/**
 * @fileoverview Qué tarjetas tiene cada tablero de reportería y en qué orden.
 *
 * Hay dos tableros, Producción ambulatoria y Ficha clínica. Cada uno trae sus
 * tarjetas de fábrica (se pueden mover, no quitar) y las que el médico agrega
 * desde el agente (se pueden mover y quitar).
 *
 * Una tarjeta del agente guarda una foto de los datos del momento en que se
 * agregó: el `resultId` del agente expira con la conversación, así que no hay
 * con qué volver a consultarla.
 *
 * Lo que se guarda en el navegador y lo que se exporta es el mismo archivo, y
 * los dos pasan por `leerArchivoTableros` al volver: un JSON editado a mano
 * se valida con las mismas reglas que una respuesta del agente.
 */

import { v4 as uuidv4 } from 'uuid'
import type { AgentChartBlock, AgentResponse, AgentTableBlock } from '../../../services/reporting.service'
import { bloquesSeguros, formatearEncabezado, type ChatMessage, type FilaResultado } from './chat'
import { esClaveDeTiempo } from './formato'

export type DashboardId = 'produccion' | 'ficha'

export const DASHBOARD_IDS: readonly DashboardId[] = ['produccion', 'ficha']

export const NOMBRE_DASHBOARD: Record<DashboardId, string> = {
    produccion: 'Producción ambulatoria',
    ficha: 'Ficha clínica',
}

/** Las tarjetas de fábrica de cada tablero, en su orden inicial. */
export const TARJETAS_FIJAS: Record<DashboardId, readonly string[]> = {
    produccion: ['produccion-mensual', 'produccion-top'],
    ficha: ['ficha-mensual'],
}

/** Tope por tablero: más que esto deja de ser un tablero y pasa a ser un archivo. */
export const MAX_WIDGETS = 24

export type TipoWidget = 'tabla' | 'grafica'

export interface WidgetAgente {
    id: string
    tipo: TipoWidget
    /** La pregunta que lo originó, para saber de dónde salió el dato. */
    pregunta: string
    /** ISO 8601. */
    creado: string
    bloque: AgentTableBlock | AgentChartBlock
}

export interface Tablero {
    orden: string[]
    widgets: Record<string, WidgetAgente>
    /** Las que se ensancharon a propósito: ocupan la fila completa. */
    anchas: string[]
    /**
     * Las que se achicaron a propósito: se quedan a media fila aunque estén
     * solas, en vez de estirarse para tapar el hueco (ver `distribuirFilas`).
     */
    medias: string[]
}

export type Tableros = Record<DashboardId, Tablero>

function tableroInicial(dashboard: DashboardId): Tablero {
    return { orden: [...TARJETAS_FIJAS[dashboard]], widgets: {}, anchas: [], medias: [] }
}

export function tablerosIniciales(): Tableros {
    return { produccion: tableroInicial('produccion'), ficha: tableroInicial('ficha') }
}

/**
 * Lo que el chat recuerda de cada respuesta que llevó al tablero: a cuál y
 * con qué tarjeta. Si esa tarjeta ya no está (se quitó), volver a agregarla
 * no repite nada.
 */
export interface AgregadoAlTablero {
    destino: DashboardId
    widgetId: string
}

export function tableroLleno(tablero: Tablero): boolean {
    return Object.keys(tablero.widgets).length >= MAX_WIDGETS
}

/** Cuántas tarjetas del agente tiene cada tablero. */
export function contarTarjetas(tableros: Tableros): Record<DashboardId, number> {
    return {
        produccion: Object.keys(tableros.produccion.widgets).length,
        ficha: Object.keys(tableros.ficha.widgets).length,
    }
}

/* ---------------------------------------------------------------------------
 * Cambios
 * ------------------------------------------------------------------------- */

