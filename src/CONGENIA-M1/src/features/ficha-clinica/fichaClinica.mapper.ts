/**
 * @fileoverview Mapper de estado del formulario al tipo de dominio FichaClinica.
 *
 * Transforma el estado React del orquestador en un objeto FichaClinica
 * listo para cifrar (borrador) o enviar al backend (finalizado).
 *
 * @compliance HIPAA 164.514 - mínimo dato necesario: solo se persisten campos clínicamente relevantes
 * @compliance HL7 FHIR R4    - FichaClinica es mapenable a Observation, Condition y Consent resources
 * @compliance ISO 27001 A.12.2 - integridad de datos verificada con Zod antes de persistir
 */

import type {
    FichaClinica,
    DatosConsulta,
    DiagnosticoConsulta,
    OtrosDemograficos,
    FamiliarAfectado,
    SignoAlerta,
    ParteSeleccionada,
    RegionAnatomica,
    Lateralidad,
    EstudiosIndicados,
    Consentimiento,
    DeclaracionConsentimiento,
    RelacionFirmante,
    RespuestaTernaria,
    Observacion,
} from '../../types/ficha'
import type { AlertSignItem } from '../../components/forms/AlertSignsSection/AlertSignsSection'
import type { ExamItem } from '../../components/forms/ExamsSection/ExamsSection'
import type { ObservacionItem } from '../../components/forms/ObservationsSection/ObservationsSection'
import { consentContent } from '../../components/forms/InformedConsentView/InformedConsentContent'

// Datos que llegan del sistema hospitalario, no los llena el médico

export interface SadcContext {
    idConsulta: number
    idTenant: number
    fechaConsulta: string
    especialidad: string
    diagnosticos: DiagnosticoConsulta[]
}

// Estado del orquestador en un momento dado

export interface FichaFormState {
    // Datos de la consulta (médico)
    referidoDe: string
    lugarDeParto: string
    // Id del catálogo /v1/Sexos, como texto
    sexo: string

    // Demográficos
    familiaresAfectados: RespuestaTernaria | null
    menoresEnHogar: number
    adultosEnHogar: number
    quienAfectado: string[]
    afectadosComunidad: RespuestaTernaria | null

    // Secciones opcionales
    alertSigns: AlertSignItem[]
    exams: ExamItem[]
    observaciones: ObservacionItem[]

    // Consentimiento
    consentValues: Record<string, boolean>
    signatureData: string | null
    signerName: string
    signerRelation: string
}

const RELACION_MAP: Record<string, RelacionFirmante> = {
    'Padre':       'padre',
    'Madre':       'madre',
    'Tutor legal': 'tutor_legal',
}

// Mapper principal

export function buildFichaClinica(
    sadc: SadcContext,
    form: FichaFormState,
    estado: 'borrador' | 'finalizado' = 'borrador'
): FichaClinica {
    const ahora = new Date().toISOString()

    const datosConsulta   = mapDatosConsulta(sadc, form)
    const demograficos    = mapDemograficos(form)
    const signosAlerta    = mapSignosAlerta(form.alertSigns)
    const examenes        = mapExamenes(form.exams)
    const consentimiento  = mapConsentimiento(form)

    const progreso = {
        datosConsulta:    Boolean(form.referidoDe && form.lugarDeParto && form.sexo),
        otrosDemograficos: isDemograficosComplete(form),
        consentimiento:   isConsentimientoComplete(form),
    }

    return {
        idConsulta:          sadc.idConsulta,
        idTenant:            sadc.idTenant,
        estado,
        progreso,
        ultimaModificacion:  ahora,
        datosConsulta,
        otrosDemograficos:   demograficos,
        signosAlerta,
        examenesSugeridos:   examenes,
        observaciones:       mapObservaciones(form.observaciones),
        consentimiento,
    }
}

// Submappers

function mapDatosConsulta(sadc: SadcContext, form: FichaFormState): DatosConsulta {
    return {
        fechaConsulta: sadc.fechaConsulta,
        idConsulta:    sadc.idConsulta,
        especialidad:  sadc.especialidad,
        diagnosticos:  sadc.diagnosticos,
        referidoDe:    (form.referidoDe as DatosConsulta['referidoDe']) || null,
        lugarDeParto:  (form.lugarDeParto as DatosConsulta['lugarDeParto']) || null,
        sexo:          form.sexo || null,
    }
}

function mapDemograficos(form: FichaFormState): OtrosDemograficos {
    return {
        familiaresAfectados: (form.familiaresAfectados ?? 0) as RespuestaTernaria,
        menoresEnHogar:      form.menoresEnHogar,
        adultosEnHogar:      form.adultosEnHogar,
        quienAfectado:       form.quienAfectado as FamiliarAfectado[],
        afectadosComunidad:  (form.afectadosComunidad ?? 0) as RespuestaTernaria,
    }
}

function mapSignosAlerta(items: AlertSignItem[]): SignoAlerta[] {
    return items
        .filter((item) => item.parteDelCuerpo && item.imageSrc)
        .map((item) => ({
            id:            item.id,
            nombre:        item.title,
            parteDelCuerpo: {
                regionValue: item.parteDelCuerpo!.regionValue as RegionAnatomica,
                parteValue:  item.parteDelCuerpo!.parteValue,
                lateralidad: item.parteDelCuerpo!.lateralidad as Lateralidad | undefined,
            } satisfies ParteSeleccionada,
            nombreArchivo: item.nombreArchivo ?? '',
            imagenBase64:  item.imageSrc!,
        }))
}

function mapExamenes(items: ExamItem[]): EstudiosIndicados[] {
    return items.map((item) => ({
        id:           item.id,
        nombre:       item.title,
        imagenBase64: item.imageSrc,
        nombreArchivo: item.imageSrc ? item.title : undefined,
    }))
}

function mapObservaciones(items: ObservacionItem[]): Observacion[] {
    return items.map((item) => ({ id: item.id, texto: item.text }))
}

function mapConsentimiento(form: FichaFormState): Consentimiento {
    const declaraciones: DeclaracionConsentimiento[] = consentContent.consentCards.map((card) => ({
        id:          card.id,
        titulo:      card.title,
        descripcion: card.description,
        obligatoria: card.required,
        aceptada:    form.consentValues[card.id] ?? false,
    }))

    const relacionDominio = RELACION_MAP[form.signerRelation] ?? 'madre'
    const firmante = form.signerName.trim()
        ? { nombreCompleto: form.signerName.trim(), relacion: relacionDominio }
        : null

    const completado =
        consentContent.consentCards
            .filter((c) => c.required)
            .every((c) => form.consentValues[c.id]) &&
        Boolean(form.signatureData)

    return {
        declaraciones,
        firmante,
        firmaBase64: form.signatureData,
        completado,
        fechaFirma:  completado ? new Date().toISOString() : undefined,
    }
}

// Helpers de progreso (usados internamente y reutilizables en el orquestador)

function isDemograficosComplete(form: FichaFormState): boolean {
    if (form.familiaresAfectados == null || form.afectadosComunidad == null) return false
    if (form.familiaresAfectados === 0) return true
    const personasEnHogar = form.menoresEnHogar + form.adultosEnHogar
    if (personasEnHogar === 0) return false
    return form.quienAfectado.length > 0
}

function isConsentimientoComplete(form: FichaFormState): boolean {
    const requiredChecked = consentContent.consentCards
        .filter((c) => c.required)
        .every((c) => form.consentValues[c.id])
    return requiredChecked && Boolean(form.signatureData)
}
