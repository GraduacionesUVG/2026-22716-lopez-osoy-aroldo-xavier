import { describe, expect, it } from 'vitest'
import type { AgentChartBlock } from '../../../services/reporting.service'
import type { ChatMessage } from './chat'
import {
    agregarWidget,
    alternarAncho,
    ArchivoInvalidoError,
    bloqueParaWidget,
    contarTarjetas,
    graficaDesdeTabla,
    crearWidget,
    destinoPorFuente,
    distribuirFilas,
    leerArchivoSubido,
    leerArchivoTableros,
    MAX_BYTES_ARCHIVO,
    MAX_WIDGETS,
    nombreArchivoPdf,
    nombreArchivoTablero,
    quitarWidget,
    reordenarTablero,
    serializarTableros,
    tableroLleno,
    tablerosIniciales,
    vaciarTablero,
    type Tablero,
} from './tablero'

type MensajeAgente = Extract<ChatMessage, { role: 'agent' }>

/** Cuántas filas ocupa el tablero en la cuadrícula de dos columnas. */
function contarFilas(tablero: Tablero): number {
    const { aLoAncho } = distribuirFilas(tablero)
    let filas = 0
    let mitad = false
    for (const id of tablero.orden) {
        if (aLoAncho.has(id)) {
            filas += 1
            mitad = false
        } else if (mitad) {
            mitad = false
        } else {
            filas += 1
            mitad = true
        }
    }
    return filas
}

const GRAFICA: AgentChartBlock = {
    type: 'bar_chart',
    title: 'Registros por sexo',
    categoryKey: 'sexo',
    series: [{ dataKey: 'total', label: 'Registros' }],
    rows: [{ sexo: 'F', total: 10 }, { sexo: 'M', total: 8 }],
}

const respuesta = (extra: Partial<MensajeAgente> = {}): MensajeAgente => ({
    id: 'm2',
    role: 'agent',
    tone: 'success',
    source: 'SIGSA',
    text: 'Listo.',
    ...extra,
})

