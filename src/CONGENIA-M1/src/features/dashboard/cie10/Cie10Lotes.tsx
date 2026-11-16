/**
 * @fileoverview Contenedor de la lista de lotes CIE-10.
 *
 * La pestaña y la página viven en la URL (`?estado=revisados&pagina=2`): así
 * "Regresar" desde un lote confirmado cae en revisados, y el atrás del
 * navegador recupera la página. Cada combinación se monta con su propio `key`,
 * de modo que cambiar de pestaña o de página empieza en "cargando" sin tener
 * que volver a ese estado a mano desde un efecto.
 *
 * Se pide una página a la vez al servidor y se navega con Anterior/Siguiente:
 * nada se acumula en memoria ni se piden todos los lotes de golpe.
 */

import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { cie10LoteRoute } from '../../../app/routes'
import { ApiError } from '../../../services/api.client'
import { CIE10_PAGE_SIZE_LOTES, listarLotes } from '../../../services/cie10.service'
import type { FiltroLotesCie10, PaginaLotesCie10 } from '../../../types/cie10'
import { totalPaginas } from './lote'
import { Cie10LotesView, type Cie10LotesStatus } from './Cie10LotesView'

function mensajeDeError(error: unknown): string {
    if (error instanceof ApiError) {
        if (error.status === 0) return 'No hay conexión con el servidor.'
        if (error.status === 401 || error.status === 403) return 'Su sesión no tiene permiso para revisar códigos CIE-10.'
    }
    return 'Intente de nuevo en un momento.'
}

/** `?pagina=` mal escrito o ausente vale 1. */
function leerPagina(valor: string | null): number {
    const n = Number(valor)
    return Number.isInteger(n) && n >= 1 ? n : 1
}

export function Cie10Lotes() {
    const [params, setParams] = useSearchParams()
    const filtro: FiltroLotesCie10 = params.get('estado') === 'revisados' ? 'REVISADOS' : 'PENDIENTES'
    const pagina = leerPagina(params.get('pagina'))
    const [intento, setIntento] = useState(0)

    const irA = (nuevoFiltro: FiltroLotesCie10, nuevaPagina: number) => {
        const siguiente: Record<string, string> = {}
        if (nuevoFiltro === 'REVISADOS') siguiente.estado = 'revisados'
        if (nuevaPagina > 1) siguiente.pagina = String(nuevaPagina)
        setParams(siguiente)
    }

    return (
        <ListaLotes
            key={`${filtro}-${pagina}-${intento}`}
            filtro={filtro}
            pagina={pagina}
            // Otra pestaña empieza en su primera página.
            onFiltroChange={(nuevo) => irA(nuevo, 1)}
            onCambiarPagina={(delta) => {
                irA(filtro, pagina + delta)
                window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
            onReintentar={() => setIntento((n) => n + 1)}
        />
    )
}

interface ListaLotesProps {
    filtro: FiltroLotesCie10
    pagina: number
    onFiltroChange: (filtro: FiltroLotesCie10) => void
    onCambiarPagina: (delta: number) => void
    onReintentar: () => void
}

function ListaLotes({ filtro, pagina, onFiltroChange, onCambiarPagina, onReintentar }: ListaLotesProps) {
    const navigate = useNavigate()
    const [status, setStatus] = useState<Cie10LotesStatus>('loading')
    const [errorMessage, setErrorMessage] = useState<string | undefined>()
    const [resultado, setResultado] = useState<PaginaLotesCie10 | null>(null)

    useEffect(() => {
        let vigente = true
        listarLotes(filtro, pagina, CIE10_PAGE_SIZE_LOTES).then(
            (respuesta) => {
                if (!vigente) return
                setResultado(respuesta)
                setStatus('ready')
            },
            (error: unknown) => {
                if (!vigente) return
                setErrorMessage(mensajeDeError(error))
                setStatus('error')
            },
        )
        return () => { vigente = false }
    }, [filtro, pagina])

    return (
        <Cie10LotesView
            filtro={filtro}
            onFiltroChange={onFiltroChange}
            status={status}
            errorMessage={errorMessage}
            onReintentar={onReintentar}
            lotes={resultado?.items ?? []}
            total={resultado?.total ?? 0}
            counts={resultado?.counts}
            page={resultado?.page ?? pagina}
            pageSize={resultado?.pageSize ?? CIE10_PAGE_SIZE_LOTES}
            pages={resultado ? totalPaginas(resultado.total, resultado.pageSize) : 1}
            onCambiarPagina={onCambiarPagina}
            onIrALote={(runId) => navigate(cie10LoteRoute(runId))}
        />
    )
}
