import { describe, expect, it } from 'vitest'
import { groupFamiliares, ladoDelFamiliar } from './familiarGroups'
import type { CatFamiliar } from '../services/catalog.service'

/** El catálogo tal y como lo sirve el backend, en su orden. */
const CATALOGO: CatFamiliar[] = [
    'Madre', 'Padre', 'Hermano(a)',
    'Abuela materna', 'Abuelo materno', 'Tía materna', 'Tío materno', 'Prima materna', 'Primo materno',
    'Abuela paterna', 'Abuelo paterno', 'Tía paterna', 'Tío paterno', 'Prima paterna', 'Primo paterno',
].map((nombre, i) => ({ familiar_catalogo_id: i + 1, nombre }))

const etiquetasDe = (groups: ReturnType<typeof groupFamiliares>, label: string) =>
    groups.find((g) => g.groupLabel === label)?.options.map((o) => o.label) ?? []

describe('ladoDelFamiliar', () => {
    it('lee el lado de la palabra completa', () => {
        expect(ladoDelFamiliar('Abuela materna')).toBe('materno')
        expect(ladoDelFamiliar('Tío paterno')).toBe('paterno')
    })

    // La regresión: la "m" de "priMo" hacía materno a todo primo, viniera del
    // lado que viniera.
    it('no confunde la "m" de primo con la marca de materno', () => {
        expect(ladoDelFamiliar('Primo paterno')).toBe('paterno')
        expect(ladoDelFamiliar('Prima paterna')).toBe('paterno')
    })

    it('acepta la inicial abreviada, pero solo como palabra suelta', () => {
        expect(ladoDelFamiliar('Abuela M.')).toBe('materno')
        expect(ladoDelFamiliar('Abuelo P.')).toBe('paterno')
    })

    it('deja sin lado a quien no lo declara', () => {
        expect(ladoDelFamiliar('Madre')).toBeNull()
        expect(ladoDelFamiliar('Hermano(a)')).toBeNull()
    })
})

describe('groupFamiliares', () => {
    it('lleva los primos de cada lado a su grupo', () => {
        const groups = groupFamiliares(CATALOGO)

        expect(etiquetasDe(groups, 'Familia paterna')).toContain('Primo paterno')
        expect(etiquetasDe(groups, 'Familia paterna')).toContain('Prima paterna')
        expect(etiquetasDe(groups, 'Familia materna')).not.toContain('Primo paterno')
        expect(etiquetasDe(groups, 'Familia materna')).not.toContain('Prima paterna')
    })

    it('reparte el catálogo completo sin repetir ni perder a nadie', () => {
        const groups = groupFamiliares(CATALOGO)
        const ids = groups.flatMap((g) => g.options.map((o) => o.value))

        expect(ids).toHaveLength(CATALOGO.length)
        expect(new Set(ids).size).toBe(CATALOGO.length)
    })

    it('agrupa en núcleo, materna y paterna', () => {
        const groups = groupFamiliares(CATALOGO)

        expect(groups.map((g) => g.groupLabel)).toEqual([
            'Núcleo familiar', 'Familia materna', 'Familia paterna',
        ])
        expect(etiquetasDe(groups, 'Núcleo familiar')).toEqual(['Madre', 'Padre', 'Hermano(a)'])
        expect(etiquetasDe(groups, 'Familia materna')).toHaveLength(6)
        expect(etiquetasDe(groups, 'Familia paterna')).toHaveLength(6)
    })

    it('usa el id del catálogo como valor', () => {
        const groups = groupFamiliares([{ familiar_catalogo_id: 42, nombre: 'Prima paterna' }])

        expect(groups).toEqual([
            { groupLabel: 'Familia paterna', options: [{ value: '42', label: 'Prima paterna' }] },
        ])
    })

    it('manda al núcleo a quien no declara lado, en vez de descartarlo', () => {
        const groups = groupFamiliares([{ familiar_catalogo_id: 1, nombre: 'Pariente lejano' }])

        expect(groups).toEqual([
            { groupLabel: 'Núcleo familiar', options: [{ value: '1', label: 'Pariente lejano' }] },
        ])
    })

    it('no inventa grupos con el catálogo vacío', () => {
        expect(groupFamiliares([])).toEqual([])
    })
})