/** Las tarjetas nuevas entran al final, donde se ven al bajar. */
export function agregarWidget(tableros: Tableros, dashboard: DashboardId, widget: WidgetAgente): Tableros {
    const tablero = tableros[dashboard]
    if (tableroLleno(tablero)) return tableros
    return {
        ...tableros,
        [dashboard]: {
            ...tablero,
            orden: [...tablero.orden, widget.id],
            widgets: { ...tablero.widgets, [widget.id]: widget },
        },
    }
}

export function quitarWidget(tableros: Tableros, dashboard: DashboardId, id: string): Tableros {
    const tablero = tableros[dashboard]
    if (!(id in tablero.widgets)) return tableros
    const widgets = { ...tablero.widgets }
    delete widgets[id]
    return {
        ...tableros,
        [dashboard]: {
            orden: tablero.orden.filter((item) => item !== id),
            widgets,
            anchas: tablero.anchas.filter((item) => item !== id),
            medias: tablero.medias.filter((item) => item !== id),
        },
    }
}

/**
 * Quita las tarjetas del agente de un tablero; las de fábrica vuelven a su
 * orden y a media fila. El otro no se toca.
 */
export function vaciarTablero(tableros: Tableros, dashboard: DashboardId): Tableros {
    return { ...tableros, [dashboard]: tableroInicial(dashboard) }
}

/**
 * Media fila ↔ fila completa, según cómo se ve la tarjeta ahora.
 *
 * Achicar: deja de ser ancha. Si así quedaría sola y se estiraría para tapar
 * el hueco, se marca como media, porque eso es lo que se pidió.
 *
 * Ensanchar: ensanchar la de la derecha de una fila dejaría sola a su
 * compañera, que `distribuirFilas` estiraría: un clic cambiaba dos tarjetas.
 * Entonces la siguiente a media fila sube a acompañarla y la ensanchada baja
 * a la fila de abajo. Solo si no hay ninguna que subir, la compañera se estira.
 */
export function alternarAncho(tableros: Tableros, dashboard: DashboardId, id: string): Tableros {
    const tablero = tableros[dashboard]
    if (!tablero.orden.includes(id)) return tableros
    const sinElla = (lista: string[]) => lista.filter((item) => item !== id)

    if (distribuirFilas(tablero).aLoAncho.has(id)) {
        const achicada = { ...tablero, anchas: sinElla(tablero.anchas) }
        const medias = distribuirFilas(achicada).rellenos.has(id) ? [...tablero.medias, id] : tablero.medias
        return { ...tableros, [dashboard]: { ...achicada, medias } }
    }
    return {
        ...tableros,
        [dashboard]: {
            ...tablero,
            orden: subirCompanera(tablero, id),
            anchas: [...tablero.anchas, id],
            medias: sinElla(tablero.medias),
        },
    }
}

/** Si `id` va a la derecha de otra, la tarjeta a media fila que le sigue pasa a ocupar su lugar. */
function subirCompanera(tablero: Tablero, id: string): string[] {
    const anchas = new Set(tablero.anchas)
    let sola: string | null = null
    for (const actual of tablero.orden) {
        if (actual === id) break
        sola = anchas.has(actual) ? null : sola ? null : actual
    }
    // `sola` es la que la acompaña a la izquierda; sin ella, `id` empieza su fila.
    if (!sola) return tablero.orden

    const indice = tablero.orden.indexOf(id)
    const siguiente = tablero.orden[indice + 1]
    if (!siguiente || anchas.has(siguiente)) return tablero.orden

    const orden = tablero.orden.filter((item) => item !== siguiente)
    orden.splice(indice, 0, siguiente)
    return orden
}

/**
 * Qué tarjetas se ven a toda la fila en la cuadrícula de dos columnas:
 *  - las que se ensancharon a propósito (`anchas`), y
 *  - las que quedarían solas en su fila, para no dejar un hueco: la última
 *    cuando sobra una, o la que va justo antes de una ensanchada. Menos las
 *    que se achicaron a propósito (`medias`): esas dejan el hueco.
 *
 * Las segundas (`rellenos`) no se guardan: cuando llega una compañera
 * vuelven a media fila. Lo usan la pantalla y el PDF, para que salgan igual.
 */
