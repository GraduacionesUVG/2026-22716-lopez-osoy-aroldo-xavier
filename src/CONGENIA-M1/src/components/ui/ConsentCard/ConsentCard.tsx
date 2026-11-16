/**
 * @fileoverview Componente ConsentCard
 *
 * Estados:
 *  - default: borde azul
 *  - success: borde verde + checkbox activo
 *  - danger: borde rojo (cuando es obligatorio y no esta marcado)
 */

import { useMemo, useState } from 'react'
import styles from './ConsentCard.module.css'

export type ConsentCardStatus = 'default' | 'success' | 'danger'
export type ConsentChipColor = 'blue' | 'green' | 'red' | 'gray'

interface ConsentCardProps {
    title: string
    description: string
    chipText?: string
    chipColor?: ConsentChipColor
    required?: boolean
    checked?: boolean
    defaultChecked?: boolean
    disabled?: boolean
    status?: ConsentCardStatus
    onCheckedChange?: (checked: boolean) => void
    className?: string
    id?: string
}

/**
 * ConsentCard base
 */
export function ConsentCard({
    title,
    description,
    chipText,
    chipColor = 'blue',
    required = false,
    checked,
    defaultChecked = false,
    disabled = false,
    status,
    onCheckedChange,
    className,
    id,
}: ConsentCardProps) {
    const inputId = id ?? `consent-${title.toLowerCase().replace(/\s+/g, '-')}`
    const [internalChecked, setInternalChecked] = useState(defaultChecked)
    const isChecked = checked !== undefined ? checked : internalChecked

    const computedStatus: ConsentCardStatus = useMemo(() => {
        if (status) return status
        if (required && !isChecked) return 'danger'
        if (isChecked) return 'success'
        return 'default'
    }, [status, required, isChecked])

    const classes = [
        styles.card,
        styles[computedStatus],
        disabled ? styles.disabled : '',
        className ?? '',
    ].filter(Boolean).join(' ')

    const chipClasses = [
        styles.chip,
        styles[`chip-${chipColor}`],
    ].filter(Boolean).join(' ')

    const handleChange = (next: boolean) => {
        if (checked === undefined) {
            setInternalChecked(next)
        }
        onCheckedChange?.(next)
    }

    return (
        <label className={classes} htmlFor={inputId}>
            <input
                id={inputId}
                type="checkbox"
                className={styles.input}
                checked={isChecked}
                disabled={disabled}
                onChange={(event) => handleChange(event.target.checked)}
            />
            <span className={styles.checkbox} aria-hidden="true">
                {isChecked && (
                    <svg
                        width="14"
                        height="14"
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
                )}
            </span>
            <div className={styles.content}>
                <div className={styles.header}>
                    <span className={styles.title}>{title}</span>
                    {chipText && <span className={chipClasses}>{chipText}</span>}
                </div>
                <p className={styles.description}>{description}</p>
            </div>
        </label>
    )
}