describe('cambios del tablero', () => {
    it('agrega al final y quita sin tocar las fijas', () => {
        const widget = crearWidget('grafica', GRAFICA, '¿Por sexo?')
        const con = agregarWidget(tablerosIniciales(), 'produccion', widget)
        expect(con.produccion.orden).toEqual(['produccion-mensual', 'produccion-top', widget.id])
        expect(con.ficha).toEqual(tablerosIniciales().ficha)

        const sin = quitarWidget(con, 'produccion', widget.id)
        expect(sin.produccion).toEqual(tablerosIniciales().produccion)
    })

    it('las fijas no se pueden quitar', () => {
        const tableros = tablerosIniciales()
        expect(quitarWidget(tableros, 'produccion', 'produccion-top')).toBe(tableros)
    })

    it('reordenar descarta ids desconocidos y no pierde tarjetas', () => {
        const tableros = reordenarTablero(tablerosIniciales(), 'produccion', ['produccion-top', 'inventada', 'produccion-top'])
        expect(tableros.produccion.orden).toEqual(['produccion-top', 'produccion-mensual'])
    })

    it('respeta el tope de tarjetas', () => {
        let tableros = tablerosIniciales()
        for (let i = 0; i < MAX_WIDGETS; i++) {
            tableros = agregarWidget(tableros, 'ficha', crearWidget('grafica', GRAFICA, ''))
        }
        expect(tableroLleno(tableros.ficha)).toBe(true)
        expect(agregarWidget(tableros, 'ficha', crearWidget('grafica', GRAFICA, ''))).toBe(tableros)
    })

    it('alterna el ancho de una tarjeta y lo conserva al moverla', () => {
        const widget = crearWidget('grafica', GRAFICA, '')
        // Cuatro tarjetas: ninguna se estira sola, así el botón ensancha.
        let tableros = agregarWidget(tablerosIniciales(), 'produccion', widget)
        tableros = agregarWidget(tableros, 'produccion', crearWidget('grafica', GRAFICA, ''))
        tableros = alternarAncho(tableros, 'produccion', widget.id)
        tableros = alternarAncho(tableros, 'produccion', 'produccion-top')
        expect(tableros.produccion.anchas).toEqual([widget.id, 'produccion-top'])

        tableros = reordenarTablero(tableros, 'produccion', [...tableros.produccion.orden].reverse())
        expect(tableros.produccion.anchas).toEqual([widget.id, 'produccion-top'])

        expect(alternarAncho(tableros, 'produccion', 'produccion-top').produccion.anchas).toEqual([widget.id])
        expect(alternarAncho(tableros, 'produccion', 'inventada')).toBe(tableros)
    })

    it.each([
        ['par, sin anchas: nadie se estira', ['a', 'b', 'c', 'd'], [], [], []],
        ['impar: la última llena su fila', ['a', 'b', 'c'], [], ['c'], ['c']],
        ['una sola tarjeta llena su fila', ['a'], [], ['a'], ['a']],
        ['la que queda sola antes de una ancha se estira', ['a', 'b', 'c', 'd'], ['b'], ['a', 'b'], ['a']],
        ['detrás de una ancha se vuelve a emparejar', ['a', 'b', 'c'], ['a'], ['a'], []],
        ['ancha en medio con pares a los lados', ['a', 'b', 'c', 'd', 'e'], ['c'], ['c'], []],
        ['dos anchas seguidas', ['a', 'b', 'c'], ['a', 'b'], ['a', 'b', 'c'], ['c']],
    ])('%s', (_caso, orden, anchas, aLoAncho, rellenos) => {
        const filas = distribuirFilas({ orden, widgets: {}, anchas, medias: [] })
        expect([...filas.aLoAncho].sort()).toEqual([...aLoAncho].sort())
        expect([...filas.rellenos].sort()).toEqual([...rellenos].sort())
    })

    it.each([
        // [caso, orden, anchas, a ensanchar, orden después, filas después]
        ['dos arriba y una abajo: la de abajo sube', ['a', 'b', 'c'], [], 'b', ['a', 'c', 'b'], 2],
        ['la de la izquierda no mueve nada', ['a', 'b', 'c'], [], 'a', ['a', 'b', 'c'], 2],
        ['cuatro: sube la siguiente', ['a', 'b', 'c', 'd'], [], 'b', ['a', 'c', 'b', 'd'], 3],
        ['la última de la derecha no tiene a quién subir', ['a', 'b', 'c', 'd'], [], 'd', ['a', 'b', 'c', 'd'], 3],
        ['no sube una que ya es ancha', ['a', 'b', 'c'], ['c'], 'b', ['a', 'b', 'c'], 3],
    ])('ensanchar: %s', (_caso, orden, anchas, id, ordenDespues, filas) => {
        const tableros = { ...tablerosIniciales(), produccion: { orden, widgets: {}, anchas, medias: [] } }
        const despues = alternarAncho(tableros, 'produccion', id).produccion
        expect(despues.orden).toEqual(ordenDespues)
        expect(despues.anchas).toContain(id)
        expect(contarFilas(despues)).toBe(filas)
    })

    it('una achicada a propósito no se estira aunque quede sola', () => {
        const filas = distribuirFilas({ orden: ['a', 'b', 'c'], widgets: {}, anchas: [], medias: ['c'] })
        expect(filas.aLoAncho.size).toBe(0)
    })

    it.each([
        // [caso, orden, anchas, medias, a achicar, anchas después, medias después]
        ['la que se estiró sola queda a media fila', ['a', 'b', 'c'], [], [], 'c', [], ['c']],
        ['una ancha que quedaría sola se marca media', ['a', 'c', 'b'], ['b'], [], 'b', [], ['b']],
        ['una ancha que encuentra compañera no necesita marca', ['a', 'b', 'c', 'd'], ['a'], [], 'a', [], []],
    ])('achicar: %s', (_caso, orden, anchas, medias, id, anchasDespues, mediasDespues) => {
        const tableros = { ...tablerosIniciales(), produccion: { orden, widgets: {}, anchas, medias } }
        const despues = alternarAncho(tableros, 'produccion', id).produccion
        // Achicar nunca reordena.
        expect(despues.orden).toEqual(orden)
        expect(despues.anchas).toEqual(anchasDespues)
        expect(despues.medias).toEqual(mediasDespues)
        expect(distribuirFilas(despues).aLoAncho.has(id)).toBe(false)
    })

    it('ensanchar una achicada le quita la marca', () => {
        const tableros = { ...tablerosIniciales(), produccion: { orden: ['a', 'b', 'c'], widgets: {}, anchas: [], medias: ['c'] } }
        const despues = alternarAncho(tableros, 'produccion', 'c').produccion
        expect(despues.anchas).toEqual(['c'])
        expect(despues.medias).toEqual([])
    })

    it('quitar una tarjeta ancha también la saca de las anchas', () => {
        const widget = crearWidget('grafica', GRAFICA, '')
        const tableros = alternarAncho(agregarWidget(tablerosIniciales(), 'produccion', widget), 'produccion', widget.id)
        expect(quitarWidget(tableros, 'produccion', widget.id).produccion).toEqual(tablerosIniciales().produccion)
    })

    it('vaciar quita las del agente de un solo tablero y devuelve las fijas a su orden', () => {
        let tableros = agregarWidget(tablerosIniciales(), 'produccion', crearWidget('grafica', GRAFICA, ''))
        tableros = agregarWidget(tableros, 'ficha', crearWidget('grafica', GRAFICA, ''))
        tableros = reordenarTablero(tableros, 'produccion', [...tableros.produccion.orden].reverse())
        expect(contarTarjetas(tableros)).toEqual({ produccion: 1, ficha: 1 })

        const vacio = vaciarTablero(tableros, 'produccion')
        expect(vacio.produccion).toEqual(tablerosIniciales().produccion)
        expect(vacio.ficha).toBe(tableros.ficha)
        expect(contarTarjetas(vacio)).toEqual({ produccion: 0, ficha: 1 })
    })
})

