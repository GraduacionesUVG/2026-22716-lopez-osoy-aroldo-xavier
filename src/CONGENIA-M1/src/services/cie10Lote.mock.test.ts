/**
 * @fileoverview El mock de la revisión por lote como especificación ejecutable.
 *
 * Fija lo propuesto en `cie10-lote-pendientes-backend.md`: si el backend se
 * comporta distinto en alguno de estos casos, el desacuerdo está aquí.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    aceptarClausulaLoteMock,
    aceptarItemLoteMock,
    aceptarItemsLoteMock,
    buscarCatalogoCie10Mock,
    confirmarLoteMock,
    guardarCorreccionLoteMock,
    listarLotesMock,
    obtenerLoteMock,
    reiniciarLoteMock,
} from './cie10.mock'
import { ApiError } from './api.client'

const RUN = 'run-2026-10-17'

/** Avanza el retardo simulado y devuelve el resultado. */
async function listo<T>(promesa: Promise<T>): Promise<T> {
    await vi.advanceTimersByTimeAsync(1000)
    return promesa
}

/** El código del `ApiError` con que falla la promesa. */
async function codigoDeError(promesa: Promise<unknown>): Promise<string> {
    const resultado = promesa.then(() => 'sin error', (error: unknown) => (error instanceof ApiError ? error.code : 'otro'))
    await vi.advanceTimersByTimeAsync(1000)
    return resultado
}

beforeEach(() => {
    vi.useFakeTimers()
    reiniciarLoteMock()
})

afterEach(() => {
    vi.useRealTimers()
})

describe('GET /lotes', () => {
    it('separa pendientes y revisados, el mes más reciente primero', async () => {
        const pendientes = await listo(listarLotesMock('PENDIENTES', 1, 10))
        const revisados = await listo(listarLotesMock('REVISADOS', 1, 10))

        expect(pendientes.items.map((l) => l.periodo)).toEqual(['2026-09', '2026-08'])
        expect(revisados.items.slice(0, 3).map((l) => l.periodo)).toEqual(['2026-07', '2026-06', '2026-05'])
        expect(pendientes.counts).toEqual({ pendientes: 2, revisados: 12 })
    })

    it('pagina en el servidor: 10 por página y el resto en la siguiente', async () => {
        const primera = await listo(listarLotesMock('REVISADOS', 1, 10))
        const segunda = await listo(listarLotesMock('REVISADOS', 2, 10))

        expect(primera).toMatchObject({ total: 12, page: 1, pageSize: 10 })
        expect(primera.items).toHaveLength(10)
        expect(segunda.items.map((l) => l.periodo)).toEqual(['2025-09', '2025-08'])
    })

    it('cada tarjeta trae lo que falta o cuándo se confirmó', async () => {
        const [, agosto] = (await listo(listarLotesMock('PENDIENTES', 1, 10))).items
        const [julio] = (await listo(listarLotesMock('REVISADOS', 1, 10))).items

        expect(agosto).toMatchObject({ status: 'PENDIENTE_REVISION', pendientes: agosto.total, confirmedAt: null })
        expect(julio).toMatchObject({ status: 'CONFIRMADO', pendientes: 0, confirmedAt: '2026-08-20T16:40:00.000Z' })
    })

    it('un lote confirmado pasa a revisados', async () => {
        const lote = await listo(obtenerLoteMock('run-2026-09-16', 1, 50))
        for (const fila of lote.items) {
            if (fila.principal) {
                await listo(aceptarItemLoteMock('run-2026-09-16', fila.codigoTraductor, { codigo: fila.principal.codigo, posicion: 1, sugerenciasMostradas: 1 }))
            } else {
                await listo(guardarCorreccionLoteMock('run-2026-09-16', fila.codigoTraductor, { codigo: 'R69' }))
            }
        }
        await listo(aceptarClausulaLoteMock('run-2026-09-16', 'v1'))
        await listo(confirmarLoteMock('run-2026-09-16'))

        expect((await listo(listarLotesMock('REVISADOS', 1, 10))).items[0].periodo).toBe('2026-08')
    })
})

