/**
 * @fileoverview Pruebas del filtrado y la paginación de la búsqueda de fichas.
 *
 * Se prueba el mock y no un adaptador de mentira porque esta es exactamente la
 * lógica que después tendrá que replicar `GET /v1/fichas` en el backend: cada
 * caso de aquí es una regla del contrato de `PENDIENTES-BACKEND.md`.
 */

import { describe, expect, it } from 'vitest'
import {
    DIAS_VENTANA_POR_DEFECTO,
    MOCK_FICHAS,
    filterFichas,
    paginate,
    searchFichasMock,
} from './fichaSearch.mock'
import type { FichaResumen } from '../types/ficha-search'

const fichas: FichaResumen[] = [
    { fichaId: 'a', nombrePaciente: 'María José Castro',  fechaConsulta: '2026-06-28', historiaClinica: '111', idTenant: 1 },
    { fichaId: 'b', nombrePaciente: 'Diego Castro Ruiz',  fechaConsulta: '2026-07-07', historiaClinica: '222', idTenant: 2 },
    { fichaId: 'c', nombrePaciente: 'Ana Lucía Menchú',   fechaConsulta: '2026-05-30', historiaClinica: '333', idTenant: 1 },
]

describe('filterFichas', () => {
    it('sin filtros devuelve todo', () => {
        expect(filterFichas(fichas, {})).toHaveLength(3)
    })

    it('busca por nombre sin distinguir mayúsculas ni acentos', () => {
        // El caso que motiva la normalización: nadie escribe el acento al buscar.
        expect(filterFichas(fichas, { q: 'maria' }).map((f) => f.fichaId)).toEqual(['a'])
        expect(filterFichas(fichas, { q: 'MENCHU' }).map((f) => f.fichaId)).toEqual(['c'])
    })

    it('un apellido trae a todos los que lo llevan', () => {
        // Lo que el médico espera de "Castro", y lo que el índice ciego resuelve
        // con una sola comparación de hash.
        expect(filterFichas(fichas, { q: 'Castro' }).map((f) => f.fichaId)).toEqual(['a', 'b'])
    })

    it('exige todas las palabras del término, en cualquier orden', () => {
        expect(filterFichas(fichas, { q: 'maria castro' }).map((f) => f.fichaId)).toEqual(['a'])
        expect(filterFichas(fichas, { q: 'castro maria' }).map((f) => f.fichaId)).toEqual(['a'])

        // "Diego" existe y "José" existe, pero en fichas distintas.
        expect(filterFichas(fichas, { q: 'diego jose' })).toEqual([])
    })

    it('no encuentra por fragmento de palabra', () => {
        // Límite real del índice ciego: un hash no admite LIKE. El mock lo
        // respeta para que la interfaz no se pruebe contra algo más permisivo
        // de lo que el backend podrá dar.
        expect(filterFichas(fichas, { q: 'Cast' })).toEqual([])
    })

    it('busca por número de historia clínica, incluso parcial', () => {
        // La historia clínica no está cifrada: ahí sí cabe la coincidencia parcial.
        expect(filterFichas(fichas, { q: '222' }).map((f) => f.fichaId)).toEqual(['b'])
        expect(filterFichas(fichas, { q: '22' }).map((f) => f.fichaId)).toEqual(['b'])
    })

    it('ignora los espacios alrededor del término', () => {
        expect(filterFichas(fichas, { q: '  diego  ' }).map((f) => f.fichaId)).toEqual(['b'])
    })

    it('devuelve vacío cuando nada coincide', () => {
        expect(filterFichas(fichas, { q: 'zzzz' })).toEqual([])
    })

    it('aplica el rango de fechas por ambos extremos, inclusive', () => {
        expect(filterFichas(fichas, { desde: '2026-06-28' }).map((f) => f.fichaId)).toEqual(['a', 'b'])
        expect(filterFichas(fichas, { hasta: '2026-06-28' }).map((f) => f.fichaId)).toEqual(['a', 'c'])

        // Un solo día: el mismo valor en ambos extremos tiene que encontrar la ficha.
        expect(filterFichas(fichas, { desde: '2026-07-07', hasta: '2026-07-07' }).map((f) => f.fichaId))
            .toEqual(['b'])
    })

    it('combina texto y fechas con AND', () => {
        // "Castro" son dos fichas; el rango deja solo la de junio.
        expect(filterFichas(fichas, { q: 'castro', desde: '2026-06-01', hasta: '2026-06-30' })
            .map((f) => f.fichaId)).toEqual(['a'])
    })

    it('trata un rango invertido como sin resultados, no como sin filtro', () => {
        expect(filterFichas(fichas, { desde: '2026-08-01', hasta: '2026-01-01' })).toEqual([])
    })
})

