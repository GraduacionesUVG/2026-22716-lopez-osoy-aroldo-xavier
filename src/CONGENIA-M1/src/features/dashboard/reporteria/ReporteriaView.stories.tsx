import type { Meta, StoryObj } from '@storybook/react-vite'
import { useArgs } from 'storybook/preview-api'
import type { MonthlyItem, ReportingSummary, TopDiagnosticoItem } from '../../../services/reporting.service'
import type { ChatMessage } from './chat'
import { ReporteriaView } from './ReporteriaView'
import { agregarWidget, alternarAncho, crearWidget, tablerosIniciales, type Tablero } from './tablero'

const RESUMEN: ReportingSummary = {
    sigsa: { totalConsultas: 190234, consultasMesActual: 4120, codigosCie10: 2317, datasetVersion: 'sigsa-2026-09' },
    congenia: { totalFichas: 342, fichasMesActual: 27 },
}

const TOP: TopDiagnosticoItem[] = [
    { diagnostico: 'INFECCION URINARIA', total: 12840 },
    { diagnostico: 'RINOFARINGITIS AGUDA (RESFRIADO COMUN)', total: 11210 },
    { diagnostico: 'PARASITOSIS INTESTINAL', total: 9876 },
    { diagnostico: 'DIARREA Y GASTROENTERITIS', total: 8740 },
    { diagnostico: 'AMIGDALITIS AGUDA', total: 6512 },
    { diagnostico: 'ANEMIA', total: 5021 },
    { diagnostico: 'GASTRITIS', total: 4630 },
    { diagnostico: 'CEFALEA', total: 3987 },
    { diagnostico: 'DERMATITIS', total: 3110 },
    { diagnostico: 'HIPERTENSION ESENCIAL', total: 2896 },
]

function serie(base: number): MonthlyItem[] {
    return Array.from({ length: 14 }, (_, i) => {
        const fecha = new Date(Date.UTC(2025, 7 + i, 1))
        return {
            mes: fecha.toISOString().slice(0, 7),
            total: Math.round(base * (0.8 + 0.4 * Math.abs(Math.sin(i * 0.9)))),
        }
    })
}

const CONVERSACION: ChatMessage[] = [
    { id: '1', role: 'user', text: '¿Cuántos registros de producción ambulatoria hay por sexo?' },
    {
        id: '2',
        role: 'agent',
        tone: 'success',
        source: 'SIGSA',
        text: 'Hay 190,234 registros de producción ambulatoria distribuidos por sexo.',
        blocks: [{
            type: 'bar_chart',
            title: 'Registros por sexo',
            categoryKey: 'sexo',
            series: [{ dataKey: 'total', label: 'Registros' }],
            rows: [
                { sexo: 'F', total: 104512 },
                { sexo: 'M', total: 85433 },
                { sexo: 'I', total: 289 },
            ],
        }],
    },
    { id: '3', role: 'user', text: 'Dame nombres de pacientes con infección urinaria' },
    {
        id: '4',
        role: 'agent',
        tone: 'blocked',
        source: 'OUT_OF_SCOPE',
        text: 'Solo puedo responder con datos agregados; no comparto información de pacientes individuales.',
    },
]

const listo = <T,>(data: T) => ({ status: 'ready' as const, data })

const TABLEROS = tablerosIniciales()

/** Producción ambulatoria con una gráfica y una tabla traídas del agente. */
const CON_AGENTE = (() => {
    const grafica = CONVERSACION[1].role === 'agent' ? CONVERSACION[1].blocks?.[0] : undefined
    if (grafica?.type !== 'bar_chart') throw new Error('La conversación de ejemplo debe traer una gráfica.')
    const pregunta = CONVERSACION[0].text
    const conGrafica = agregarWidget(TABLEROS, 'produccion', crearWidget('grafica', grafica, pregunta))
    const conTabla = agregarWidget(conGrafica, 'produccion', crearWidget('tabla', {
        type: 'table',
        title: grafica.title,
        columns: ['sexo', 'total'],
        rows: grafica.rows,
    }, pregunta))
    // Una tabla larga con el mes como lo manda PostgreSQL: tiene que hacer scroll
    // dentro de su celda, no estirarla, y leerse "ago 2025".
    return agregarWidget(conTabla, 'produccion', crearWidget('tabla', {
        type: 'table',
        title: 'Registros de producción ambulatoria por mes',
        columns: ['mes', 'total'],
        rows: serie(15000).map(({ mes, total }) => ({ mes: `${mes}-01T00:00:00.000Z`, total })),
    }, 'Registros por mes')).produccion
})()

