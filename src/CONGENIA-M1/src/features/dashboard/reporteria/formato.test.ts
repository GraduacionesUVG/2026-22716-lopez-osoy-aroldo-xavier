import { describe, expect, it } from 'vitest'
import {
    esClaveDeTiempo,
    formatearCategoria,
    formatearFecha,
    formatearMes,
    formatearNumeroCompacto,
    truncar,
    ultimosMeses,
} from './formato'

describe('formatearMes', () => {
    it('formatea año-mes en corto y en largo', () => {
        expect(formatearMes('2026-01')).toBe('ene 2026')
        expect(formatearMes('2026-09', 'largo')).toBe('septiembre de 2026')
    })

    it('acepta fecha completa sin correrse al mes anterior', () => {
        expect(formatearMes('2026-03-01')).toBe('mar 2026')
        expect(formatearMes('2026-03-01T00:00:00.000Z')).toBe('mar 2026')
    })

    it('devuelve tal cual lo que no reconoce', () => {
        expect(formatearMes('marzo')).toBe('marzo')
    })
})

describe('fechas del agente', () => {
    const ISO = '2025-01-01T00:00:00.000Z'

    it('una columna de mes se lee como mes', () => {
        expect(formatearCategoria(ISO, 'mes')).toBe('ene 2025')
        expect(formatearCategoria(ISO, 'periodo')).toBe('ene 2025')
        expect(formatearCategoria('2025-03')).toBe('mar 2025')
    })

    it('cualquier otra fecha se lee como día, en UTC', () => {
        expect(formatearCategoria(ISO, 'fecha')).toBe('01/01/2025')
        expect(formatearFecha('2025-12-31')).toBe('31/12/2025')
    })

    it('el texto normal no se toca', () => {
        expect(formatearCategoria('Pediatría', 'area')).toBe('Pediatría')
        expect(formatearCategoria('2025 fue un buen año')).toBe('2025 fue un buen año')
    })

    it('reconoce columnas de tiempo por nombre o por sus valores', () => {
        expect(esClaveDeTiempo('mes', [])).toBe(true)
        expect(esClaveDeTiempo('inicio', [ISO, '2025-02-01T00:00:00.000Z'])).toBe(true)
        expect(esClaveDeTiempo('area', ['Pediatría', 'Genética'])).toBe(false)
    })
})

describe('formatearNumeroCompacto', () => {
    it('usa siempre el mismo sufijo', () => {
        expect(formatearNumeroCompacto(0)).toBe('0')
        expect(formatearNumeroCompacto(950)).toBe('950')
        expect(formatearNumeroCompacto(4500)).toBe('4.5 k')
        expect(formatearNumeroCompacto(18000)).toBe('18 k')
        expect(formatearNumeroCompacto(190234)).toBe('190 k')
        expect(formatearNumeroCompacto(2_500_000)).toBe('2.5 M')
    })

    it('no redondea las marcas de un eje', () => {
        expect([450, 900, 1350, 1800].map(formatearNumeroCompacto)).toEqual(['450', '900', '1.35 k', '1.8 k'])
        expect(formatearNumeroCompacto(10_500)).toBe('10.5 k')
        expect(formatearNumeroCompacto(1_250_000)).toBe('1.25 M')
    })
})

describe('ultimosMeses', () => {
    it('se queda con los más recientes', () => {
        const items = Array.from({ length: 15 }, (_, i) => ({ mes: `2025-${String(i + 1).padStart(2, '0')}`, total: i }))
        const ultimos = ultimosMeses(items)
        expect(ultimos).toHaveLength(12)
        expect(ultimos[0].total).toBe(3)
        expect(ultimos[11].total).toBe(14)
    })
})

describe('truncar', () => {
    it('no toca lo que cabe', () => {
        expect(truncar('ASMA', 10)).toBe('ASMA')
    })

    it('corta con elipsis respetando el máximo', () => {
        const corto = truncar('INFECCION DE VIAS URINARIAS', 12)
        expect(corto).toBe('INFECCION D…')
        expect(corto).toHaveLength(12)
    })
})
