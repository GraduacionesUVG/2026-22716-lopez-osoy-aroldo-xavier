/**
 * @fileoverview Lo que el revisor elige en la tuerca, guardado en el navegador.
 *
 * Cuántas sugerencias ver por diagnóstico y si ver el detalle de la IA (el
 * "i"). Son preferencias, no datos clínicos: si no hay almacenamiento (ventana
 * privada, sitio bloqueado) solo se vuelve al valor por defecto.
 */

export const CANTIDAD_MIN = 1
export const CANTIDAD_MAX = 5
export const CANTIDAD_POR_DEFECTO = 5

const CANTIDAD_STORAGE_NAME = 'congenia.cie10.cantidad'
const VER_DETALLE_STORAGE_NAME = 'congenia.cie10.verDetalle'

export function clampCantidad(n: number): number {
    if (!Number.isFinite(n)) return CANTIDAD_POR_DEFECTO
    return Math.min(CANTIDAD_MAX, Math.max(CANTIDAD_MIN, Math.round(n)))
}

function leer(clave: string): string | null {
    try {
        return window.localStorage.getItem(clave)
    } catch {
        return null
    }
}

function guardar(clave: string, valor: string): void {
    try {
        window.localStorage.setItem(clave, valor)
    } catch {
        // Sin almacenamiento solo se pierde la preferencia.
    }
}

export function leerCantidad(): number {
    const guardada = leer(CANTIDAD_STORAGE_NAME)
    return guardada === null ? CANTIDAD_POR_DEFECTO : clampCantidad(Number(guardada))
}

export function guardarCantidad(cantidad: number): void {
    guardar(CANTIDAD_STORAGE_NAME, String(cantidad))
}

/** Por defecto se ve: apagarlo es una decisión del revisor, no al revés. */
export function leerVerDetalle(): boolean {
    return leer(VER_DETALLE_STORAGE_NAME) !== 'false'
}

export function guardarVerDetalle(ver: boolean): void {
    guardar(VER_DETALLE_STORAGE_NAME, String(ver))
}
