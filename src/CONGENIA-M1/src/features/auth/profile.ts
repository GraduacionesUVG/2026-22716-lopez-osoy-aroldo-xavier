/**
 * @fileoverview Datos presentables del medico autenticado.
 */

import type { User } from 'oidc-client-ts'

/** Nombre presentable segun el perfil OIDC. */
export function displayNameOf(user: User | null | undefined): string {
    if (!user) return ''
    return String(user.profile.name ?? user.profile.preferred_username ?? '')
}
