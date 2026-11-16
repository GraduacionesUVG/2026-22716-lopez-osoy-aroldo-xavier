/**
 * @fileoverview Componente SectionHeader
 *
 * Estados:
 *  - default: borde azul, indicador vacío
 *  - in-progress: barra verde
 *  - completed: borde verde + indicador con check
 *  - none: sin indicador, para secciones que no llevan cuenta de completitud
 */

import type { ReactNode } from 'react'
import styles from './SectionHeader.module.css'

export type SectionHeaderStatus =
    | 'default'
    | 'in-progress'
    | 'completed'
    | 'incomplete'
    /** La seccion no tiene nada que completar: se omite el indicador. */
    | 'none'

interface SectionHeaderProps {
    title: string
    icon?: ReactNode
    progressCurrent?: number
    progressTotal?: number
    status?: SectionHeaderStatus
    isOpen?: boolean
    onToggle?: () => void
    embedded?: boolean
    className?: string
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

export function SectionHeader({
    title,
    icon,
    progressCurrent,
    progressTotal,
    status,
    isOpen = true,
    onToggle,
    embedded = false,
    className,
}: SectionHeaderProps) {
    // Sin status explicito y sin progreso, la seccion no lleva cuenta de completitud
    // (listados como Signos de Alerta o Estudios de Gabinete): queda en 'none' para que
    // no aparezca un circulo vacio, que se lee como "pendiente" sin serlo.
    const trackedStatus: SectionHeaderStatus =
        (progressCurrent !== undefined && progressTotal !== undefined && progressTotal > 0)
            ? progressCurrent >= progressTotal
                ? 'completed'
                : progressCurrent > 0
                    ? 'in-progress'
                    : 'default'
            : 'none'

    const computedStatus: SectionHeaderStatus = status ?? trackedStatus

    const progressValue = (progressCurrent !== undefined && progressTotal !== undefined && progressTotal > 0)
        ? clamp((progressCurrent / progressTotal) * 100, 0, 100)
        : 0

    const isToggleable = Boolean(onToggle)

    const containerClasses = [
        styles.container,
        styles[computedStatus],
        embedded ? styles.embedded : '',
        isToggleable ? styles.toggleable : '',
        className ?? '',
    ].filter(Boolean).join(' ')

    const chevronClasses = [
        styles.chevron,
        isOpen ? styles.chevronOpen : '',
    ].filter(Boolean).join(' ')

    const content = (
        <>
            <div className={styles.left}>
                <div className={styles.iconBox} aria-hidden="true">
                    {icon ?? (
                        <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <path
                                d="M9 3H15V7C15 8.10457 15.8954 9 17 9H21"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                            <path
                                d="M6 7H4C2.89543 7 2 7.89543 2 9V20C2 21.1046 2.89543 22 4 22H15C16.1046 22 17 21.1046 17 20V18"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                            <path
                                d="M7 15H11"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                            />
                        </svg>
                    )}
                </div>

                <div className={styles.textBlock}>
                    <span className={styles.title}>{title}</span>
                    {(progressCurrent !== undefined && progressTotal !== undefined) && (
                        <div className={styles.progressRow}>
                            <div className={styles.progressTrack} aria-hidden="true">
                                <div
                                    className={styles.progressFill}
                                    style={{ width: `${progressValue}%` }}
                                />
                            </div>
                            <span className={styles.progressText}>
                                {progressCurrent}/{progressTotal}
                            </span>
                        </div>
                    )}
                </div>
            </div>

            <div className={styles.right}>
                {computedStatus !== 'none' && (
                    <span className={styles.statusIndicator} aria-hidden="true">
                        {computedStatus === 'completed' && (
                            <svg
                                width="12"
                                height="12"
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
                        {computedStatus === 'incomplete' && (
                            <svg
                                width="10"
                                height="10"
                                viewBox="0 0 16 16"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                                <path
                                    d="M8 4.5V9"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                />
                                <circle cx="8" cy="12" r="1.25" fill="currentColor" />
                            </svg>
                        )}
                    </span>
                )}
                {isToggleable && (
                    <span className={chevronClasses} aria-hidden="true">
                        <svg
                            width="16"
                            height="16"
                            viewBox="0 0 16 16"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <path
                                d="M4 6L8 10L12 6"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    </span>
                )}
            </div>
        </>
    )

    // El atributo es el asidero para quien coloca la cabecera: CSS Modules cifra el
    // nombre de clase, asi que la pantalla que contiene la seccion no tiene forma de
    // nombrarla desde su propia hoja. El orquestador lo usa para dejarla fija arriba
    // mientras se llena esa seccion.
    if (isToggleable) {
        return (
            <button
                type="button"
                data-section-header=""
                className={containerClasses}
                onClick={onToggle}
                aria-expanded={isOpen}
                aria-label={isOpen ? 'Colapsar sección' : 'Expandir sección'}
            >
                {content}
            </button>
        )
    }

    return <div data-section-header="" className={containerClasses}>{content}</div>
}
