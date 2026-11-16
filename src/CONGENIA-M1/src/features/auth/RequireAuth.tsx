/**
 * @fileoverview Guarda de ruta del dashboard: exige sesion y el permiso `dashboard`.
 *
 */

import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from './useAuth'
import { can } from './permissions'
import { displayNameOf } from './profile'
import { AccessDeniedView } from './AccessDeniedView'
import { ErrorView } from '../../components/forms/ErrorView/ErrorView'
import { LoadingView } from '../../components/forms/LoadingView/LoadingView'

export function RequireAuth({ children }: { children: ReactNode }) {
    const { state, signIn, logout } = useAuth()

    useEffect(() => {
        if (state.status === 'anonymous') signIn()
    }, [state.status, signIn])

    if (state.status === 'error') {
        return (
            <ErrorView
                title="No se pudo iniciar sesión"
                message={state.message}
                onRetry={() => window.location.reload()}
            />
        )
    }

    if (state.status !== 'authenticated') {
        return <LoadingView message="Verificando acceso" />
    }

    if (!can(state.access, 'dashboard')) {
        return <AccessDeniedView displayName={displayNameOf(state.user)} onLogout={logout} />
    }

    return <>{children}</>
}
