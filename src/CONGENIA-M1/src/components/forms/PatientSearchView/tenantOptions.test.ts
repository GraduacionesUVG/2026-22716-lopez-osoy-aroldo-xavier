import { describe, expect, it } from 'vitest'
import { normalizeTenantOptions } from './tenantOptions'

describe('normalizeTenantOptions', () => {
    it('keeps the tenant id as value and exposes a readable label', () => {
        expect(normalizeTenantOptions([
            { id: '23', name: 'PruebaInstitucion', label: '23 - PruebaInstitucion' },
            { id: '254', name: 'SADC' },
        ])).toEqual([
            { id: '23', label: '23 - PruebaInstitucion' },
            { id: '254', label: '254 - SADC' },
        ])
    })

    it('keeps compatibility with legacy tenant id arrays', () => {
        expect(normalizeTenantOptions(['23'])).toEqual([{ id: '23', label: '23' }])
    })
})