describe('gráfica desde una tabla', () => {
    const tabla = (rows: Array<Record<string, unknown>>, columns = Object.keys(rows[0] ?? {})) =>
        ({ type: 'table' as const, title: 'Registros de producción ambulatoria por sexo', columns, rows })

    it('texto como categoría y números como series, con el título de la tabla', () => {
        const grafica = graficaDesdeTabla(tabla([{ sexo: 'F', total: 5 }, { sexo: 'M', total: 3 }]))
        expect(grafica).toEqual({
            type: 'bar_chart',
            title: 'Registros de producción ambulatoria por sexo',
            categoryKey: 'sexo',
            series: [{ dataKey: 'total', label: 'Total' }],
            rows: [{ sexo: 'F', total: 5 }, { sexo: 'M', total: 3 }],
        })
    })

    it('los meses van en línea y los números en texto cuentan como medida', () => {
        const grafica = graficaDesdeTabla(tabla([
            { mes: '2025-01-01T00:00:00.000Z', total: '2483' },
            { mes: '2025-02-01T00:00:00.000Z', total: '1101' },
        ]))
        expect(grafica?.type).toBe('line_chart')
        expect(grafica?.categoryKey).toBe('mes')
        expect(grafica?.rows.map((fila) => fila.total)).toEqual([2483, 1101])
    })

    it.each([
        ['una sola fila', [{ sexo: 'F', total: 5 }]],
        ['sin números', [{ sexo: 'F', nota: 'a' }, { sexo: 'M', nota: 'b' }]],
        ['sin texto', [{ anio: 2024, total: 5 }, { anio: 2025, total: 3 }]],
        ['categoría repetida sin otra dimensión', [{ sexo: 'F', total: 5 }, { sexo: 'F', total: 3 }]],
        ['categoría repetida con dos medidas', [
            { mes: '2025-01', area: 'Pediatría', total: 5, promedio: 2 },
            { mes: '2025-01', area: 'Genética', total: 3, promedio: 1 },
        ]],
    ])('no hay gráfica: %s', (_caso, filas) => {
        expect(graficaDesdeTabla(tabla(filas))).toBeNull()
    })

    it('área × mes se apila: el mes en el eje y una serie por área, como el backend', () => {
        const grafica = graficaDesdeTabla(tabla([
            // El área viene primero, como en la captura: igual va el mes en el eje.
            { area: 'PEDIATRIA', mes: '2025-01-01T00:00:00.000Z', total: 8 },
            { area: 'MEDICINA GENERAL', mes: '2025-01-01T00:00:00.000Z', total: 5 },
            { area: 'PEDIATRIA', mes: '2025-02-01T00:00:00.000Z', total: '7' },
            { area: 'MEDICINA GENERAL', mes: '2025-02-01T00:00:00.000Z', total: 6 },
        ]))
        expect(grafica).toEqual({
            type: 'stacked_bar',
            title: 'Registros de producción ambulatoria por sexo',
            categoryKey: 'mes',
            series: [
                { dataKey: 'PEDIATRIA', label: 'PEDIATRIA' },
                { dataKey: 'MEDICINA GENERAL', label: 'MEDICINA GENERAL' },
            ],
            rows: [
                { mes: '2025-01-01T00:00:00.000Z', PEDIATRIA: 8, 'MEDICINA GENERAL': 5 },
                { mes: '2025-02-01T00:00:00.000Z', PEDIATRIA: 7, 'MEDICINA GENERAL': 6 },
            ],
        })
    })

    it('con más de 5 áreas, las menores van a "Otros" sin perder el total', () => {
        const areas = ['A', 'B', 'C', 'D', 'E', 'F']
        const grafica = graficaDesdeTabla(tabla(areas.flatMap((area, i) => [
            { mes: '2025-01', area, total: i + 1 },
            { mes: '2025-02', area, total: i + 2 },
        ])))
        expect(grafica?.series.map((serie) => serie.dataKey)).toEqual(['F', 'E', 'D', 'C', 'Otros'])
        const enero = grafica!.rows[0]
        expect(grafica!.series.reduce((suma, serie) => suma + Number(enero[serie.dataKey]), 0)).toBe(21)
    })

    it('respeta los topes del backend: 25 filas y 5 series', () => {
        const fila = (i: number) => ({ cat: `c${i}`, a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 })
        const grafica = graficaDesdeTabla(tabla(Array.from({ length: 40 }, (_, i) => fila(i))))
        expect(grafica?.rows).toHaveLength(25)
        expect(grafica?.series.map((serie) => serie.dataKey)).toEqual(['a', 'b', 'c', 'd', 'e'])
    })

    it('una respuesta con solo tabla ofrece la gráfica de una vez', () => {
        const mensaje = respuesta({ blocks: [tabla([{ sexo: 'F', total: 5 }, { sexo: 'M', total: 3 }])] })
        expect(bloqueParaWidget(mensaje, 'grafica')).toMatchObject({ type: 'bar_chart', categoryKey: 'sexo' })
    })

    it('la tabla sacada de una gráfica conserva todas las columnas', () => {
        const mensaje = respuesta({
            blocks: [{
                ...GRAFICA,
                rows: [{ sexo: 'F', area: 'Pediatría', total: 10 }, { sexo: 'M', area: 'Genética', total: 8 }],
            }],
        })
        expect(bloqueParaWidget(mensaje, 'tabla')).toMatchObject({ columns: ['sexo', 'area', 'total'] })
    })
})

