/**
 * @fileoverview Componente NumberStepper
 *
 * Estados:
 *  - default: borde azul, texto azul
 *  - disabled: fondo gris claro
 */

import { useMemo, useState } from 'react'
import styles from './NumberStepper.module.css'

interface NumberStepperProps {
    label: string
    value?: number
    defaultValue?: number
    min?: number
    max?: number
    step?: number
    disabled?: boolean
    onChange?: (value: number) => void
    className?: string
}

const clamp = (value: number, min?: number, max?: number) => {
    if (min !== undefined && value < min) return min
    if (max !== undefined && value > max) return max
    return value
}

/**
 * NumberStepper base
 */
export function NumberStepper({
    label,
    value,
    defaultValue,
    min,
    max,
    step = 1,
    disabled = false,
    onChange,
    className,
}: NumberStepperProps) {
    const initialValue = useMemo(() => {
        const base = value ?? defaultValue ?? min ?? 0
        return clamp(base, min, max)
    }, [value, defaultValue, min, max])

    const [internalValue, setInternalValue] = useState<number>(initialValue)

    const currentValue = value !== undefined ? clamp(value, min, max) : internalValue

    const applyValue = (next: number) => {
        const clamped = clamp(next, min, max)
        if (value === undefined) {
            setInternalValue(clamped)
        }
        onChange?.(clamped)
    }

    const handleDecrease = () => {
        applyValue(currentValue - step)
    }

    const handleIncrease = () => {
        applyValue(currentValue + step)
    }

    const isMin = min !== undefined ? currentValue <= min : false
    const isMax = max !== undefined ? currentValue >= max : false

    const stepperClasses = [
        styles.stepper,
        disabled ? styles.disabled : '',
        className ?? '',
    ].filter(Boolean).join(' ')

    return (
        <div className={styles.wrapper}>
            <span className={styles.label}>{label}</span>
            <div className={stepperClasses} role="group" aria-label={label}>
                <button
                    type="button"
                    className={styles.button}
                    onClick={handleDecrease}
                    disabled={disabled || isMin}
                    aria-label="Disminuir"
                >
                    -
                </button>
                <span className={styles.value} aria-live="polite">
                    {currentValue}
                </span>
                <button
                    type="button"
                    className={styles.button}
                    onClick={handleIncrease}
                    disabled={disabled || isMax}
                    aria-label="Aumentar"
                >
                    +
                </button>
            </div>
        </div>
    )
}
