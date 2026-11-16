/**
 * @fileoverview Card de un resultado de búsqueda de fichas.
 *
 * Muestra los cuatro datos con los que un médico reconoce una ficha -nombre,
 * fecha, historia clínica y tenant- y el botón para abrirla.
 */

import type { FichaResumen } from '../../../types/ficha-search'
import styles from './FichaResultCard.module.css'

export interface FichaResultCardProps {
    ficha: FichaResumen
    onVerRegistro: (fichaId: string) => void
    className?: string
}

const FECHA_CORTA = new Intl.DateTimeFormat('es-GT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
})

/**
 * Formatea el ISO del backend a `DD-MM-YYYY`.
 *
 * Se parte la cadena a mano en vez de `new Date(iso)`: esa forma interpreta el
 * ISO como UTC y en Guatemala pinta el día anterior.
 */
function formatearFecha(iso: string): string {
    const [anio, mes, dia] = iso.split('-').map(Number)
    if (!anio || !mes || !dia) return iso

    return FECHA_CORTA.format(new Date(anio, mes - 1, dia)).replace(/\//g, '-')
}

export function FichaResultCard({ ficha, onVerRegistro, className }: FichaResultCardProps) {
    const classes = [styles.card, className ?? ''].filter(Boolean).join(' ')
    const href = `/dashboard/busqueda/${encodeURIComponent(ficha.fichaId)}`

    return (
        <article className={classes}>
            <header className={styles.header}>
                <h3 className={styles.name}>{ficha.nombrePaciente}</h3>
                <time className={styles.date} dateTime={ficha.fechaConsulta}>
                    {formatearFecha(ficha.fechaConsulta)}
                </time>
            </header>

            {/* Sin el tenant: el servidor ya acota la búsqueda al hospital del
                médico, así que mostrarlo repetiría el mismo número en todas las
                cards. Vuelve a tener sentido el día que una cuenta abarque
                varios, y entonces conviene el nombre de la institución antes que
                el id. */}
            <dl className={styles.details}>
                <div className={styles.row}>
                    <dt className={styles.term}>No. Historia Clínica:</dt>
                    <dd className={styles.value}>{ficha.historiaClinica}</dd>
                </div>
            </dl>

            <a
                className={styles.openButton}
                href={href}
                onClick={(event) => {
                    event.preventDefault()
                    onVerRegistro(ficha.fichaId)
                }}
                aria-label={`Ver registro de ${ficha.nombrePaciente}`}
            >
                Ver registro
            </a>
        </article>
    )
}
