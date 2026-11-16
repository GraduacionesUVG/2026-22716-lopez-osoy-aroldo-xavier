/**
 * @fileoverview Aviso informativo dentro de una seccion.
 *
 * Nace para marcar las secciones que quedan congeladas al finalizar el registro:
 * la ficha no avisaba que no admiten adenda, y el medico solo lo descubria cuando
 * ya no podia corregirlas.
 *
 * Reusa los tokens del aviso que la cabecera del orquestador ya usaba
 * (.noticeBadge / .noticePending en RegistrationOrchestratorView.module.css), para
 * que la ficha tenga un solo lenguaje de avisos y no dos parecidos.
 *
 * A proposito NO lleva role="alert": un aviso permanente que no responde a ninguna
 * accion del usuario no debe interrumpir al lector de pantalla. Se lee en su turno,
 * al entrar en la seccion.
 */

import type { ReactNode } from 'react'
import { CircleAlert, TriangleAlert } from 'lucide-react'
import styles from './InlineNotice.module.css'

/**
 * 'info' para una regla que conviene conocer; 'warning' para algo que exige
 * decision; 'danger' para un bloqueo que el medico no puede resolver solo y que
 * deja la pantalla sin salida (por ejemplo, quedarse sin instituciones).
 */
export type InlineNoticeTone = 'info' | 'warning' | 'danger'

interface InlineNoticeProps {
    children: ReactNode
    tone?: InlineNoticeTone
    className?: string
}

export function InlineNotice({ children, tone = 'info', className }: InlineNoticeProps) {
    // 'danger' se queda con el circulo de 'info': el triangulo distingue al ambar,
    // y el rojo ya carga la gravedad por color y copy.
    const Icono = tone === 'warning' ? TriangleAlert : CircleAlert

    const classes = [styles.notice, styles[tone], className ?? '']
        .filter(Boolean)
        .join(' ')

    return (
        <p className={classes}>
            <Icono className={styles.icon} size={16} aria-hidden="true" />
            <span>{children}</span>
        </p>
    )
}
