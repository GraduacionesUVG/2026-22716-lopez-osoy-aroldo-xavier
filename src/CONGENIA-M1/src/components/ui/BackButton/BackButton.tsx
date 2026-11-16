/**
 * @fileoverview Boton redondo de regresar, para la ranura de accion del topbar.
 *
 * `FichaDetailPage` tiene el mismo boton escrito a mano, con su CSS repetido en
 * `FichaDetailPage.module.css`. Al aparecer la segunda pantalla que lo necesita
 * -la revision de una adenda- se extrajo aqui; falta migrar aquella, que ahora
 * mismo esta en obra por el selector de versiones y tocarla seria pisarse.
 *
 * `usePageHeader` compara la accion por identidad, asi que quien lo pase como
 * `action` debe memoizarlo.
 */

import { Undo2 } from 'lucide-react'
import styles from './BackButton.module.css'

export interface BackButtonProps {
    onClick: () => void
    /** Describe a donde se vuelve: "Regresar a la búsqueda". */
    label: string
    className?: string
}

export function BackButton({ onClick, label, className }: BackButtonProps) {
    return (
        <button
            type="button"
            className={[styles.backButton, className ?? ''].filter(Boolean).join(' ')}
            onClick={onClick}
            aria-label={label}
            title={label}
        >
            <Undo2 size={20} aria-hidden="true" />
        </button>
    )
}
