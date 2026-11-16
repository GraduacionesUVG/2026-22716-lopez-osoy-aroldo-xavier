/**
 * @fileoverview Componente ToggleChip
 *
 * Estados:
 *  - default: borde azul, texto azul
 *  - selected: fondo azul oscuro, texto blanco
 *  - disabled: fondo gris claro
 */

import type { ButtonHTMLAttributes, ReactNode } from 'react'
import styles from './ToggleChip.module.css'

interface ToggleChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    selected?: boolean
    children: ReactNode
}

/**
 * ToggleChip base
 */
export function ToggleChip({
    selected = false,
    children,
    className,
    disabled,
    ...rest
}: ToggleChipProps) {
    const classes = [
        styles.chip,
        selected ? styles.selected : '',
        className ?? '',
    ].filter(Boolean).join(' ')

    return (
        <button
            type="button"
            className={classes}
            aria-pressed={selected}
            disabled={disabled}
            {...rest}
        >
            {selected && (
                <span className={styles.icon} aria-hidden="true">
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path
                            d="M4 8.25L6.5 10.75L12 5.25"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                </span>
            )}
            <span className={styles.label}>{children}</span>
        </button>
    )
}
