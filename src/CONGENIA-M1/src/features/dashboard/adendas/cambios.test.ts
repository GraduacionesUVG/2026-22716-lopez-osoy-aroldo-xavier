import { describe, expect, it } from 'vitest'
import {
    cambiosDeAdenda,
    construirDecisiones,
    contarAprobados,
    decisionesCompletas,
    type CambioSolicitado,
} from './cambios'
import type { FichaDetail, StoredExam, StoredWarningSign } from '../../../services/ficha.service'

function signo(partial: Partial<StoredWarningSign> & { signoId: string }): StoredWarningSign {
    return {
        signDescription: `Signo ${partial.signoId}`,
        partCatalogId: 31,
        partName: 'Mano',
        regionId: 3,
        regionName: 'Extremidades superiores',
        addedInRevision: false,
        ...partial,
    }
}

function examen(partial: Partial<StoredExam> & { examenId: string }): StoredExam {
    return {
        examDescription: `Examen ${partial.examenId}`,
        addedInRevision: false,
        ...partial,
    }
}

function ficha(warningSigns: StoredWarningSign[], examDiagnoses: StoredExam[] = []): FichaDetail {
    return {
        fichaId: 'f-1',
        pacienteId: 'p-1',
        fichaRaizId: 'r-1',
        revision: 2,
        estadoFicha: 'PENDIENTE',
        estadoRevision: 'PENDIENTE',
        esVigente: false,
        paciente: { nombre: 'Rachel Castro', historiaClinica: '001', tenantId: '23' },
        consulta: { fechaConsulta: '2026-07-07', diagnosticoTexto: 'Dx' },
        medico: { nombre: 'Dr. Marco Paez', especialidad: 'Pediatría' },
        demographic: {
            referralSourceId: null,
            birthMethodId: null,
            affectedRelatives: null,
            affectedRelativesCategoryIds: [],
            affectedUnderageRelatives: 0,
            affectedAdultRelatives: 0,
            affectedCommunityMembers: null,
        },
        consent: null,
        warningSigns,
        examDiagnoses,
    }
}

