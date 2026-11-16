import { describe, expect, it } from 'vitest'
import { demographicProgress, hayConvivientes } from './demographicProgress'

describe('hayConvivientes', () => {
    it('exige al menos una persona', () => {
        expect(hayConvivientes(0, 0)).toBe(false)
        expect(hayConvivientes(1, 0)).toBe(true)
        expect(hayConvivientes(0, 2)).toBe(true)
    })

    it('trata los contadores sin tocar como cero', () => {
        expect(hayConvivientes(undefined, undefined)).toBe(false)
    })
})

describe('demographicProgress', () => {
    it('pide 2 respuestas cuando no hay familiares afectados', () => {
        expect(demographicProgress({ familiaresAfectados: 0 }))
            .toEqual({ filledCount: 1, progressTotal: 2 })

        expect(demographicProgress({ familiaresAfectados: 0, afectadosComunidad: 2 }))
            .toEqual({ filledCount: 2, progressTotal: 2 })
    })

    // La regresion: el denominador se movia solo. Con 0 convivientes pedia 3
    // respuestas y en cuanto se subia el contador pasaba a 4, de modo que "2/3"
    // se convertia en "3/4" sin haber respondido nada nuevo.
    it('mantiene el total en 4 sin importar cuantos convivan', () => {
        const base = { familiaresAfectados: 1 as const, afectadosComunidad: 1 as const }

        expect(demographicProgress({ ...base }).progressTotal).toBe(4)
        expect(demographicProgress({ ...base, menoresEnHogar: 2 }).progressTotal).toBe(4)
        expect(demographicProgress({ ...base, menoresEnHogar: 2, quienAfectado: ['3'] }).progressTotal).toBe(4)
    })

    it('no da por respondida la cantidad cuando queda en 0 y 0', () => {
        const progreso = demographicProgress({
            familiaresAfectados: 1,
            menoresEnHogar: 0,
            adultosEnHogar: 0,
            afectadosComunidad: 1,
        })

        expect(progreso).toEqual({ filledCount: 2, progressTotal: 4 })
    })

    it('cuenta las cuatro respuestas del camino completo', () => {
        expect(demographicProgress({
            familiaresAfectados: 1,
            menoresEnHogar: 1,
            adultosEnHogar: 2,
            quienAfectado: ['3', '7'],
            afectadosComunidad: 0,
        })).toEqual({ filledCount: 4, progressTotal: 4 })
    })

    it('no cuenta a los señalados si no se declaro cuantos conviven', () => {
        // El estado que dejaba el bug: parientes marcados con los contadores en 0.
        const progreso = demographicProgress({
            familiaresAfectados: 1,
            menoresEnHogar: 0,
            adultosEnHogar: 0,
            quienAfectado: ['3'],
            afectadosComunidad: 1,
        })

        expect(progreso.filledCount).toBe(3)
        expect(progreso.progressTotal).toBe(4)
    })

    it('empieza en cero con la seccion en blanco', () => {
        expect(demographicProgress({})).toEqual({ filledCount: 0, progressTotal: 4 })
    })
})