export function distribuirFilas(tablero: Tablero): { aLoAncho: Set<string>; rellenos: Set<string> } {
    const anchas = new Set(tablero.anchas)
    const rellenos = new Set<string>()
    let sola: string | null = null
    for (const id of tablero.orden) {
        if (anchas.has(id)) {
            if (sola) rellenos.add(sola)
            sola = null
        } else {
            sola = sola ? null : id
        }
    }
    if (sola) rellenos.add(sola)
    for (const id of tablero.medias) rellenos.delete(id)
    return { aLoAncho: new Set([...anchas, ...rellenos]), rellenos }
}

export function reordenarTablero(tableros: Tableros, dashboard: DashboardId, orden: string[]): Tableros {
    return {
        ...tableros,
        [dashboard]: normalizarTablero(dashboard, { ...tableros[dashboard], orden }),
    }
}

/**
 * El orden solo puede nombrar tarjetas que existen, una vez cada una, y
 * ninguna tarjeta puede quedarse fuera. Las fijas que falten (una versión
 * nueva que agrega una) entran al final. Lo mismo vale para las anchas.
 */
function normalizarTablero(dashboard: DashboardId, tablero: Tablero): Tablero {
    const validas = new Set([...TARJETAS_FIJAS[dashboard], ...Object.keys(tablero.widgets)])
    const orden = [...new Set(tablero.orden)].filter((id) => validas.has(id))
    for (const id of validas) {
        if (!orden.includes(id)) orden.push(id)
    }
    const anchas = [...new Set(tablero.anchas)].filter((id) => validas.has(id))
    const medias = [...new Set(tablero.medias)].filter((id) => validas.has(id) && !anchas.includes(id))
    return { orden, widgets: tablero.widgets, anchas, medias }
}

/* ---------------------------------------------------------------------------
 * Del chat al tablero
 * ------------------------------------------------------------------------- */

type MensajeAgente = Extract<ChatMessage, { role: 'agent' }>

/** Cada fuente a su tablero; lo que mezcla las dos va al que está abierto. */
export function destinoPorFuente(source: AgentResponse['source'] | undefined, activo: DashboardId): DashboardId {
    if (source === 'SIGSA') return 'produccion'
    if (source === 'CONGENIA') return 'ficha'
    return activo
}

export function esGrafica(bloque: { type: string }): bloque is AgentChartBlock {
    return bloque.type === 'bar_chart' || bloque.type === 'line_chart' || bloque.type === 'stacked_bar'
}

export function esTabla(bloque: { type: string }): bloque is AgentTableBlock {
    return bloque.type === 'table' || bloque.type === 'pivot'
}

/**
 * Lo que agregaría cada botón, o `null` si la respuesta no lo trae.
 *
 * Los dos botones salen desde la primera respuesta: si el agente mandó solo
 * la tabla, la gráfica se arma aquí con `graficaDesdeTabla`, sin esperar a
 * que el médico pida "Ver como gráfica". Y una gráfica también se puede
 * llevar como tabla, con todas las columnas de sus filas.
 */
export function bloqueParaWidget(
    message: MensajeAgente,
    tipo: TipoWidget,
): AgentTableBlock | AgentChartBlock | null {
    if (message.tone !== 'success') return null
    const bloques = message.blocks ?? []
    const grafica = bloques.find(esGrafica)
    const tabla = bloques.find(esTabla)

    // Respuestas sin bloques (backend sin herramientas analíticas): solo `result`.
    const filas = message.result ?? []
    const deResultado: AgentTableBlock | null = filas.length > 0
        ? { type: 'table', title: 'Resultado del agente', columns: columnasDe(filas), rows: filas }
        : null

    if (tipo === 'grafica') {
        if (grafica) return grafica
        const base = tabla ?? deResultado
        return base ? graficaDesdeTabla(base) : null
    }

    if (tabla) return tabla
    if (grafica) return { type: 'table', title: grafica.title, columns: columnasDe(grafica.rows), rows: grafica.rows }
    return deResultado
}

