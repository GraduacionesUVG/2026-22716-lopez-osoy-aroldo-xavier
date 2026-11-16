/**
 * @fileoverview Bandeja de adendas, sin logica de datos.
 *
 * Todo entra y sale por props para que la pagina contenedora se quede con el
 * estado y las llamadas al servicio, y esta vista se pueda montar sola en
 * Storybook con cada uno de sus estados. Mismo reparto que `BusquedaView`.
 */

import type { FormEvent } from 'react'
import { CircleCheck, FileSearch, TriangleAlert } from 'lucide-react'
import { Button } from '../../../components/ui/Button/Button'
import { DateRangeField, type DateRange } from '../../../components/ui/DateRangeField/DateRangeField'
import { Tabs } from '../../../components/ui/Tabs/Tabs'
import type { AdendaResumen } from '../../../services/ficha.service'
import { AdendaResultCard } from './AdendaResultCard'
import { TABS, type SlugEstado } from './estados'
import styles from './AdendasView.module.css'

export type AdendasStatus = 'loading' | 'ready' | 'error'

export interface AdendasViewProps {
    tab: SlugEstado
    onTabChange: (tab: SlugEstado) => void

    q: string
    onQChange: (value: string) => void
    rango: DateRange
    onRangoChange: (value: DateRange) => void
    rangoError?: string
    onSubmit: () => void

    status: AdendasStatus
    results: AdendaResumen[]
    total: number
    errorMessage?: string

    hasMore: boolean
    isLoadingMore: boolean
    onLoadMore: () => void

    onVerRegistro: (fichaId: string) => void
    /** Aviso tras resolver una adenda. Lo deja la pantalla de revision al volver. */
    notice?: string
}

/** Cuantos esqueletos pintar mientras carga: una pantalla llena de filas. */
const SKELETON_COUNT = 4

/** El vacio se explica distinto en cada tab: no es lo mismo "nada por hacer" que "aun nada". */
const VACIO: Record<SlugEstado, { titulo: string; texto: string }> = {
    pendientes: {
        titulo: 'No hay adendas pendientes de revisión',
        texto: 'Cuando un pediatra solicite un cambio sobre una ficha registrada, aparecerá aquí.',
    },
    aprobadas: {
        titulo: 'No hay adendas aprobadas',
        texto: 'Se listan las de las últimas semanas. Amplíe el rango de fechas para ir más atrás.',
    },
    rechazadas: {
        titulo: 'No hay adendas rechazadas',
        texto: 'Se listan las de las últimas semanas. Amplíe el rango de fechas para ir más atrás.',
    },
}

const ICONO_VACIO: Record<SlugEstado, typeof FileSearch> = {
    pendientes: CircleCheck,
    aprobadas:  FileSearch,
    rechazadas: FileSearch,
}

export function AdendasView({
    tab,
    onTabChange,
    q,
    onQChange,
    rango,
    onRangoChange,
    rangoError,
    onSubmit,
    status,
    results,
    total,
    errorMessage,
    hasMore,
    isLoadingMore,
    onLoadMore,
    onVerRegistro,
    notice,
}: AdendasViewProps) {
    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        onSubmit()
    }

    // Solo la primera carga muestra esqueletos. Al pedir mas paginas ya hay
    // resultados en pantalla y reemplazarlos por esqueletos seria un parpadeo.
    const showSkeletons = status === 'loading'
    const IconoVacio = ICONO_VACIO[tab]

    return (
        <div className={styles.container}>
            <Tabs
                items={TABS}
                activeId={tab}
                onChange={(id) => onTabChange(id as SlugEstado)}
                label="Estado de las adendas"
            />

            {notice && (
                <p className={styles.notice} role="status">{notice}</p>
            )}

            <form className={styles.filters} onSubmit={handleSubmit} noValidate>
                <div className={styles.searchField}>
                    <input
                        type="search"
                        className={styles.searchInput}
                        value={q}
                        onChange={(event) => onQChange(event.target.value)}
                        placeholder="Nombre, no. historia clínica o pediatra"
                        aria-label="Búsqueda por nombre del paciente, número de historia clínica o pediatra"
                        autoComplete="off"
                    />
                </div>

                <DateRangeField
                    value={rango}
                    onChange={onRangoChange}
                    error={rangoError}
                />

                <Button
                    type="submit"
                    variant="primary"
                    className={styles.submitButton}
                    isLoading={status === 'loading'}
                >
                    Buscar
                </Button>
            </form>

            <div
                id={`panel-${tab}`}
                role="tabpanel"
                aria-labelledby={`tab-${tab}`}
                className={styles.panel}
            >
                {showSkeletons && (
                    <div className={styles.list} aria-busy="true" aria-label="Cargando adendas">
                        {Array.from({ length: SKELETON_COUNT }, (_, index) => (
                            <div key={index} className={styles.skeleton} />
                        ))}
                    </div>
                )}

                {status === 'error' && (
                    <div className={`${styles.state} ${styles.stateError}`} role="alert">
                        <TriangleAlert size={40} className={styles.stateIcon} aria-hidden="true" />
                        <span className={styles.stateTitle}>No se pudo cargar la bandeja</span>
                        <p className={styles.stateText}>{errorMessage}</p>
                        <Button variant="ghost" onClick={onSubmit}>Reintentar</Button>
                    </div>
                )}

                {status === 'ready' && results.length === 0 && (
                    <div className={`${styles.state} ${styles.stateEmpty}`}>
                        <IconoVacio size={40} className={styles.stateIcon} aria-hidden="true" />
                        <span className={styles.stateTitle}>{VACIO[tab].titulo}</span>
                        <p className={styles.stateText}>
                            {q.trim()
                                ? 'Revise que el nombre esté completo (no admite palabras a medias) o amplíe el rango de fechas.'
                                : VACIO[tab].texto}
                        </p>
                    </div>
                )}

                {status === 'ready' && results.length > 0 && (
                    <>
                        <div className={styles.list}>
                            {results.map((adenda) => (
                                <AdendaResultCard
                                    key={adenda.fichaId}
                                    adenda={adenda}
                                    onVerRegistro={onVerRegistro}
                                />
                            ))}
                        </div>

                        <div className={styles.footer}>
                            <span className={styles.count} aria-live="polite">
                                {results.length} de {total} {total === 1 ? 'adenda' : 'adendas'}
                            </span>

                            {hasMore && (
                                <Button variant="ghost" onClick={onLoadMore} isLoading={isLoadingMore}>
                                    Cargar más
                                </Button>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
