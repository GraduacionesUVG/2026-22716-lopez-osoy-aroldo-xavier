/**
 * @fileoverview Barra superior de la aplicacion, sobre el fondo de marca.
 *
 * Vive encima del azul y no dentro de la tarjeta blanca: el logo blanco queda a
 * la izquierda y la sesion con su salida a la derecha, que es el borde donde la
 * gente busca cerrar sesion. Antes las dos cosas estaban apiladas dentro de la
 * tarjeta, pegadas al logo azul y compitiendo con el titulo de la pantalla.
 *
 * El fondo es transparente a proposito: hereda el azul del shell que la
 * contiene, asi que sirve igual sobre cualquiera de las pantallas de marca.
 */

import { LayoutDashboard, LogOut } from 'lucide-react'
import styles from './AppTopBar.module.css'
import logoC from '../../../assets/C.png'
import logoOngenia from '../../../assets/Ongenia.png'

export interface AppTopBarProps {
    /** Nombre del medico en sesion. Sin el no se pinta el bloque de sesion. */
    userName?: string
    /** Sin handler no se pinta el boton de salir. */
    onLogout?: () => void
    /** Solo para quien tiene rol de dashboard. Sin handler no se pinta el boton. */
    onGoToDashboard?: () => void
}

export function AppTopBar({ userName, onLogout, onGoToDashboard }: AppTopBarProps) {
    return (
        <header className={styles.topBar}>
            <span className={styles.brand}>
                <img src={logoC} alt="" className={styles.brandMark} />
                <img src={logoOngenia} alt="Congenia" className={styles.brandWordmark} />
            </span>

            {userName && (
                <div className={styles.session}>
                    <span className={styles.identity}>
                        {/* "Sesion:" se cae en movil: el nombre se entiende solo y
                            el ancho hace falta para el boton. */}
                        <span className={styles.identityPrefix}>Sesión:</span>
                        <span className={styles.userName} title={userName}>{userName}</span>
                    </span>

                    {onGoToDashboard && (
                        /* Aqui si va aria-label: en movil solo queda el icono, y en
                           pantalla grande coincide con el texto visible. */
                        <button
                            type="button"
                            className={styles.actionButton}
                            onClick={onGoToDashboard}
                            aria-label="Ir a dashboard"
                            title="Ir a dashboard"
                        >
                            <LayoutDashboard size={16} aria-hidden="true" />
                            <span className={styles.dashboardLabel}>Ir a dashboard</span>
                        </button>
                    )}

                    {onLogout && (
                        /* Sin aria-label: el nombre accesible tiene que coincidir con
                           el texto visible, y ese texto cambia con el ancho. Los dos
                           spans se alternan con display:none, que si saca el oculto
                           del arbol de accesibilidad. */
                        <button type="button" className={styles.actionButton} onClick={onLogout}>
                            <LogOut size={16} aria-hidden="true" />
                            <span className={styles.labelLong}>Cerrar sesión</span>
                            <span className={styles.labelShort}>Salir</span>
                        </button>
                    )}
                </div>
            )}
        </header>
    )
}
