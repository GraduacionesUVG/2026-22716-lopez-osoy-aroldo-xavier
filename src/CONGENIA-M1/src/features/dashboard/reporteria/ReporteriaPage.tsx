/**
 * @fileoverview Contenedor del dashboard de reportería.
 *
 * Se queda con las llamadas al servicio y con la sesión del agente;
 * `ReporteriaView` solo pinta.
 *
 * El servicio se inyecta para que el flujo de Storybook monte esta misma página
 * con `reportingMock`; en la app siempre es el real.
 *
 * El ID vive solo en memoria de la pestaña y el contexto visible expira en
 * Redis. Recargar o volver a iniciar sesión empieza una conversación nueva.
 *
 * Los tableros, en cambio, sí sobreviven: se guardan en el navegador por
 * usuario (ver `useTableros`) y se pueden exportar e importar como JSON.
 */

import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog/ConfirmDialog'
import { ApiError } from '../../../services/api.client'
import { useAuth } from '../../auth/useAuth'
import { usePageHeader } from '../layout/usePageHeader'
import {
    reportingService,
    type AgentSuggestedAction,
    type MonthlyItem,
    type ReportingService,
    type ReportingSummary,
    type TopDiagnosticoItem,
} from '../../../services/reporting.service'
import { errorAMensaje, mensajeDelUsuario, respuestaAMensaje, type ChatMessage } from './chat'
import { descargarPdfTablero } from './pdfTablero'
import { ReporteriaView, type Seccion } from './ReporteriaView'
import {
    agregarWidget,
    alternarAncho,
    bloqueParaWidget,
    claveAgregado,
    contarTarjetas,
    crearWidget,
    MAX_WIDGETS,
    NOMBRE_DASHBOARD,
    nombreArchivoTablero,
    quitarWidget,
    reordenarTablero,
    serializarTableros,
    tableroLleno,
    vaciarTablero,
    type AgregadoAlTablero,
    type DashboardId,
    type TipoWidget,
} from './tablero'
import { useTableros } from './useTableros'

const CARGANDO = { status: 'loading' } as const

function aSeccion<R, T>(resultado: PromiseSettledResult<R>, elegir: (valor: R) => T): Seccion<T> {
    return resultado.status === 'fulfilled'
        ? { status: 'ready', data: elegir(resultado.value) }
        : { status: 'error' }
}

interface ReporteriaPageProps {
    servicio?: ReportingService
}

// El permiso lo exige la ruta (DashboardRoutes + routePermissions).
export function ReporteriaPage({ servicio = reportingService }: ReporteriaPageProps) {
    usePageHeader('Reportería')

    return <Reporteria servicio={servicio} />
}

