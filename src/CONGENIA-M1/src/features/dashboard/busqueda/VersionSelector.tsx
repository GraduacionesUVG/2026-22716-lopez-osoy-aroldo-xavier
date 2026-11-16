/**
 * @fileoverview Selector de versiones de una ficha, bajo el título del visor.
 *
 * Presentacional puro: recibe las versiones ya recortadas al linaje y avisa cuál
 * se eligió. Envuelve el `Dropdown` base en vez de traer un select propio.
 */

import type { ChangeEvent } from 'react'
import { Dropdown } from '../../../components/ui/Dropdown/Dropdown'
import type { FichaSummary } from '../../../services/ficha.service'
import { etiquetaVersion } from './versiones'
import styles from './VersionSelector.module.css'

export interface VersionSelectorProps {
    /** Versiones del linaje, de la más antigua a la más reciente. */
    versiones: FichaSummary[]
    /** La que se está viendo. */
    fichaActivaId: string
    onSeleccionar: (fichaId: string) => void
    /** Mientras la versión elegida carga, para no encadenar peticiones. */
    disabled?: boolean
}

/**
 * No se pinta nada con menos de dos versiones: un selector de una sola opción no
 * ofrece ninguna elección, y la mayoría de las fichas no tienen adendas.
 *
 * La condición vive aquí y no en la página para que el visor no tenga que saber
 * cuándo hay algo que elegir.
 */
export function VersionSelector({
    versiones,
    fichaActivaId,
    onSeleccionar,
    disabled = false,
}: VersionSelectorProps) {
    if (versiones.length < 2) return null

    const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
        if (event.target.value !== fichaActivaId) onSeleccionar(event.target.value)
    }

    return (
        <div className={styles.wrapper}>
            <Dropdown
                // Explícito: el id derivado del label chocaría con otro dropdown
                // que se llamara igual en la misma pantalla.
                id="version-ficha"
                label="Versión de la ficha"
                options={versiones.map((version) => ({
                    value: version.fichaId,
                    label: etiquetaVersion(version),
                }))}
                value={fichaActivaId}
                onChange={handleChange}
                disabled={disabled}
            />
        </div>
    )
}
