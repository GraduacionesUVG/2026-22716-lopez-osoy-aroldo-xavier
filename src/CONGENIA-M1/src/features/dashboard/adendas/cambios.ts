/**
 * @fileoverview De la ficha de una adenda a la lista de cambios que se revisan.
 *
 * La ficha que devuelve el servidor no trae "los cambios": trae el conjunto
 * completo de signos y examenes, marcando cuales nacieron en esta revision
 * (`addedInRevision`) y cual sustituye a cual. Reconstruir de ahi el par
 * *anterior → nuevo* es la unica pieza de logica real de la pantalla, asi que
 * vive aparte del componente para poder probarla sin montar nada.
 *
 * El vinculo de sustitucion se acepta en las dos direcciones -`replacedBySignoId`
 * en el registro viejo, `replacesSignoId` en el alta- porque el contrato pide
 * ambas y hoy el servidor todavia no persiste ninguna: en cuanto llegue una, la
 * pantalla funciona. Ver PENDIENTES-BACKEND.md seccion 12.
 */

import type { DecisionCambio, FichaDetail } from '../../../services/ficha.service'

export type TipoCambio = 'SIGNO' | 'EXAMEN' | 'OBSERVACION'

/** Una de las dos mitades del par: el registro tal como se pinta en el panel. */
export interface RegistroCambio {
    id: string
    titulo: string
    imagenUrl?: string
    chips: string[]
}

export interface CambioSolicitado {
    /** Id del alta. Es el que viaja en la decision hacia el servidor. */
    id: string
    tipo: TipoCambio
    /** Como se nombra el tipo en pantalla: "Signo de alerta" / "Estudio de gabinete" / "Observación". */
    etiqueta: string
    nuevo: RegistroCambio
    /** Ausente cuando el alta no sustituye nada: es informacion nueva, no una correccion. */
    anterior?: RegistroCambio
}

export const ETIQUETA: Record<TipoCambio, string> = {
    SIGNO:       'Signo de alerta',
    EXAMEN:      'Estudio de gabinete',
    OBSERVACION: 'Observación',
}

/**
 * Los cambios que el pediatra pide, en el orden en que los registro.
 *
 * Signos, examenes y observaciones, que es el mismo orden en que aparecen las
 * secciones de la ficha: asi avanzar con las flechas del panel recorre la ficha
 * de arriba abajo en vez de saltar.
 *
 * Las observaciones nunca sustituyen a nada -solo se agregan-, asi que no
 * llevan `anterior`.
 */
export function cambiosDeAdenda(ficha: FichaDetail): CambioSolicitado[] {
    const signos = ficha.warningSigns
    const examenes = ficha.examDiagnoses

    const comoRegistro = (signo: FichaDetail['warningSigns'][number]): RegistroCambio => ({
        id: signo.signoId,
        titulo: signo.signDescription,
        imagenUrl: signo.imageUrl ?? undefined,
        chips: [signo.partName, signo.regionName].filter(Boolean),
    })

    const comoRegistroExamen = (examen: FichaDetail['examDiagnoses'][number]): RegistroCambio => ({
        id: examen.examenId,
        titulo: examen.examDescription,
        imagenUrl: examen.examUrl ?? undefined,
        chips: [],
    })

    const deSignos: CambioSolicitado[] = signos
        .filter((signo) => signo.addedInRevision)
        .map((alta) => {
            const anterior = signos.find((otro) =>
                otro.signoId !== alta.signoId &&
                (otro.replacedBySignoId === alta.signoId || otro.signoId === alta.replacesSignoId))

            return {
                id: alta.signoId,
                tipo: 'SIGNO' as const,
                etiqueta: ETIQUETA.SIGNO,
                nuevo: comoRegistro(alta),
                anterior: anterior ? comoRegistro(anterior) : undefined,
            }
        })

    const deExamenes: CambioSolicitado[] = examenes
        .filter((examen) => examen.addedInRevision)
        .map((alta) => {
            const anterior = examenes.find((otro) =>
                otro.examenId !== alta.examenId &&
                (otro.replacedByExamenId === alta.examenId || otro.examenId === alta.replacesExamenId))

            return {
                id: alta.examenId,
                tipo: 'EXAMEN' as const,
                etiqueta: ETIQUETA.EXAMEN,
                nuevo: comoRegistroExamen(alta),
                anterior: anterior ? comoRegistroExamen(anterior) : undefined,
            }
        })

    const deObservaciones: CambioSolicitado[] = (ficha.observations ?? [])
        .filter((observacion) => observacion.addedInRevision)
        .map((alta) => ({
            id: alta.observacionId,
            tipo: 'OBSERVACION' as const,
            etiqueta: ETIQUETA.OBSERVACION,
            nuevo: { id: alta.observacionId, titulo: alta.observationText, chips: [] },
        }))

    return [...deSignos, ...deExamenes, ...deObservaciones]
}

/** Lo que el revisor decide de un cambio. Sin matices: se acepta o se rechaza. */
export type Decision = 'APROBADO' | 'RECHAZADO'

/** Las decisiones tomadas hasta ahora, por id del alta. */
export type DecisionesPorCambio = Record<string, Decision | undefined>

/**
 * Todos los cambios estan decididos.
 *
 * Es lo que habilita "Guardar cambios": el servidor exige la adenda completa
 * (seccion 11 del contrato), asi que dejar guardar a medias solo produciria un
 * 400 que el revisor no sabria interpretar.
 */
export function decisionesCompletas(
    cambios: readonly CambioSolicitado[],
    decisiones: DecisionesPorCambio,
): boolean {
    if (cambios.length === 0) return false

    return cambios.every((cambio) => decisiones[cambio.id] !== undefined)
}

/** Traduce el estado local al cuerpo de `POST /fichas/:id/resolver`. */
export function construirDecisiones(
    cambios: readonly CambioSolicitado[],
    decisiones: DecisionesPorCambio,
): DecisionCambio[] {
    return cambios.map((cambio) => {
        const decision = decisiones[cambio.id]
        if (!decision) throw new Error(`El cambio ${cambio.id} no tiene decisión.`)

        return { tipo: cambio.tipo, id: cambio.id, decision }
    })
}

/** Cuantos cambios se aceptaron, para el aviso que se muestra al guardar. */
export function contarAprobados(decisiones: DecisionCambio[]): number {
    return decisiones.filter((decision) => decision.decision === 'APROBADO').length
}
