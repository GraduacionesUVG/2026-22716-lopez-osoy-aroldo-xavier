/**
 * @fileoverview Datos de prueba para el dashboard de reportería y su agente.
 *
 * Mismo criterio que `cie10.mock.ts`: imita el contrato de
 * `docs/REPORTING_CHAT_OVERLAY_PLAN.md`, incluidas las respuestas bloqueadas,
 * para que la pantalla se pueda recorrer entera en Storybook.
 *
 * No hay flag que lo encienda en la app (ver `ReportingService`): solo se usa
 * pasando `reportingMock` a `ReporteriaPage`.
 *
 * El agente no es un modelo: clasifica la pregunta por palabras clave y
 * responde con agregados fijos. Alcanza para ejercitar la tabla, las gráficas
 * (y llevarlas al tablero), el bloqueo y el indicador de espera, que es lo que
 * necesita la pantalla. Las preguntas que comparan fuentes responden `MULTI`.
 *
 * `responderAgente` se exporta aparte de la función asíncrona para poder
 * probarla sin esperar el retardo simulado.
 *
 * Ningún dato de aquí es real.
 */

import type {
    AgentBlock,
    AgentResponse,
    MonthlyItem,
    ReportingService,
    ReportingSummary,
    TopCie10Item,
    TopDiagnosticoItem,
} from './reporting.service'

/** Retardo simulado: suficiente para que se vea el estado de carga. */
const LATENCIA_MS = 320

/** El agente tarda más que un GET, como el de verdad: así se ve el "consultando". */
const LATENCIA_AGENTE_MS = 1100

const MESES = 18

function esperar<T>(valor: T, ms = LATENCIA_MS): Promise<T> {
    return new Promise((resolve) => setTimeout(() => resolve(valor), ms))
}

/** `YYYY-MM` de hace `atras` meses, contando el actual como 0. */
function mesHace(atras: number): string {
    const hoy = new Date()
    const fecha = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth() - atras, 1))
    return fecha.toISOString().slice(0, 7)
}

/** Serie estable entre recargas: una onda suave alrededor de `base`, sin azar. */
function serie(base: number, amplitud: number): MonthlyItem[] {
    return Array.from({ length: MESES }, (_, i) => ({
        mes: mesHace(MESES - 1 - i),
        total: Math.round(base + amplitud * Math.sin(i * 0.8) + (amplitud / 3) * Math.cos(i * 1.7)),
    }))
}

export const SERIE_SIGSA = serie(10_500, 2_400)
export const SERIE_CONGENIA = serie(22, 9)

const total = (items: MonthlyItem[]) => items.reduce((suma, item) => suma + item.total, 0)

export const TOP_DIAGNOSTICOS: TopDiagnosticoItem[] = [
    { diagnostico: 'INFECCION URINARIA', total: 18_412 },
    { diagnostico: 'RINOFARINGITIS AGUDA (RESFRIADO COMUN)', total: 16_087 },
    { diagnostico: 'PARASITOSIS INTESTINAL', total: 12_940 },
    { diagnostico: 'DIARREA Y GASTROENTERITIS DE PRESUNTO ORIGEN INFECCIOSO', total: 11_305 },
    { diagnostico: 'AMIGDALITIS AGUDA', total: 8_716 },
    { diagnostico: 'ANEMIA', total: 6_902 },
    { diagnostico: 'GASTRITIS', total: 6_118 },
    { diagnostico: 'CEFALEA', total: 4_873 },
    { diagnostico: 'DERMATITIS', total: 4_210 },
    { diagnostico: 'HIPERTENSION ESENCIAL (PRIMARIA)', total: 3_964 },
]

const TOP_CIE10: TopCie10Item[] = [
    { codigo: 'N39.0', descripcion: 'Infección de vías urinarias, sitio no especificado', total: 18_412 },
    { codigo: 'J00', descripcion: 'Rinofaringitis aguda', total: 16_087 },
    { codigo: 'B82.9', descripcion: 'Parasitosis intestinal, sin otra especificación', total: 12_940 },
]

