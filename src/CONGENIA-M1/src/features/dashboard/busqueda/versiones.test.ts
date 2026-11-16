import { describe, expect, it } from 'vitest'
import type { FichaSummary } from '../../../services/ficha.service'
import { etiquetaVersion, versionesDelLinaje } from './versiones'

function summary(overrides: Partial<FichaSummary> & Pick<FichaSummary, 'fichaId'>): FichaSummary {
    return {
        fichaRaizId: 'raiz-a',
        revision: 1,
        estado: 'COMPLETA',
        estadoFicha: 'COMPLETA',
        fechaConsulta: '2026-03-12',
        esVigente: false,
        medico: 'Dra. Ruiz',
        ...overrides,
    }
}

describe('versionesDelLinaje', () => {
    it('se queda solo con el linaje de la ficha abierta', () => {
        // El paciente tiene dos consultas distintas; el selector no puede ofrecer
        // versiones de la otra.
        const fichas = [
            summary({ fichaId: 'a-1', fichaRaizId: 'raiz-a', revision: 1 }),
            summary({ fichaId: 'b-1', fichaRaizId: 'raiz-b', revision: 1 }),
            summary({ fichaId: 'a-2', fichaRaizId: 'raiz-a', revision: 2, esVigente: true }),
        ]

        expect(versionesDelLinaje(fichas, 'a-1').map((f) => f.fichaId)).toEqual(['a-1', 'a-2'])
        expect(versionesDelLinaje(fichas, 'b-1').map((f) => f.fichaId)).toEqual(['b-1'])
    })

    it('ordena por revisión ascendente sin importar cómo lleguen', () => {
        const fichas = [
            summary({ fichaId: 'a-3', revision: 3, esVigente: true }),
            summary({ fichaId: 'a-1', revision: 1 }),
            summary({ fichaId: 'a-2', revision: 2 }),
        ]

        expect(versionesDelLinaje(fichas, 'a-1').map((f) => f.revision)).toEqual([1, 2, 3])
    })

    it('descarta los borradores', () => {
        const fichas = [
            summary({ fichaId: 'a-1', revision: 1, esVigente: true }),
            summary({ fichaId: 'a-2', revision: 2, estadoFicha: 'BORRADOR' }),
        ]

        expect(versionesDelLinaje(fichas, 'a-1').map((f) => f.fichaId)).toEqual(['a-1'])
    })

    it('lee el estado antiguo cuando la respuesta no trae `estadoFicha`', () => {
        const conEstadoViejo = {
            ...summary({ fichaId: 'a-2', revision: 2 }),
            estado: 'BORRADOR',
        } as FichaSummary
        // Algunas respuestas todavía no incluyen el campo nuevo.
        delete (conEstadoViejo as Partial<FichaSummary>).estadoFicha

        const fichas = [summary({ fichaId: 'a-1', revision: 1, esVigente: true }), conEstadoViejo]

        expect(versionesDelLinaje(fichas, 'a-1').map((f) => f.fichaId)).toEqual(['a-1'])
    })

    it('nunca descarta la ficha que se está viendo, aunque sea un borrador', () => {
        // Si se filtrara, el select mostraría un valor que no está entre sus
        // opciones y se pintaría en blanco.
        const fichas = [
            summary({ fichaId: 'a-1', revision: 1, esVigente: true }),
            summary({ fichaId: 'a-2', revision: 2, estadoFicha: 'BORRADOR' }),
        ]

        expect(versionesDelLinaje(fichas, 'a-2').map((f) => f.fichaId)).toEqual(['a-1', 'a-2'])
    })

    it('no adivina el linaje si la ficha abierta no está en la lista', () => {
        const fichas = [summary({ fichaId: 'a-1', revision: 1, esVigente: true })]

        expect(versionesDelLinaje(fichas, 'desconocida')).toEqual([])
    })
})

describe('etiquetaVersion', () => {
    it('numera con dos dígitos y fecha la revisión', () => {
        const ficha = summary({ fichaId: 'a-1', revision: 1, fechaCreacion: '2026-03-12T15:04:00Z' })

        expect(etiquetaVersion(ficha)).toBe('Versión 01 - 12 mar 2026')
    })

    it('marca la vigente como actual', () => {
        const ficha = summary({
            fichaId: 'a-3',
            revision: 3,
            esVigente: true,
            fechaCreacion: '2026-08-20T15:04:00Z',
        })

        expect(etiquetaVersion(ficha)).toBe('Versión 03 (actual) - 20 ago 2026')
    })

    it('marca la revisión que sigue en la bandeja del genetista', () => {
        const ficha = summary({ fichaId: 'a-4', revision: 4, estadoFicha: 'PENDIENTE' })

        expect(etiquetaVersion(ficha)).toBe('Versión 04 (pendiente)')
    })

    it('omite la fecha mientras el servidor no la mande', () => {
        expect(etiquetaVersion(summary({ fichaId: 'a-2', revision: 2 }))).toBe('Versión 02')
    })

    it('omite la fecha si lo que llega no es una', () => {
        const ficha = summary({ fichaId: 'a-2', revision: 2, fechaCreacion: 'no es una fecha' })

        expect(etiquetaVersion(ficha)).toBe('Versión 02')
    })
})
