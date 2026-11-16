/**
 * @fileoverview Tipo y validación del rango de fechas.
 *
 * Viven fuera del componente porque una pantalla necesita validar el rango antes
 * de llamar al servicio, sin montar el control; y porque exportar funciones
 * junto a un componente rompe el fast refresh de Vite.
 */

export interface DateRange {
    /** ISO `YYYY-MM-DD`, o cadena vacía si no se eligió. */
    desde: string
    hasta: string
}

/** `true` si el rango está al revés. Vacíos = sin rango, y eso es válido. */
export function isInvalidRange({ desde, hasta }: DateRange): boolean {
    if (!desde || !hasta) return false
    return desde > hasta
}
