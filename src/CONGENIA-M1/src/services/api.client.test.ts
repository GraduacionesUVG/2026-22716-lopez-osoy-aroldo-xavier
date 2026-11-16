import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiFetch, setAccessTokenProvider, setAuthFailureHandlers, setSessionToken } from './api.client'

function lastHeaders(): Headers {
    const call = vi.mocked(fetch).mock.calls.at(-1)
    return new Headers((call?.[1] as RequestInit | undefined)?.headers)
}

describe('apiFetch - lecturas de catálogos (modo session)', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 200 })))
        setSessionToken(null)
        setAccessTokenProvider(null)
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        setSessionToken(null)
        setAccessTokenProvider(null)
    })

    it('durante la captura envía la sesión y no pide token de Keycloak', async () => {
        const provider = vi.fn(async () => 'kc-token')
        setAccessTokenProvider(provider)
        setSessionToken('session-capability')

        await apiFetch('/v1/ReferidoDe')

        const headers = lastHeaders()
        expect(headers.get('X-Session-Token')).toBe('session-capability')
        expect(headers.get('Authorization')).toBeNull()
        expect(headers.get('X-Request-Id')).toBeTruthy()
        expect(provider).not.toHaveBeenCalled()
    })

    it('fuera de la captura envía el bearer del médico', async () => {
        setAccessTokenProvider(async () => 'kc-token')

        await apiFetch('/v1/PartesCuerpo')

        const headers = lastHeaders()
        expect(headers.get('Authorization')).toBe('Bearer kc-token')
        expect(headers.get('X-Session-Token')).toBeNull()
    })
})

describe('apiFetch - rechazos del token de Keycloak', () => {
    const onUnauthorized = vi.fn()
    const onForbidden = vi.fn()

    function responder(status: number, error: string) {
        vi.stubGlobal('fetch', vi.fn(async () =>
            new Response(JSON.stringify({ success: false, error, message: error }), { status })))
    }

    beforeEach(() => {
        onUnauthorized.mockClear()
        onForbidden.mockClear()
        setSessionToken(null)
        setAccessTokenProvider(async () => 'kc-token')
        setAuthFailureHandlers({ onUnauthorized, onForbidden })
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        setSessionToken(null)
        setAccessTokenProvider(null)
        setAuthFailureHandlers({})
    })

    it('un 401 con bearer pide volver a iniciar sesión y la pantalla igual recibe el error', async () => {
        responder(401, 'UNAUTHORIZED')

        await expect(apiFetch('/api/v1/me', { auth: 'bearer' })).rejects.toBeInstanceOf(ApiError)
        expect(onUnauthorized).toHaveBeenCalledOnce()
        expect(onForbidden).not.toHaveBeenCalled()
    })

    it('un 403 FORBIDDEN con bearer pide refrescar la sesión', async () => {
        responder(403, 'FORBIDDEN')

        await expect(apiFetch('/api/v1/cie10/sugerencias', { auth: 'bearer' })).rejects.toMatchObject({ status: 403 })
        expect(onForbidden).toHaveBeenCalledOnce()
        expect(onUnauthorized).not.toHaveBeenCalled()
    })

    it('otro 403 (perfil incompleto, adenda propia) no es falta de rol', async () => {
        responder(403, 'USER_PROFILE_INCOMPLETE')

        await expect(apiFetch('/api/v1/me', { auth: 'bearer' })).rejects.toMatchObject({ code: 'USER_PROFILE_INCOMPLETE' })
        expect(onForbidden).not.toHaveBeenCalled()
    })

    it('un 401 de la capability de SADC no manda a Keycloak', async () => {
        setSessionToken('session-capability')
        responder(401, 'UNAUTHORIZED')

        await expect(apiFetch('/v1/patient', { method: 'POST', body: '{}' })).rejects.toMatchObject({ status: 401 })
        expect(onUnauthorized).not.toHaveBeenCalled()
    })
})
