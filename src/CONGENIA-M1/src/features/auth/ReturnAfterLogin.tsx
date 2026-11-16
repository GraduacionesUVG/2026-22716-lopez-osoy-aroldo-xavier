/**
 * @fileoverview Lleva al usuario a la ruta que pidio antes de pasar por Keycloak.
 *
 * El callback de OIDC siempre aterriza en `/`, el unico `redirect_uri` del realm.
 * El `AuthProvider` solo informa a donde se queria ir; la decision de navegar
 * vive aqui, del lado del enrutado.
 */

import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './useAuth'
import { prefersDashboard } from './permissions'
import { ROUTES } from '../../app/routes'

export function ReturnAfterLogin() {
    const { state, returnPath, consumeReturnPath } = useAuth()
    const navigate = useNavigate()
    const { pathname } = useLocation()

    const access = state.status === 'authenticated' ? state.access : null

    // `navigate` y `pathname` cambian con cada ruta y vuelven a correr el efecto.
    // No pasa nada: la ruta se consume antes de navegar, asi que solo se usa una vez.
    useEffect(() => {
        if (!returnPath) return

        // Quien entro por `/` y trabaja sobre todo en el dashboard empieza ahi
        // (ver `prefersDashboard`). Solo al volver de Keycloak: con la sesion ya
        // abierta, `/` es "Registrar ficha" y no debe rebotar.
        const destino = returnPath === ROUTES.ficha && prefersDashboard(access)
            ? ROUTES.dashboard
            : returnPath

        consumeReturnPath()
        if (destino !== pathname) void navigate(destino, { replace: true })
    }, [returnPath, consumeReturnPath, navigate, pathname, access])

    return null
}
