/**
 * @fileoverview `GET /me` una sola vez por token.
 *
 * Lo piden el `AuthProvider` (permisos del menu y las rutas) y la busqueda en
 * `/` (instituciones del selector). Con el mismo token la respuesta no cambia,
 * asi que se comparte la misma peticion. Un token nuevo -renovacion, o el que
 * se pide tras un 403- vuelve a consultar: puede traer otros grupos.
 */

import type { User } from 'oidc-client-ts'
import { getMe, type MeProfile } from '../../services/ficha.service'

let cached: { token: string; profile: Promise<MeProfile> } | null = null

export function loadMe(user: User): Promise<MeProfile> {
    if (cached?.token === user.access_token) return cached.profile

    const profile = getMe()
    const entry = { token: user.access_token, profile }
    cached = entry
    // Un fallo no se guarda: el siguiente intento vuelve a preguntar.
    profile.catch(() => {
        if (cached === entry) cached = null
    })
    return profile
}

/** Solo para pruebas. */
export function resetMeCache(): void {
    cached = null
}
