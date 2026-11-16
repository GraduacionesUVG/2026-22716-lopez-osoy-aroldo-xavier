/**
 * @fileoverview Seccion Observaciones
 *
 * Texto libre para lo que el medico quiera agregar y no cabe en otra seccion.
 * Sigue el patron de Signos de Alerta: una lista de cards y un modal para
 * agregar. Puede haber varias, y en una adenda solo se agregan: lo ya registrado
 * no se edita ni se borra.
 *
 * Es opcional: no cuenta para el avance de la ficha ni para "Falta completar".
 */

import { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import styles from './ObservationsSection.module.css'
import { SectionHeader } from '../../ui/SectionHeader/SectionHeader'
import { fichaItemAnchorId } from '../../ui/MediaCard/anchor'
import { ConfirmDialog } from '../../ui/ConfirmDialog/ConfirmDialog'
import { Button } from '../../ui/Button/Button'
import { TextArea } from '../../ui/Input/TextArea'
import { InlineNotice } from '../../ui/InlineNotice/InlineNotice'

/** El servidor rechaza observaciones mas largas (PENDIENTES-BACKEND.md, seccion 16). */
export const MAX_OBSERVACION = 1000
const MIN_OBSERVACION = 3

export interface ObservacionItem {
    id: string
    text: string
    /** Ya registrada: se puede leer, no quitar. */
    locked?: boolean
    /** Ya formateada para mostrar. Solo la traen las observaciones guardadas. */
    fecha?: string
}

interface ObservationsSectionProps {
    title?: string
    items: ObservacionItem[]
    onAdd?: (item: ObservacionItem) => void
    onRemove?: (id: string) => void
    /** Bloquea la seccion hasta que el consentimiento este firmado. */
    disabled?: boolean
    /** Solo lectura: se pueden abrir, pero no agregar ni quitar. */
    readOnly?: boolean
    /** Observacion a la que acaba de saltar otra pantalla. Se realza para no perderla. */
    highlightedItemId?: string
    isOpen?: boolean
    onToggle?: () => void
    className?: string
    /** Ancla en el DOM, para que el pie pueda traer esta seccion a la vista. */
    id?: string
}

const observationsIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 5C4 3.895 4.895 3 6 3H18C19.105 3 20 3.895 20 5V15C20 16.105 19.105 17 18 17H9L4 21V5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8 8H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M8 12H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
)

