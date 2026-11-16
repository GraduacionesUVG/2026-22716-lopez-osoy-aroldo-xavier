/**
 * @fileoverview Lista de lotes CIE-10 por mes, sin lógica de datos.
 *
 * Es lo primero que ve el médico: un lote por mes, separado entre los que
 * faltan por revisar y los ya confirmados. "Ir al lote" abre la tabla
 * (`Cie10BatchReview`). Misma estética que la bandeja de adendas (pestañas y
 * tarjetas anchas con el botón a la derecha), pero paginada como la tabla del
 * lote: una página del servidor a la vez, con Anterior y Siguiente.
 */

import { CircleCheck, FileSearch, TriangleAlert } from 'lucide-react'
import { Button } from '../../../components/ui/Button/Button'
import { StatusBadge } from '../../../components/ui/StatusBadge/StatusBadge'
import { Tabs } from '../../../components/ui/Tabs/Tabs'
import { cie10LoteRoute } from '../../../app/routes'
import type { FiltroLotesCie10, ResumenLoteCie10 } from '../../../types/cie10'
import { etiquetaPeriodo, fechaCorta } from './lote'
import styles from './Cie10LotesView.module.css'

export type Cie10LotesStatus = 'loading' | 'ready' | 'error'

export interface Cie10LotesViewProps {
    filtro: FiltroLotesCie10
    onFiltroChange: (filtro: FiltroLotesCie10) => void

    status: Cie10LotesStatus
    errorMessage?: string
    onReintentar: () => void

    lotes: ResumenLoteCie10[]
    /** Lotes del filtro activo. */
    total: number
    /** Contadores de las dos pestañas; se omiten mientras no se sepan. */
    counts?: { pendientes: number; revisados: number }

    page: number
    pageSize: number
    pages: number
    onCambiarPagina: (delta: number) => void

    onIrALote: (runId: string) => void
}

const ESQUELETOS = 4

const VACIO: Record<FiltroLotesCie10, { Icono: typeof FileSearch; titulo: string; texto: string }> = {
    PENDIENTES: {
        Icono: CircleCheck,
        titulo: 'No hay lotes pendientes de revisión',
        texto: 'Cuando termine una autocodificación nueva, el lote del mes aparecerá aquí para revisarlo.',
    },
    REVISADOS: {
        Icono: FileSearch,
        titulo: 'Aún no hay lotes revisados',
        texto: 'Los lotes confirmados quedan aquí para consultar cómo se codificó cada diagnóstico.',
    },
}

export function Cie10LotesView({
    filtro,
    onFiltroChange,
    status,
    errorMessage,
    onReintentar,
    lotes,
    total,
    counts,
    page,
    pageSize,
    pages,
    onCambiarPagina,
    onIrALote,
}: Cie10LotesViewProps) {
    const vacio = VACIO[filtro]
    const panelId = filtro === 'PENDIENTES' ? 'pendientes' : 'revisados'
    const desde = lotes.length ? (page - 1) * pageSize + 1 : 0
    const hasta = desde ? desde + lotes.length - 1 : 0

    return (
        <div className={styles.container}>
            <Tabs
                items={[
                    { id: 'pendientes', label: 'Pendientes', count: counts?.pendientes },
                    { id: 'revisados', label: 'Revisados', count: counts?.revisados },
                ]}
                activeId={panelId}
                onChange={(id) => onFiltroChange(id === 'revisados' ? 'REVISADOS' : 'PENDIENTES')}
                label="Estado de los lotes"
            />

            <div id={`panel-${panelId}`} role="tabpanel" aria-labelledby={`tab-${panelId}`} className={styles.panel}>
                {status === 'loading' && (
                    <div className={styles.list} aria-busy="true" aria-label="Cargando lotes">
                        {Array.from({ length: ESQUELETOS }, (_, index) => <div key={index} className={styles.skeleton} />)}
                    </div>
                )}

                {status === 'error' && (
                    <div className={`${styles.state} ${styles.stateError}`} role="alert">
                        <TriangleAlert size={40} className={styles.stateIcon} aria-hidden="true" />
                        <span className={styles.stateTitle}>No se pudieron cargar los lotes</span>
                        <p className={styles.stateText}>{errorMessage}</p>
                        <Button variant="ghost" onClick={onReintentar}>Reintentar</Button>
                    </div>
                )}

                {status === 'ready' && lotes.length === 0 && (
                    <div className={`${styles.state} ${styles.stateEmpty}`}>
                        <vacio.Icono size={40} className={styles.stateIcon} aria-hidden="true" />
                        <span className={styles.stateTitle}>{vacio.titulo}</span>
                        <p className={styles.stateText}>{vacio.texto}</p>
                    </div>
                )}

                {status === 'ready' && lotes.length > 0 && (
                    <>
                        <div className={styles.list}>
                            {lotes.map((lote) => <LoteCard key={lote.runId} lote={lote} onIrALote={onIrALote} />)}
                        </div>

                        <div className={styles.footer}>
                            <span className={styles.count} aria-live="polite">
                                {desde} a {hasta} de {total} {total === 1 ? 'lote' : 'lotes'}
                            </span>
                            {pages > 1 && (
                                <div className={styles.pagination}>
                                    <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => onCambiarPagina(-1)}>
                                        Anterior
                                    </Button>
                                    <span>Página {page} de {pages}</span>
                                    <Button variant="ghost" size="sm" disabled={page >= pages} onClick={() => onCambiarPagina(1)}>
                                        Siguiente
                                    </Button>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

function LoteCard({ lote, onIrALote }: { lote: ResumenLoteCie10; onIrALote: (runId: string) => void }) {
    const mes = etiquetaPeriodo(lote.periodo)
    const revisado = lote.status !== 'PENDIENTE_REVISION'
    const href = cie10LoteRoute(lote.runId)

    return (
        <article className={styles.card}>
            <div className={styles.body}>
                <header className={styles.header}>
                    <h3 className={styles.name}>{mes}</h3>
                    <StatusBadge tone={revisado ? 'approved' : 'pending'}>
                        {revisado ? 'CONFIRMADO' : 'PENDIENTE'}
                    </StatusBadge>
                </header>

                {lote.finishedAt && (
                    <time className={styles.date} dateTime={lote.finishedAt}>
                        Procesado el {fechaCorta(lote.finishedAt)}
                    </time>
                )}

                <dl className={styles.details}>
                    <div className={styles.row}>
                        <dt className={styles.term}>Diagnósticos:</dt>
                        <dd className={styles.value}>{lote.total}</dd>
                    </div>
                    {revisado ? (
                        <div className={styles.row}>
                            <dt className={styles.term}>Confirmado:</dt>
                            <dd className={styles.value}>{fechaCorta(lote.confirmedAt)}</dd>
                        </div>
                    ) : (
                        <div className={styles.row}>
                            <dt className={styles.term}>Por revisar:</dt>
                            <dd className={styles.value}>
                                {lote.pendientes === 0 ? 'Todo revisado, falta confirmar' : lote.pendientes}
                            </dd>
                        </div>
                    )}
                </dl>
            </div>

            <a
                className={styles.openButton}
                href={href}
                onClick={(event) => {
                    // Clic normal: navega por el router. Ctrl/Cmd/medio abren pestaña nueva.
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
                    event.preventDefault()
                    onIrALote(lote.runId)
                }}
                aria-label={`Ir al lote de ${mes}`}
            >
                Ir al lote
            </a>
        </article>
    )
}
