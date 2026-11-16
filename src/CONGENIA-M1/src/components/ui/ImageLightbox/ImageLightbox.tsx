/**
 * @fileoverview Imagen a pantalla completa sobre fondo oscuro.
 *
 * Es la ampliación que ya existía dentro de signos de alerta y de exámenes,
 * extraída para que la ficha en modo lectura la reuse sin volver a escribirla.
 */

import { X } from 'lucide-react'
import { Modal } from '../Modal/Modal'
import styles from './ImageLightbox.module.css'

export interface ImageLightboxProps {
    isOpen: boolean
    onClose: () => void
    src: string
    alt: string
}

export function ImageLightbox({ isOpen, onClose, src, alt }: ImageLightboxProps) {
    return (
        <Modal isOpen={isOpen} onClose={onClose} variant="bare" label={alt}>
            <img src={src} alt={alt} className={styles.image} />

            <button
                type="button"
                className={styles.close}
                onClick={onClose}
                aria-label="Cerrar la imagen"
            >
                <X size={22} aria-hidden="true" />
            </button>
        </Modal>
    )
}
