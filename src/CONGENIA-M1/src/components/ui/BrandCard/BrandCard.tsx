/**
 * @fileoverview Shell de pantalla completa con la marca CONGENIA.
 *
 * Tiene dos modos:
 *
 * - 'centered' (por defecto): la tarjeta blanca sola en medio del azul, con el
 *   logo azul dentro. Es lo que usan las pantallas de carga, error y acceso
 *   denegado, y se comporta igual que antes de que existieran estas props.
 *
 * - 'split': el logo pasa arriba en blanco dentro de `topBar`, y el `hero` (el
 *   titulo de la pantalla) se pinta sobre el azul al lado de la tarjeta. Desde
 *   900px van en dos columnas; por debajo se apilan. Asi el azul deja de ser
 *   relleno y carga la mitad del contenido.
 *
 * El contenedor sigue siendo `position: fixed` a proposito: AppRouter envuelve
 * la ficha en un shell de 480px (AppRouter.module.css) y solo saliendose del
 * flujo el azul llega a ocupar la pantalla entera en escritorio.
 */

import type { ReactNode } from 'react'
import styles from './BrandCard.module.css'
import logoCongenia from '../../../assets/CONGENIA LOGO.png'

interface BrandCardProps {
    children: ReactNode
    /**
     * Barra superior sobre el azul. Cuando se pasa, el logo azul interno no se
     * pinta: la marca ya esta arriba y repetirla la duplicaba.
     */
    topBar?: ReactNode
    /** Bloque de texto sobre el azul, junto a la tarjeta. */
    hero?: ReactNode
    layout?: 'centered' | 'split'
}

export function BrandCard({ children, topBar, hero, layout = 'centered' }: BrandCardProps) {
    return (
        <div className={styles.background}>
            {topBar && <div className={styles.topBarSlot}>{topBar}</div>}

            <div className={styles.main}>
                <div className={layout === 'split' ? styles.split : styles.centered}>
                    {hero}
                    <div className={styles.card}>
                        {!topBar && <img src={logoCongenia} alt="Congenia" className={styles.logo} />}
                        {children}
                    </div>
                </div>
            </div>
        </div>
    )
}
