/**
 * @fileoverview Dialogo de confirmacion para acciones que destruyen datos.
 *
 * Recoge el patron que ya estaba escrito dos veces -el "¿Salir sin guardar?" de
 * la revision de adendas y el del orquestador- y lo deja en un solo sitio, para
 * que ningun borrado nuevo tenga que volver a montar el suyo a mano.
 *
 * Envuelve a `Modal`, que es quien resuelve overlay, Escape, clic en el fondo y
 * bloqueo del scroll. Lo que suma aqui es lo propio de una confirmacion:
 * titulo, consecuencia, dos salidas y el sesgo hacia la opcion segura.
 */

import { useId } from 'react'
import type { ReactNode } from 'react'
import { Modal } from '../Modal/Modal'
import { Button } from '../Button/Button'
import styles from './ConfirmDialog.module.css'

export interface ConfirmDialogProps {
    isOpen: boolean
    /** Va en pregunta: es lo que se lee primero y decide por si solo. */
    title: string
    /** La consecuencia de confirmar. Lo que el usuario necesita para elegir. */
    message?: ReactNode
    confirmLabel?: string
    cancelLabel?: string
    /** `destructive` pinta de rojo el boton de confirmar. Para borrados. */
    tone?: 'primary' | 'destructive'
    onConfirm: () => void
    onCancel: () => void
}

export function ConfirmDialog({
    isOpen,
    title,
    message,
    confirmLabel = 'Sí, continuar',
    cancelLabel = 'Cancelar',
    tone = 'primary',
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    const titleId = useId()

    return (
        <Modal
            isOpen={isOpen}
            onClose={onCancel}
            labelledBy={titleId}
            className={styles.overlay}
        >
            <h2 id={titleId} className={styles.title}>{title}</h2>
            {message && <p className={styles.message}>{message}</p>}

            <div className={styles.actions}>
                {/* Cancelar primero -el orden que ya usan los otros dialogos- y
                    con el foco de entrada: `Modal` no tiene focus trap, asi que
                    sin esto el foco se queda en el boton de borrar que acaba de
                    desaparecer y un Enter de mas confirma sin leer nada.
                    Se enfoca en cada apertura porque `Modal` desmonta al cerrar. */}
                <Button autoFocus variant="ghost" fullWidth onClick={onCancel}>
                    {cancelLabel}
                </Button>
                <Button variant={tone} fullWidth onClick={onConfirm}>
                    {confirmLabel}
                </Button>
            </div>
        </Modal>
    )
}
