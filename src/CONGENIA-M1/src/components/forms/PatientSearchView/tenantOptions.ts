/**
 * @fileoverview Instituciones (tenants) que se ofrecen en el selector de búsqueda.
 *
 * El `/me` del SADC devuelve `tenantOptions` con id y nombre, pero versiones
 * anteriores solo mandaban `tenants` como array de ids sueltos. Aquí se aplanan
 * ambas formas a una sola: lo que viaja al backend es siempre el `id`, y el
 * `label` es únicamente lo que lee el médico.
 *
 * Vive aparte del componente porque es lo único de esta pantalla que se puede
 * probar sin montarla.
 */

/** Institución tal como puede llegar desde el perfil: id suelto u objeto. */
export interface TenantSelectOption {
    id: string
    name?: string
    label?: string
}

/** Institución ya lista para pintar en un `<option>`. */
export interface NormalizedTenantOption {
    id: string
    label: string
}

/**
 * Unifica las dos formas del perfil en `{ id, label }`.
 *
 * Si no viene `label` se arma con el id y, cuando existe, el nombre; así el
 * médico distingue instituciones aunque el SADC solo mande el identificador.
 */
export function normalizeTenantOptions(
    tenantOptions: Array<string | TenantSelectOption>,
): NormalizedTenantOption[] {
    return tenantOptions.map((option) => {
        if (typeof option === 'string') return { id: option, label: option }
        return { id: option.id, label: option.label ?? `${option.id}${option.name ? ` - ${option.name}` : ''}` }
    })
}
