/**
 * @fileoverview Cuantas respuestas pide "Otros Demograficos" y cuantas hay.
 *
 * Vive aparte porque el calculo lo necesitan dos sitios: la cabecera de la propia
 * seccion y el porcentaje global del orquestador. Estaban escritos por separado,
 * con el riesgo de que uno se corrigiera y el otro no.
 *
 * El total es fijo a proposito. Antes se movia -3 preguntas mientras nadie
 * conviviera, 4 en cuanto se subia el contador-, asi que el denominador cambiaba
 * solo: la seccion pasaba de "2/3" a "3/4" sin que el medico hubiera respondido
 * nada nuevo, y no habia forma de saber cuanto faltaba de verdad.
 */

import type { RespuestaTernaria } from '../../../types/ficha'

export interface DemographicAnswers {
    familiaresAfectados?: RespuestaTernaria | null
    menoresEnHogar?: number
    adultosEnHogar?: number
    quienAfectado?: string[]
    afectadosComunidad?: RespuestaTernaria | null
}

/**
 * Un "No" cierra las preguntas sobre convivientes: no hay familiares afectados a
 * los que contar ni señalar. Sin responder todavia se muestran.
 */
export function familiaresAfectadosVisible(value?: RespuestaTernaria | null): boolean {
    return value !== 0
}

/**
 * Si no convive nadie, no hay a quien señalar en la lista de familiares.
 *
 * Es la condicion que ordena el flujo: primero se dice cuantos son y solo
 * entonces se abre la lista de quienes.
 */
export function hayConvivientes(menores?: number, adultos?: number): boolean {
    return (menores ?? 0) + (adultos ?? 0) > 0
}

export function demographicProgress(
    answers: DemographicAnswers,
): { filledCount: number; progressTotal: number } {
    const { familiaresAfectados, menoresEnHogar, adultosEnHogar, quienAfectado, afectadosComunidad } = answers

    // Con "No" solo quedan en pie la primera pregunta y la de la comunidad.
    if (!familiaresAfectadosVisible(familiaresAfectados)) {
        return {
            progressTotal: 2,
            filledCount: [
                familiaresAfectados != null,
                afectadosComunidad != null,
            ].filter(Boolean).length,
        }
    }

    return {
        progressTotal: 4,
        filledCount: [
            familiaresAfectados != null,
            hayConvivientes(menoresEnHogar, adultosEnHogar),
            (quienAfectado?.length ?? 0) > 0,
            afectadosComunidad != null,
        ].filter(Boolean).length,
    }
}
