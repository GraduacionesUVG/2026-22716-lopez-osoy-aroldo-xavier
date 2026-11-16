/**
 * @fileoverview Permisos del medico autenticado, tal como los calcula la API.
 *
 * Las pantallas nunca preguntan por un rol: preguntan por un permiso (`can`).
 * El frontend ya no tiene matriz propia. `GET /me` devuelve los permisos que
 * salen de los grupos de Keycloak (`/instituciones/<tenant>/<funcion>`) segun
 * config/access-policy.yaml del servidor; aqui solo se leen. Un cambio de
 * politica en el servidor llega solo, sin tocar el cliente.
 *
 * @compliance ISO 27001 A.9.4.1 - el control de acceso efectivo es de servidor;
 *                                 el cliente solo refleja la decision
 */

import type { MeProfile, TenantOption } from '../../services/ficha.service'

/** Permisos que usa el frontend. El servidor puede mandar otros: se ignoran. */
export type Permission =
    | 'dashboard'
    | 'fichas.crear'
    | 'adendas.revisar'
    | 'cie10.corregir'
    | 'reporteria'

export interface TenantAccess extends TenantOption {
    permissions: ReadonlySet<string>
}

export interface Access {
    /** Union de los permisos en todas las instituciones activas. */
    permissions: ReadonlySet<string>
    roleLabel: string
    /** Permisos por institucion: la API filtra cada consulta con estos. */
    tenants: readonly TenantAccess[]
}

export const NO_ACCESS: Access = { permissions: new Set(), roleLabel: '', tenants: [] }

function strings(value: unknown): string[] {
    return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string')
        : []
}

/**
 * Lee la respuesta de `/me`. Un servidor anterior a los permisos no manda
 * `permissions`: queda sin acceso, nunca con acceso de mas.
 */
export function accessFromMe(me: MeProfile): Access {
    return {
        permissions: new Set(strings(me.permissions)),
        roleLabel: typeof me.roleLabel === 'string' ? me.roleLabel : '',
        tenants: (Array.isArray(me.access) ? me.access : []).map((entry) => {
            const id = String(entry.tenantId)
            return {
                id,
                name: entry.name ?? id,
                label: entry.label ?? id,
                permissions: new Set(strings(entry.permissions)),
            }
        }),
    }
}

export function can(access: Access | null | undefined, permission: Permission): boolean {
    return access?.permissions.has(permission) === true
}

/** Instituciones donde tiene el permiso, para los selectores. */
export function tenantsWith(access: Access | null | undefined, permission: Permission): TenantOption[] {
    return (access?.tenants ?? [])
        .filter((tenant) => tenant.permissions.has(permission))
        .map(({ id, name, label }) => ({ id, name, label }))
}

/**
 * A donde llevar a quien entro por `/` y volvio de Keycloak.
 *
 * Quien solo busca y registra fichas (el medico) se queda registrando. Quien
 * tiene algo mas del dashboard -o no puede registrar, como el admin- empieza
 * en el dashboard.
 */
export function prefersDashboard(access: Access | null | undefined): boolean {
    if (!can(access, 'dashboard')) return false
    if (!can(access, 'fichas.crear')) return true
    return can(access, 'adendas.revisar')
        || can(access, 'cie10.corregir')
        || can(access, 'reporteria')
}

/** Etiqueta del rol que decide el servidor (la funcion de mayor prioridad). */
export function roleLabelOf(access: Access | null | undefined): string {
    return access?.roleLabel ?? ''
}
