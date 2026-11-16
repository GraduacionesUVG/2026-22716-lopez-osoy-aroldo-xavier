/**
 * @fileoverview Antes de exportar, para qué sirve la copia.
 *
 * El tablero solo vive en el navegador, y quien lo arma no tiene por qué
 * saberlo. Lo leen coordinadores y directivos, así que habla del archivo y de
 * qué hacer con él, no del formato.
 */

import { useId } from 'react'
import { Download } from 'lucide-react'
import { Button } from '../../../components/ui/Button/Button'
import { InlineNotice } from '../../../components/ui/InlineNotice/InlineNotice'
import { Modal } from '../../../components/ui/Modal/Modal'
import { NOMBRE_DASHBOARD, PREFIJO_ARCHIVO_TABLERO, type DashboardId } from './tablero'
import styles from './TableroModales.module.css'

export interface ExportarTableroModalProps {
    isOpen: boolean
    onClose: () => void
    onDescargar: () => void
    /** Tarjetas del agente por tablero, para decir qué se lleva la copia. */
    tarjetas: Record<DashboardId, number>
}

export function ExportarTableroModal({ isOpen, onClose, onDescargar, tarjetas }: ExportarTableroModalProps) {
    const tituloId = useId()

    return (
        <Modal isOpen={isOpen} onClose={onClose} labelledBy={tituloId} className={styles.overlay}>
            <h2 id={tituloId} className={styles.title}>Guardar una copia del tablero</h2>

            <p className={styles.lead}>
                El tablero que arma con el agente se guarda solo en este navegador. Si cambia de
                computadora o de navegador, o si se borra el historial, las tarjetas se pierden.
                La copia sirve para conservarlo y volver a usarlo en otra sesión.
            </p>

            <div>
                <h3 className={styles.subtitle}>Qué se descarga</h3>
                <p className={styles.lead}>
                    Un archivo con los dos tableros: {NOMBRE_DASHBOARD.produccion} ({cantidad(tarjetas.produccion)})
                    y {NOMBRE_DASHBOARD.ficha} ({cantidad(tarjetas.ficha)}), con el orden en que las acomodó.
                </p>
            </div>

            <div>
                <h3 className={styles.subtitle}>Cómo usarlo</h3>
                <ol className={styles.steps}>
                    <li>
                        Pulse <strong>Descargar copia</strong>. El archivo queda en su carpeta de descargas
                        con el nombre <span className={styles.fileName}>{PREFIJO_ARCHIVO_TABLERO}</span> y la fecha de hoy.
                    </li>
                    <li>
                        Guárdelo en una carpeta segura de la institución. También queda como registro de
                        cómo estaba el tablero ese día.
                    </li>
                    <li>
                        Para recuperarlo en otra sesión o en otra computadora, abra <strong>Importar</strong> en
                        esta misma pantalla y suelte ahí ese archivo.
                    </li>
                </ol>
            </div>

            <InlineNotice>
                El archivo solo trae totales y gráficas. No contiene datos de pacientes.
            </InlineNotice>

            <div className={styles.actions}>
                <Button variant="ghost" fullWidth onClick={onClose}>Cancelar</Button>
                <Button
                    autoFocus
                    fullWidth
                    leftIcon={<Download size={18} aria-hidden="true" />}
                    onClick={onDescargar}
                >
                    Descargar copia
                </Button>
            </div>
        </Modal>
    )
}

function cantidad(total: number) {
    return total === 1 ? '1 tarjeta del agente' : `${total} tarjetas del agente`
}
