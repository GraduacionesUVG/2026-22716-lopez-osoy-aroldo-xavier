/**
 * @fileoverview El mock de adendas como especificación ejecutable.
 *
 * Estas pruebas fijan el contrato de PENDIENTES-BACKEND.md secciones 10 y 11:
 * si el backend se comporta distinto en alguno de estos casos, el desacuerdo
 * está aquí.
 */

import { describe, expect, it } from 'vitest'
import {
    DIAS_VENTANA_POR_DEFECTO,
    filtrarAdendas,
    listarAdendasMock,
    obtenerAdendaMock,
    paginar,
    resolverAdendaMock,
} from './adendas.mock'
import type { AdendaResumen } from './ficha.service'
import { ApiError } from './api.client'

function adenda(partial: Partial<AdendaResumen> & { fichaId: string }): AdendaResumen {
    return {
        fichaRaizId: `${partial.fichaId}-raiz`,
        revision: 2,
        estadoRevision: 'PENDIENTE',
        fechaSolicitud: '2026-07-07',
        medicoSolicitante: 'Dr. Marco Paez',
        motivoSolicitud: 'Motivo',
        paciente: { nombre: 'Rachel Castro Morales', historiaClinica: '00445566777', tenantId: '23' },
        ...partial,
    }
}

const CONJUNTO: AdendaResumen[] = [
    adenda({ fichaId: 'a' }),
    adenda({
        fichaId: 'b',
        estadoRevision: 'APROBADA',
        medicoSolicitante: 'Dra. Lucía Morán',
        paciente: { nombre: 'Diego Armando Ruiz', historiaClinica: '00445566778', tenantId: '23' },
    }),
    adenda({
        fichaId: 'c',
        estadoRevision: 'RECHAZADA',
        fechaSolicitud: '2026-01-15',
        paciente: { nombre: 'María José Xoc', historiaClinica: '00998877', tenantId: '23' },
    }),
]

describe('filtrarAdendas', () => {
    it('el estado siempre acota: cada tab ve solo lo suyo', () => {
        expect(filtrarAdendas(CONJUNTO, { estado: 'PENDIENTE' }).map((a) => a.fichaId)).toEqual(['a'])
        expect(filtrarAdendas(CONJUNTO, { estado: 'APROBADA' }).map((a) => a.fichaId)).toEqual(['b'])
        expect(filtrarAdendas(CONJUNTO, { estado: 'RECHAZADA' }).map((a) => a.fichaId)).toEqual(['c'])
    })

    it('busca por nombre del paciente sin distinguir acentos ni mayúsculas', () => {
        expect(filtrarAdendas(CONJUNTO, { estado: 'RECHAZADA', q: 'maria' }).map((a) => a.fichaId))
            .toEqual(['c'])
    })

    it('exige todas las palabras del término, en cualquier orden', () => {
        expect(filtrarAdendas(CONJUNTO, { estado: 'PENDIENTE', q: 'castro rachel' })).toHaveLength(1)
        expect(filtrarAdendas(CONJUNTO, { estado: 'PENDIENTE', q: 'rachel ruiz' })).toHaveLength(0)
    })

    it('no encuentra por fragmento de nombre: el índice ciego no admite prefijos', () => {
        expect(filtrarAdendas(CONJUNTO, { estado: 'PENDIENTE', q: 'Cast' })).toHaveLength(0)
    })

    it('la historia clínica sí admite coincidencia parcial', () => {
        expect(filtrarAdendas(CONJUNTO, { estado: 'PENDIENTE', q: '4455667' })).toHaveLength(1)
    })

    it('busca también por el pediatra que la solicita, y por fragmento', () => {
        expect(filtrarAdendas(CONJUNTO, { estado: 'APROBADA', q: 'lucia' }).map((a) => a.fichaId))
            .toEqual(['b'])
        expect(filtrarAdendas(CONJUNTO, { estado: 'PENDIENTE', q: 'paez' })).toHaveLength(1)
    })

    it('el rango de fechas de solicitud es inclusivo en los dos extremos', () => {
        const params = { estado: 'RECHAZADA' as const, desde: '2026-01-15', hasta: '2026-01-15' }
        expect(filtrarAdendas(CONJUNTO, params)).toHaveLength(1)
        expect(filtrarAdendas(CONJUNTO, { ...params, desde: '2026-01-16' })).toHaveLength(0)
        expect(filtrarAdendas(CONJUNTO, { ...params, hasta: '2026-01-14' })).toHaveLength(0)
    })

    it('combina texto y fechas con AND', () => {
        expect(filtrarAdendas(CONJUNTO, {
            estado: 'RECHAZADA', q: 'maria', desde: '2026-02-01',
        })).toHaveLength(0)
    })
})

