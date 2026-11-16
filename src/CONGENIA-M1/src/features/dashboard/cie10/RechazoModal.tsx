/**
 * @fileoverview Modal de "Rechazar": el revisor elige el código correcto.
 *
 * Rechazar descarta **todas** las sugerencias del modelo, así que el código que
 * se elige aquí es el que queda en la ficha. Sale del catálogo CIE-10 vigente
 * (`CatalogoCie10Combobox`); si no está, el médico puede usar el que escribió,
 * con formato CIE-10 y un aviso de que queda fuera de catálogo. Solo se pide el
 * código: sin justificación.
 *
 * También sirve para las filas sin sugerencias (`modo="ingresar"`): ahí no hay
 * nada que rechazar, solo un código que poner.
 *
 * El texto vive dentro del modal y no en la página: `Modal` desmonta al cerrar,
 * así que cada rechazo empieza en blanco sin tener que limpiar nada a mano.
 */

import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { Modal } from '../../../components/ui/Modal/Modal'
import { Button } from '../../../components/ui/Button/Button'
import { InlineNotice } from '../../../components/ui/InlineNotice/InlineNotice'
import { buscarCatalogoCie10 } from '../../../services/cie10.service'
import type { CatalogoCie10Item } from '../../../types/cie10'
import { CatalogoCie10Combobox } from './CatalogoCie10Combobox'
import { esFueraDeCatalogo } from './lote'
import styles from './Cie10BatchReview.module.css'

export interface RechazoModalProps {
    isOpen: boolean
    diagnostico: string
    /** `ingresar` para filas sin sugerencias: cambia el título y el texto. */
    modo?: 'rechazar' | 'ingresar'
    /** El código de la corrección anterior, al usar "Cambiar". */
    codigoInicial?: string
    enviando: boolean
    onCancelar: () => void
    /** `fueraDeCatalogo`: el médico eligió usar un código que no está en el catálogo. */
    onEnviar: (codigo: string, fueraDeCatalogo: boolean) => void
    /** Por defecto, el catálogo del servicio. Storybook pasa uno de prueba. */
    buscarCatalogo?: (q: string) => Promise<CatalogoCie10Item[]>
}

export function RechazoModal({ isOpen, ...resto }: RechazoModalProps) {
    const titleId = useId()

    return (
        <Modal isOpen={isOpen} onClose={resto.enviando ? undefined : resto.onCancelar} labelledBy={titleId}>
            <Formulario titleId={titleId} {...resto} />
        </Modal>
    )
}

/** El código guardado antes no trae descripción: basta con mostrarlo tal cual. */
function seleccionPrevia(codigo: string | undefined): CatalogoCie10Item | null {
    if (!codigo) return null
    return { codigo, descripcion: '', codigoInterno: null, enCatalogoInstitucional: true, enReferenciaExterna: false }
}

function Formulario({
    titleId,
    diagnostico,
    modo = 'rechazar',
    codigoInicial,
    enviando,
    onCancelar,
    onEnviar,
    buscarCatalogo = buscarCatalogoCie10,
}: Omit<RechazoModalProps, 'isOpen'> & { titleId: string }) {
    const [seleccion, setSeleccion] = useState<CatalogoCie10Item | null>(() => seleccionPrevia(codigoInicial))
    const [errorCodigo, setErrorCodigo] = useState<string | undefined>()

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault()
        if (!seleccion) {
            setErrorCodigo('Elija un código del catálogo.')
            return
        }
        onEnviar(seleccion.codigo, esFueraDeCatalogo(seleccion))
    }

    return (
        <form className={styles.modalForm} onSubmit={handleSubmit} noValidate>
            <h2 id={titleId} className={styles.modalTitle}>
                {modo === 'ingresar' ? 'Ingresar código CIE-10' : 'Rechazar sugerencias'}
            </h2>
            <p className={styles.modalText}>
                {modo === 'ingresar'
                    ? <>El modelo no propuso un código para <strong>{diagnostico}</strong>.</>
                    : <>Ninguna sugerencia corresponde a <strong>{diagnostico}</strong>.</>}
                {' '}Elija el código CIE-10 correcto del catálogo.
            </p>

            <CatalogoCie10Combobox
                label="Corrección médica (código CIE-10)"
                buscar={buscarCatalogo}
                seleccion={seleccion}
                onSeleccionar={(item) => {
                    setSeleccion(item)
                    setErrorCodigo(undefined)
                }}
                error={errorCodigo}
                autoFocus
            />

            {seleccion && esFueraDeCatalogo(seleccion) && (
                <InlineNotice tone="warning">
                    {seleccion.codigo} no está en el catálogo vigente. Se guardará como código fuera de catálogo:
                    verifique que esté bien escrito.
                </InlineNotice>
            )}

            <div className={styles.modalActions}>
                <Button variant="destructive" fullWidth onClick={onCancelar} disabled={enviando}>
                    Cancelar
                </Button>
                <Button type="submit" variant="primary" fullWidth isLoading={enviando}>
                    Aceptar
                </Button>
            </div>
        </form>
    )
}