describe('del chat al tablero', () => {
    it('cada fuente va a su tablero y la mixta al que está abierto', () => {
        expect(destinoPorFuente('SIGSA', 'ficha')).toBe('produccion')
        expect(destinoPorFuente('CONGENIA', 'produccion')).toBe('ficha')
        expect(destinoPorFuente('MULTI', 'ficha')).toBe('ficha')
        expect(destinoPorFuente('MULTI', 'produccion')).toBe('produccion')
    })

    it('con gráfica ofrece la gráfica y la tabla de sus filas', () => {
        const mensaje = respuesta({ blocks: [GRAFICA] })
        expect(bloqueParaWidget(mensaje, 'grafica')).toBe(GRAFICA)
        expect(bloqueParaWidget(mensaje, 'tabla')).toEqual({
            type: 'table',
            title: 'Registros por sexo',
            columns: ['sexo', 'total'],
            rows: GRAFICA.rows,
        })
    })

    it('sin bloques, la tabla sale de result y no hay gráfica', () => {
        const mensaje = respuesta({ result: [{ total: 190140 }] })
        expect(bloqueParaWidget(mensaje, 'tabla')).toMatchObject({ type: 'table', columns: ['total'] })
        expect(bloqueParaWidget(mensaje, 'grafica')).toBeNull()
    })

    it('una respuesta bloqueada no se lleva a ningún lado', () => {
        const mensaje = respuesta({ tone: 'blocked', blocks: [GRAFICA] })
        expect(bloqueParaWidget(mensaje, 'grafica')).toBeNull()
        expect(bloqueParaWidget(mensaje, 'tabla')).toBeNull()
    })
})

