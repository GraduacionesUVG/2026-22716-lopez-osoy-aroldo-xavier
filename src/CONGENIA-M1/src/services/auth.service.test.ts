import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Estado simulado de oidc-client-ts: el usuario solo existe una vez que el
// callback (?code=...) se canjea, como pasa en el navegador.
const oidc = vi.hoisted(() => ({
    user: null as null | { access_token: string; expired: boolean; expires_in: number },
    signinRedirect: vi.fn(async () => undefined),
    signinRedirectCallback: vi.fn(),
}))

vi.mock('../config/runtime', () => ({
    OIDC_AUTHORITY: 'http://keycloak.test/realms/congenia',
    OIDC_CLIENT_ID: 'congenia-web',
}))

vi.mock('oidc-client-ts', () => ({
    UserManager: class {
        getUser = async () => oidc.user
        signinRedirect = oidc.signinRedirect
        signinRedirectCallback = oidc.signinRedirectCallback
        signinSilent = async () => null
        removeUser = async () => undefined
        clearStaleState = async () => undefined
        signoutRedirect = async () => undefined
    },
    WebStorageStateStore: class {},
}))

function stubWindow(search: string) {
    vi.stubGlobal('window', {
        location: { origin: 'http://localhost:8080', pathname: '/', search, hash: '', href: `http://localhost:8080/${search}` },
        history: { state: null, replaceState: vi.fn() },
        sessionStorage: { removeItem: vi.fn() },
    })
}

async function settle() {
    for (let i = 0; i < 10; i++) await Promise.resolve()
}

describe('getValidAccessToken - un login por carga de página', () => {
    beforeEach(() => {
        vi.resetModules()
        oidc.user = null
        oidc.signinRedirect.mockClear()
        oidc.signinRedirectCallback.mockReset()
    })

    afterEach(() => vi.unstubAllGlobals())

    it('al volver de Keycloak espera el canje del código y no lanza otro login', async () => {
        stubWindow('?code=one-time&state=abc')
        let finishCallback: () => void = () => undefined
        oidc.signinRedirectCallback.mockImplementation(() => new Promise((resolve) => {
            finishCallback = () => {
                oidc.user = { access_token: 'kc-token', expired: false, expires_in: 300 }
                resolve(oidc.user)
            }
        }))
        const { getValidAccessToken } = await import('./auth.service')

        // Perfil y catálogos piden token a la vez, antes de que termine el canje.
        const tokens = Promise.all([1, 2, 3, 4, 5].map(() => getValidAccessToken()))
        await settle()
        finishCallback()

        expect(await tokens).toEqual(Array(5).fill('kc-token'))
        expect(oidc.signinRedirectCallback).toHaveBeenCalledTimes(1)
        expect(oidc.signinRedirect).not.toHaveBeenCalled()
    })

    it('sin sesión, varias peticiones simultáneas producen una sola redirección', async () => {
        stubWindow('')
        const { getValidAccessToken } = await import('./auth.service')

        for (let i = 0; i < 5; i++) void getValidAccessToken()
        await settle()

        expect(oidc.signinRedirect).toHaveBeenCalledTimes(1)
    })
})