describe('GET /lotes/:runId', () => {
    it('un id que no existe es 404', async () => {
        expect(await codigoDeError(obtenerLoteMock('run-no-existe', 1, 20))).toBe('CIE10_BATCH_NOT_FOUND')
    })

    it('trae el periodo para el título', async () => {
        expect((await listo(obtenerLoteMock(RUN, 1, 20))).periodo).toBe('2026-09')
    })

    it('filtra por la confianza de la principal; sin código solo sale sin filtro', async () => {
        const todo = await listo(obtenerLoteMock(RUN, 1, 500))
        const media = await listo(obtenerLoteMock(RUN, 1, 500, { confianza: 'MEDIA' }))

        expect(media.items.length).toBeGreaterThan(0)
        expect(media.items.every((i) => i.principal?.confianza === 'MEDIA')).toBe(true)
        expect(media.items.some((i) => i.principal === null)).toBe(false)
        expect(todo.items.some((i) => i.principal === null)).toBe(true)
    })

    it('busca en la descripción médica sin importar mayúsculas ni acentos', async () => {
        const lote = await listo(obtenerLoteMock(RUN, 1, 50, { q: 'RODILLA' }))
        expect(lote.items.map((i) => i.codigoTraductor)).toContain('REG-001')
        expect(lote.items.every((i) => i.diagnostico.toLowerCase().includes('rodilla'))).toBe(true)

        const conAcento = await listo(obtenerLoteMock(RUN, 1, 50, { q: 'neumonia' }))
        expect(conAcento.items.map((i) => i.diagnostico)).toContain('Neumonía')
    })

    it('el conteo de pendientes es de todo el lote, no de lo filtrado', async () => {
        const todo = await listo(obtenerLoteMock(RUN, 1, 20))
        const filtrado = await listo(obtenerLoteMock(RUN, 1, 20, { confianza: 'ALTA', q: 'neumonia' }))
        expect(filtrado.counts).toEqual(todo.counts)
    })

    it('pone primero lo que no tiene código', async () => {
        const lote = await listo(obtenerLoteMock(RUN, 1, 50))
        expect(lote.items[0].principal).toBeNull()
    })

    it('las semillas llegan revisadas: una aceptada y una corregida', async () => {
        const lote = await listo(obtenerLoteMock(RUN, 1, 200))
        const aceptada = lote.items.find((i) => i.codigoTraductor === 'REG-002')!
        const corregida = lote.items.find((i) => i.codigoTraductor === 'REG-007')!

        expect(aceptada).toMatchObject({ reviewed: true, corrected: false, finalCode: 'J18.9' })
        expect(corregida).toMatchObject({ reviewed: true, corrected: true, finalCode: 'R69', status: 'CORREGIDO_POR_MEDICO' })
    })
})

describe('POST /lotes/:runId/items/aceptar', () => {
    it('acepta varias filas en una llamada', async () => {
        const { aceptados } = await listo(aceptarItemsLoteMock(RUN, [
            { codigoTraductor: 'REG-001', codigo: 'S83.9', posicion: 1, sugerenciasMostradas: 3 },
            { codigoTraductor: 'REG-003', codigo: 'S83.004A', posicion: 1, sugerenciasMostradas: 3 },
        ]))
        const lote = await listo(obtenerLoteMock(RUN, 1, 200))

        expect(aceptados.map((a) => a.codigoFinal)).toEqual(['S83.9', 'S83.004A'])
        expect(lote.items.filter((i) => ['REG-001', 'REG-003'].includes(i.codigoTraductor)).every((i) => i.reviewed)).toBe(true)
    })

    it('todo o nada: si una no calza, no se guarda ninguna', async () => {
        const error = await codigoDeError(aceptarItemsLoteMock(RUN, [
            { codigoTraductor: 'REG-001', codigo: 'S83.9', posicion: 1, sugerenciasMostradas: 3 },
            { codigoTraductor: 'REG-003', codigo: 'X00', posicion: 1, sugerenciasMostradas: 3 },
        ]))
        const lote = await listo(obtenerLoteMock(RUN, 1, 200))

        expect(error).toBe('SUGERENCIA_INVALIDA')
        expect(lote.items.find((i) => i.codigoTraductor === 'REG-001')?.reviewed).toBe(false)
    })

    it('no pisa una corrección médica', async () => {
        expect(await codigoDeError(aceptarItemsLoteMock(RUN, [
            { codigoTraductor: 'REG-007', codigo: 'R53', posicion: 1, sugerenciasMostradas: 3 },
        ]))).toBe('CIE10_YA_CORREGIDO')
    })

    it('pide al menos una fila', async () => {
        expect(await codigoDeError(aceptarItemsLoteMock(RUN, []))).toBe('ACEPTACION_MASIVA_INVALIDA')
    })
})

describe('POST /lotes/:runId/items/:id/aceptar', () => {
    it('guarda la sugerencia de esa posición', async () => {
        await listo(aceptarItemLoteMock(RUN, 'REG-001', { codigo: 'S83.8', posicion: 2, sugerenciasMostradas: 3 }))
        const lote = await listo(obtenerLoteMock(RUN, 1, 200))

        expect(lote.items.find((i) => i.codigoTraductor === 'REG-001')).toMatchObject({ reviewed: true, finalCode: 'S83.8', corrected: false })
    })

    it('rechaza un código que no está en esa posición', async () => {
        expect(await codigoDeError(aceptarItemLoteMock(RUN, 'REG-001', { codigo: 'S83.8', posicion: 1, sugerenciasMostradas: 3 })))
            .toBe('SUGERENCIA_INVALIDA')
    })

    it('rechaza una posición que no se mostró', async () => {
        expect(await codigoDeError(aceptarItemLoteMock(RUN, 'REG-001', { codigo: 'S83.8', posicion: 2, sugerenciasMostradas: 1 })))
            .toBe('SUGERENCIAS_MOSTRADAS_INVALIDAS')
    })
})

