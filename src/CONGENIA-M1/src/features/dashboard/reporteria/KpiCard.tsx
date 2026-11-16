/**
 * @fileoverview Tarjeta de un indicador del dashboard de reportería.
 */

import type { ReactNode } from 'react'
import { formatearNumero } from './formato'
import styles from './ReporteriaView.module.css'

interface KpiCardProps {
    label: string
    /** `null` = no se pudo cargar. Se muestra un guion, nunca un 0 que parezca dato. */
    value: number | null
    detail?: ReactNode
}

export function KpiCard({ label, value, detail }: KpiCardProps) {
    return (
        <article className={styles.card}>
            <p className={styles.kpiLabel}>{label}</p>
            <p className={styles.kpiValue}>{value == null ? '—' : formatearNumero(value)}</p>
            {detail && <p className={styles.kpiDetail}>{detail}</p>}
        </article>
    )
}
