/**
 * @fileoverview Contenedor de la busqueda de fichas.
 *
 * Se queda con el estado y las llamadas al servicio; `BusquedaView` solo pinta.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BusquedaView, type BusquedaStatus } from './BusquedaView'
import { isInvalidRange, type DateRange } from '../../../components/ui/DateRangeField/dateRange'
import { usePageHeader } from '../layout/usePageHeader'
import { fichaRoute } from '../../../app/routes'
import { DEFAULT_PAGE_SIZE, searchFichas } from '../../../services/fichaSearch.service'
import { ApiError } from '../../../services/api.client'
import { readBusquedaSnapshot, writeBusquedaSnapshot } from './busquedaCache'
import type { FichaResumen, FichaSearchParams } from '../../../types/ficha-search'

/**
 * El filtro de fechas arranca vacío: dos fechas precargadas se leen como algo que
 * el médico eligió, y no lo eligió.
 *
 * La ventana reciente sigue existiendo, pero del lado del servidor: cuando la
 * búsqueda va sin fechas, acota al último mes por su cuenta (ver
 * `PENDIENTES-BACKEND.md`, sección 1). Así el campo dice la verdad -no hay filtro
 * puesto- y la consulta sigue sin poder pedir el historial completo de un
 * hospital de una sola vez.
 *
 * @compliance HIPAA 164.502(b) - mínimo dato necesario
 */
const RANGO_VACIO: DateRange = { desde: '', hasta: '' }

const MENSAJE_GENERICO = 'Intente de nuevo en un momento.'

function mensajeDeError(error: unknown): string {
    if (error instanceof ApiError) {
        // Los mensajes del servidor pueden arrastrar detalles internos, asi que
        // solo se traducen los casos que el medico puede accionar.
        if (error.status === 408) return 'La búsqueda tardó demasiado. Intente de nuevo.'
        if (error.status === 0)   return 'No hay conexión con el servidor.'
        if (error.status === 401 || error.status === 403) {
            return 'Su sesión no tiene permiso para consultar fichas.'
        }
    }
    return MENSAJE_GENERICO
}

export function BusquedaPage() {
    const navigate = useNavigate()
    usePageHeader('Búsqueda de Ficha Clínica')

    // Al volver del visor de una ficha se recupera la ultima busqueda, para no
    // obligar a repetir los filtros por cada registro que se quiera revisar.
    // Inicializador perezoso de useState: se lee una sola vez, al montar.
    const [guardada] = useState(readBusquedaSnapshot)

    const [q, setQ] = useState(guardada?.q ?? '')
    const [rango, setRango] = useState<DateRange>(guardada?.rango ?? RANGO_VACIO)
    const [rangoError, setRangoError] = useState<string | undefined>()

    const [status, setStatus] = useState<BusquedaStatus>(guardada ? 'ready' : 'idle')
    const [results, setResults] = useState<FichaResumen[]>(guardada?.results ?? [])
    const [total, setTotal] = useState(guardada?.total ?? 0)
    const [page, setPage] = useState(guardada?.page ?? 1)
    const [isLoadingMore, setIsLoadingMore] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | undefined>()

    // Los filtros aplicados, congelados al momento de buscar. "Cargar mas" tiene
    // que pedir la siguiente pagina de ESA busqueda, no de lo que el medico haya
    // tecleado despues sin volver a pulsar Buscar.
    const filtrosAplicados = useRef<FichaSearchParams>(guardada?.filtros ?? {})

    // Cada busqueda lleva numero: si llega tarde la respuesta de una anterior,
    // se descarta en vez de pisar los resultados buenos.
    const peticionActual = useRef(0)

    const ejecutarBusqueda = useCallback(async (filtros: FichaSearchParams) => {
        const idPeticion = ++peticionActual.current

        setStatus('loading')
        setErrorMessage(undefined)

        try {
            const resultado = await searchFichas(filtros)
            if (idPeticion !== peticionActual.current) return

            setResults(resultado.items)
            setTotal(resultado.total)
            setPage(resultado.page)
            setStatus('ready')
        } catch (error) {
            if (idPeticion !== peticionActual.current) return

            setErrorMessage(mensajeDeError(error))
            setStatus('error')
        }
    }, [])

    const handleSubmit = useCallback(() => {
        if (isInvalidRange(rango)) {
            setRangoError('La fecha inicial no puede ser posterior a la final.')
            return
        }
        setRangoError(undefined)

        const filtros: FichaSearchParams = {
            q: q.trim() || undefined,
            desde: rango.desde || undefined,
            hasta: rango.hasta || undefined,
            page: 1,
            pageSize: DEFAULT_PAGE_SIZE,
        }
        filtrosAplicados.current = filtros

        void ejecutarBusqueda(filtros)
    }, [ejecutarBusqueda, q, rango])

    const handleLoadMore = useCallback(async () => {
        const siguiente = page + 1
        const idPeticion = ++peticionActual.current

        setIsLoadingMore(true)

        try {
            const resultado = await searchFichas({ ...filtrosAplicados.current, page: siguiente })
            if (idPeticion !== peticionActual.current) return

            // Se acumulan las paginas en vez de reemplazarlas: "Cargar mas" alarga
            // la lista, no navega entre paginas.
            setResults((previas) => [...previas, ...resultado.items])
            setTotal(resultado.total)
            setPage(resultado.page)
        } catch (error) {
            if (idPeticion !== peticionActual.current) return

            setErrorMessage(mensajeDeError(error))
            setStatus('error')
        } finally {
            if (idPeticion === peticionActual.current) setIsLoadingMore(false)
        }
    }, [page])

    // Se guarda en cada cambio y no solo al navegar: al desmontar por un clic en
    // "Ver registro" ya no habria ocasion de escribirlo.
    useEffect(() => {
        if (status !== 'ready') return

        writeBusquedaSnapshot({
            q,
            rango,
            filtros: filtrosAplicados.current,
            results,
            total,
            page,
        })
    }, [status, q, rango, results, total, page])

    const handleVerRegistro = useCallback(
        (fichaId: string) => navigate(fichaRoute(fichaId)),
        [navigate],
    )

    return (
        <BusquedaView
            q={q}
            onQChange={setQ}
            rango={rango}
            onRangoChange={(value) => {
                setRango(value)
                setRangoError(undefined)
            }}
            rangoError={rangoError}
            onSubmit={handleSubmit}
            status={status}
            results={results}
            total={total}
            errorMessage={errorMessage}
            hasMore={results.length < total}
            isLoadingMore={isLoadingMore}
            onLoadMore={() => void handleLoadMore()}
            onVerRegistro={handleVerRegistro}
        />
    )
}