describe('PUT /lotes/:runId/items/:id', () => {
    it('guarda una corrección cuando la IA no mostró sugerencias', async () => {
        const revision = await listo(guardarCorreccionLoteMock(RUN, 'REG-005', {
            codigo: 'R69',
            sugerenciasMostradas: 0,
        }))
        expect(revision).toMatchObject({ codigoFinal: 'R69', corrected: true })
    })

    it('rechaza un código fuera del catálogo si no se pidió a propósito', async () => {
        expect(await codigoDeError(guardarCorreccionLoteMock(RUN, 'REG-005', { codigo: 'Z99.99' })))
            .toBe('CIE10_FUERA_DE_CATALOGO')
    })

    it('guarda un código fuera del catálogo con `fueraDeCatalogo`', async () => {
        const revision = await listo(guardarCorreccionLoteMock(RUN, 'REG-005', { codigo: 'Z99.99', fueraDeCatalogo: true }))
        expect(revision).toMatchObject({ codigoFinal: 'Z99.99', corrected: true })
    })

    it('aun fuera del catálogo exige formato CIE-10', async () => {
        expect(await codigoDeError(guardarCorreccionLoteMock(RUN, 'REG-005', { codigo: 'rodilla', fueraDeCatalogo: true })))
            .toBe('FORMATO_CIE10')
    })

    it('sin justificación: la corrección es solo el código', async () => {
        const revision = await listo(guardarCorreccionLoteMock(RUN, 'REG-005', { codigo: 'R69' }))
        expect(revision).toMatchObject({ codigoFinal: 'R69', comentario: null, corrected: true })
    })

    it('acepta códigos de referencia externa como S83.004A', async () => {
        const revision = await listo(guardarCorreccionLoteMock(RUN, 'REG-005', { codigo: 's83.004a' }))
        expect(revision).toMatchObject({ codigoFinal: 'S83.004A', corrected: true })
    })
})

describe('catálogo', () => {
    it('busca por código o descripción, sin importar acentos', async () => {
        expect((await listo(buscarCatalogoCie10Mock('r69'))).map((c) => c.codigo)).toContain('R69')
        expect((await listo(buscarCatalogoCie10Mock('neumonia'))).length).toBeGreaterThan(0)
        expect(await listo(buscarCatalogoCie10Mock('r'))).toEqual([])
    })

    it('no ofrece lo que la IA propuso sin respaldo', async () => {
        expect((await listo(buscarCatalogoCie10Mock('Q99'))).map((c) => c.codigo)).not.toContain('Q99.8')
    })
})

describe('confirmar', () => {
    it('pide la cláusula y no deja confirmar con filas sin revisar', async () => {
        expect(await codigoDeError(confirmarLoteMock(RUN))).toBe('CIE10_CLAUSE_REQUIRED')
        await listo(aceptarClausulaLoteMock(RUN, 'v1'))
        expect(await codigoDeError(confirmarLoteMock(RUN))).toBe('CIE10_BATCH_INCOMPLETE')
    })

    it('con todo revisado confirma y todo llega CONFIRMADO', async () => {
        const lote = await listo(obtenerLoteMock(RUN, 1, 500))
        for (const fila of lote.items.filter((i) => !i.reviewed)) {
            if (fila.principal) {
                await listo(aceptarItemLoteMock(RUN, fila.codigoTraductor, { codigo: fila.principal.codigo, posicion: 1, sugerenciasMostradas: 1 }))
            } else {
                await listo(guardarCorreccionLoteMock(RUN, fila.codigoTraductor, { codigo: 'R69' }))
            }
        }
        await listo(aceptarClausulaLoteMock(RUN, 'v1'))
        const confirmacion = await listo(confirmarLoteMock(RUN))
        const despues = await listo(obtenerLoteMock(RUN, 1, 500))

        expect(confirmacion.total).toBe(lote.total)
        expect(despues.items.every((i) => i.status === 'CONFIRMADO')).toBe(true)
        expect(despues.counts!.pendientes).toBe(0)
        expect(await codigoDeError(aceptarItemLoteMock(RUN, 'REG-001', { codigo: 'S83.9', posicion: 1, sugerenciasMostradas: 1 })))
            .toBe('CIE10_BATCH_ALREADY_CONFIRMED')
    })
})