describe('archivo de tableros', () => {
    it('lo exportado se vuelve a importar igual', () => {
        const tableros = agregarWidget(tablerosIniciales(), 'ficha', crearWidget('grafica', GRAFICA, 'Pregunta'))
        const movidos = reordenarTablero(tableros, 'ficha', [...tableros.ficha.orden].reverse())
        expect(leerArchivoTableros(serializarTableros(movidos))).toEqual(movidos)
    })

    it.each([
        ['no es JSON', 'esto no es json'],
        ['otro formato', JSON.stringify({ formato: 'otro', version: 1, tableros: {} })],
        ['otra versión', JSON.stringify({ formato: 'congenia-reporteria', version: 99, tableros: {} })],
    ])('rechaza un archivo que %s', (_caso, texto) => {
        expect(() => leerArchivoTableros(texto)).toThrow(ArchivoInvalidoError)
        // Lo lee el médico: le habla del archivo que exportó, no del formato.
        expect(() => leerArchivoTableros(texto)).not.toThrow(/json/i)
    })

    it('las anchas viajan en el archivo; uno de antes, sin ellas, se lee igual', () => {
        // La única tarjeta de Ficha se estira sola: el botón la achica.
        const tableros = alternarAncho(tablerosIniciales(), 'ficha', 'ficha-mensual')
        expect(tableros.ficha.medias).toEqual(['ficha-mensual'])
        expect(leerArchivoTableros(serializarTableros(tableros)).ficha.medias).toEqual(['ficha-mensual'])
        const ancha = alternarAncho(tablerosIniciales(), 'produccion', 'produccion-mensual')
        expect(leerArchivoTableros(serializarTableros(ancha)).produccion.anchas).toEqual(['produccion-mensual'])

        const viejo = JSON.parse(serializarTableros(tablerosIniciales()))
        delete viejo.tableros.produccion.anchas
        viejo.tableros.ficha.anchas = ['inventada', 7]
        expect(leerArchivoTableros(JSON.stringify(viejo))).toEqual(tablerosIniciales())
    })

    it('rechaza un archivo demasiado grande sin leerlo', async () => {
        const archivo = { size: MAX_BYTES_ARCHIVO + 1, text: () => Promise.reject(new Error('no debió leerse')) }
        await expect(leerArchivoSubido(archivo)).rejects.toThrow(ArchivoInvalidoError)
    })

    it('lee un archivo subido igual que el texto', async () => {
        const tableros = agregarWidget(tablerosIniciales(), 'ficha', crearWidget('grafica', GRAFICA, ''))
        const texto = serializarTableros(tableros)
        await expect(leerArchivoSubido({ size: texto.length, text: async () => texto })).resolves.toEqual(tableros)
    })

    it('los nombres de archivo usan la fecha local', () => {
        const noche = new Date(2026, 9, 17, 23, 30)
        expect(nombreArchivoTablero(noche)).toBe('tablero-reporteria-2026-10-17.json')
        expect(nombreArchivoPdf('ficha', noche)).toBe('reporteria-ficha-2026-10-17.pdf')
    })

    it('descarta las tarjetas que no pasan la validación y conserva las demás', () => {
        const buena = crearWidget('grafica', GRAFICA, 'ok')
        const archivo = JSON.parse(serializarTableros(agregarWidget(tablerosIniciales(), 'produccion', buena)))
        archivo.tableros.produccion.widgets['w-sin-filas'] = { ...buena, id: 'w-sin-filas', bloque: { ...GRAFICA, rows: [] } }
        archivo.tableros.produccion.widgets['w-tipo-cruzado'] = { ...buena, id: 'w-tipo-cruzado', tipo: 'tabla' }
        archivo.tableros.produccion.widgets['<script>'] = { ...buena, id: '<script>' }
        archivo.tableros.produccion.orden.push('w-sin-filas', 'w-tipo-cruzado', '<script>')

        const leido = leerArchivoTableros(JSON.stringify(archivo))
        expect(Object.keys(leido.produccion.widgets)).toEqual([buena.id])
        expect(leido.produccion.orden).toEqual(['produccion-mensual', 'produccion-top', buena.id])
    })
})
