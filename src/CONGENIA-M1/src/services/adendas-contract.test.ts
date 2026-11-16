/**
 * @fileoverview Congela la forma de las dos llamadas de la bandeja de adendas.
 *
 * El mock se apaga a propósito: aquí no se prueba qué devuelve el servidor, sino
 * qué URL y qué cuerpo sale del cliente. Si alguien renombra un parámetro o
 * cambia el path, se entera aquí y no en producción.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./api.client', () => ({ apiFetch: vi.fn() }))
// Con `APP_ENV` de producción y el flag apagado, el servicio habla con `apiFetch`.
vi.mock('../config/runtime', () => ({ APP_ENV: 'production', USE_ADENDAS_MOCK: 'false' }))

import { apiFetch } from './api.client'
import { listarAdendas, resolverAdenda } from './ficha.service'

function ultimaLlamada() {
    return vi.mocked(apiFetch).mock.calls.at(-1)
}

describe('contrato de la bandeja de adendas', () => {
    beforeEach(() => vi.clearAllMocks())

    it('el estado y la paginación viajan siempre; los filtros vacíos no', async () => {
        await listarAdendas({ estado: 'PENDIENTE' })

        expect(ultimaLlamada()?.[0]).toBe('/api/v1/fichas/adendas?estado=PENDIENTE&page=1&pageSize=12')
    })

    it('manda texto y rango cuando los hay, con el término recortado', async () => {
        await listarAdendas({
            estado: 'RECHAZADA', q: '  castro  ', desde: '2026-01-01', hasta: '2026-07-07', page: 2, pageSize: 5,
        })

        const url = String(ultimaLlamada()?.[0])
        expect(url).toContain('estado=RECHAZADA')
        expect(url).toContain('q=castro')
        expect(url).toContain('desde=2026-01-01')
        expect(url).toContain('hasta=2026-07-07')
        expect(url).toContain('page=2')
        expect(url).toContain('pageSize=5')
    })

    it('un término en blanco no se manda: `?q=` filtraría por cadena vacía', async () => {
        await listarAdendas({ estado: 'APROBADA', q: '   ' })

        expect(String(ultimaLlamada()?.[0])).not.toContain('q=')
    })

    it('las lecturas van con bearer y sin caché: traen PHI', async () => {
        await listarAdendas({ estado: 'PENDIENTE' })

        expect(ultimaLlamada()?.[1]).toMatchObject({ auth: 'bearer', sensitive: true })
    })

    it('la resolución va por POST, con las decisiones bajo `decisiones`', async () => {
        await resolverAdenda('ficha-1', [
            { tipo: 'SIGNO', id: 's-1', decision: 'APROBADO' },
            { tipo: 'EXAMEN', id: 'e-1', decision: 'RECHAZADO' },
        ])

        const [url, options] = ultimaLlamada() ?? []
        expect(url).toBe('/api/v1/fichas/ficha-1/resolver')
        expect(options).toMatchObject({ method: 'POST', auth: 'bearer', sensitive: true })
        expect(JSON.parse(String(options?.body))).toEqual({
            decisiones: [
                { tipo: 'SIGNO', id: 's-1', decision: 'APROBADO' },
                { tipo: 'EXAMEN', id: 'e-1', decision: 'RECHAZADO' },
            ],
        })
    })

    it('el id de la ficha va escapado en la ruta', async () => {
        await resolverAdenda('con/barra', [])

        expect(ultimaLlamada()?.[0]).toBe('/api/v1/fichas/con%2Fbarra/resolver')
    })
})
