import { describe, expect, it } from 'vitest'
import type { AgentChartBlock } from '../../../services/reporting.service'
import { formaDeGrafica } from './estiloGraficas'

const bloque = (extra: Partial<AgentChartBlock>): AgentChartBlock => ({
    type: 'bar_chart',
    title: 'Prueba',
    categoryKey: 'sexo',
    series: [{ dataKey: 'total', label: 'Registros' }],
    rows: [{ sexo: 'F', total: 10 }, { sexo: 'M', total: 8 }],
    ...extra,
})

const meses = [{ mes: '2025-01-01T00:00:00.000Z', total: 5 }, { mes: '2025-02-01T00:00:00.000Z', total: 7 }]
const diagnosticos = [{ diagnostico: 'INFECCION URINARIA', total: 12 }, { diagnostico: 'ANEMIA', total: 4 }]

describe('forma de una gráfica del agente', () => {
    it('categorías cortas: barras verticales sin leyenda', () => {
        expect(formaDeGrafica(bloque({}))).toEqual({
            tipo: 'barras', horizontal: false, apilada: false, tiempo: false, leyenda: false,
        })
    })

    it('una serie por mes: área, como "Registros por mes"', () => {
        expect(formaDeGrafica(bloque({ type: 'line_chart', categoryKey: 'mes', rows: meses })).tipo).toBe('area')
        // Aunque el backend la pida en barras.
        expect(formaDeGrafica(bloque({ categoryKey: 'mes', rows: meses })).tipo).toBe('area')
    })

    it('varias series por mes: líneas con leyenda', () => {
        const forma = formaDeGrafica(bloque({
            type: 'line_chart',
            categoryKey: 'mes',
            series: [{ dataKey: 'sigsa', label: 'Producción' }, { dataKey: 'congenia', label: 'Fichas' }],
            rows: meses.map(({ mes, total }) => ({ mes, sigsa: total, congenia: total })),
        }))
        expect(forma).toMatchObject({ tipo: 'lineas', leyenda: true })
    })

    it('categorías de texto largo: barras horizontales, como "Diagnósticos más frecuentes"', () => {
        expect(formaDeGrafica(bloque({ categoryKey: 'diagnostico', rows: diagnosticos })))
            .toMatchObject({ tipo: 'barras', horizontal: true })
    })

    it('pocas categorías medianas siguen en vertical; muchas pasan a horizontal', () => {
        const sexo = [{ sexo: 'Femenino', total: 1 }, { sexo: 'Masculino', total: 1 }, { sexo: 'Indeterminado', total: 1 }]
        expect(formaDeGrafica(bloque({ rows: sexo })).horizontal).toBe(false)
        const areas = Array.from({ length: 8 }, (_, i) => ({ area: `Departamento ${i}`, total: i }))
        expect(formaDeGrafica(bloque({ categoryKey: 'area', rows: areas })).horizontal).toBe(true)
    })

    it('apilada por mes: sigue en barras, con leyenda', () => {
        const forma = formaDeGrafica(bloque({
            type: 'stacked_bar',
            categoryKey: 'mes',
            series: [{ dataKey: 'PEDIATRIA', label: 'PEDIATRIA' }, { dataKey: 'GENETICA', label: 'GENETICA' }],
            rows: meses.map(({ mes }) => ({ mes, PEDIATRIA: 1, GENETICA: 2 })),
        }))
        expect(forma).toEqual({ tipo: 'barras', horizontal: false, apilada: true, tiempo: true, leyenda: true })
    })
})
