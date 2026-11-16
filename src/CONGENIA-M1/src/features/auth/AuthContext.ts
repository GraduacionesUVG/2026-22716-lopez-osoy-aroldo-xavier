/**
 * @fileoverview Contexto de sesion. 
 */

import { createContext } from 'react'
import type { User } from 'oidc-client-ts'
import type { Access } from './permissions'

export type AuthState =
    | { status: 'loading' }
    | { status: 'anonymous' }
    /** `access` sale de `GET /me`: no hay sesion abierta sin permisos cargados. */
    | { status: 'authenticated'; user: User; access: Access }
    | { status: 'error'; message: string }

export interface AuthContextValue {
    state: AuthState
    signIn: () => void
    logout: () => void
    /**
     * Ruta a la que el usuario queria volver antes de pasar por Keycloak.
     *
     * Es solo un dato: quien navega es `ReturnAfterLogin`, que la descarta con
     * `consumeReturnPath` al usarla.
     */
    returnPath: string | null
    consumeReturnPath: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)
