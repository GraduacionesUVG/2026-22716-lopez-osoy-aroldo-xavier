/**
 * @fileoverview Llamadas de la revisión CIE-10 por lote.
 *
 * El contrato vigente y lo que falta están en `cie10-lote-pendientes-backend.md`:
 * la lista de lotes, leer un lote por su id, aceptar filas, los filtros y los
 * conteos son propuestos, así que contra el servidor actual todavía no
 * existen. Mientras no aterricen, `USE_MOCK` desvía a `cie10.mock.ts`, que
 * implementa ese contrato en memoria para que la pantalla se ejercite entera.
 */

import { apiFetch } from './api.client'
import { APP_ENV, USE_CIE10_MOCK } from '../config/runtime'
import {
    aceptarClausulaLoteMock,
    aceptarItemLoteMock,
    aceptarItemsLoteMock,
    buscarCatalogoCie10Mock,
    confirmarLoteMock,
    guardarCorreccionLoteMock,
    listarLotesMock,
    obtenerLoteMock,
} from './cie10.mock'
import type {
    AceptacionLotePayload,
    AceptacionMasivaItem,
    CorreccionLotePayload,
    ConfirmacionLoteCie10,
    CatalogoCie10Item,
    FiltroLotesCie10,
    FiltrosLoteCie10,
    LoteCie10,
    PaginaLotesCie10,
    RevisionItemLote,
} from '../types/cie10'

/**
 * Solo se puede encender fuera de producción, aunque alguien olvide apagarlo:
 * aprobar códigos contra diagnósticos inventados es peor que no ver ninguno.
 */
const USE_MOCK = USE_CIE10_MOCK
    ? ['1', 'true', 'yes', 'on'].includes(USE_CIE10_MOCK.trim().toLowerCase())
    : ['development', 'dev', 'test'].includes(APP_ENV.trim().toLowerCase())

// Los diagnósticos van ligados a pacientes: PHI, así que nunca a la caché.
const options = { auth: 'bearer', sensitive: true } as const
const BASE = '/api/v1/cie10'

/** 20 y no 50: cada fila puede llevar hasta 5 sugerencias y la página se hacía eterna. */
export const CIE10_PAGE_SIZE_LOTE = 20

const lotePath = (runId: string) => `${BASE}/lotes/${encodeURIComponent(runId)}`
const itemLotePath = (runId: string, codigoTraductor: string) =>
    `${lotePath(runId)}/items/${encodeURIComponent(codigoTraductor)}`

export const CIE10_PAGE_SIZE_LOTES = 10

/** Propuesto: los lotes de un mes en cada tarjeta, pendientes o ya revisados. */
export async function listarLotes(
    filtro: FiltroLotesCie10,
    page = 1,
    pageSize = CIE10_PAGE_SIZE_LOTES,
): Promise<PaginaLotesCie10> {
    if (USE_MOCK) return listarLotesMock(filtro, page, pageSize)

    const query = new URLSearchParams({ estado: filtro, page: String(page), pageSize: String(pageSize) })
    return apiFetch<PaginaLotesCie10>(`${BASE}/lotes?${query.toString()}`, options)
}

/** Propuesto: un lote por su id. Reemplaza a `GET /lotes/activo`, que solo daba el último. */
export async function obtenerLote(
    runId: string,
    page = 1,
    pageSize = CIE10_PAGE_SIZE_LOTE,
    filtros: FiltrosLoteCie10 = {},
): Promise<LoteCie10> {
    if (USE_MOCK) return obtenerLoteMock(runId, page, pageSize, filtros)

    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    if (filtros.confianza) query.set('confianza', filtros.confianza)
    const q = filtros.q?.trim()
    if (q) query.set('q', q)
    return apiFetch<LoteCie10>(`${lotePath(runId)}?${query.toString()}`, options)
}

/** Propuesto: "Aceptar seleccionadas", en una sola llamada y todo o nada. */
export async function aceptarItemsLote(
    runId: string,
    items: AceptacionMasivaItem[],
): Promise<{ aceptados: RevisionItemLote[] }> {
    if (USE_MOCK) return aceptarItemsLoteMock(runId, items)

    return apiFetch(`${lotePath(runId)}/items/aceptar`, {
        ...options,
        method: 'POST',
        body: JSON.stringify({ items }),
    })
}

export async function buscarCatalogoCie10(q: string): Promise<CatalogoCie10Item[]> {
    if (USE_MOCK) return buscarCatalogoCie10Mock(q)

    const query = new URLSearchParams({ q, limit: '12' })
    const result = await apiFetch<{ items: CatalogoCie10Item[] }>(`${BASE}/catalogo?${query.toString()}`, options)
    return result.items
}

/** Propuesto: el médico confirma la sugerencia marcada en la fila. */
export async function aceptarItemLote(
    runId: string,
    codigoTraductor: string,
    payload: AceptacionLotePayload,
): Promise<RevisionItemLote> {
    if (USE_MOCK) return aceptarItemLoteMock(runId, codigoTraductor, payload)

    return apiFetch(`${itemLotePath(runId, codigoTraductor)}/aceptar`, {
        ...options,
        method: 'POST',
        body: JSON.stringify(payload),
    })
}

export async function guardarCorreccionLote(
    runId: string,
    codigoTraductor: string,
    payload: CorreccionLotePayload,
): Promise<RevisionItemLote> {
    if (USE_MOCK) return guardarCorreccionLoteMock(runId, codigoTraductor, payload)

    return apiFetch(itemLotePath(runId, codigoTraductor), {
        ...options,
        method: 'PUT',
        body: JSON.stringify(payload),
    })
}

export async function aceptarClausulaLote(runId: string, clauseVersion: string): Promise<void> {
    if (USE_MOCK) return aceptarClausulaLoteMock(runId, clauseVersion)

    await apiFetch(`${lotePath(runId)}/clausula`, {
        ...options,
        method: 'POST',
        body: JSON.stringify({ clauseVersion }),
    })
}

export async function confirmarLote(runId: string): Promise<ConfirmacionLoteCie10> {
    if (USE_MOCK) return confirmarLoteMock(runId)

    return apiFetch(`${lotePath(runId)}/confirmar`, {
        ...options,
        method: 'POST',
        body: JSON.stringify({}),
    })
}