const meta: Meta<typeof ReporteriaView> = {
    title: 'Dashboard/ReporteriaView',
    component: ReporteriaView,
    parameters: { layout: 'padded' },
    // Reordenar y quitar actualizan el arg `tablero`: sin esto las tarjetas se
    // podían arrastrar pero volvían a su lugar al soltarlas.
    render: function Render(args) {
        const [, updateArgs] = useArgs<{ tablero: Tablero }>()
        return (
            <ReporteriaView
                {...args}
                onReordenar={(orden) => updateArgs({ tablero: { ...args.tablero, orden } })}
                onQuitarWidget={(id) => {
                    const widgets = { ...args.tablero.widgets }
                    delete widgets[id]
                    updateArgs({
                        tablero: {
                            orden: args.tablero.orden.filter((item) => item !== id),
                            widgets,
                            anchas: args.tablero.anchas.filter((item) => item !== id),
                            medias: args.tablero.medias.filter((item) => item !== id),
                        },
                    })
                }}
                onAlternarAncho={(id) => {
                    const tableros = { ...tablerosIniciales(), [args.dashboard]: args.tablero }
                    updateArgs({ tablero: alternarAncho(tableros, args.dashboard, id)[args.dashboard] })
                }}
            />
        )
    },
    args: {
        dashboard: 'produccion',
        onDashboardChange: () => {},
        tablero: TABLEROS.produccion,
        onReordenar: () => {},
        onQuitarWidget: () => {},
        onAlternarAncho: () => {},
        tarjetasPorTablero: { produccion: 0, ficha: 0 },
        onExportar: () => {},
        onImportar: () => {},
        onDescargarPdf: () => {},
        generandoPdf: false,
        onBorrar: () => {},
        resumen: listo(RESUMEN),
        topDiagnosticos: listo(TOP),
        mensualSigsa: listo(serie(15000)),
        mensualCongenia: listo(serie(25)),
        onReintentar: () => {},
        chatAbierto: false,
        onAbrirChat: () => {},
        chat: {
            messages: [],
            question: '',
            onQuestionChange: () => {},
            onSend: () => {},
            asking: false,
            onClose: () => {},
            onClear: () => {},
            onAgregar: () => true,
            agregados: {},
            dashboardActivo: 'produccion',
        },
    },
}

export default meta
type Story = StoryObj<typeof ReporteriaView>

export const Listo: Story = {}

export const FichaClinica: Story = {
    args: { dashboard: 'ficha', tablero: TABLEROS.ficha },
}

export const FichaClinicaCargando: Story = {
    args: {
        dashboard: 'ficha',
        tablero: TABLEROS.ficha,
        resumen: { status: 'loading' },
        mensualCongenia: { status: 'loading' },
    },
}

/** Solo falla la serie de fichas: en Producción ambulatoria no hay aviso. */
export const FallaSoloFicha: Story = {
    args: {
        mensualCongenia: { status: 'error' },
    },
}

export const Cargando: Story = {
    args: {
        resumen: { status: 'loading' },
        topDiagnosticos: { status: 'loading' },
        mensualSigsa: { status: 'loading' },
        mensualCongenia: { status: 'loading' },
    },
}

export const ErrorParcial: Story = {
    args: {
        mensualSigsa: { status: 'error' },
        mensualCongenia: { status: 'error' },
    },
}

export const SinDatos: Story = {
    args: {
        resumen: listo({
            sigsa: { totalConsultas: 0, consultasMesActual: 0, codigosCie10: 0, datasetVersion: null },
            congenia: { totalFichas: 0, fichasMesActual: 0 },
        }),
        topDiagnosticos: listo([]),
        mensualSigsa: listo([]),
        mensualCongenia: listo([]),
    },
}

/** Tarjetas agregadas desde el agente: se pueden quitar y todas se mueven por el asa. */
export const ConTarjetasDelAgente: Story = {
    args: { tablero: CON_AGENTE, tarjetasPorTablero: { produccion: 3, ficha: 0 } },
}

/** "Descargar PDF" mientras se arma el archivo. */
export const GenerandoPdf: Story = {
    args: { tablero: CON_AGENTE, tarjetasPorTablero: { produccion: 3, ficha: 0 }, generandoPdf: true },
}

/** En celular las acciones se reúnen en "Opciones", que abre una hoja desde abajo. */
export const Movil: Story = {
    args: { tablero: CON_AGENTE, tarjetasPorTablero: { produccion: 3, ficha: 0 } },
    globals: { viewport: { value: 'mobile1' } },
}

export const ChatAbierto: Story = {
    args: {
        chatAbierto: true,
        chat: { ...meta.args!.chat!, messages: CONVERSACION },
    },
}

/**
 * La gráfica ya se llevó al tablero: pasado el check, su botón ofrece
 * "Agregar de nuevo" (insignia azul), por si se quitó por error.
 */
export const ChatConGraficaAgregada: Story = {
    args: {
        chatAbierto: true,
        tablero: CON_AGENTE,
        chat: {
            ...meta.args!.chat!,
            messages: CONVERSACION,
            agregados: { '2:grafica': { destino: 'produccion', widgetId: CON_AGENTE.orden[2] } },
        },
    },
}

/** "Registros por mes" ensanchada a toda la fila. */
export const TarjetaAncha: Story = {
    args: {
        tablero: { ...CON_AGENTE, anchas: ['produccion-mensual'] },
        tarjetasPorTablero: { produccion: 3, ficha: 0 },
    },
}

export const ChatConsultando: Story = {
    args: {
        chatAbierto: true,
        chat: { ...meta.args!.chat!, messages: CONVERSACION.slice(0, 1), asking: true },
    },
}