function Reporteria({ servicio }: { servicio: ReportingService }) {
    const { state } = useAuth()
    // Cada médico tiene sus tableros en el mismo navegador.
    const usuario = (state.status === 'authenticated' && state.user.profile.sub) || 'anonimo'

    const [dashboard, setDashboard] = useState<DashboardId>('produccion')
    const [tableros, setTableros] = useTableros(`congenia.reporteria.tableros.${usuario}`)
    const [confirmarBorrado, setConfirmarBorrado] = useState(false)
    const [generandoPdf, setGenerandoPdf] = useState(false)
    const [resumen, setResumen] = useState<Seccion<ReportingSummary>>(CARGANDO)
    const [topDiagnosticos, setTopDiagnosticos] = useState<Seccion<TopDiagnosticoItem[]>>(CARGANDO)
    const [mensualSigsa, setMensualSigsa] = useState<Seccion<MonthlyItem[]>>(CARGANDO)
    const [mensualCongenia, setMensualCongenia] = useState<Seccion<MonthlyItem[]>>(CARGANDO)
    const [intento, setIntento] = useState(0)

    const [chatAbierto, setChatAbierto] = useState(false)
    const [mensajes, setMensajes] = useState<ChatMessage[]>([])
    const [pregunta, setPregunta] = useState('')
    const [consultando, setConsultando] = useState(false)
    /** Lo que se llevó al tablero desde cada respuesta, por `claveAgregado`. */
    const [agregados, setAgregados] = useState<Record<string, AgregadoAlTablero>>({})
    const ultimoId = useRef(0)
    const conversationId = useRef<string | null>(null)
    const conversationRequest = useRef<Promise<string> | null>(null)

    useEffect(() => {
        let alive = true

        // allSettled y no all: cada tarjeta muestra lo suyo aunque otra falle.
        Promise.allSettled([
            servicio.obtenerResumenReporteria(),
            servicio.obtenerTopDiagnosticos(10),
            servicio.obtenerSerieMensualSigsa(),
            servicio.obtenerSerieMensualCongenia(),
        ]).then(([resumenR, topR, sigsaR, congeniaR]) => {
            if (!alive) return
            setResumen(aSeccion(resumenR, (valor) => valor))
            setTopDiagnosticos(aSeccion(topR, (valor) => valor.items))
            setMensualSigsa(aSeccion(sigsaR, (valor) => valor.items))
            setMensualCongenia(aSeccion(congeniaR, (valor) => valor.items))
        })

        return () => { alive = false }
    }, [servicio, intento])

    const reintentar = () => {
        setResumen(CARGANDO)
        setTopDiagnosticos(CARGANDO)
        setMensualSigsa(CARGANDO)
        setMensualCongenia(CARGANDO)
        setIntento((valor) => valor + 1)
    }

    const nuevoId = () => `m${++ultimoId.current}`

    const obtenerConversationId = async () => {
        if (conversationId.current) return conversationId.current
        if (!conversationRequest.current) {
            conversationRequest.current = servicio.crearConversacionAgente()
                .then((conversation) => {
                    conversationId.current = conversation.conversationId
                    return conversation.conversationId
                })
                .finally(() => { conversationRequest.current = null })
        }
        return conversationRequest.current
    }

    const consultarConContexto = async (texto: string, action?: AgentSuggestedAction) => {
        let id = await obtenerConversationId()
        try {
            return await servicio.consultarAgente(id, texto, action)
        } catch (error) {
            if (!(error instanceof ApiError) || error.code !== 'AGENT_CONVERSATION_EXPIRED') throw error
            conversationId.current = null
            setMensajes((previos) => previos.slice(-1))
            id = await obtenerConversationId()
            return servicio.consultarAgente(id, texto, action)
        }
    }

    const enviar = async (texto: string, action?: AgentSuggestedAction) => {
        const limpio = texto.trim()
        if (!limpio || consultando) return

        setMensajes((previos) => [...previos, mensajeDelUsuario(nuevoId(), limpio)])
        setPregunta('')
        setConsultando(true)

        try {
            const respuesta = await consultarConContexto(limpio, action)
            setMensajes((previos) => [...previos, respuestaAMensaje(nuevoId(), respuesta)])
        } catch (error) {
            setMensajes((previos) => [...previos, errorAMensaje(nuevoId(), error)])
        } finally {
            setConsultando(false)
        }
    }

    /**
     * Lleva la respuesta al tablero. Se puede repetir: si la tarjeta se quitó
     * por error, el chat ofrece "Agregar de nuevo". Devuelve si se agregó,
     * para que el botón muestre su check solo entonces.
     */
    const agregarAlTablero = (messageId: string, tipo: TipoWidget, destino: DashboardId): boolean => {
        const indice = mensajes.findIndex((mensaje) => mensaje.id === messageId)
        const mensaje = mensajes[indice]
        if (!mensaje || mensaje.role !== 'agent') return false
        const bloque = bloqueParaWidget(mensaje, tipo)
        if (!bloque) return false

        if (tableroLleno(tableros[destino])) {
            toast.error(`${NOMBRE_DASHBOARD[destino]} ya tiene ${MAX_WIDGETS} tarjetas del agente. Quite alguna para agregar otra.`)
            return false
        }

        // La pregunta que originó la respuesta: el último mensaje del médico antes de ella.
        const pregunta = mensajes.slice(0, indice).reverse().find((previo) => previo.role === 'user')?.text ?? ''
        const widget = crearWidget(tipo, bloque, pregunta)
        const clave = claveAgregado(messageId, tipo)
        const anterior = agregados[clave]
        const repetida = anterior !== undefined && anterior.widgetId in tableros[anterior.destino].widgets

        setTableros((previos) => agregarWidget(previos, destino, widget))
        setAgregados((previos) => ({ ...previos, [clave]: { destino, widgetId: widget.id } }))
        const que = tipo === 'tabla' ? 'Tabla agregada' : 'Gráfica agregada'
        toast.success(repetida
            ? `${que} otra vez a ${NOMBRE_DASHBOARD[destino]}. Ya había una igual en el tablero.`
            : `${que} a ${NOMBRE_DASHBOARD[destino]}.`)
        return true
    }

    const exportar = () => {
        const archivo = new Blob([serializarTableros(tableros)], { type: 'application/json' })
        const url = URL.createObjectURL(archivo)
        const enlace = document.createElement('a')
        enlace.href = url
        enlace.download = nombreArchivoTablero()
        enlace.click()
        // Después del clic: revocarlo en el mismo tick cancela la descarga en algunos navegadores.
        setTimeout(() => URL.revokeObjectURL(url), 0)
        toast.success('Copia del tablero descargada.')
    }

    const descargarPdf = async (elemento: HTMLElement) => {
        if (generandoPdf) return
        setGenerandoPdf(true)
        try {
            await descargarPdfTablero({ elemento, dashboard, tablero: tableros[dashboard] })
        } catch {
            toast.error('No se pudo generar el PDF. Intente de nuevo.')
        } finally {
            setGenerandoPdf(false)
        }
    }

    const borrar = () => {
        setTableros((previos) => vaciarTablero(previos, dashboard))
        setConfirmarBorrado(false)
        toast.success(`Se borraron las tarjetas del agente de ${NOMBRE_DASHBOARD[dashboard]}.`)
    }

    const tarjetasPorTablero = contarTarjetas(tableros)
    const tarjetasActivas = tarjetasPorTablero[dashboard]

    return (
        <>
            <ReporteriaView
                dashboard={dashboard}
                onDashboardChange={setDashboard}
                tablero={tableros[dashboard]}
                onReordenar={(orden) => setTableros((previos) => reordenarTablero(previos, dashboard, orden))}
                onQuitarWidget={(id) => setTableros((previos) => quitarWidget(previos, dashboard, id))}
                onAlternarAncho={(id) => setTableros((previos) => alternarAncho(previos, dashboard, id))}
                tarjetasPorTablero={tarjetasPorTablero}
                onExportar={exportar}
                onImportar={(importados) => {
                    setTableros(importados)
                    toast.success('Tablero recuperado.')
                }}
                onDescargarPdf={(elemento) => { void descargarPdf(elemento) }}
                generandoPdf={generandoPdf}
                onBorrar={() => setConfirmarBorrado(true)}
                resumen={resumen}
                topDiagnosticos={topDiagnosticos}
                mensualSigsa={mensualSigsa}
                mensualCongenia={mensualCongenia}
                onReintentar={reintentar}
                chatAbierto={chatAbierto}
                onAbrirChat={() => setChatAbierto(true)}
                chat={{
                    messages: mensajes,
                    question: pregunta,
                    onQuestionChange: setPregunta,
                    onSend: (texto, action) => { void enviar(texto, action) },
                    asking: consultando,
                    onClose: () => setChatAbierto(false),
                    onAgregar: agregarAlTablero,
                    agregados,
                    dashboardActivo: dashboard,
                    // El panel deshabilita limpiar mientras hay una consulta en vuelo,
                    // así una respuesta tardía no cae en una conversación nueva.
                    onClear: () => {
                        const id = conversationId.current
                        conversationId.current = null
                        setMensajes([])
                        setAgregados({})
                        if (id) void servicio.eliminarConversacionAgente(id).catch(() => undefined)
                    },
                }}
            />
            <ConfirmDialog
                isOpen={confirmarBorrado}
                title={`¿Borrar las tarjetas del agente de ${NOMBRE_DASHBOARD[dashboard]}?`}
                message={
                    `Se ${tarjetasActivas === 1 ? 'quita la tarjeta' : `quitan las ${tarjetasActivas} tarjetas`} `
                    + 'que agregó desde el agente. Las gráficas de fábrica se quedan. '
                    + 'Si quiere conservarlas, exporte antes.'
                }
                confirmLabel="Sí, borrar"
                tone="destructive"
                onConfirm={borrar}
                onCancel={() => setConfirmarBorrado(false)}
            />
        </>
    )
}