export const RESUMEN: ReportingSummary = {
    sigsa: {
        totalConsultas: total(SERIE_SIGSA),
        consultasMesActual: SERIE_SIGSA[SERIE_SIGSA.length - 1].total,
        codigosCie10: 2_317,
        datasetVersion: 'sigsa-mock',
    },
    congenia: {
        totalFichas: total(SERIE_CONGENIA),
        fichasMesActual: SERIE_CONGENIA[SERIE_CONGENIA.length - 1].total,
    },
}

const POR_SEXO = (() => {
    const todos = RESUMEN.sigsa.totalConsultas
    const indeterminado = 289
    const femenino = Math.round((todos - indeterminado) * 0.55)
    return [
        { sexo: 'Femenino', total: femenino },
        { sexo: 'Masculino', total: todos - indeterminado - femenino },
        { sexo: 'Indeterminado', total: indeterminado },
    ]
})()

/* ---------------------------------------------------------------------------
 * Agente
 * ------------------------------------------------------------------------- */

/** Minúsculas y sin tildes, para que "Cuántos" y "cuantos" sean lo mismo. */
function normalizar(texto: string): string {
    return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

const SQL = /\b(select|drop|delete|insert|update|alter|truncate|union)\b|;|--/
const DATOS_PERSONALES = /\bnombres?\b|historias? clinicas?|expediente|\bdpi\b|direccion|telefono|individual|registro por registro|lista (los|las) (registros|fichas|pacientes)/

function bloqueada(answer: string): AgentResponse {
    return { status: 'blocked', source: 'OUT_OF_SCOPE', answer, result: null, auditId: 'mock-audit' }
}

/** Filas como objetos sueltos: el contrato no fija columnas, cada pregunta trae las suyas. */
function exito(
    source: 'SIGSA' | 'CONGENIA' | 'MULTI',
    answer: string,
    filas: object[],
    blocks?: AgentBlock[],
): AgentResponse {
    const result = filas.map((fila) => ({ ...fila }) as Record<string, unknown>)
    return { status: 'success', source, answer, result, auditId: 'mock-audit', ...(blocks && { blocks }) }
}

/** Una sola serie, que es lo que devuelve el agente para casi todo. */
function grafica(
    type: 'bar_chart' | 'line_chart',
    title: string,
    categoryKey: string,
    label: string,
    filas: object[],
): AgentBlock {
    const rows = filas.map((fila) => ({ ...fila }) as Record<string, unknown>)
    return { type, title, categoryKey, series: [{ dataKey: 'total', label }], rows }
}

const fmt = (valor: number) => new Intl.NumberFormat('es-GT').format(valor)

export function responderAgente(pregunta: string): AgentResponse {
    const q = normalizar(pregunta)

    if (SQL.test(q)) {
        return bloqueada('La solicitud incluye instrucciones SQL o fuentes no permitidas.')
    }
    if (DATOS_PERSONALES.test(q)) {
        return bloqueada('Solo puedo responder con datos agregados; no comparto nombres, historias clínicas ni registros individuales.')
    }

    if (/compar|ambas|ambos|las dos/.test(q)) {
        const filas = [
            { fuente: 'Producción ambulatoria', total: RESUMEN.sigsa.consultasMesActual },
            { fuente: 'Ficha clínica', total: RESUMEN.congenia.fichasMesActual },
        ]
        return exito('MULTI', 'Estos son los registros de este mes en las dos fuentes.', filas, [
            grafica('bar_chart', 'Registros de este mes por fuente', 'fuente', 'Registros', filas),
        ])
    }
    if (/\bsexo\b|genero/.test(q)) {
        return exito('SIGSA', 'Esta es la distribución de registros de producción ambulatoria por sexo.', POR_SEXO, [
            grafica('bar_chart', 'Registros por sexo', 'sexo', 'Registros', POR_SEXO),
        ])
    }
    if (/frecuente|comun|top|principales/.test(q)) {
        const top = TOP_DIAGNOSTICOS.slice(0, 5)
        return exito('SIGSA', 'Estos son los cinco diagnósticos más frecuentes en producción ambulatoria.', top, [
            grafica('bar_chart', 'Diagnósticos más frecuentes', 'diagnostico', 'Registros', top),
        ])
    }
    if (/cie-?10|codigo/.test(q)) {
        return exito('SIGSA', 'Estos son los códigos CIE-10 más registrados en producción ambulatoria.', TOP_CIE10)
    }
    if (/infeccion urinaria|urinari/.test(q)) {
        const totalUrinaria = TOP_DIAGNOSTICOS[0].total
        return exito('SIGSA', `Se encontraron ${fmt(totalUrinaria)} registros de producción ambulatoria con diagnóstico relacionado con "infección urinaria".`, [{ total: totalUrinaria }])
    }
    if (/ficha|congenia|genetic|pediatric/.test(q)) {
        if (/por mes|mensual|cada mes/.test(q)) {
            const meses = SERIE_CONGENIA.slice(-6)
            return exito('CONGENIA', 'Estas son las fichas de los últimos seis meses.', meses, [
                grafica('line_chart', 'Fichas por mes', 'mes', 'Fichas', meses),
            ])
        }
        if (/este mes|mes actual/.test(q)) {
            const delMes = RESUMEN.congenia.fichasMesActual
            return exito('CONGENIA', `Este mes se registraron ${fmt(delMes)} fichas pediátricas genéticas.`, [{ total: delMes }])
        }
        const fichas = RESUMEN.congenia.totalFichas
        return exito('CONGENIA', `Hay ${fmt(fichas)} fichas pediátricas genéticas en CONGENIA.`, [{ total: fichas }])
    }
    if (/\barea\b/.test(q) && /\bmes\b/.test(q)) {
        // Dos dimensiones en filas largas, como `execute_validated_query`: el
        // botón de gráfica las apila (una barra por mes, una serie por área).
        const areas = [['PEDIATRIA', 0.45], ['MEDICINA GENERAL', 0.35], ['GINECOLOGIA', 0.2]] as const
        const filas = SERIE_SIGSA.slice(-3).flatMap(({ mes, total }) => areas.map(([area, parte]) => ({
            area,
            mes: `${mes}-01T00:00:00.000Z`,
            total: Math.round(total * parte),
        })))
        return exito('SIGSA', 'Estas son las atenciones de los últimos tres meses por área hospitalaria.', filas, [
            { type: 'table', title: 'Atenciones por área hospitalaria y mes', columns: ['area', 'mes', 'total'], rows: filas },
        ])
    }
    if (/por mes|mensual|cada mes/.test(q)) {
        // Como `sigsa_monthly_records` del backend: solo la tabla, y el mes como
        // timestamp ISO. El botón de gráfica del chat la arma desde aquí.
        const meses = SERIE_SIGSA.slice(-6).map(({ mes, total }) => ({ mes: `${mes}-01T00:00:00.000Z`, total }))
        return exito('SIGSA', 'Estos son los registros de producción ambulatoria de los últimos seis meses.', meses, [
            { type: 'table', title: 'Registros de producción ambulatoria por mes', columns: ['mes', 'total'], rows: meses },
        ])
    }
    if (/sigsa|ambulatori|produccion|registro|consulta|total/.test(q)) {
        if (/este mes|mes actual/.test(q)) {
            const delMes = RESUMEN.sigsa.consultasMesActual
            return exito('SIGSA', `Este mes hay ${fmt(delMes)} registros de producción ambulatoria.`, [{ total: delMes }])
        }
        const registros = RESUMEN.sigsa.totalConsultas
        return exito('SIGSA', `Hay ${fmt(registros)} registros de producción ambulatoria en total.`, [{ total: registros }])
    }

    return bloqueada('Solo puedo responder preguntas sobre totales y agregados de producción ambulatoria y de las fichas CONGENIA.')
}

/* ---------------------------------------------------------------------------
 * El servicio
 * ------------------------------------------------------------------------- */

export const reportingMock: ReportingService = {
    obtenerResumenReporteria: () => esperar(RESUMEN),
    obtenerTopDiagnosticos: (limit = 10) => esperar({ items: TOP_DIAGNOSTICOS.slice(0, limit) }),
    obtenerSerieMensualSigsa: () => esperar({ items: SERIE_SIGSA }),
    obtenerSerieMensualCongenia: () => esperar({ items: SERIE_CONGENIA }),
    crearConversacionAgente: () => esperar({ conversationId: '00000000-0000-4000-8000-000000000001', expiresIn: 1800 }),
    eliminarConversacionAgente: () => esperar(undefined),
    consultarAgente: (_conversationId, question) => esperar(responderAgente(question), LATENCIA_AGENTE_MS),
}