/** Las mismas que `chartBlock` en el backend, para que salga igual que "Ver como gráfica". */
const MAX_FILAS_TABLA = 50
const MAX_FILAS_GRAFICA = 25
const MAX_SERIES = 5
/** Si están, van en el eje: "por área y mes" se grafica por mes, no por área. */
const CLAVES_DE_TIEMPO = ['mes', 'fecha', 'fecha_consulta', 'periodo']
const OTROS = 'Otros'

/** Un número, o un texto que solo es un número (PostgreSQL manda así los `numeric`). */
function medida(valor: unknown): number | null {
    if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null
    if (typeof valor !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(valor.trim())) return null
    return Number(valor)
}

/** Texto que no es un número: lo que sirve de categoría o de agrupación. */
function esTexto(valor: unknown): boolean {
    return typeof valor === 'string' && medida(valor) === null
}

/**
 * La gráfica de una tabla, con la regla de `chartBlock` del backend:
 *  - La categoría es la columna de tiempo si hay una; si no, la primera de texto.
 *  - Las columnas numéricas son las series (hasta 5).
 *  - Si la categoría se repite porque hay una segunda dimensión con una sola
 *    medida (área × mes), se apila: una barra por mes y una serie por área.
 *    Pasadas 5 áreas, las menores se suman en "Otros" para no perder el total.
 *
 * `null` cuando no hay gráfica honesta que hacer: una sola fila, sin texto o
 * sin números, o con categorías repetidas que no se pueden apilar.
 */
export function graficaDesdeTabla(tabla: AgentTableBlock): AgentChartBlock | null {
    const filas = tabla.rows.slice(0, MAX_FILAS_TABLA)
    if (filas.length < 2) return null

    const columnas = tabla.columns.length > 0 ? tabla.columns : columnasDe(filas)
    const categoryKey = CLAVES_DE_TIEMPO.find((clave) =>
        columnas.includes(clave) && filas.some((fila) => typeof fila[clave] === 'string'))
        ?? columnas.find((columna) => filas.some((fila) => esTexto(fila[columna])))
    if (!categoryKey) return null

    const valores = columnas
        .filter((columna) => columna !== categoryKey && filas.some((fila) => medida(fila[columna]) !== null))
        .slice(0, MAX_SERIES)
    if (valores.length === 0) return null

    const categorias = filas.map((fila) => String(fila[categoryKey] ?? ''))
    const repetidas = new Set(categorias).size < categorias.length

    if (repetidas) {
        const dimensiones = columnas.filter((columna) =>
            columna !== categoryKey && !valores.includes(columna) && filas.some((fila) => esTexto(fila[columna])))
        if (valores.length !== 1 || dimensiones.length !== 1) return null
        return { title: tabla.title, ...apilar(filas, categoryKey, dimensiones[0], valores[0]) }
    }

    const rows = filas.slice(0, MAX_FILAS_GRAFICA)
    return {
        type: esClaveDeTiempo(categoryKey, categorias) ? 'line_chart' : 'bar_chart',
        title: tabla.title,
        categoryKey,
        series: valores.map((dataKey) => ({ dataKey, label: formatearEncabezado(dataKey) })),
        rows: rows.map((fila) => ({
            ...fila,
            ...Object.fromEntries(valores.map((columna) => [columna, medida(fila[columna]) ?? 0])),
        })),
    }
}

/**
 * Filas largas (mes, área, total) a anchas (mes, PEDIATRÍA, GENÉTICA…), como
 * `build_pivot_table` + `limitPivotSeries` del backend.
 */
