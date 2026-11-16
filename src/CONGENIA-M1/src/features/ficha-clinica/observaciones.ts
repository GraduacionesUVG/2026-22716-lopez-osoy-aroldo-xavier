/**
 * @fileoverview Observaciones del formulario al contrato del servidor.
 *
 * Lo comparten el alta (POST /v1/patient) y la revision (POST /fichas/:id/revisiones),
 * para que las dos recorten y omitan igual.
 */

import type { Observation } from '../../types/patient-api'
import {
    MAX_OBSERVACION,
    type ObservacionItem,
} from '../../components/forms/ObservationsSection/ObservationsSection'

/**
 * Las observaciones listas para enviar, o `undefined` si no hay ninguna.
 *
 * Se omite el campo en vez de mandar `[]`: asi una ficha o una adenda sin
 * observaciones no depende de que el servidor ya las acepte (PENDIENTES-BACKEND.md,
 * seccion 16).
 */
export function observacionesParaEnviar(items: readonly ObservacionItem[]): Observation[] | undefined {
    const observaciones = items
        .map((item) => item.text.trim())
        .filter(Boolean)
        .map((texto) => ({ observationText: texto.slice(0, MAX_OBSERVACION) }))

    return observaciones.length > 0 ? observaciones : undefined
}
