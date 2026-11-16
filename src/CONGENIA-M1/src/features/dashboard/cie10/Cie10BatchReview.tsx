/**
 * @fileoverview Contenedor de la revisión por lote CIE-10.
 *
 * Se queda con el estado y las llamadas al servicio; `Cie10BatchReviewView`
 * solo pinta. Abre el lote de la ruta (`Cie10LotePage`) y pone en el topbar su
 * mes y el botón para volver a la lista.
 *
 * Cada aceptación o corrección se guarda al pulsar, y después se vuelve a pedir
 * la página para traer los conteos del lote. Esa recarga no enciende `loading`:
 * la tabla sigue a la vista mientras llega.
 *
 * Los filtros se escriben en un borrador y solo se aplican al buscar: así no
 * se pide una página al servidor por cada letra.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { BackButton } from '../../../components/ui/BackButton/BackButton'
import { ApiError } from '../../../services/api.client'
import { usePageHeader } from '../layout/usePageHeader'
import {
    CIE10_PAGE_SIZE_LOTE,
    aceptarClausulaLote,
    aceptarItemLote,
    aceptarItemsLote,
    buscarCatalogoCie10,
    confirmarLote,
    guardarCorreccionLote,
    obtenerLote,
} from '../../../services/cie10.service'
import type { AceptacionMasivaItem, FiltrosLoteCie10, ItemLoteCie10, LoteCie10 } from '../../../types/cie10'

import { clampCantidad, guardarCantidad, guardarVerDetalle, leerCantidad, leerVerDetalle } from './preferencias'
import { SIN_FILTROS, aFiltros, esSeleccionable, etiquetaPeriodo, seleccionDe, totalPaginas, type FiltrosBorrador } from './lote'
import { Cie10BatchReviewView } from './Cie10BatchReviewView'

const ERROR_CARGA = 'No se pudo cargar el lote CIE-10.'

/**
 * Los mensajes del servidor pueden arrastrar detalles internos: solo se
 * traducen los casos que el médico puede resolver.
 */
function mensajeDeError(error: unknown, porDefecto: string): string {
    if (!(error instanceof ApiError)) return porDefecto
    if (error.status === 0) return 'No hay conexión con el servidor.'
    if (error.status === 401 || error.status === 403) return 'Su sesión no tiene permiso para revisar códigos CIE-10.'
    if (error.code === 'CIE10_BATCH_ALREADY_CONFIRMED') return 'El lote ya fue confirmado.'
    if (error.code === 'CIE10_FUERA_DE_CATALOGO') return 'El código no está en el catálogo CIE-10 vigente.'
    if (error.code === 'FORMATO_CIE10') return 'El servidor no acepta el formato de ese código.'
    if (error.code === 'CIE10_CLAUSE_OUTDATED') return 'La cláusula cambió. Vuelva a leerla y acéptela.'
    if (error.code === 'CIE10_BATCH_INCOMPLETE') return 'Aún hay diagnósticos sin aceptar ni corregir.'
    if (error.code === 'CIE10_YA_CORREGIDO') return 'Una de las filas ya tiene una corrección médica. Recargue y vuelva a seleccionar.'
    return porDefecto
}

export interface Cie10BatchReviewProps {
    runId: string
    /** `revisado`: el lote ya está confirmado, así que se vuelve a esa pestaña. */
    onVolver: (revisado: boolean) => void
}