function apilar(
    filas: FilaResultado[],
    categoryKey: string,
    dimension: string,
    valor: string,
): Omit<AgentChartBlock, 'title'> {
    const etiqueta = (dato: unknown) => (dato == null || dato === '' ? 'Sin dato' : String(dato))
    const categorias = [...new Set(filas.map((fila) => etiqueta(fila[categoryKey])))]
    const grupos = [...new Set(filas.map((fila) => etiqueta(fila[dimension])))]

    const anchas = new Map(categorias.map((categoria) =>
        [categoria, Object.fromEntries(grupos.map((grupo) => [grupo, 0])) as Record<string, number>]))
    for (const fila of filas) {
        anchas.get(etiqueta(fila[categoryKey]))![etiqueta(fila[dimension])] += medida(fila[valor]) ?? 0
    }

    // Las 4 mayores por total y el resto en "Otros": 5 series, el tope de la gráfica.
    const total = (grupo: string) => [...anchas.values()].reduce((suma, fila) => suma + fila[grupo], 0)
    const visibles = grupos.length <= MAX_SERIES
        ? grupos
        : grupos.filter((grupo) => grupo !== OTROS)
            .sort((a, b) => total(b) - total(a) || a.localeCompare(b))
            .slice(0, MAX_SERIES - 1)
    const resto = grupos.filter((grupo) => !visibles.includes(grupo))
    const series = resto.length > 0 ? [...visibles, OTROS] : visibles

    return {
        type: 'stacked_bar',
        categoryKey,
        series: series.map((grupo) => ({ dataKey: grupo, label: grupo })),
        rows: categorias.slice(0, MAX_FILAS_GRAFICA).map((categoria) => {
            const fila = anchas.get(categoria)!
            return {
                [categoryKey]: categoria,
                ...Object.fromEntries(visibles.map((grupo) => [grupo, fila[grupo]])),
                ...(resto.length > 0 && { [OTROS]: resto.reduce((suma, grupo) => suma + fila[grupo], 0) }),
            }
        }),
    }
}

/** Todas las columnas de las filas, en el orden en que aparecen. */
function columnasDe(filas: FilaResultado[]): string[] {
    return [...new Set(filas.flatMap((fila) => Object.keys(fila)))]
}

/** Cómo recuerda el chat que una respuesta ya se llevó al tablero. */
export function claveAgregado(messageId: string, tipo: TipoWidget): string {
    return `${messageId}:${tipo}`
}

export function crearWidget(
    tipo: TipoWidget,
    bloque: AgentTableBlock | AgentChartBlock,
    pregunta: string,
    ahora = new Date(),
): WidgetAgente {
    return { id: `w-${uuidv4()}`, tipo, pregunta: pregunta.slice(0, 500), creado: ahora.toISOString(), bloque }
}

/* ---------------------------------------------------------------------------
 * Archivo (guardado local, exportar e importar)
 * ------------------------------------------------------------------------- */

const FORMATO = 'congenia-reporteria'
const VERSION = 1

export function serializarTableros(tableros: Tableros, ahora = new Date()): string {
    return JSON.stringify({ formato: FORMATO, version: VERSION, exportado: ahora.toISOString(), tableros }, null, 2)
}

