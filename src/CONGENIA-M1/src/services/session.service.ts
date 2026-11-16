/**
 * @fileoverview Servicio de sesiones para el flujo de integración de CONGENIA M1.
 *
 * El flujo SADC recibe su capability desde un endpoint servidor a servidor.
 * El flujo manual crea una equivalente después del login OIDC del médico.
 *
 * @compliance HIPAA 164.312(b)  - X-Request-Id en cada llamada para trazabilidad de auditoría
 * @compliance HIPAA 164.312(c)  - sensitive: true fuerza Cache-Control: no-store
 *                                 (la respuesta contiene nombre del paciente e historia clínica)
 * @compliance ISO 27001 A.12.4  - los errores exponen solo códigos, nunca datos del paciente
 */

import { apiFetch } from './api.client'
import type { Paciente } from '../types/patient'
import { localIsoDate } from '../features/ficha-provisional/provisional'

export interface SessionActivateResponse {
    fichaId: string
    sessionId: string
    origenCreacion: 'INTEGRACION' | 'MANUAL'
    /** true cuando la sesión ya estaba activa (ej. recarga de página) - no se crea una ficha duplicada */
    alreadyActive: boolean
    paciente: {
        /** ID externo enviado por SADC; para el flujo actual corresponde a la historia clinica/expediente. */
        patientId: string
        externalId: string
        nombre: string
        historiaClinica?: string | null
        tenantId?: string | null
        /** Solo en la ficha provisional: la HC que SADC no encontró. */
        historiaClinicaReferida?: string | null
    }
    consulta: {
        fechaConsulta: string
        diagnosticoTexto: string
    }
    medico: {
        medicoId: string
        medicoExtId: string
        nombre: string
        especialidad: string
    }
}

interface SessionInitResponse {
    sessionToken: string
    formUrl: string
    expiresIn: number
}

/** Crea una capability para el flujo iniciado por un medico autenticado. */
export async function createManualSession(
    paciente: Paciente,
    accessToken: string,
): Promise<SessionInitResponse> {
    return apiFetch<SessionInitResponse>('/api/v1/sessions/manual', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
            paciente: {
                historiaClinica: paciente.historiaClinica,
                tenantId: String(paciente.idTenant),
                nombre: paciente.nombreCompleto,
            },
            consulta: {
                fechaConsulta: localIsoDate(),
                diagnosticoTexto: '',
            },
        }),
        sensitive: true,
    })
}

export interface ProvisionalSessionInput {
    /** HC que SADC no encontró. El servidor la vuelve a buscar y arma el TMP-. */
    historiaClinica: string
    tenantId: string
    nombre: string
    fechaConsulta: string
}

/**
 * Crea la capability de una ficha provisional.
 *
 * El servidor confirma en SADC que la HC no existe (409 si existe, 503 si SADC
 * no responde) y registra la ficha con HC 'TMP-<institución>-<HC>'. No se
 * envía diagnóstico: la ficha provisional no lo trae.
 */
export async function createProvisionalSession(
    input: ProvisionalSessionInput,
    accessToken: string,
): Promise<SessionInitResponse> {
    return apiFetch<SessionInitResponse>('/api/v1/sessions/manual', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
            provisional: true,
            paciente: {
                historiaClinica: input.historiaClinica,
                tenantId: input.tenantId,
                nombre: input.nombre,
            },
            consulta: {
                fechaConsulta: input.fechaConsulta,
            },
        }),
        sensitive: true,
    })
}

// Endpoint 

/**
 * Activa un token de sesión de un solo uso emitido por el sistema SADC externo.
 *
 * - Si la sesión está PENDIENTE la marca como ACTIVA y crea una ficha en BORRADOR.
 * - Si ya está ACTIVA devuelve los datos de la ficha existente sin crear duplicado (idempotente).
 * - Lanza ApiError 410 si la sesión expiró.
 * - Lanza ApiError 409 si la ficha ya fue completada (CONSUMIDA).
 *
 */
export function activateSession(): Promise<SessionActivateResponse> {
    return apiFetch<SessionActivateResponse>(
        '/api/v1/sessions/activate',
        { method: 'POST', sensitive: true },
    )
}
