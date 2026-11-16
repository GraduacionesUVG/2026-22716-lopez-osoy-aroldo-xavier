const OIDC_RESPONSE_KEYS = [
    'code',
    'error',
    'error_description',
    'error_uri',
    'iss',
    'session_state',
    'state',
]

export type OidcCallback =
    | { kind: 'none' }
    | { kind: 'success'; state: string }
    | { kind: 'error'; code: string; state: string | null }

interface LocationLike {
    search: string
    hash: string
}

function callbackFrom(params: URLSearchParams): OidcCallback | null {
    const error = params.get('error')
    if (error) {
        return { kind: 'error', code: error, state: params.get('state') }
    }

    const code = params.get('code')
    if (!code) return null

    const state = params.get('state')
    if (!state) {
        return { kind: 'error', code: 'invalid_callback', state: null }
    }

    return { kind: 'success', state }
}

export function readOidcCallback(location: LocationLike): OidcCallback {
    const queryCallback = callbackFrom(new URLSearchParams(location.search))
    if (queryCallback) return queryCallback

    const fragmentCallback = callbackFrom(new URLSearchParams(location.hash.replace(/^#/, '')))
    return fragmentCallback ?? { kind: 'none' }
}

export function oidcErrorMessage(code: string): string {
    if (code === 'invalid_scope') {
        return 'Keycloak rechazó los permisos solicitados. Contacte al administrador del sistema.'
    }
    if (code === 'access_denied') {
        return 'El acceso fue cancelado o denegado por Keycloak.'
    }
    if (code === 'login_required') {
        return 'Keycloak requiere que vuelvas a iniciar sesión.'
    }
    return 'Keycloak no pudo completar el inicio de sesión.'
}

/** Elimina únicamente parámetros OIDC; conserva cualquier parámetro propio. */
export function cleanOidcCallbackUrl(rawUrl: string): string {
    const url = new URL(rawUrl)
    for (const key of OIDC_RESPONSE_KEYS) url.searchParams.delete(key)

    const fragment = new URLSearchParams(url.hash.replace(/^#/, ''))
    if (OIDC_RESPONSE_KEYS.some((key) => fragment.has(key))) {
        for (const key of OIDC_RESPONSE_KEYS) fragment.delete(key)
        const cleanFragment = fragment.toString()
        url.hash = cleanFragment ? `#${cleanFragment}` : ''
    }

    return `${url.pathname}${url.search}${url.hash}`
}
