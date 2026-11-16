/**
 * @fileoverview Panel de decision de una adenda: un cambio a la vez.
 *
 * De uno en uno y no como lista: cada decision es un acto clinico y verlas
 * todas a la vez invita a aprobar en bloque sin mirar. Las flechas solo
 * aparecen cuando hay mas de un cambio, porque un par de botones desactivados
 * al lado de un unico cambio no informan de nada.
 *
 * Decidir avanza al siguiente cambio por su cuenta: el revisor viene a resolver
 * la adenda entera, y obligarle a pulsar la flecha despues de cada decision solo
 * anade un paso que siempre quiere dar. En el ultimo cambio se queda donde esta.
 *
 * Pulsar cualquiera de las dos vistas previas lleva la ficha de la derecha hasta
 * ese elemento: es la forma de ver el cambio en su contexto sin perder el sitio.
 */

import { ArrowDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '../../../components/ui/Button/Button'
import type { CambioSolicitado, Decision, DecisionesPorCambio, RegistroCambio, TipoCambio } from './cambios'
import styles from './CambiosPanel.module.css'

/** Como se nombra un alta que no sustituye nada, segun su tipo. */
const ALTA_NUEVA: Record<TipoCambio, string> = {
    SIGNO:       'un signo nuevo',
    EXAMEN:      'un estudio nuevo',
    OBSERVACION: 'una observación nueva',
}

export interface CambiosPanelProps {
    cambios: CambioSolicitado[]
    indice: number
    onIndiceChange: (indice: number) => void
    decisiones: DecisionesPorCambio
    onDecidir: (id: string, decision: Decision) => void
    /** Trae a la vista el elemento de la ficha que se acaba de pulsar. */
    onFocusRegistro: (registroId: string) => void
    /** Bloquea el panel mientras el guardado esta en vuelo. */
    disabled?: boolean
}

function Preview({
    registro,
    etiquetaTipo,
    rol,
    onClick,
    disabled,
    conMiniatura = true,
}: {
    registro: RegistroCambio
    etiquetaTipo: string
    rol: 'anterior' | 'nuevo'
    onClick: () => void
    disabled: boolean
    /** Las observaciones son solo texto: el recuadro gris sugeriria una foto que falta. */
    conMiniatura?: boolean
}) {
    return (
        <div className={styles.block}>
            <span className={rol === 'anterior' ? styles.labelAnterior : styles.labelNuevo}>
                {rol === 'anterior' ? 'Anterior' : 'Nuevo'} ({etiquetaTipo})
            </span>

            <button
                type="button"
                className={rol === 'anterior' ? styles.previewAnterior : styles.previewNuevo}
                onClick={onClick}
                disabled={disabled}
                aria-label={`Ver "${registro.titulo}" dentro de la ficha`}
            >
                {conMiniatura && (registro.imagenUrl ? (
                    <img src={registro.imagenUrl} alt="" className={styles.thumb} />
                ) : (
                    <div className={styles.thumbPlaceholder} aria-hidden="true" />
                ))}

                <span className={styles.previewBody}>
                    <span className={styles.previewTitle}>{registro.titulo}</span>
                    {registro.chips.length > 0 && (
                        <span className={styles.chips}>
                            {registro.chips.map((chip) => (
                                <span key={chip} className={styles.chip}>{chip}</span>
                            ))}
                        </span>
                    )}
                </span>
            </button>
        </div>
    )
}

export function CambiosPanel({
    cambios,
    indice,
    onIndiceChange,
    decisiones,
    onDecidir,
    onFocusRegistro,
    disabled = false,
}: CambiosPanelProps) {
    const cambio = cambios[indice]
    if (!cambio) return null

    const tomada = decisiones[cambio.id]
    const varios = cambios.length > 1

    return (
        <section className={styles.panel} aria-label="Cambios solicitados">
            <header className={styles.header}>
                <h2 className={styles.title}>Cambios solicitados</h2>
                {varios && (
                    <span className={styles.counter} aria-live="polite">
                        {indice + 1} de {cambios.length}
                    </span>
                )}
            </header>

            {cambio.anterior ? (
                <>
                    <Preview
                        registro={cambio.anterior}
                        etiquetaTipo={cambio.etiqueta}
                        rol="anterior"
                        onClick={() => onFocusRegistro(cambio.anterior?.id ?? '')}
                        disabled={disabled}
                    />

                    <ArrowDown size={28} className={styles.arrow} aria-hidden="true" />
                </>
            ) : (
                <p className={styles.sinAnterior}>
                    Este cambio no sustituye nada: es {ALTA_NUEVA[cambio.tipo]}.
                </p>
            )}

            <Preview
                registro={cambio.nuevo}
                etiquetaTipo={cambio.etiqueta}
                rol="nuevo"
                conMiniatura={cambio.tipo !== 'OBSERVACION'}
                onClick={() => onFocusRegistro(cambio.nuevo.id)}
                disabled={disabled}
            />

            <div className={styles.actions}>
                {varios && (
                    <button
                        type="button"
                        className={styles.navButton}
                        onClick={() => onIndiceChange(indice - 1)}
                        disabled={disabled || indice === 0}
                        aria-label="Cambio anterior"
                    >
                        <ChevronLeft size={20} aria-hidden="true" />
                    </button>
                )}

                {/* Los dos van rellenos de serie: no hay aqui una "accion principal"
                    que destacar sobre la otra, aceptar y rechazar pesan igual. Lo ya
                    decidido se marca con el color, no con el relieve. */}
                <div className={styles.decisionButtons}>
                    <Button
                        variant="primary"
                        fullWidth
                        disabled={disabled}
                        aria-pressed={tomada === 'APROBADO'}
                        className={[styles.accept, tomada === 'APROBADO' ? styles.elegida : '']
                            .filter(Boolean).join(' ')}
                        onClick={() => onDecidir(cambio.id, 'APROBADO')}
                    >
                        Aceptar
                    </Button>
                    <Button
                        variant="primary"
                        fullWidth
                        disabled={disabled}
                        aria-pressed={tomada === 'RECHAZADO'}
                        className={[styles.reject, tomada === 'RECHAZADO' ? styles.elegida : '']
                            .filter(Boolean).join(' ')}
                        onClick={() => onDecidir(cambio.id, 'RECHAZADO')}
                    >
                        Rechazar
                    </Button>
                </div>

                {varios && (
                    <button
                        type="button"
                        className={styles.navButton}
                        onClick={() => onIndiceChange(indice + 1)}
                        disabled={disabled || indice === cambios.length - 1}
                        aria-label="Cambio siguiente"
                    >
                        <ChevronRight size={20} aria-hidden="true" />
                    </button>
                )}
            </div>

            {varios && (
                <ol className={styles.dots}>
                    {cambios.map((otro, i) => {
                        const suya = decisiones[otro.id]
                        const clases = [
                            styles.dot,
                            i === indice ? styles.dotCurrent : '',
                            suya === 'APROBADO' ? styles.dotApproved : '',
                            suya === 'RECHAZADO' ? styles.dotRejected : '',
                        ].filter(Boolean).join(' ')

                        return (
                            <li key={otro.id}>
                                <button
                                    type="button"
                                    className={clases}
                                    disabled={disabled}
                                    aria-label={`Ir al cambio ${i + 1}: ${otro.nuevo.titulo}`}
                                    aria-current={i === indice || undefined}
                                    onClick={() => onIndiceChange(i)}
                                />
                            </li>
                        )
                    })}
                </ol>
            )}
        </section>
    )
}
