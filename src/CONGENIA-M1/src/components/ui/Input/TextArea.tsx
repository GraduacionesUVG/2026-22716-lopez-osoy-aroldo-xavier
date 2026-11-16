/**
 * @fileoverview Campo de texto que crece con lo que se escribe
 *
 * Mismo aspecto que Input. Nace porque en las pruebas de usabilidad el campo de
 * una sola linea hacia pensar que solo cabia una palabra o dos: al crecer, y con
 * el contador a la vista, queda claro que se puede describir con detalle.
 */

import { useId, useLayoutEffect, useRef } from 'react'
import type { ChangeEvent, KeyboardEvent, TextareaHTMLAttributes } from 'react'
import styles from './Input.module.css'

interface TextAreaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value'> {
    label: string
    value: string
    error?: string
    hint?: string
    /**
     * Si es false, Enter no parte el texto y los saltos pegados se vuelven
     * espacios: el texto se ajusta en varias lineas pero sigue siendo un solo
     * renglon, como un nombre.
     */
    allowLineBreaks?: boolean
    /**
     * Si es true, no crece solo: el medico lo agranda arrastrando la esquina,
     * como el motivo de la adenda en la ficha. Para textos largos en un modal,
     * donde crecer solo empujaria los botones fuera de la vista.
     */
    resizable?: boolean
}

export function TextArea({
    label,
    value,
    error,
    hint,
    allowLineBreaks = true,
    resizable = false,
    maxLength,
    rows = 2,
    onChange,
    onKeyDown,
    className,
    id,
    ...rest
}: TextAreaProps) {
    const autoId = useId()
    const inputId = id ?? `textarea-${autoId}`
    const ref = useRef<HTMLTextAreaElement>(null)

    // Se mide tras cada cambio: primero se colapsa para que tambien encoja al borrar.
    // Redimensionable, la altura es del medico: medirla borraria lo que arrastro.
    useLayoutEffect(() => {
        const el = ref.current
        if (!el || resizable) return
        el.style.height = 'auto'
        el.style.height = `${el.scrollHeight}px`
    }, [value, resizable])

    const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
        if (!allowLineBreaks && /[\r\n]/.test(e.target.value)) {
            e.target.value = e.target.value.replace(/[\r\n]+/g, ' ')
        }
        onChange?.(e)
    }

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (!allowLineBreaks && e.key === 'Enter') e.preventDefault()
        onKeyDown?.(e)
    }

    const classes = [
        styles.input,
        styles.textarea,
        resizable ? styles.textareaResizable : '',
        error ? styles.inputError : '',
        className ?? '',
    ].filter(Boolean).join(' ')

    const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined

    return (
        <div className={styles.wrapper}>
            <label htmlFor={inputId} className={styles.label}>
                {label}
            </label>

            <textarea
                ref={ref}
                id={inputId}
                rows={rows}
                value={value}
                maxLength={maxLength}
                className={classes}
                aria-invalid={!!error}
                aria-describedby={describedBy}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                {...rest}
            />

            <div className={styles.footerRow}>
                {error ? (
                    <span id={`${inputId}-error`} className={styles.errorMessage} role="alert">
                        {error}
                    </span>
                ) : hint ? (
                    <span id={`${inputId}-hint`} className={styles.hint}>{hint}</span>
                ) : <span />}

                {maxLength != null && (
                    <span className={styles.counter} aria-hidden="true">
                        {value.length} / {maxLength}
                    </span>
                )}
            </div>
        </div>
    )
}