describe('cambiosDeAdenda', () => {
    it('solo toma las altas de la revisión, no la ficha entera', () => {
        const cambios = cambiosDeAdenda(ficha([
            signo({ signoId: 'viejo' }),
            signo({ signoId: 'nuevo', addedInRevision: true }),
        ]))

        expect(cambios).toHaveLength(1)
        expect(cambios[0].id).toBe('nuevo')
    })

    it('empareja el anterior cuando el vínculo llega en el registro sustituido', () => {
        const cambios = cambiosDeAdenda(ficha([
            signo({ signoId: 'viejo', replacedBySignoId: 'nuevo' }),
            signo({ signoId: 'nuevo', addedInRevision: true }),
        ]))

        expect(cambios[0].anterior?.id).toBe('viejo')
    })

    it('empareja el anterior cuando el vínculo llega en el alta', () => {
        // El contrato pide las dos direcciones; basta con que llegue una.
        const cambios = cambiosDeAdenda(ficha([
            signo({ signoId: 'viejo' }),
            signo({ signoId: 'nuevo', addedInRevision: true, replacesSignoId: 'viejo' }),
        ]))

        expect(cambios[0].anterior?.id).toBe('viejo')
    })

    it('suma las observaciones nuevas al final, sin anterior y con su texto', () => {
        const cambios = cambiosDeAdenda({
            ...ficha(
                [signo({ signoId: 's-nuevo', addedInRevision: true })],
                [examen({ examenId: 'e-nuevo', addedInRevision: true })],
            ),
            observations: [
                { observacionId: 'o-vieja', observationText: 'Ya estaba', addedInRevision: false },
                { observacionId: 'o-nueva', observationText: 'Nota agregada en la adenda', addedInRevision: true },
            ],
        })

        expect(cambios.map((c) => c.tipo)).toEqual(['SIGNO', 'EXAMEN', 'OBSERVACION'])
        const observacion = cambios[2]
        expect(observacion.id).toBe('o-nueva')
        expect(observacion.etiqueta).toBe('Observación')
        expect(observacion.nuevo.titulo).toBe('Nota agregada en la adenda')
        expect(observacion.anterior).toBeUndefined()
    })

    it('una ficha sin observaciones del servidor no produce cambios de ese tipo', () => {
        const cambios = cambiosDeAdenda(ficha([signo({ signoId: 'nuevo', addedInRevision: true })]))

        expect(cambios.some((c) => c.tipo === 'OBSERVACION')).toBe(false)
    })

    it('deja el alta sin anterior cuando no sustituye nada', () => {
        const cambios = cambiosDeAdenda(ficha([signo({ signoId: 'nuevo', addedInRevision: true })]))

        expect(cambios[0].anterior).toBeUndefined()
    })

    it('no empareja un alta consigo misma aunque el servidor mande el vínculo mal', () => {
        const cambios = cambiosDeAdenda(ficha([
            signo({ signoId: 'nuevo', addedInRevision: true, replacesSignoId: 'nuevo' }),
        ]))

        expect(cambios[0].anterior).toBeUndefined()
    })

    it('pone los signos antes que los exámenes, como las secciones de la ficha', () => {
        const cambios = cambiosDeAdenda(ficha(
            [signo({ signoId: 's1', addedInRevision: true })],
            [examen({ examenId: 'e1', addedInRevision: true })],
        ))

        expect(cambios.map((cambio) => cambio.tipo)).toEqual(['SIGNO', 'EXAMEN'])
    })

    it('empareja también los exámenes y arrastra su adjunto', () => {
        const cambios = cambiosDeAdenda(ficha([], [
            examen({ examenId: 'viejo', replacedByExamenId: 'nuevo', examUrl: 'https://b/viejo.pdf' }),
            examen({ examenId: 'nuevo', addedInRevision: true, examUrl: 'https://b/nuevo.pdf' }),
        ]))

        expect(cambios[0].anterior?.imagenUrl).toBe('https://b/viejo.pdf')
        expect(cambios[0].nuevo.imagenUrl).toBe('https://b/nuevo.pdf')
    })
})

describe('decisionesCompletas', () => {
    const cambios = cambiosDeAdenda(ficha([
        signo({ signoId: 'a', addedInRevision: true }),
        signo({ signoId: 'b', addedInRevision: true }),
    ]))

    it('exige una decisión por cada cambio', () => {
        expect(decisionesCompletas(cambios, { a: 'APROBADO' })).toBe(false)
    })

    it('acepta la mezcla de aceptados y rechazados', () => {
        expect(decisionesCompletas(cambios, { a: 'APROBADO', b: 'RECHAZADO' })).toBe(true)
    })

    it('un rechazo no pide nada más: no hay motivo que escribir', () => {
        expect(decisionesCompletas(cambios, { a: 'RECHAZADO', b: 'RECHAZADO' })).toBe(true)
    })

    it('no deja guardar una adenda sin cambios', () => {
        expect(decisionesCompletas([], {})).toBe(false)
    })
})

describe('construirDecisiones', () => {
    const cambios: CambioSolicitado[] = cambiosDeAdenda(ficha(
        [signo({ signoId: 'a', addedInRevision: true })],
        [examen({ examenId: 'b', addedInRevision: true })],
    ))

    it('traduce el estado local al cuerpo del contrato', () => {
        const payload = construirDecisiones(cambios, { a: 'APROBADO', b: 'RECHAZADO' })

        expect(payload).toEqual([
            { tipo: 'SIGNO', id: 'a', decision: 'APROBADO' },
            { tipo: 'EXAMEN', id: 'b', decision: 'RECHAZADO' },
        ])
    })

    it('no deja armar un envío incompleto', () => {
        expect(() => construirDecisiones(cambios, { a: 'APROBADO' }))
            .toThrow(/no tiene decisión/)
    })

    it('cuenta los aprobados para el aviso del guardado', () => {
        const payload = construirDecisiones(cambios, { a: 'APROBADO', b: 'RECHAZADO' })

        expect(contarAprobados(payload)).toBe(1)
    })
})
