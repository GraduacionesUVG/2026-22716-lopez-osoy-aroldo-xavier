/**
 * @fileoverview Búsqueda y lectura de fichas ya registradas (dashboard).
 *
 * El backend de estos dos endpoints todavía no existe: el contrato está escrito
 * en `PENDIENTES-BACKEND.md` y aquí se implementa contra él. Mientras no esté,
 * `USE_MOCK` desvía las llamadas a `fichaSearch.mock.ts`, que respeta el mismo
 * contrato -filtra y pagina de verdad- para que la UI se ejercite completa.
 *
 * Cuando el backend aterrice, lo único que cambia es el flag.
 *
 * @compliance HIPAA 164.312(c) - `sensitive: true`: las respuestas traen PHI
 * @compliance HIPAA 164.312(d) - `auth: 'bearer'`: el dashboard va con Keycloak
 */

import { apiFetch } from './api.client'
import { APP_ENV, USE_FICHA_SEARCH_MOCK } from '../config/runtime'
import type {
    FichaDetalle,
    FichaSearchParams,
    FichaSearchResult,
} from '../types/ficha-search'
import { getFichaByIdMock, searchFichasMock } from './fichaSearch.mock'

/**
 * Mientras el backend no exponga `/v1/fichas` no hay nada real contra qué hablar.
 * Se apaga solo al salir de desarrollo, así que producción nunca sirve datos
 * ficticios aunque alguien olvide cambiar esto.
 */
const USE_MOCK = USE_FICHA_SEARCH_MOCK
    ? ['1', 'true', 'yes', 'on'].includes(USE_FICHA_SEARCH_MOCK.trim().toLowerCase())
    : APP_ENV === 'test'

export const DEFAULT_PAGE_SIZE = 12

function buildQuery({ q, desde, hasta, page, pageSize }: FichaSearchParams): string {
    const params = new URLSearchParams()

    // Los vacíos no se mandan: `?q=` es un filtro por cadena vacía, no "sin filtro".
    if (q?.trim()) params.set('q', q.trim())
    if (desde) params.set('desde', desde)
    if (hasta) params.set('hasta', hasta)
    params.set('page', String(page ?? 1))
    params.set('pageSize', String(pageSize ?? DEFAULT_PAGE_SIZE))

    return params.toString()
}

export async function searchFichas(params: FichaSearchParams = {}): Promise<FichaSearchResult> {
    if (USE_MOCK) return searchFichasMock(params)

    return apiFetch<FichaSearchResult>(`/v1/fichas?${buildQuery(params)}`, {
        sensitive: true,
        auth: 'bearer',
    })
}

export async function getFichaById(fichaId: string): Promise<FichaDetalle> {
    if (USE_MOCK) return getFichaByIdMock(fichaId)

    return apiFetch<FichaDetalle>(`/v1/fichas/${encodeURIComponent(fichaId)}`, {
        sensitive: true,
        auth: 'bearer',
    })
}
