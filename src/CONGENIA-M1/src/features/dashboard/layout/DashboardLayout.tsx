/**
 * @fileoverview Armazon del dashboard: barra lateral, cabecera y contenido.
 *
 */

import { useEffect, useMemo, useState } from 'react'
import { Menu } from 'lucide-react'
import { Outlet, useLocation } from 'react-router-dom'
import styles from './DashboardLayout.module.css'
import { SidebarNav } from './SidebarNav'
import { NAV_ITEMS } from './NAV_ITEMS'
import { PageHeaderContext, type PageHeader } from './PageHeaderContext'
import { useAuth } from '../../auth/useAuth'
import { displayNameOf } from '../../auth/profile'
import { can, roleLabelOf } from '../../auth/permissions'
import { ROUTE_PERMISSIONS } from '../routePermissions'

const COLLAPSED_KEY = 'congenia.dashboard.sidebarCollapsed'

function readCollapsed(): boolean {
    try {
        return window.localStorage.getItem(COLLAPSED_KEY) === 'true'
    } catch {
        return false
    }
}

export function DashboardLayout() {
    const { state, logout } = useAuth()
    const { pathname } = useLocation()

    const [collapsed, setCollapsed] = useState(readCollapsed)
    const [mobileOpen, setMobileOpen] = useState(false)
    const [header, setHeader] = useState<PageHeader | null>(null)

    useEffect(() => {
        try {
            window.localStorage.setItem(COLLAPSED_KEY, String(collapsed))
        } catch {
            // Sin almacenamiento la preferencia dura lo que la pestana.
        }
    }, [collapsed])

    useEffect(() => {
        if (!mobileOpen) return

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setMobileOpen(false)
        }
        window.addEventListener('keydown', onKeyDown)

        const previousOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'

        return () => {
            window.removeEventListener('keydown', onKeyDown)
            document.body.style.overflow = previousOverflow
        }
    }, [mobileOpen])

    const user = state.status === 'authenticated' ? state.user : null
    const access = state.status === 'authenticated' ? state.access : null

    // Solo las secciones que el usuario puede abrir, con el mismo permiso que
    // exige su ruta. Antes el medico veia las cinco y al entrar le salia el aviso.
    const items = useMemo(
        () => NAV_ITEMS.filter((item) => can(access, ROUTE_PERMISSIONS[item.to])),
        [access],
    )

    const active = NAV_ITEMS.find((item) =>
        item.end ? pathname === item.to : pathname.startsWith(item.to),
    )

    // El valor del contexto se memoiza para no re-renderizar todo el subarbol
    // cada vez que cambia algo del layout (colapsar la barra, abrir el menu).
    const headerContext = useMemo(() => ({ header, setHeader }), [header])

    return (
        <div className={styles.shell}>
            <SidebarNav
                items={items}
                showRegistrarFicha={can(access, 'fichas.crear')}
                collapsed={collapsed}
                mobileOpen={mobileOpen}
                onToggle={() => {
                    if (mobileOpen) setMobileOpen(false)
                    else setCollapsed((value) => !value)
                }}
                onNavigate={() => setMobileOpen(false)}
                doctorName={displayNameOf(user)}
                doctorRole={roleLabelOf(access)}
                onLogout={logout}
            />

            {mobileOpen && (
                <button
                    type="button"
                    className={styles.backdrop}
                    aria-label="Cerrar el menú"
                    onClick={() => setMobileOpen(false)}
                />
            )}

            <div className={styles.main}>
                <header className={styles.topbar}>
                    <button
                        type="button"
                        className={styles.menuButton}
                        onClick={() => setMobileOpen(true)}
                        aria-label="Abrir el menú"
                        aria-expanded={mobileOpen}
                    >
                        <Menu size={20} aria-hidden="true" />
                    </button>

                    <h1 className={styles.title}>
                        {header?.title ?? active?.label ?? 'Dashboard'}
                        {header?.highlight && (
                            <> <span className={styles.titleHighlight}>{header.highlight}</span></>
                        )}
                    </h1>

                    {/* Siempre presente, aunque vaya vacio: es el contrapeso que
                        mantiene el titulo centrado de verdad. */}
                    <div className={styles.action}>{header?.action}</div>
                </header>

                <main className={styles.content}>
                    <div className={styles.contentInner}>
                        <PageHeaderContext.Provider value={headerContext}>
                            <Outlet />
                        </PageHeaderContext.Provider>
                    </div>
                </main>
            </div>
        </div>
    )
}
