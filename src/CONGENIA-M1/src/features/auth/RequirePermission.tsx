/**
 * @fileoverview Guarda de una seccion del dashboard: exige su permiso.
 *
 * `RequireAuth` ya exige sesion y el permiso `dashboard`; esta va por dentro,
 * ruta por ruta. Sin ella, una seccion oculta del menu se abria igual
 * escribiendo su URL, y solo la detenia el 403 de la API.
 *
 * @compliance ISO 27001 A.9.4.1 - el cliente solo refleja la decision del servidor
 */

import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ShieldX } from 'lucide-react'
import styles from './RequirePermission.module.css'
import { useAuth } from './useAuth'
import { can, type Permission } from './permissions'
import { ROUTES } from '../../app/routes'

export function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
    const { state } = useAuth()
    const access = state.status === 'authenticated' ? state.access : null

    if (!can(access, permission)) return <SectionDenied />

    return <>{children}</>
}

/** El aviso no nombra roles: cambian en el servidor y el texto quedaria viejo. */
export function SectionDenied() {
    return (
        <section className={styles.denied} role="alert">
            <ShieldX size={28} className={styles.icon} aria-hidden="true" />
            <h2 className={styles.title}>Sin permiso para esta sección</h2>
            <p className={styles.message}>
                Su cuenta no tiene permiso para abrir esta sección. Si lo necesita, pida al
                administrador que se lo asigne.
            </p>
            <Link to={ROUTES.dashboard} className={styles.link}>Volver al inicio</Link>
        </section>
    )
}
