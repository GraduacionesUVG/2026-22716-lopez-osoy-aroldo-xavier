/**
 * @fileoverview Servicio de registro de ficha clínica - POST /v1/patient.
 *
 * Responsabilidades:
 *  1. Mapear FichaFormState (modelo UI/Zustand) al payload exacto que espera el backend.
 *  2. Ejecutar la llamada HTTP con los headers de autenticación correctos.
 *
 * El X-Session-Token se adjunta automáticamente por apiFetch (vía setSessionToken en App.tsx).
 * El Bearer OIDC solo se usa al crear la sesión manual; esta operación queda
 * protegida por la capability temporal de X-Session-Token.
 *
 * @compliance HIPAA 164.312(b)  - X-Request-Id trazable en cada llamada
 * @compliance HIPAA 164.312(c)  - sensitive: true fuerza Cache-Control: no-store (respuesta con IDs de PHI)
 * @compliance ISO 27001 A.10.1  - hash SHA-256 del trazo como evidencia de integridad de la firma
 * @compliance ISO 27001 A.12.4  - logs solo exponen método/ruta/estado, nunca el payload
 */

import { apiFetch } from './api.client'
import type { FichaFormState } from '../features/ficha-clinica/fichaClinica.mapper'
import { observacionesParaEnviar } from '../features/ficha-clinica/observaciones'
import type { AlertSignItem } from '../components/forms/AlertSignsSection/AlertSignsSection'
import type { ExamItem } from '../components/forms/ExamsSection/ExamsSection'
import { consentContent } from '../components/forms/InformedConsentView/InformedConsentContent'
import type {
    PatientRegistrationPayload,
    PatientRegistrationResponse,
    TipoFirmante,
    AfectadoComunidad,
    WarningSign,
    ExamDiagnosis,
    ConsentPayload,
} from '../types/patient-api'

const TIPO_FIRMANTE: Record<string, TipoFirmante> = {
    'Padre':       'PADRE',
    'Madre':       'MADRE',
    'Tutor legal': 'TUTOR',
}

// RespuestaTernaria: 0 = No, 1 = Sí, 2 = Desconocido
const COMUNIDAD_MAP: Record<number, AfectadoComunidad> = {
    0: 'NO',
    1: 'SI',
    2: 'DESCONOCIDO',
}

/**
 * Calcula el hash SHA-256 del trazo de firma capturado en el canvas.
 * En contextos no seguros (por ejemplo, HTTP en un host remoto) Web Crypto
 * puede no estar disponible; en ese caso devolvemos null para no romper el envío.
 * @compliance ISO 27001 A.10.1
 */
async function sha256Hex(text: string): Promise<string | null> {
    const subtle = globalThis.crypto?.subtle
    if (!subtle) {
        console.warn('[CONGENIA] Web Crypto no está disponible; se omite canvasHash')
        return null
    }

    const encoded = new TextEncoder().encode(text)
    const hashBuffer = await subtle.digest('SHA-256', encoded)
    return Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
}

/**
 * Construye el objeto de evidencia técnica de la firma.
 * Contiene metadata del dispositivo y hash del trazo, no la imagen PNG: la
 * imagen viaja aparte en `consent.firmaPng` y el servidor la guarda en S3.
 */
async function buildFirmaEvidenciaTecnica(
    signatureBase64: string | null,
    consentValues: Record<string, boolean>,
): Promise<Record<string, unknown>> {
    const declaraciones = consentContent.consentCards.map((card) => ({
        titulo:      card.title,
        descripcion: card.description,
        aceptada:    consentValues[card.id] ?? false,
        obligatoria: card.required,
    }))

    return {
        timestamp:  new Date().toISOString(),
        userAgent:  navigator.userAgent,
        source:     'canvas-pad',
        canvasHash: signatureBase64 ? await sha256Hex(signatureBase64) : null,
        // El PDF worker consume estas declaraciones para la sección "Declaraciones del consentimiento".
        declaraciones,
        version_texto_legal: 'CONSENTIMIENTO_V1',
    }
}