/** AAAA-MM-DD en la hora local: con `toISOString`, de noche en Guatemala ya sería mañana. */
export function fechaParaArchivo(fecha = new Date()): string {
    const dos = (valor: number) => String(valor).padStart(2, '0')
    return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`
}

/** El nombre que se lee en la carpeta de descargas y que el modal de importar menciona. */
export const PREFIJO_ARCHIVO_TABLERO = 'tablero-reporteria'

export function nombreArchivoTablero(fecha = new Date()): string {
    return `${PREFIJO_ARCHIVO_TABLERO}-${fechaParaArchivo(fecha)}.json`
}

export function nombreArchivoPdf(dashboard: DashboardId, fecha = new Date()): string {
    return `reporteria-${dashboard}-${fechaParaArchivo(fecha)}.pdf`
}

/**
 * El mensaje va directo al médico, así que dice qué hacer y no qué falló por
 * dentro. Tampoco habla de formatos: para quien lo lee es "el archivo del
 * tablero", el que bajó con Exportar.
 */
export class ArchivoInvalidoError extends Error {}

const USE_EL_EXPORTADO = 'Use el archivo que descargó con la opción Exportar.'

/**
 * Lee un archivo exportado. Lo que no pase la validación se descarta tarjeta
 * por tarjeta; solo se rechaza el archivo entero si no es de reportería.
 */
export function leerArchivoTableros(texto: string): Tableros {
    let datos: unknown
    try {
        datos = JSON.parse(texto)
    } catch {
        throw new ArchivoInvalidoError(`No se pudo leer este archivo. ${USE_EL_EXPORTADO}`)
    }

    if (!isRecord(datos) || datos.formato !== FORMATO || !isRecord(datos.tableros)) {
        throw new ArchivoInvalidoError(`Este archivo no es un tablero de reportería. ${USE_EL_EXPORTADO}`)
    }
    if (datos.version !== VERSION) {
        throw new ArchivoInvalidoError('Este archivo viene de otra versión de la reportería y no se puede abrir aquí.')
    }

    const tableros = datos.tableros
    const resultado = tablerosIniciales()
    for (const dashboard of DASHBOARD_IDS) {
        const crudo = tableros[dashboard]
        if (!isRecord(crudo)) continue
        resultado[dashboard] = normalizarTablero(dashboard, {
            orden: textos(crudo.orden),
            widgets: widgetsSeguros(crudo.widgets),
            // Los archivos de antes de poder ensanchar tarjetas no la traen.
            anchas: textos(crudo.anchas),
            medias: textos(crudo.medias),
        })
    }
    return resultado
}

/** Un tablero exportado pesa unos KB; más que esto no es uno. */
export const MAX_BYTES_ARCHIVO = 2_000_000

/** Lo que llega de arrastrar o elegir un archivo: el tope de tamaño va antes de leerlo. */
export async function leerArchivoSubido(archivo: Pick<File, 'size' | 'text'>): Promise<Tableros> {
    if (archivo.size > MAX_BYTES_ARCHIVO) {
        throw new ArchivoInvalidoError(`Este archivo es demasiado grande para ser un tablero. ${USE_EL_EXPORTADO}`)
    }
    let texto: string
    try {
        texto = await archivo.text()
    } catch {
        throw new ArchivoInvalidoError(`No se pudo leer este archivo. ${USE_EL_EXPORTADO}`)
    }
    return leerArchivoTableros(texto)
}

function widgetsSeguros(crudos: unknown): Record<string, WidgetAgente> {
    if (!isRecord(crudos)) return {}

    const widgets: Record<string, WidgetAgente> = {}
    for (const candidato of Object.values(crudos)) {
        if (Object.keys(widgets).length >= MAX_WIDGETS) break
        if (!isRecord(candidato)) continue

        const { id, tipo, pregunta, creado } = candidato
        if (typeof id !== 'string' || !/^w-[\w-]{1,64}$/.test(id) || id in widgets) continue
        if (tipo !== 'tabla' && tipo !== 'grafica') continue

        // El bloque pasa por el mismo filtro que una respuesta del agente, y
        // tiene que ser del tipo que dice la tarjeta.
        const [crudo] = bloquesSeguros([candidato.bloque])
        const bloque = !crudo ? null
            : tipo === 'tabla' ? (esTabla(crudo) ? crudo : null)
            : (esGrafica(crudo) ? crudo : null)
        if (!bloque) continue

        widgets[id] = {
            id,
            tipo,
            pregunta: typeof pregunta === 'string' ? pregunta.slice(0, 500) : '',
            creado: typeof creado === 'string' && !Number.isNaN(Date.parse(creado)) ? creado : new Date(0).toISOString(),
            bloque,
        }
    }
    return widgets
}

function textos(valor: unknown): string[] {
    return Array.isArray(valor) ? valor.filter((item): item is string => typeof item === 'string') : []
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}
