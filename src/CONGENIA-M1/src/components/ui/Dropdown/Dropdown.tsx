/**
 * @fileoverview Componente Dropdown (Select) base
 *
 * Estados:
 *  - default:  borde azul
 *  - error:    borde rojo + mensaje debajo
 *  - focused:  borde azul oscuro al hacer click
 *  - disabled: fondo gris claro
 */

import { forwardRef, useState } from 'react'
import type { SelectHTMLAttributes } from 'react'
import styles from './Dropdown.module.css'

export interface DropdownOption {
    value: string
    label: string
    disabled?: boolean
}

interface DropdownProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
    label: string
    options: DropdownOption[]
    placeholder?: string
    error?: string
    hint?: string
}

/**
 * Dropdown base con label siempre visible
 */
export const Dropdown = forwardRef<HTMLSelectElement, DropdownProps>(
    (
        {
            label,
            options,
            placeholder,
            error,
            hint,
            className,
            id,
            value,
            defaultValue,
            disabled,
            onChange,
            ...rest
        },
        ref
    ) => {
        const selectId = id ?? `dropdown-${label.toLowerCase().replace(/\s+/g, '-')}`

        const [internalValue, setInternalValue] = useState<string>(() => {
            if (value !== undefined) return String(value)
            if (defaultValue !== undefined) return String(defaultValue)
            if (placeholder) return ''
            return options[0]?.value ?? ''
        })

        const currentValue = value !== undefined ? String(value) : internalValue
        const isPlaceholder = placeholder ? currentValue === '' : false

        const selectClasses = [
            styles.select,
            isPlaceholder ? styles.placeholder : '',
            error ? styles.selectError : '',
            className ?? '',
        ].filter(Boolean).join(' ')

        const handleChange: SelectHTMLAttributes<HTMLSelectElement>['onChange'] = (event) => {
            if (value === undefined) {
                setInternalValue(event.target.value)
            }
            onChange?.(event)
        }

        return (
        <div className={styles.wrapper}>
            <label htmlFor={selectId} className={styles.label}>
                {label}
            </label>

            <select
                ref={ref}
                id={selectId}
                disabled={disabled}
                className={selectClasses}
                aria-invalid={!!error}
                aria-describedby={error ? `${selectId}-error` : hint ? `${selectId}-hint` : undefined}
                value={currentValue}
                onChange={handleChange}
                {...rest}
            >
                {placeholder && (
                    <option value="" disabled hidden>
                        {placeholder}
                    </option>
                )}
                {options.map((option) => (
                    <option key={option.value} value={option.value} disabled={option.disabled}>
                        {option.label}
                    </option>
                ))}
            </select>

            {error && (
                <span
                    id={`${selectId}-error`}
                    className={styles.errorMessage}
                    role="alert"
                >
                    {error}
                </span>
            )}

            {!error && hint && (
                <span id={`${selectId}-hint`} className={styles.hint}>
                    {hint}
                </span>
            )}
        </div>
        )
    }
)

Dropdown.displayName = 'Dropdown'
