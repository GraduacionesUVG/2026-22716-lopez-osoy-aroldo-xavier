/**
 * @fileoverview Barra lateral del dashboard.
 *
 */

import { ArrowUpRight, LogOut, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'
import { Link, NavLink } from 'react-router-dom'
import styles from './SidebarNav.module.css'
import type { NavItem } from './NAV_ITEMS'
import { ROUTES } from '../../../app/routes'
import logoC from '../../../assets/C.png'
import logoOngenia from '../../../assets/Ongenia.png'

export interface SidebarNavProps {
    /** Ya filtradas por permiso: la barra pinta lo que recibe. */
    items: readonly NavItem[]
    /** Solo con permiso para crear fichas; sin el, el enlace no se pinta. */
    showRegistrarFicha?: boolean
    collapsed: boolean
    mobileOpen: boolean
    onToggle: () => void
    onNavigate: () => void
    doctorName: string
    doctorRole?: string
    onLogout: () => void
}

export function SidebarNav({
    items,
    showRegistrarFicha = false,
    collapsed,
    mobileOpen,
    onToggle,
    onNavigate,
    doctorName,
    doctorRole,
    onLogout,
}: SidebarNavProps) {
    const classes = [
        styles.sidebar,
        collapsed ? styles.collapsed : '',
        mobileOpen ? styles.mobileOpen : '',
    ].filter(Boolean).join(' ')

    const toggleLabel = mobileOpen
        ? 'Cerrar el menú'
        : collapsed ? 'Expandir la barra lateral' : 'Colapsar la barra lateral'

    const ToggleIcon = mobileOpen ? X : collapsed ? PanelLeftOpen : PanelLeftClose

    return (
        <aside className={classes} aria-label="Navegación del dashboard">
            <div className={styles.header}>
                <span className={styles.brand}>
                    <img src={logoC} alt="" className={styles.brandMark} />
                    <img src={logoOngenia} alt="Congenia" className={styles.brandWordmark} />
                </span>

                <button
                    type="button"
                    className={styles.collapseButton}
                    onClick={onToggle}
                    aria-label={toggleLabel}
                    title={toggleLabel}
                >
                    <ToggleIcon size={18} aria-hidden="true" />
                </button>
            </div>

            <nav className={styles.nav}>
                {items.map(({ to, label, icon: Icon, end }) => (
                    <NavLink
                        key={to}
                        to={to}
                        end={end}
                        onClick={onNavigate}
                        title={collapsed ? label : undefined}
                        className={({ isActive }) =>
                            [styles.item, isActive ? styles.itemActive : ''].filter(Boolean).join(' ')
                        }
                    >
                        <Icon size={18} className={styles.itemIcon} aria-hidden="true" />
                        <span className={styles.label}>{label}</span>
                    </NavLink>
                ))}

                {/* Fuera de NAV_ITEMS: sale del dashboard, asi que no es una seccion
                    ni puede quedar marcada como activa. */}
                {showRegistrarFicha && (
                    <Link
                        to={ROUTES.ficha}
                        onClick={onNavigate}
                        title={collapsed ? 'Registrar ficha' : undefined}
                        className={`${styles.item} ${styles.exitItem}`}
                    >
                        <ArrowUpRight size={18} className={styles.itemIcon} aria-hidden="true" />
                        <span className={styles.label}>Registrar ficha</span>
                    </Link>
                )}
            </nav>

            <div className={styles.footer}>
                {doctorName && <span className={styles.doctorName}>{doctorName}</span>}
                {doctorRole && <span className={styles.doctorRole}>{doctorRole}</span>}

                <button
                    type="button"
                    className={styles.logoutButton}
                    onClick={onLogout}
                    aria-label="Cerrar sesión"
                    title={collapsed ? 'Cerrar sesión' : undefined}
                >
                    <LogOut size={16} aria-hidden="true" />
                    <span className={styles.label}>Salir</span>
                </button>
            </div>
        </aside>
    )
}
