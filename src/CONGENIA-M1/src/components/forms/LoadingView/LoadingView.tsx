/**
 * @fileoverview Pantalla de carga a pantalla completa.
 *
 * Misma tarjeta y logo que el resto de pantallas previas a la ficha, con el
 * mensaje de lo que se está cargando y tres puntos que parpadean.
 *
 * No lleva spinner a propósito: con el logo arriba, el spinner y los puntos
 * competían por la atención sin aportar nada distinto. El movimiento lo llevan
 * los puntos, y el texto dice qué está pasando en vez de solo "espera".
 */

import styles from './LoadingView.module.css'
import { BrandCard } from '../../ui/BrandCard/BrandCard'

export interface LoadingViewProps {
    /** Texto sin puntos suspensivos: los añade la animación. */
    message?: string
}

export function LoadingView({ message = 'Cargando' }: LoadingViewProps) {
    return (
        <BrandCard>
            {/* El texto se anuncia una sola vez; los puntos son decorativos y se
                ocultan a los lectores de pantalla para no repetirlos en bucle. */}
            <p className={styles.label} role="status" aria-live="polite">
                {message}
                <span className={styles.dots} aria-hidden="true">
                    <span />
                    <span />
                    <span />
                </span>
            </p>
        </BrandCard>
    )
}