export function Cie10BatchReview({ runId, onVolver }: Cie10BatchReviewProps) {
    const [page, setPage] = useState(1)
    const [borrador, setBorrador] = useState<FiltrosBorrador>(SIN_FILTROS)
    const [filtros, setFiltros] = useState<FiltrosLoteCie10>({})
    const [lote, setLote] = useState<LoteCie10 | null>(null)
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState<string | null>(null)
    const [accepted, setAccepted] = useState(false)
    const [cantidad, setCantidad] = useState(leerCantidad)
    const [verDetalle, setVerDetalle] = useState(leerVerDetalle)
    const [selecciones, setSelecciones] = useState<Record<string, string>>({})
    const [editando, setEditando] = useState<ReadonlySet<string>>(() => new Set())
    const [marcadas, setMarcadas] = useState<ReadonlySet<string>>(() => new Set())
    const [rechazoItem, setRechazoItem] = useState<ItemLoteCie10 | null>(null)

    const mostrarLote = useCallback((result: LoteCie10) => {
        setLote(result)
        setAccepted(result.clauseAccepted)
    }, [])

    // El título lleva el mes del lote, como la adenda lleva el nombre del paciente.
    // Memoizado porque `usePageHeader` compara la acción por identidad.
    const revisado = lote?.confirmed ?? false
    const botonRegresar = useMemo(() => (
        <BackButton onClick={() => onVolver(revisado)} label="Regresar a la lista de lotes" />
    ), [onVolver, revisado])
    const periodo = lote?.periodo ? etiquetaPeriodo(lote.periodo) : undefined
    usePageHeader(periodo ? 'Lote CIE-10 de' : 'Lote CIE-10', periodo, botonRegresar)

    // El estado se toca solo cuando llega la respuesta, no al entrar al efecto.
    // `loading` lo enciende quien cambia de página o de filtros (empieza en true
    // para la primera). `vigente` descarta la respuesta de una vista que ya se dejó.
    useEffect(() => {
        let vigente = true
        obtenerLote(runId, page, CIE10_PAGE_SIZE_LOTE, filtros)
            .then((result) => { if (vigente) mostrarLote(result) })
            .catch((error: unknown) => { if (vigente) toast.error(mensajeDeError(error, ERROR_CARGA)) })
            .finally(() => { if (vigente) setLoading(false) })
        return () => { vigente = false }
    }, [runId, page, filtros, mostrarLote])

    // Solo cuentan las marcadas que siguen a la vista y pendientes: una que se
    // aceptó sola, o que quedó en otra página, ya no entra en el grupo.
    const seleccionadas = useMemo<ReadonlySet<string>>(() => new Set(
        (lote?.items ?? []).filter((item) => esSeleccionable(item) && marcadas.has(item.codigoTraductor)).map((item) => item.codigoTraductor),
    ), [lote, marcadas])

    const cambiarPagina = (delta: number) => {
        setLoading(true)
        setPage((value) => value + delta)
        setMarcadas(new Set())
        // La paginación está al pie: sin esto, la página nueva se vería desde abajo.
        document.getElementById('cie10-lote')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }

    const buscar = (aplicar: FiltrosBorrador) => {
        setLoading(true)
        // Un objeto nuevo siempre: buscar dos veces lo mismo también recarga.
        setFiltros(aFiltros(aplicar))
        setPage(1)
        setMarcadas(new Set())
    }

    const cambiarCantidad = (n: number) => {
        const nueva = clampCantidad(n)
        setCantidad(nueva)
        guardarCantidad(nueva)
    }

    const cambiarVerDetalle = (ver: boolean) => {
        setVerDetalle(ver)
        guardarVerDetalle(ver)
    }

    const editar = (codigoTraductor: string, activo: boolean) => {
        setEditando((actual) => {
            const siguiente = new Set(actual)
            if (activo) siguiente.add(codigoTraductor)
            else siguiente.delete(codigoTraductor)
            return siguiente
        })
    }

    const marcarFila = (codigoTraductor: string, marcar: boolean) => {
        setMarcadas((actual) => {
            const siguiente = new Set(actual)
            if (marcar) siguiente.add(codigoTraductor)
            else siguiente.delete(codigoTraductor)
            return siguiente
        })
    }

    const marcarTodas = (marcar: boolean) => {
        setMarcadas(marcar
            ? new Set((lote?.items ?? []).filter(esSeleccionable).map((item) => item.codigoTraductor))
            : new Set())
    }

    /** Después de guardar: la misma vista, con lo que quedó en el servidor. */
    async function recargar() {
        try {
            mostrarLote(await obtenerLote(runId, page, CIE10_PAGE_SIZE_LOTE, filtros))
        } catch (error) {
            toast.error(mensajeDeError(error, ERROR_CARGA))
        }
    }

    const sugerenciasMostradas = (item: ItemLoteCie10) => Math.min(cantidad, item.sugerencias.length)

    /** Lo que se manda al aceptar una fila: la opción marcada, su lugar y cuántas se veían. */
    function aceptacionDe(item: ItemLoteCie10, codigo: string): AceptacionMasivaItem | null {
        const posicion = item.sugerencias.findIndex((s) => s.codigo === codigo) + 1
        if (posicion === 0) return null
        return { codigoTraductor: item.codigoTraductor, codigo, posicion, sugerenciasMostradas: sugerenciasMostradas(item) }
    }

    async function aceptar(item: ItemLoteCie10, codigo: string) {
        if (!lote) return
        const aceptacion = aceptacionDe(item, codigo)
        if (!aceptacion) return
        const { codigoTraductor, ...payload } = aceptacion
        setBusy(codigoTraductor)
        try {
            await aceptarItemLote(lote.runId, codigoTraductor, payload)
            toast.success(`${codigo} aceptado.`)
            editar(codigoTraductor, false)
            await recargar()
        } catch (error) {
            toast.error(mensajeDeError(error, 'No se pudo aceptar el código.'))
        } finally {
            setBusy(null)
        }
    }

    /** Cada fila marcada se acepta con la opción que tiene marcada (la principal si no se tocó). */
    async function aceptarSeleccionadas() {
        if (!lote || seleccionadas.size === 0) return
        const items = lote.items
            .filter((item) => seleccionadas.has(item.codigoTraductor))
            .map((item) => {
                const codigo = seleccionDe(item, selecciones[item.codigoTraductor], cantidad)
                return codigo ? aceptacionDe(item, codigo) : null
            })
            .filter((aceptacion): aceptacion is AceptacionMasivaItem => aceptacion !== null)
        if (items.length === 0) return

        setBusy('masivo')
        try {
            const { aceptados } = await aceptarItemsLote(lote.runId, items)
            toast.success(`${aceptados.length} ${aceptados.length === 1 ? 'diagnóstico aceptado' : 'diagnósticos aceptados'}.`)
            setMarcadas(new Set())
            await recargar()
        } catch (error) {
            toast.error(mensajeDeError(error, 'No se pudieron aceptar las filas seleccionadas.'))
        } finally {
            setBusy(null)
        }
    }

    // Sin justificación: en el lote basta con el código correcto.
    async function guardarCorreccion(codigo: string, fueraDeCatalogo: boolean) {
        if (!lote || !rechazoItem) return
        const item = rechazoItem
        setBusy(item.codigoTraductor)
        try {
            await guardarCorreccionLote(lote.runId, item.codigoTraductor, {
                codigo,
                sugerenciasMostradas: sugerenciasMostradas(item),
                // Solo viaja cuando aplica: el contrato vigente no lo conoce.
                ...(fueraDeCatalogo ? { fueraDeCatalogo: true } : {}),
            })
            toast.success(`Corrección guardada: ${codigo}.`)
            setRechazoItem(null)
            editar(item.codigoTraductor, false)
            marcarFila(item.codigoTraductor, false)
            await recargar()
        } catch (error) {
            toast.error(mensajeDeError(error, 'No se pudo guardar la corrección.'))
        } finally {
            setBusy(null)
        }
    }

    async function confirm() {
        if (!lote || !accepted) return
        setBusy('confirm')
        try {
            if (!lote.clauseAccepted) await aceptarClausulaLote(lote.runId, lote.clause.version)
            const result = await confirmarLote(lote.runId)
            toast.success(`${result.total} registros confirmados.`)
            await recargar()
        } catch (error) {
            toast.error(mensajeDeError(error, 'No se pudo confirmar el lote.'))
        } finally {
            setBusy(null)
        }
    }

    return (
        <Cie10BatchReviewView
            lote={lote}
            loading={loading}
            filtros={borrador}
            onFiltrosChange={setBorrador}
            onBuscar={buscar}
            filtrando={Object.keys(filtros).length > 0}
            cantidad={cantidad}
            onCantidadChange={cambiarCantidad}
            verDetalle={verDetalle}
            onVerDetalleChange={cambiarVerDetalle}
            page={page}
            pages={lote ? totalPaginas(lote.total, lote.pageSize) : 1}
            onCambiarPagina={cambiarPagina}
            selecciones={selecciones}
            onSeleccionar={(id, codigo) => setSelecciones((actual) => ({ ...actual, [id]: codigo }))}
            editando={editando}
            onEditar={editar}
            seleccionadas={seleccionadas}
            onSeleccionarFila={marcarFila}
            onSeleccionarTodas={marcarTodas}
            onAceptarSeleccionadas={() => void aceptarSeleccionadas()}
            busy={busy}
            onAceptar={(item, codigo) => void aceptar(item, codigo)}
            onRechazar={setRechazoItem}
            rechazo={{
                item: rechazoItem,
                enviando: rechazoItem !== null && busy === rechazoItem.codigoTraductor,
                onCancelar: () => setRechazoItem(null),
                onEnviar: (codigo, fueraDeCatalogo) => void guardarCorreccion(codigo, fueraDeCatalogo),
            }}
            buscarCatalogo={buscarCatalogoCie10}
            accepted={accepted}
            onAcceptedChange={setAccepted}
            onConfirmar={() => void confirm()}
        />
    )
}
