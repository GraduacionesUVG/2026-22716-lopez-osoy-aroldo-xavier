import { describe, expect, it } from 'vitest'
import type { MeProfile } from '../../services/ficha.service'
import { accessFromMe, can, NO_ACCESS, prefersDashboard, roleLabelOf, tenantsWith } from './permissions'

// Respuestas de GET /me tal como las arma congenia-m1-server (accessSummary) a
// partir de los grupos de Keycloak. La matriz vive en el servidor
// (config/access-policy.yaml); aqui solo se prueba que el cliente la lee bien.
function me(parcial: Partial<MeProfile>): MeProfile {
    return { subject: 's', displayName: 'X', especialidad: 'No especificada', roles: [], tenants: [], ...parcial }
}

const medico = me({
    roleLabel: 'Médico',
    permissions: ['dashboard', 'fichas.crear'],
    access: [
        { tenantId: 23, funciones: ['medicos'], permissions: ['dashboard', 'fichas.crear'], name: 'Clínica A', label: '23 - Clínica A' },
        { tenantId: 254, funciones: ['medicos'], permissions: ['dashboard', 'fichas.crear'], name: 'Hospital B', label: '254 - Hospital B' },
    ],
})

const revisor = me({
    roleLabel: 'Administrador',
    permissions: ['dashboard', 'cie10.corregir', 'reporteria'],
    access: [
        { tenantId: 23, funciones: ['revisores'], permissions: ['dashboard', 'cie10.corregir', 'reporteria'] },
    ],
})

// Revisor en una institucion y medico en otra.
const mixto = me({
    roleLabel: 'Administrador',
    permissions: ['dashboard', 'fichas.crear', 'cie10.corregir', 'reporteria'],
    access: [
        { tenantId: 23, funciones: ['revisores'], permissions: ['dashboard', 'cie10.corregir', 'reporteria'], name: 'Clínica A', label: '23 - Clínica A' },
        { tenantId: 254, funciones: ['medicos'], permissions: ['dashboard', 'fichas.crear'], name: 'Hospital B', label: '254 - Hospital B' },
    ],
})

const superadmin = me({
    roleLabel: 'Superadministrador',
    permissions: ['dashboard', 'fichas.crear', 'adendas.revisar', 'cie10.corregir', 'reporteria', 'catalogos.administrar'],
    globalPermissions: ['catalogos.administrar'],
    access: [
        { tenantId: 23, funciones: [], permissions: ['dashboard', 'fichas.crear', 'adendas.revisar', 'cie10.corregir', 'reporteria'] },
    ],
})

describe('accessFromMe', () => {
    it('toma los permisos que manda el servidor', () => {
        const access = accessFromMe(medico)
        expect(can(access, 'dashboard')).toBe(true)
        expect(can(access, 'fichas.crear')).toBe(true)
        expect(can(access, 'adendas.revisar')).toBe(false)
        expect(can(access, 'cie10.corregir')).toBe(false)
    })

    it('el revisor no resuelve adendas ni registra fichas', () => {
        const access = accessFromMe(revisor)
        expect(can(access, 'adendas.revisar')).toBe(false)
        expect(can(access, 'fichas.crear')).toBe(false)
        expect(can(access, 'cie10.corregir')).toBe(true)
    })

    it('sin grupos (o un servidor sin `permissions`) no abre nada', () => {
        expect(can(accessFromMe(me({ permissions: [], access: [], roleLabel: null })), 'dashboard')).toBe(false)
        expect(can(accessFromMe(me({})), 'dashboard')).toBe(false)
        expect(roleLabelOf(accessFromMe(me({})))).toBe('')
    })

    it('ignora valores que no son texto', () => {
        const raro = me({ permissions: ['dashboard', 7, null] as unknown as string[] })
        expect([...accessFromMe(raro).permissions]).toEqual(['dashboard'])
    })

    it('sin sesión no hay permisos', () => {
        expect(can(null, 'dashboard')).toBe(false)
        expect(can(NO_ACCESS, 'dashboard')).toBe(false)
    })
})

describe('tenantsWith', () => {
    it('solo las instituciones donde tiene el permiso', () => {
        expect(tenantsWith(accessFromMe(mixto), 'fichas.crear')).toEqual([
            { id: '254', name: 'Hospital B', label: '254 - Hospital B' },
        ])
        expect(tenantsWith(accessFromMe(mixto), 'dashboard').map((t) => t.id)).toEqual(['23', '254'])
    })

    it('sin nombre del catálogo usa el id', () => {
        expect(tenantsWith(accessFromMe(revisor), 'dashboard')).toEqual([{ id: '23', name: '23', label: '23' }])
    })

    it('el revisor no tiene dónde registrar', () => {
        expect(tenantsWith(accessFromMe(revisor), 'fichas.crear')).toEqual([])
    })
})

describe('prefersDashboard', () => {
    it('el médico se queda registrando fichas', () => {
        expect(prefersDashboard(accessFromMe(medico))).toBe(false)
    })

    it.each([['revisor', revisor], ['mixto', mixto], ['superadmin', superadmin]])(
        '%s empieza en el dashboard',
        (_nombre, perfil) => expect(prefersDashboard(accessFromMe(perfil))).toBe(true),
    )

    it('sin permiso de dashboard no se le manda ahí', () => {
        expect(prefersDashboard(accessFromMe(me({})))).toBe(false)
    })
})

describe('roleLabelOf', () => {
    it('muestra la etiqueta que decide el servidor', () => {
        expect(roleLabelOf(accessFromMe(superadmin))).toBe('Superadministrador')
        expect(roleLabelOf(accessFromMe(mixto))).toBe('Administrador')
        expect(roleLabelOf(null)).toBe('')
    })
})