export function ObservationsSection({
    title = 'Observaciones',
    items,
    onAdd,
    onRemove,
    disabled = false,
    readOnly = false,
    highlightedItemId,
    isOpen,
    onToggle,
    className,
    id,
}: ObservationsSectionProps) {
    const [isOpenState, setIsOpenState] = useState(true)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [texto, setTexto] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [detalle, setDetalle] = useState<ObservacionItem | null>(null)
    // Se guarda la observacion entera: el dialogo la cita mientras se cierra.
    const [itemAEliminar, setItemAEliminar] = useState<ObservacionItem | null>(null)

    const isExpanded = isOpen ?? isOpenState
    const handleToggle = onToggle ?? (() => setIsOpenState((prev) => !prev))

    const abrirModal = () => {
        setTexto('')
        setError(null)
        setIsModalOpen(true)
    }

    const agregar = () => {
        const limpio = texto.trim()
        if (limpio.length < MIN_OBSERVACION) {
            setError(`La observación debe tener al menos ${MIN_OBSERVACION} caracteres`)
            return
        }
        onAdd?.({ id: uuidv4(), text: limpio })
        setIsModalOpen(false)
    }

    return (
        <div id={id} className={[styles.card, className ?? ''].filter(Boolean).join(' ')}>
            <SectionHeader
                title={title}
                icon={observationsIcon}
                isOpen={isExpanded}
                onToggle={handleToggle}
                embedded
            />

            {isExpanded && disabled && (
                <div className={styles.body}>
                    <p className={styles.disabledNotice}>
                        Firme el consentimiento informado para habilitar esta sección.
                    </p>
                </div>
            )}

            {isExpanded && !disabled && (
                <div className={styles.body}>
                    <div className={styles.list}>
                        {items.map((item) => (
                            <div
                                key={item.id}
                                id={fichaItemAnchorId(item.id)}
                                className={[
                                    styles.item,
                                    item.id === highlightedItemId ? styles.itemHighlighted : '',
                                ].filter(Boolean).join(' ')}
                            >
                                <button
                                    type="button"
                                    className={styles.itemBody}
                                    onClick={() => setDetalle(item)}
                                    aria-label={`Ver observación completa: ${item.text.slice(0, 60)}`}
                                >
                                    <span className={styles.itemText}>{item.text}</span>
                                    {item.fecha && <span className={styles.itemDate}>{item.fecha}</span>}
                                </button>
                                {!readOnly && !item.locked && onRemove && (
                                    <button
                                        type="button"
                                        className={styles.removeButton}
                                        onClick={() => setItemAEliminar(item)}
                                        aria-label="Eliminar"
                                    >
                                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                                            <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                                        </svg>
                                    </button>
                                )}
                            </div>
                        ))}

                        {readOnly && items.length === 0 && (
                            <span className={styles.emptyText}>
                                No se registraron observaciones.
                            </span>
                        )}
                    </div>

                    {!readOnly && (
                        <Button variant="primary" fullWidth onClick={abrirModal}>
                            + Agregar observación
                        </Button>
                    )}
                </div>
            )}

            {isModalOpen && !readOnly && (
                <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="observacion-modal-title">
                    <div className={styles.modal}>
                        <div className={styles.modalHeader}>
                            <span id="observacion-modal-title" className={styles.modalTitle}>Agregar Observación</span>
                            <button
                                type="button"
                                className={styles.modalClose}
                                onClick={() => setIsModalOpen(false)}
                                aria-label="Cerrar"
                            >
                                <span aria-hidden="true">×</span>
                            </button>
                        </div>

                        <div className={styles.modalBody}>
                            <span className={styles.stepBodyLabel}>
                                Escriba lo que quiera agregar a la ficha y que no quedó en otra sección
                            </span>
                            {/* Es texto libre y no se cifra por campo como el nombre del
                                paciente: se recuerda antes de escribir, no despues. */}
                            <InlineNotice>
                                No incluya nombres ni datos personales del paciente o su familia.
                            </InlineNotice>
                            <TextArea
                                label="Observación *"
                                placeholder="Ej: La madre refiere que el hermano mayor presentó un cuadro similar..."
                                value={texto}
                                rows={5}
                                maxLength={MAX_OBSERVACION}
                                onChange={(e) => {
                                    setTexto(e.target.value)
                                    setError(null)
                                }}
                                error={error ?? undefined}
                            />
                        </div>

                        <div className={styles.modalFooter}>
                            <Button variant="ghost" fullWidth onClick={() => setIsModalOpen(false)}>
                                Cancelar
                            </Button>
                            <Button variant="primary" fullWidth onClick={agregar}>
                                Agregar
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {detalle && (
                <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="observacion-detalle-title">
                    <div className={styles.modal}>
                        <div className={styles.modalHeader}>
                            <span id="observacion-detalle-title" className={styles.modalTitle}>Observación</span>
                            <button
                                type="button"
                                className={styles.modalClose}
                                onClick={() => setDetalle(null)}
                                aria-label="Cerrar"
                            >
                                <span aria-hidden="true">×</span>
                            </button>
                        </div>

                        <div className={styles.modalBody}>
                            {detalle.fecha && <span className={styles.itemDate}>{detalle.fecha}</span>}
                            <p className={styles.detailText}>{detalle.text}</p>
                        </div>

                        <div className={styles.detailFooter}>
                            <Button variant="primary" fullWidth onClick={() => setDetalle(null)}>
                                Cerrar
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmDialog
                isOpen={itemAEliminar !== null}
                title="¿Eliminar esta observación?"
                message="La observación se eliminará de la ficha. Esta acción no se puede deshacer."
                confirmLabel="Sí, eliminar"
                tone="destructive"
                onCancel={() => setItemAEliminar(null)}
                onConfirm={() => {
                    if (itemAEliminar) onRemove?.(itemAEliminar.id)
                    setItemAEliminar(null)
                }}
            />
        </div>
    )
}
