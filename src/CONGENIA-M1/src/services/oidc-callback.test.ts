import { describe, expect, it } from 'vitest'
import { cleanOidcCallbackUrl, oidcErrorMessage, readOidcCallback } from './oidc-callback'

describe('OIDC callback handling', () => {
    it('recognizes an OAuth error even when no authorization code exists', () => {
        expect(readOidcCallback({
            search: '?error=invalid_scope&error_description=Invalid+scopes&state=abc',
            hash: '',
        })).toEqual({ kind: 'error', code: 'invalid_scope', state: 'abc' })
    })

    it('recognizes a successful authorization-code callback', () => {
        expect(readOidcCallback({ search: '?code=one-time-code&state=abc', hash: '' }))
            .toEqual({ kind: 'success', state: 'abc' })
    })

    it('treats a code without state as an invalid callback', () => {
        expect(readOidcCallback({ search: '?code=one-time-code', hash: '' }))
            .toEqual({ kind: 'error', code: 'invalid_callback', state: null })
    })

    it('cleans OIDC values while preserving application parameters', () => {
        expect(cleanOidcCallbackUrl(
            'https://cogenia.app/?tenant=7&error=invalid_scope&state=abc#section=search',
        )).toBe('/?tenant=7#section=search')
    })

    it('shows a safe actionable message for invalid_scope', () => {
        expect(oidcErrorMessage('invalid_scope')).toMatch(/permisos solicitados/)
    })
})
