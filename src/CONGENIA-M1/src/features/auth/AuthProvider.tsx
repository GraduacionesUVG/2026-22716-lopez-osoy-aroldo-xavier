/**
 * @fileoverview Sesion de Keycloak compartida por toda la aplicacion.
 *
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { User } from 'oidc-client-ts'
import { AuthContext, type AuthContextValue, type AuthState } from './AuthContext'
import {
    getExistingUser,
    logout as oidcLogout,
    onUserLoaded,
    requireAuthenticatedUser,
} from '../../services/auth.service'
import { readOidcCallback } from '../../services/oidc-callback'
import { ALLOW_DEV_SESSION, DEV_ACCESS, DEV_USER } from './devSession'
import { loadMe } from './me'
import { accessFromMe } from './permissions'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog/ConfirmDialog'

/**
 * Ruta guardada antes de salir hacia Keycloak.
 *
 *
 * @compliance ISO 27001 A.14.2.5 - validacion de destino en la navegacion
 */
function returnPathOf(user: User): string | null {
    const state = user.state
    if (typeof state !== 'string') return null
    if (!state.startsWith('/') || state.startsWith('//')) return null
    return state
}

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : 'No se pudo iniciar sesión'
}

/**
 * Sesion con sus permisos. Se espera a `/me` antes de darla por abierta: sin
 * esa espera, el menu y las rutas veian un usuario sin permisos y mostraban
 * "Acceso denegado" un instante.
 */
async function authenticated(user: User): Promise<AuthState> {
    return { status: 'authenticated', user, access: accessFromMe(await loadMe(user)) }
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<AuthState>({ status: 'loading' })
    const [returnPath, setReturnPath] = useState<string | null>(null)

    const [hasOidcCallback] = useState(() => readOidcCallback(window.location).kind !== 'none')

    useEffect(() => {
        let cancelled = false

        if (!hasOidcCallback) {
            void getExistingUser()
                .then(async (user): Promise<AuthState> => {
                    if (user) return authenticated(user)
                    return ALLOW_DEV_SESSION
                        ? { status: 'authenticated', user: DEV_USER, access: DEV_ACCESS }
                        : { status: 'anonymous' }
                })
                .then(
                    (next) => { if (!cancelled) setState(next) },
                    (error: unknown) => { if (!cancelled) setState({ status: 'error', message: messageOf(error) }) },
                )
            return () => { cancelled = true }
        }

        requireAuthenticatedUser()
            .then(async (user) => {
                const next = await authenticated(user)
                if (cancelled) return
                setState(next)
                // Aqui solo se guarda a donde queria ir; navegar es cosa de
                // `ReturnAfterLogin`. Cuando este efecto navegaba por su cuenta,
                // dependia de `navigate`, que cambia con cada ruta: cada click del
                // menu lo volvia a correr y devolvia al usuario a esta ruta.
                setReturnPath(returnPathOf(user))
            })
            .catch((error: unknown) => {
                if (cancelled) return
                setState({ status: 'error', message: messageOf(error) })
            })

        return () => { cancelled = true }
    }, [hasOidcCallback])

    // Renovaciones y token nuevo tras un 403: el token puede traer otros grupos,
    // asi que se vuelve a pedir `/me`. Si falla, se conservan los permisos que
    // ya habia; la API sigue decidiendo cada peticion.
    useEffect(() => onUserLoaded((user) => {
        authenticated(user).then(
            (next) => setState(next),
            () => setState((prev) => (prev.status === 'authenticated' ? { ...prev, user } : prev)),
        )
    }), [])

    const signIn = useCallback(() => {
        setState({ status: 'loading' })
        requireAuthenticatedUser()
            .then(authenticated)
            .then(setState)
            .catch((error: unknown) => setState({ status: 'error', message: messageOf(error) }))
    }, [])

    // La confirmacion vive aqui y no en cada boton de salir. Son cuatro repartidos
    // entre la ficha y el dashboard, y `signoutRedirect()` se lleva la pestana
    // entera: basta olvidarse en uno para que el medico pierda una ficha a medio
    // capturar. Puesta en el contexto, cualquier salida futura la hereda sola.
    const [confirmandoSalida, setConfirmandoSalida] = useState(false)

    const logout = useCallback(() => { setConfirmandoSalida(true) }, [])

    const consumeReturnPath = useCallback(() => { setReturnPath(null) }, [])

    const value = useMemo<AuthContextValue>(
        () => ({ state, signIn, logout, returnPath, consumeReturnPath }),
        [state, signIn, logout, returnPath, consumeReturnPath],
    )

    return (
        <AuthContext.Provider value={value}>
            {children}

            <ConfirmDialog
                isOpen={confirmandoSalida}
                title="¿Está seguro de salir?"
                message="Se cerrará su sesión. Si tiene una ficha a medio capturar, se perderá lo que no haya guardado."
                confirmLabel="Sí, cerrar sesión"
                onCancel={() => setConfirmandoSalida(false)}
                onConfirm={() => { void oidcLogout() }}
            />
        </AuthContext.Provider>
    )
}
