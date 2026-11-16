/**
 * @fileoverview Configuración resuelta en tiempo de arranque.
 *
 * El orden de precedencia es deliberado:
 *
 *   1. `window.__CONGENIA_CONFIG__`  - lo escribe el contenedor al iniciar
 *   2. `import.meta.env.VITE_*`      - lo hornea el build (compatibilidad)
 *   3. valor por defecto             - mismo origen para la API propia
 *
 * El motivo del cambio: `VITE_API_BASE_URL` se resolvía en tiempo de build, de
 * modo que la imagen quedaba atada a una URL concreta -llegó a producción
 * apuntando a `http://159.89.88.142:3000`- y mover la API obligaba a
 * reconstruir y volver a publicar. Con el ALB delante, además, el valor
 * correcto casi siempre es "el mismo origen".
 */

export interface RuntimeConfig {
    API_BASE_URL: string
    /** Realm OIDC que muestra el login de Keycloak para el acceso manual. */
    OIDC_AUTHORITY: string
    OIDC_CLIENT_ID: string
    APP_ENV: string
    USE_FICHA_SEARCH_MOCK: string
    USE_ADENDAS_MOCK: string
    USE_CIE10_MOCK: string
    ALLOW_DEV_SESSION: string
}

declare global {
    interface Window {
        __CONGENIA_CONFIG__?: Partial<RuntimeConfig>
    }
}

function readRuntimeValue(key: keyof RuntimeConfig): string | undefined {
    if (typeof window === 'undefined') return undefined

    const value = window.__CONGENIA_CONFIG__?.[key]
    if (typeof value !== 'string') return undefined

    const trimmed = value.trim()
    // Una variable sin sustituir ("${API_BASE_URL}") vale menos que nada:
    // pasaría los controles de "no vacío" y produciría URLs imposibles.
    if (trimmed === '' || trimmed.startsWith('${')) return undefined

    return trimmed
}

function resolveApiBaseUrl(): string {
    const runtime = readRuntimeValue('API_BASE_URL')
    if (runtime !== undefined) return runtime.replace(/\/+$/, '')

    const build = import.meta.env.VITE_API_BASE_URL
    if (typeof build === 'string' && build.trim() !== '') return build.trim().replace(/\/+$/, '')

    // Mismo origen: `fetch('/v1/...')` sale al host que sirvió la página.
    return ''
}

export const API_BASE_URL: string = resolveApiBaseUrl()

/**
 * Origen de la página, o cadena vacía fuera del navegador.
 *
 * El realm por defecto se arma con el origen actual, pero este módulo también se
 * importa desde pruebas en node, donde no hay `window`: sin esta guarda, cargar
 * el módulo lanzaba antes de que nadie llegara a leer la configuración.
 */
function currentOrigin(): string {
    return typeof window === 'undefined' ? '' : window.location.origin
}

const buildOidcAuthority = import.meta.env.VITE_OIDC_AUTHORITY
export const OIDC_AUTHORITY: string = readRuntimeValue('OIDC_AUTHORITY') ?? (
    typeof buildOidcAuthority === 'string' && buildOidcAuthority.trim()
        ? buildOidcAuthority.trim()
        : `${currentOrigin()}/realms/congenia`
)

const buildOidcClientId = import.meta.env.VITE_OIDC_CLIENT_ID
export const OIDC_CLIENT_ID: string = readRuntimeValue('OIDC_CLIENT_ID') ?? (
    typeof buildOidcClientId === 'string' && buildOidcClientId.trim()
        ? buildOidcClientId.trim()
        : 'congenia-web'
)

export const APP_ENV: string =
    readRuntimeValue('APP_ENV') ?? import.meta.env.VITE_APP_ENV ?? 'development'

export const USE_FICHA_SEARCH_MOCK: string =
    readRuntimeValue('USE_FICHA_SEARCH_MOCK') ?? import.meta.env.VITE_USE_FICHA_SEARCH_MOCK ?? ''

export const USE_ADENDAS_MOCK: string =
    readRuntimeValue('USE_ADENDAS_MOCK') ?? import.meta.env.VITE_USE_ADENDAS_MOCK ?? ''

export const USE_CIE10_MOCK: string =
    readRuntimeValue('USE_CIE10_MOCK') ?? import.meta.env.VITE_USE_CIE10_MOCK ?? ''

export const ALLOW_DEV_SESSION: string =
    readRuntimeValue('ALLOW_DEV_SESSION') ?? import.meta.env.VITE_ALLOW_DEV_SESSION ?? ''
