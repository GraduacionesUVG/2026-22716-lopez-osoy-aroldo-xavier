/**
 * @fileoverview Formato de números y meses para la reportería.
 *
 * Funciones puras para poder probarlas sin montar las gráficas.
 */

import type { MonthlyItem } from '../../../services/reporting.service'

const NUMERO = new Intl.NumberFormat('es-GT')
// Sin `notation: 'compact'`: en español ICU alterna `k` y `K` según el valor y
// el eje quedaba con etiquetas mezcladas.
const UN_DECIMAL = new Intl.NumberFormat('es-GT', { maximumFractionDigits: 1 })
// Tres cifras y no un decimal: los ejes van en números redondos (450, 900,
// 1350…) y con un decimal 1350 salía "1.4 k", que no es lo que marca.
const TRES_CIFRAS = new Intl.NumberFormat('es-GT', { maximumSignificantDigits: 3 })

// UTC en ambos: el mes llega como fecha sin hora, y en la zona local de
// Guatemala (UTC-6) el día 1 a medianoche caería en el mes anterior.
const MES_CORTO = new Intl.DateTimeFormat('es-GT', { month: 'short', year: 'numeric', timeZone: 'UTC' })
const MES_LARGO = new Intl.DateTimeFormat('es-GT', { month: 'long', year: 'numeric', timeZone: 'UTC' })

/** `2026-01`, `2026-01-01` o `2026-01-01T00:00:00.000Z`. */
const PATRON_MES = /^(\d{4})-(\d{2})/

export function formatearNumero(valor: number): string {
    return NUMERO.format(valor)
}

/** Para los ejes: `1350` → `1.35 k`, `190234` → `190 k`. */
export function formatearNumeroCompacto(valor: number): string {
    const absoluto = Math.abs(valor)
    if (absoluto >= 1_000_000) return `${TRES_CIFRAS.format(valor / 1_000_000)} M`
    if (absoluto >= 1_000) return `${TRES_CIFRAS.format(valor / 1_000)} k`
    return UN_DECIMAL.format(valor)
}

/**
 * `2026-01` → `ene 2026` (corto) o `enero de 2026` (largo). Si el backend manda
 * otro formato se devuelve tal cual, que es mejor que una fecha inventada.
 */
export function formatearMes(mes: string, estilo: 'corto' | 'largo' = 'corto'): string {
    const match = PATRON_MES.exec(mes)
    if (!match) return mes

    const fecha = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1))
    return (estilo === 'corto' ? MES_CORTO : MES_LARGO).format(fecha)
}

const FECHA = new Intl.DateTimeFormat('es-GT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })

/** `2026-01`: un mes sin día. */
const PATRON_SOLO_MES = /^\d{4}-\d{2}$/
/** `2026-01-15` o `2026-01-15T00:00:00.000Z`, que es como llega un `date` de PostgreSQL. */
const PATRON_FECHA = /^(\d{4})-(\d{2})-(\d{2})(?:T[\d:.]+Z?)?$/
/** Columnas que el agente devuelve truncadas al mes (`date_trunc('month', …)`). */
const CLAVES_DE_MES = /^(mes|periodo)$/i
const CLAVES_DE_TIEMPO = /^(mes|periodo|fecha)$/i

/** `2026-01-15T00:00:00.000Z` → `15/01/2026`. Lo que no sea fecha se devuelve tal cual. */
export function formatearFecha(valor: string): string {
    const match = PATRON_FECHA.exec(valor)
    if (!match) return valor
    return FECHA.format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))))
}

/**
 * Un valor de categoría (celda de texto, eje de una gráfica) listo para leer.
 * La clave decide si una fecha es un mes: `mes: 2025-01-01T00:00:00.000Z` es
 * "ene 2025", pero `fecha` con el mismo valor es el 1 de enero.
 */
export function formatearCategoria(valor: string, clave?: string): string {
    if (PATRON_SOLO_MES.test(valor) || (clave && CLAVES_DE_MES.test(clave) && PATRON_FECHA.test(valor))) {
        return formatearMes(valor)
    }
    return formatearFecha(valor)
}

/** Si la columna es de tiempo, por su nombre o porque sus valores son fechas. */
export function esClaveDeTiempo(clave: string, valores: unknown[]): boolean {
    if (CLAVES_DE_TIEMPO.test(clave)) return true
    return valores.length > 0 && valores.every((valor) => typeof valor === 'string' && PATRON_MES.test(valor))
}

/** Los últimos `cantidad` meses; la serie llega ordenada del más viejo al más nuevo. */
export function ultimosMeses(items: MonthlyItem[], cantidad = 12): MonthlyItem[] {
    return items.slice(-cantidad)
}

export function truncar(texto: string, maximo: number): string {
    return texto.length <= maximo ? texto : `${texto.slice(0, maximo - 1).trimEnd()}…`
}
