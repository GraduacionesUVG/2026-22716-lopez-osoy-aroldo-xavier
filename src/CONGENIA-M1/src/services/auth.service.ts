/**
 * Autenticacion interactiva OIDC con Authorization Code + PKCE.
 * El access token vive en sessionStorage y solo se usa para crear la capability
 * temporal; las llamadas clinicas posteriores siguen protegidas por esa
 * capability de alcance reducido.
 */

import { UserManager, WebStorageStateStore, type User } from 'oidc-client-ts'
import { OIDC_AUTHORITY, OIDC_CLIENT_ID } from '../config/runtime'
import { cleanOidcCallbackUrl, oidcErrorMessage, readOidcCallback } from './oidc-callback'

const callbackUri = `${window.location.origin}/`

const userManager = new UserManager({
    authority: OIDC_AUTHORITY.replace(/\/+$/, ''),
    client_id: OIDC_CLIENT_ID,
    redirect_uri: callbackUri,
    post_logout_redirect_uri: callbackUri,
    response_type: 'code',
    scope: 'openid profile email',
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),
    stateStore: new WebStorageStateStore({ store: window.sessionStorage }),
    monitorSession: false,
    automaticSilentRenew: true,
})

let initialization: Promise<User> | null = null
let loginRedirect: Promise<void> | null = null

/**
 * Una sola navegacion a Keycloak por carga de pagina.
 */
function redirectToLogin(): Promise<never> {
    loginRedirect ??= userManager.signinRedirect({ state: currentReturnPath() })
    return loginRedirect.then(() => new Promise<never>(() => undefined))
}

/**
 * Ruta a la que volver despues del login.
 *
 * Viaja en el `state` de OIDC y lo lee el AuthProvider al procesar el callback.
 * Sin esto, entrar directo a `/dashboard/reporteria` sin sesion terminaba
 * siempre en `/`, porque ese es el unico `redirect_uri` del realm.
 */
function currentReturnPath(): string {
    return `${window.location.pathname}${window.location.search}`
}

async function discardOidcState(state: string | null): Promise<void> {
    // WebStorageStateStore usa el prefijo `oidc.` por defecto. La eliminación
    // explícita cubre callbacks incompletos que la librería no puede procesar.
    if (state) window.sessionStorage.removeItem(`oidc.${state}`)

    await Promise.allSettled([
        userManager.removeUser(),
        userManager.clearStaleState(),
    ])

    window.history.replaceState(
        window.history.state,
        '',
        cleanOidcCallbackUrl(window.location.href),
    )
}

async function rejectOidcCallback(code: string, state: string | null): Promise<never> {
    // Procesar primero permite que oidc-client-ts consuma el state correlacionado.
    // Un callback OAuth con `error` termina lanzando; eso es esperado aquí.
    if (state) {
        try {
            await userManager.signinRedirectCallback()
        } catch {
            // El error seguro y localizado se construye debajo.
        }
    }

    await discardOidcState(state)
    throw new Error(oidcErrorMessage(code))
}

export function requireAuthenticatedUser(): Promise<User> {
    if (initialization) return initialization

    initialization = (async () => {
        const callback = readOidcCallback(window.location)
        if (callback.kind === 'error') {
            return rejectOidcCallback(callback.code, callback.state)
        }

        if (callback.kind === 'success') {
            try {
                const callbackUser = await userManager.signinRedirectCallback()
                window.history.replaceState(
                    window.history.state,
                    '',
                    cleanOidcCallbackUrl(window.location.href),
                )
                return callbackUser
            } catch {
                await discardOidcState(callback.state)
                throw new Error('No se pudo validar la respuesta de inicio de sesión de Keycloak.')
            }
        }

        const existing = await userManager.getUser()
        if (existing && !existing.expired) return existing

        return redirectToLogin()
    })().catch((error) => {
        initialization = null
        throw error
    })

    return initialization
}

/**
 * Sesion OIDC ya establecida en este navegador, sin provocar un redirect.
 *
 * `requireAuthenticatedUser` exige sesion y manda a Keycloak si no la hay. Aqui
 * solo se consulta: sirve para el flujo que entra con una capability -incluido
 * recargar la ficha, porque el token sobrevive en `history.state`- donde el
 * medico puede tener sesion aunque no se le vaya a pedir.
 *
 * Devuelve null si no hay usuario, si expiro o si el almacenamiento falla.
 */
export async function getExistingUser(): Promise<User | null> {
    try {
        const user = await userManager.getUser()
        return user && !user.expired ? user : null
    } catch {
        return null
    }
}

/**
 * Avisa cada vez que oidc-client-ts carga un usuario: el login, la renovacion
 * silenciosa y el `refreshSession` de abajo. Sin esto el `AuthProvider` se
 * quedaba con el usuario del arranque, y un rol cambiado no llegaba al menu
 * hasta recargar.
 */
export function onUserLoaded(listener: (user: User) => void): () => void {
    userManager.events.addUserLoaded(listener)
    return () => userManager.events.removeUserLoaded(listener)
}

const RELOGIN_KEY = 'congenia.auth.reloginAt'
const RELOGIN_COOLDOWN_MS = 60_000

/**
 * La API rechazo el token (401): se descarta y se vuelve a Keycloak.
 *
 * Una vez por minuto como mucho. Si el servidor rechaza tambien el token recien
 * emitido -reloj desfasado, realm mal configurado- el SSO devolveria otro igual
 * al instante y la pagina entraria en bucle; en ese caso queda el error de la
 * pantalla.
 */
export function handleUnauthorized(): void {
    try {
        const last = Number(window.sessionStorage.getItem(RELOGIN_KEY) ?? 0)
        if (Date.now() - last < RELOGIN_COOLDOWN_MS) return
        window.sessionStorage.setItem(RELOGIN_KEY, String(Date.now()))
    } catch {
        // Sin almacenamiento no hay como contar intentos: se intenta igual.
    }

    initialization = null
    void userManager.removeUser()
        .catch(() => undefined)
        .then(() => redirectToLogin())
}

const REFRESH_COOLDOWN_MS = 30_000
let lastRefresh = 0

/**
 * La API respondio 403: puede que el rol haya cambiado en Keycloak despues de
 * emitir el token. Se pide uno nuevo para que el menu y las guardas reflejen
 * los roles de ahora. No cambia lo que decide el servidor: si el rol sigue
 * faltando, la pantalla muestra su aviso como antes.
 */
export async function refreshSession(): Promise<void> {
    if (Date.now() - lastRefresh < REFRESH_COOLDOWN_MS) return
    lastRefresh = Date.now()

    try {
        await userManager.signinSilent()
    } catch {
        // Se queda el token actual; el siguiente 401 lleva al login.
    }
}

export function logout(): Promise<void> {
    initialization = null
    loginRedirect = null
    return userManager.signoutRedirect()
}

export async function getValidAccessToken(): Promise<string> {
    // Al volver de Keycloak (?code=...) el canje lo hace requireAuthenticatedUser.
    // Pedir el token antes de que termine veia "sin usuario" y lanzaba otro
    // login; por eso se espera ese mismo canje en vez de decidir antes.
    if (initialization || readOidcCallback(window.location).kind !== 'none') {
        await requireAuthenticatedUser()
    }

    const user = await userManager.getUser()
    if (user && !user.expired && (user.expires_in ?? 0) > 30) {
        return user.access_token
    }

    if (user?.refresh_token) {
        try {
            const renewed = await userManager.signinSilent()
            if (renewed) return renewed.access_token
        } catch {
            await userManager.removeUser()
        }
    }

    initialization = null
    return redirectToLogin()
}