function mapWarningSigns(items: AlertSignItem[]): WarningSign[] {
    return items
        .filter((item) => item.parteDelCuerpo !== undefined)
        .map((item) => ({
            signDescription: item.title.trim().slice(0, 300),
            partCatalogId:   parseInt(item.parteDelCuerpo!.parteValue, 10),
            imageResourceId: item.imageResourceId,
        }))
}

function mapExamDiagnoses(items: ExamItem[]): ExamDiagnosis[] {
    return items.map((item) => ({
        examDescription: item.title.trim().slice(0, 300),
        examResourceId:  item.imageResourceId,
    }))
}

async function mapConsent(form: FichaFormState): Promise<ConsentPayload> {
    const firmaEvidenciaTecnica = await buildFirmaEvidenciaTecnica(
        form.signatureData,
        form.consentValues,
    )

    return {
        tipoFirmante:         TIPO_FIRMANTE[form.signerRelation] ?? 'MADRE',
        nombreFirmante:       form.signerName.trim(),
        idiomaConsentimiento: 'ESPANOL',
        aceptacionTerminos:   Boolean(
            form.consentValues['autorizacion-principal'] &&
            form.consentValues['aceptacion-final']
        ),
        aceptacionContacto:   form.consentValues['contacto-futuro'] ?? false,
        firmaEvidenciaTecnica,
        firmaPng:             form.signatureData ?? '',
    }
}

/**
 * Convierte el estado del formulario (modelo UI) al payload exacto de POST /v1/patient.
 *
 * Conversiones principales:
 *  - referidoDe (string ID)       - referralSourceId (integer)
 *  - lugarDeParto (string ID)     - birthMethodId (integer | null)
 *  - sexo (string ID)             - sexId (integer)
 *  - observaciones (items)        - observations (se omite si no hay ninguna)
 *  - familiaresAfectados (0|1|2)  - affectedRelatives (boolean): 0 = false, 1|2 = true
 *  - quienAfectado (string[])     - affectedRelativesCategoryIds (number[])
 *  - afectadosComunidad (0|1|2)   - affectedCommunityMembers ('NO'|'SI'|'DESCONOCIDO')
 *  - signerRelation (label UI)    - tipoFirmante (enum backend)
 *  - signatureData (Base64 canvas)- firmaPng (imagen) + firmaEvidenciaTecnica (metadata + hash SHA-256)
 */
async function buildPatientPayload(form: FichaFormState): Promise<PatientRegistrationPayload> {
    const ternaria = form.familiaresAfectados ?? 0

    const consent = await mapConsent(form)
    const observations = observacionesParaEnviar(form.observaciones)

    return {
        referralSourceId:             parseInt(form.referidoDe, 10),
        birthMethodId:                form.lugarDeParto ? parseInt(form.lugarDeParto, 10) : null,
        sexId:                        parseInt(form.sexo, 10),
        affectedRelatives:            ternaria !== 0,
        affectedRelativesCategoryIds: form.quienAfectado.map((id) => parseInt(id, 10)),
        affectedUnderageRelatives:    form.menoresEnHogar,
        affectedAdultRelatives:       form.adultosEnHogar,
        affectedCommunityMembers:     COMUNIDAD_MAP[form.afectadosComunidad ?? 0],
        warningSigns:                 mapWarningSigns(form.alertSigns),
        examDiagnoses:                mapExamDiagnoses(form.exams),
        ...(observations ? { observations } : {}),
        consent,
    }
}

/**
 * Registra la ficha clínica completa en el backend.
 *
 * Prerequisitos (manejados fuera de este servicio):
 *  - setSessionToken() debe haberse llamado en App.tsx con el ?sessionToken= de la URL.
 *  - La sesión debe estar ACTIVA (POST /api/v1/sessions/activate ya ejecutado).
 *
 * @throws ApiError 409 si la sesión ya fue consumida (ficha ya registrada)
 * @throws ApiError 410 si la sesión expiró
 * @throws ApiError 400 si el payload tiene campos inválidos
 */
export async function registerPatient(
    form: FichaFormState,
): Promise<PatientRegistrationResponse> {
    const payload = await buildPatientPayload(form)

    return apiFetch<PatientRegistrationResponse>('/v1/patient', {
        method:    'POST',
        body:      JSON.stringify(payload),
        sensitive: true,
    })
}
