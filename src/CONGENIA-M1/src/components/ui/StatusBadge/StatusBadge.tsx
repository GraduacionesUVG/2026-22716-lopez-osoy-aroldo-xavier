/**
 * @fileoverview Pill de estado de una adenda.
 *
 * Nace de los badges ACTIVA/CAMBIADA de `MediaCard`, que ya tenian la forma
 * correcta pero estaban atados a la vigencia de un elemento dentro de la ficha.
 * Aqui el eje es otro -en que punto de la revision esta la adenda- y lo usan
 * tanto las cards del listado como la cabecera de la pantalla de revision.
 */

import styles from './StatusBadge.module.css'

export type StatusTone = 'pending' | 'approved' | 'rejected'

export interface StatusBadgeProps {
    tone: StatusTone
    /** Texto del pill. Por defecto, el nombre del estado. */
    children?: string
    className?: string
}

const DEFAULT_LABEL: Record<StatusTone, string> = {
    pending:  'PENDIENTE',
    approved: 'APROBADA',
    rejected: 'RECHAZADA',
}

export function StatusBadge({ tone, children, className }: StatusBadgeProps) {
    const classes = [styles.badge, styles[tone], className ?? ''].filter(Boolean).join(' ')

    return <span className={classes}>{children ?? DEFAULT_LABEL[tone]}</span>
}