describe('paginar', () => {
    it('corta por página, 1-based', () => {
        expect(paginar([1, 2, 3, 4, 5], 2, 2)).toEqual([3, 4])
    })

    it('una página más allá del final viene vacía, no da error', () => {
        expect(paginar([1, 2], 9, 2)).toEqual([])
    })
})

describe('listarAdendasMock', () => {
    it('ordena por fecha de solicitud, la más reciente primero', async () => {
        const { items } = await listarAdendasMock({ estado: 'PENDIENTE' })
        const fechas = items.map((item) => item.fechaSolicitud)

        expect([...fechas].sort().reverse()).toEqual(fechas)
    })

    it('no esconde una pendiente vieja: en esa bandeja no hay ventana por defecto', async () => {
        const { items } = await listarAdendasMock({ estado: 'PENDIENTE' })
        const antigua = items.find((item) => item.fichaId === 'ad-003')

        expect(DIAS_VENTANA_POR_DEFECTO).toBe(30)
        expect(antigua).toBeDefined()
    })

    it('sí acota las resueltas cuando no llegan fechas, y las devuelve al pedirlas', async () => {
        const sinFechas = await listarAdendasMock({ estado: 'RECHAZADA' })
        expect(sinFechas.items.some((item) => item.fichaId === 'ad-007')).toBe(false)

        const conFechas = await listarAdendasMock({ estado: 'RECHAZADA', desde: '2000-01-01' })
        expect(conFechas.items.some((item) => item.fichaId === 'ad-007')).toBe(true)
    })

    it('`total` cuenta lo filtrado, antes de paginar', async () => {
        const { items, total } = await listarAdendasMock({ estado: 'PENDIENTE', pageSize: 1 })

        expect(items).toHaveLength(1)
        expect(total).toBeGreaterThan(1)
    })

    it('sin coincidencias devuelve una lista vacía, no un error', async () => {
        const resultado = await listarAdendasMock({ estado: 'PENDIENTE', q: 'Nadie Existente' })

        expect(resultado.items).toEqual([])
        expect(resultado.total).toBe(0)
    })
})

describe('obtenerAdendaMock', () => {
    it('trae la ficha completa con sus altas marcadas y el vínculo de sustitución', async () => {
        const ficha = await obtenerAdendaMock('ad-001')
        const altas = ficha.warningSigns.filter((signo) => signo.addedInRevision)

        expect(altas.length).toBeGreaterThan(0)
        expect(ficha.warningSigns.some((signo) => signo.replacedBySignoId)).toBe(true)
        expect(ficha.motivoSolicitud).toBeTruthy()
    })

    it('una adenda inexistente da 404', async () => {
        await expect(obtenerAdendaMock('no-existe')).rejects.toBeInstanceOf(ApiError)
    })
})

