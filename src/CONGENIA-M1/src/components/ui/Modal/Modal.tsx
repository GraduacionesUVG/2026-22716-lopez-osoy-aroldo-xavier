/**
 * @fileoverview Modal base.
 *
 * Recoge el patrón que estaba escrito a mano tres veces -en el orquestador, en
 * signos de alerta y en exámenes- con las mismas cuatro responsabilidades cada
 * vez: overlay, cierre con Escape, cierre al tocar el fondo y bloqueo del scroll
 * de la página detrás.
 *
 * Dos variantes:
 *  - `card`: tarjeta blanca centrada. Es el diálogo de siempre.
 *  - `bare`: sin caja. Para contenido que se pinta solo sobre el fondo oscuro,
 *    como una imagen a pantalla completa.
 */

import { useEffect } from 'react'
import type { ReactNode } from 'react'
import styles from './Modal.module.css'

export interface ModalProps {
    isOpen: boolean
    /** Ausente = el modal no se puede cerrar desde la UI (p. ej. "Guardando..."). */
    onClose?: () => void
    children: ReactNode
    variant?: 'card' | 'bare'
    /** id del elemento que titula el diálogo, para `aria-labelledby`. */
    labelledBy?: string
    /** Úsalo cuando no haya un título visible al que apuntar. */
    label?: string
    className?: string
}

export function Modal({
    isOpen,
    onClose,
    children,
    variant = 'card',
    labelledBy,
    label,
    className,
}: ModalProps) {
    // El bloqueo del scroll va en su propio efecto, atado solo a `isOpen`.
    // Si compartiera efecto con el listener de Escape, cambiar `onClose` lo
    // volvería a ejecutar y guardaría "hidden" como valor previo: al cerrar, la
    // página se quedaría sin scroll.
    useEffect(() => {
        if (!isOpen) return

        const previousOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'

        return () => { document.body.style.overflow = previousOverflow }
    }, [isOpen])

    useEffect(() => {
        if (!isOpen) return

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose?.()
        }

        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [isOpen, onClose])

    if (!isOpen) return null

    // El fondo oscuro es el mismo en las dos variantes; lo que cambia es la caja
    // de dentro.
    const overlayClasses = [styles.overlay, className ?? ''].filter(Boolean).join(' ')

    return (
        <div
            className={overlayClasses}
            // Solo cierra si el clic nació y murió en el fondo: arrastrar una
            // selección desde dentro del diálogo hasta el borde no debe cerrarlo.
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose?.()
            }}
        >
            <div
                className={variant === 'card' ? styles.card : styles.bare}
                role="dialog"
                aria-modal="true"
                aria-labelledby={labelledBy}
                aria-label={labelledBy ? undefined : label}
            >
                {children}
            </div>
        </div>
    )
}
