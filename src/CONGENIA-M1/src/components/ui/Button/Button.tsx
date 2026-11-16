/**
 * @fileoverview Componente Button
 * Soporta 4 variantes:
 *  - primary: azul oscuro
 *  - secondary: celeste
 *  - destructive: rojo
 *  - ghost: sin fondo, solo texto
 */

import type { ButtonHTMLAttributes, ReactNode } from 'react'
import styles from './Button.module.css'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'destructive' | 'ghost'
    size?: 'sm' | 'md' | 'lg'
    leftIcon?: ReactNode
    isLoading?: boolean
    fullWidth?: boolean
    children: ReactNode
}

// Componente 

/**
 * Botón base reutilizable
 *
 * @example
 * <Button variant="primary" fullWidth>Finalizar registro</Button>
 *
 * @example
 * <Button variant="secondary" leftIcon={<SaveIcon />}>Borrador</Button>
 *
 * @example
 * <Button variant="destructive">Sí, eliminar</Button>
 */
export function Button({
    variant = 'primary',
    size = 'md',
    leftIcon,
    isLoading = false,
    fullWidth = false,
    children,
    disabled,
    className,
    ...rest
}: ButtonProps) {
    const classes = [
        styles.button,
        styles[variant],
        styles[size],
        fullWidth ? styles.fullWidth : '',
        isLoading ? styles.loading : '',
        className ?? '',
    ].filter(Boolean).join(' ')

    return (
        <button
        className={classes}
        disabled={disabled || isLoading}
        type="button"
        {...rest}
        >
        {isLoading && (
            <span className={styles.spinner} aria-hidden="true" />
        )}
        {!isLoading && leftIcon && (
            <span className={styles.icon} aria-hidden="true">
            {leftIcon}
            </span>
        )}
        <span>{children}</span>
        </button>
    )
}