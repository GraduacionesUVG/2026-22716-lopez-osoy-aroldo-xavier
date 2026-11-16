/**
 * @fileoverview Congela la forma de las llamadas de la revisión CIE-10 por lote.
 *
 * El mock se apaga a propósito: aquí no se prueba qué devuelve el servidor, sino
 * qué URL y qué cuerpo sale del cliente. Si alguien renombra un parámetro o
 * cambia el path, se entera aquí y no en producción.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./api.client', () => ({ apiFetch: vi.fn() }))
// Con `APP_ENV` de producción y el flag apagado, el servicio habla con `apiFetch`.
vi.mock('../config/runtime', () => ({ APP_ENV: 'production', USE_CIE10_MOCK: 'false' }))

import { apiFetch } from './api.client'
import {
    aceptarClausulaLote,
    aceptarItemLote,
    aceptarItemsLote,
    buscarCatalogoCie10,
    confirmarLote,
    guardarCorreccionLote,
    listarLotes,
    obtenerLote,
} from './cie10.service'

function ultimaLlamada() {
    return vi.mocked(apiFetch).mock.calls.at(-1)
}

describe('contrato de la revisión CIE-10 por lote', () => {
    beforeEach(() => vi.clearAllMocks())

    it('la lista de lotes filtra por estado y pagina por número', async () => {
        await listarLotes('REVISADOS', 2, 10)

        expect(ultimaLlamada()?.[0]).toBe('/api/v1/cie10/lotes?estado=REVISADOS&page=2&pageSize=10')
        expect(ultimaLlamada()?.[1]).toMatchObject({ auth: 'bearer', sensitive: true })
    })

    it('un lote se lee por su id, escapado, con paginación y filtros', async () => {
        await obtenerLote('run/1', 2, 20, { confianza: 'MEDIA', q: ' rodilla izq ' })

        expect(ultimaLlamada()?.[0]).toBe('/api/v1/cie10/lotes/run%2F1?page=2&pageSize=20&confianza=MEDIA&q=rodilla+izq')
        expect(ultimaLlamada()?.[1]).toMatchObject({ auth: 'bearer', sensitive: true })
    })

    it('sin filtros, o con texto en blanco, no manda los parámetros', async () => {
        await obtenerLote('run-1', 1, 20, { q: '   ' })

        expect(ultimaLlamada()?.[0]).toBe('/api/v1/cie10/lotes/run-1?page=1&pageSize=20')
    })

    it('aceptar seleccionadas va en una sola llamada con todas las filas', async () => {
        const items = [
            { codigoTraductor: 'REG-001', codigo: 'S83.9', posicion: 1, sugerenciasMostradas: 3 },
            { codigoTraductor: 'REG-008', codigo: 'I10', posicion: 1, sugerenciasMostradas: 3 },
        ]
        await aceptarItemsLote('run-1', items)

        const [url, options] = ultimaLlamada() ?? []
        expect(url).toBe('/api/v1/cie10/lotes/run-1/items/aceptar')
        expect(options).toMatchObject({ method: 'POST', auth: 'bearer', sensitive: true })
        expect(JSON.parse(String(options?.body))).toEqual({ items })
    })

    it('aceptar una fila va por POST con el código, su posición y cuántas se mostraron', async () => {
        await aceptarItemLote('run-1', 'REG-001', { codigo: 'S83.8', posicion: 2, sugerenciasMostradas: 3 })

        const [url, options] = ultimaLlamada() ?? []
        expect(url).toBe('/api/v1/cie10/lotes/run-1/items/REG-001/aceptar')
        expect(options).toMatchObject({ method: 'POST', auth: 'bearer', sensitive: true })
        expect(JSON.parse(String(options?.body))).toEqual({ codigo: 'S83.8', posicion: 2, sugerenciasMostradas: 3 })
    })

    it('el autocomplete busca en el catálogo RAG activo', async () => {
        vi.mocked(apiFetch).mockResolvedValueOnce({ items: [] })
        await buscarCatalogoCie10('esguince rodilla')

        expect(ultimaLlamada()?.[0]).toBe('/api/v1/cie10/catalogo?q=esguince+rodilla&limit=12')
    })

    it('la corrección de lote escapa ambos identificadores', async () => {
        await guardarCorreccionLote('run/1', 'item/2', { codigo: 'N10', sugerenciasMostradas: 3 })

        const [url, options] = ultimaLlamada() ?? []
        expect(url).toBe('/api/v1/cie10/lotes/run%2F1/items/item%2F2')
        expect(options).toMatchObject({ method: 'PUT', auth: 'bearer', sensitive: true })
        // Solo el código: la corrección del lote no lleva justificación.
        expect(JSON.parse(String(options?.body))).toEqual({ codigo: 'N10', sugerenciasMostradas: 3 })
    })

    it('envía cero sugerencias mostradas cuando la IA se abstuvo', async () => {
        await guardarCorreccionLote('run-1', 'item-empty', { codigo: 'Z34.0', sugerenciasMostradas: 0 })

        const [, options] = ultimaLlamada() ?? []
        expect(JSON.parse(String(options?.body))).toEqual({ codigo: 'Z34.0', sugerenciasMostradas: 0 })
    })

    it('la aceptación liga al usuario con la versión de cláusula visible', async () => {
        await aceptarClausulaLote('run-1', 'CIE10-AI-REVIEW-V1')

        expect(ultimaLlamada()?.[0]).toBe('/api/v1/cie10/lotes/run-1/clausula')
        expect(JSON.parse(String(ultimaLlamada()?.[1]?.body))).toEqual({ clauseVersion: 'CIE10-AI-REVIEW-V1' })
    })

    it('la confirmación masiva usa un endpoint separado', async () => {
        await confirmarLote('run-1')

        expect(ultimaLlamada()?.[0]).toBe('/api/v1/cie10/lotes/run-1/confirmar')
        expect(ultimaLlamada()?.[1]).toMatchObject({ method: 'POST', auth: 'bearer', sensitive: true })
    })
})