describe('paginate', () => {
    const items = [1, 2, 3, 4, 5]

    it('corta la página pedida', () => {
        expect(paginate(items, 1, 2)).toEqual([1, 2])
        expect(paginate(items, 2, 2)).toEqual([3, 4])
    })

    it('la última página puede venir incompleta', () => {
        expect(paginate(items, 3, 2)).toEqual([5])
    })

    it('una página más allá del final es vacía, no un error', () => {
        expect(paginate(items, 9, 2)).toEqual([])
    })
})

describe('searchFichasMock', () => {
    /** Rango que abarca todo el conjunto de prueba, para saltarse la ventana. */
    const TODO = { desde: '2000-01-01' }

    it('ordena de la consulta más reciente a la más antigua', async () => {
        const { items } = await searchFichasMock({ ...TODO, pageSize: 50 })
        const fechas = items.map((f) => f.fechaConsulta)

        expect(fechas).toEqual([...fechas].sort().reverse())
    })

    it('total cuenta lo filtrado, no lo devuelto en la página', async () => {
        const { items, total, page, pageSize } = await searchFichasMock({ ...TODO, page: 1, pageSize: 5 })

        expect(items).toHaveLength(5)
        expect(total).toBe(MOCK_FICHAS.length)
        expect(page).toBe(1)
        expect(pageSize).toBe(5)
    })

    it('las páginas sucesivas no repiten fichas', async () => {
        const primera = await searchFichasMock({ ...TODO, page: 1, pageSize: 5 })
        const segunda = await searchFichasMock({ ...TODO, page: 2, pageSize: 5 })

        const ids = new Set([...primera.items, ...segunda.items].map((f) => f.fichaId))
        expect(ids.size).toBe(10)
    })

    it('sin coincidencias devuelve una lista vacía con total 0', async () => {
        const { items, total } = await searchFichasMock({ ...TODO, q: 'no-existe-este-paciente' })

        expect(items).toEqual([])
        expect(total).toBe(0)
    })

    describe('ventana por defecto', () => {
        function haceDias(dias: number): string {
            const fecha = new Date()
            fecha.setDate(fecha.getDate() - dias)
            const mes = String(fecha.getMonth() + 1).padStart(2, '0')
            const dia = String(fecha.getDate()).padStart(2, '0')
            return `${fecha.getFullYear()}-${mes}-${dia}`
        }

        it('sin fechas acota al último mes en vez de devolver todo', async () => {
            // El control que no depende del cliente: aunque la interfaz mande el
            // filtro vacío, el servidor no entrega el historial completo.
            const { items, total } = await searchFichasMock({ pageSize: 50 })
            const limite = haceDias(DIAS_VENTANA_POR_DEFECTO)

            expect(total).toBeLessThan(MOCK_FICHAS.length)
            expect(items.length).toBeGreaterThan(0)
            expect(items.every((f) => f.fechaConsulta >= limite)).toBe(true)
        })

        it('una fecha dada por el médico manda sobre la ventana', async () => {
            const { total } = await searchFichasMock({ ...TODO, pageSize: 50 })

            expect(total).toBe(MOCK_FICHAS.length)
        })
    })
})
