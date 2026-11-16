/**
 * @fileoverview Búsqueda de pacientes del SADC a través de la API de CONGENIA.
 *
 * GET /api/v1/sadc/pacientes?idTenant=&historiaClinica=
 *
 * Antes la ficha llamaba a Nursera directamente desde el navegador, sin
 * autenticación ni bitácora. Ahora la consulta la hace el servidor con el token
 * del médico: la institución debe ser una de las suyas, cada consulta queda en
 * la auditoría y el servidor aplica el tiempo límite de 20 s.
 *
 * @compliance HIPAA 164.312(b) - cada consulta queda en la bitácora del servidor
 * @compliance HIPAA 164.312(c) - sensitive: no-store, la respuesta es PHI
 * @compliance ISO 27001 A.14.1 - timeout del cliente por encima del límite del servidor
 */

import { apiFetch, ApiError } from './api.client'
import type { Paciente } from '../types/patient'

// El servidor corta a los 20 s y responde 504; el cliente espera un poco más
// para recibir esa respuesta en lugar de abortar antes.
const TIMEOUT_MS = 25_000

/**
 * `status` es lo que App.tsx usa para decidir entre toast y pantalla de error:
 * 404 deja al médico corregir el número o registrar al paciente a mano.
 */
export class PatientSearchError extends Error {
    readonly status: number

    constructor(status: number, message: string) {
        super(message)
        this.name = 'PatientSearchError'
        this.status = status
    }
}

export interface PatientSearchParams {
    historiaClinica: string
    idTenant: string
}

/** Lo que devuelve la API: solo los campos que la ficha necesita. */
interface SadcPaciente {
    idPaciente:      number | string | null
    idInstitucion:   number | string
    historiaClinica: string
    nombres:         string
    apellidos:       string
}

interface SadcPacienteResponse {
    success: boolean
    data:    SadcPaciente
}

function toPaciente(origen: SadcPaciente): Paciente {
    return {
        id:              Number(origen.idPaciente),
        idTenant:        Number(origen.idInstitucion),
        nombreCompleto:  `${origen.nombres} ${origen.apellidos}`.trim(),
        historiaClinica: origen.historiaClinica,
    }
}

function toSearchError(err: ApiError): PatientSearchError {
    switch (err.status) {
        case 404:
            return new PatientSearchError(404, 'No se encontró historia clínica')
        case 401:
        case 403:
            return new PatientSearchError(err.status, 'No tiene autorización para consultar pacientes de esta institución.')
        case 408:
        case 504:
            return new PatientSearchError(408, 'La búsqueda superó el tiempo límite. Intente de nuevo.')
        case 0:
            return new PatientSearchError(0, 'No se pudo conectar con el servidor. Revise su conexión.')
        default:
            return new PatientSearchError(err.status, err.status === 503
                ? 'El SADC no está disponible en este momento. Intente de nuevo.'
                : `Error del servidor (HTTP ${err.status}).`)
    }
}

export async function searchPatient({
    historiaClinica,
    idTenant,
}: PatientSearchParams): Promise<Paciente> {
    const query = new URLSearchParams({
        idTenant:        String(idTenant),
        historiaClinica: historiaClinica.trim(),
    })

    try {
        const response = await apiFetch<SadcPacienteResponse>(`/api/v1/sadc/pacientes?${query}`, {
            auth:      'bearer',
            sensitive: true,
            timeoutMs: TIMEOUT_MS,
        })
        return toPaciente(response.data)
    } catch (err) {
        if (err instanceof ApiError) throw toSearchError(err)
        throw err
    }
}