describe('resolverAdendaMock', () => {
    it('exige una decisión por cada alta', async () => {
        const ficha = await obtenerAdendaMock('ad-001')
        const primera = ficha.warningSigns.find((signo) => signo.addedInRevision)!

        await expect(resolverAdendaMock('ad-001', [
            { tipo: 'SIGNO', id: primera.signoId, decision: 'APROBADO' },
        ])).rejects.toMatchObject({ status: 400 })
    })

    // Va antes de resolver ad-001: resuelta, la respuesta seria 409 y no 400.
    it('las observaciones también exigen decisión', async () => {
        const ficha = await obtenerAdendaMock('ad-001')
        expect((ficha.observations ?? []).some((o) => o.addedInRevision)).toBe(true)

        const sinObservaciones = [
            ...ficha.warningSigns.filter((s) => s.addedInRevision)
                .map((s) => ({ tipo: 'SIGNO' as const, id: s.signoId, decision: 'APROBADO' as const })),
            ...ficha.examDiagnoses.filter((e) => e.addedInRevision)
                .map((e) => ({ tipo: 'EXAMEN' as const, id: e.examenId, decision: 'APROBADO' as const })),
        ]
        await expect(resolverAdendaMock('ad-001', sinObservaciones)).rejects.toMatchObject({ status: 400 })
    })

    it('aplica solo lo aceptado y devuelve a vigente lo que el rechazo sustituía', async () => {
        const antes = await obtenerAdendaMock('ad-001')
        const signos = antes.warningSigns.filter((signo) => signo.addedInRevision)
        const examenes = antes.examDiagnoses.filter((examen) => examen.addedInRevision)
        const observaciones = (antes.observations ?? []).filter((o) => o.addedInRevision)
        const rechazado = signos[0]
        const sustituido = antes.warningSigns.find((s) => s.replacedBySignoId === rechazado.signoId)!

        await resolverAdendaMock('ad-001', [
            { tipo: 'SIGNO', id: rechazado.signoId, decision: 'RECHAZADO' },
            ...signos.slice(1).map((s) => ({ tipo: 'SIGNO' as const, id: s.signoId, decision: 'APROBADO' as const })),
            ...examenes.map((e) => ({ tipo: 'EXAMEN' as const, id: e.examenId, decision: 'APROBADO' as const })),
            ...observaciones.map((o) => ({ tipo: 'OBSERVACION' as const, id: o.observacionId, decision: 'RECHAZADO' as const })),
        ])

        const despues = await obtenerAdendaMock('ad-001')

        // El alta rechazada desaparece.
        expect(despues.warningSigns.some((s) => s.signoId === rechazado.signoId)).toBe(false)
        // Y lo que sustituía vuelve a estar vigente.
        expect(despues.warningSigns.find((s) => s.signoId === sustituido.signoId)?.replacedBySignoId)
            .toBeNull()
        // Con al menos un cambio aceptado, la adenda queda aprobada.
        expect(despues.estadoRevision).toBe('APROBADA')
        // La observacion rechazada no entra a la ficha: no sustituia nada, solo se descarta.
        expect(despues.observations ?? []).toHaveLength(0)
    })

    it('rechazarlo todo deja la adenda rechazada y no vigente', async () => {
        const ficha = await obtenerAdendaMock('ad-002')
        const altas = ficha.warningSigns.filter((signo) => signo.addedInRevision)

        await resolverAdendaMock('ad-002', altas.map((s) => ({
            tipo: 'SIGNO' as const, id: s.signoId, decision: 'RECHAZADO' as const,
        })))

        const despues = await obtenerAdendaMock('ad-002')
        expect(despues.estadoRevision).toBe('RECHAZADA')
        expect(despues.esVigente).toBe(false)
    })

    it('no se puede resolver dos veces: la segunda da 409', async () => {
        const ficha = await obtenerAdendaMock('ad-003')
        const altas = ficha.examDiagnoses.filter((examen) => examen.addedInRevision)
        const decisiones = altas.map((e) => ({
            tipo: 'EXAMEN' as const, id: e.examenId, decision: 'APROBADO' as const,
        }))

        await resolverAdendaMock('ad-003', decisiones)
        await expect(resolverAdendaMock('ad-003', decisiones)).rejects.toMatchObject({ status: 409 })
    })
})
