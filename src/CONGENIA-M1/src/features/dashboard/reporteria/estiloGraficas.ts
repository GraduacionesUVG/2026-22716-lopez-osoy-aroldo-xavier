/**
 * @fileoverview Un solo estilo para todas las gráficas de la reportería.
 *
 * Las fijas del tablero (`MonthlyChart`, `TopDiagnosticosChart`) y las que
 * trae el agente (`GraficaAgente`) salen de aquí, para que una tarjeta del
 * agente se vea como las de fábrica: misma cuadrícula, mismos ejes, mismo
 * tooltip, mismos colores.
 *
 * Los colores van en hex y no en `var(--color-*)`: Recharts los escribe como
 * atributos SVG y ahí no todos los navegadores resuelven variables CSS. Son los
 * mismos valores de `src/index.css`.
 */

import type { AgentChartBlock } from '../../../services/reporting.service'
import { esClaveDeTiempo, formatearNumeroCompacto } from './formato'

export const COLOR = {
    primario: '#003E69',    // --color-primary: líneas
    secundario: '#45779E',  // --color-secondary: barras
    area: '#AED3F2',        // --color-2: relleno del área
    cuadricula: '#E8E8E8',  // --color-gray-light
    eje: '#6B7280',
    cursor: '#F1F5F9',      // fondo de la barra bajo el puntero
} as const

/**
 * Varias series: la primera es la de siempre y las demás contrastan entre sí
 * y con ella. Pasadas 5 el backend ya juntó el resto en "Otros".
 */
export const COLORES_SERIES = [COLOR.secundario, '#D97706', '#3F7D4D', '#8B5CF6', '#C2415D'] as const

/** Ejes sin rayitas, en gris y a 12px. */
export const EJE = {
    tick: { fill: COLOR.eje, fontSize: 12 },
    tickLine: false,
} as const

/** Las categorías largas (diagnósticos) a 11px, como en "Diagnósticos más frecuentes". */
export const EJE_CATEGORIAS_LARGAS = {
    tick: { fill: COLOR.eje, fontSize: 11 },
    tickLine: false,
    axisLine: false,
    width: 128,
    interval: 0,
} as const

/** Los números del eje: `190234` → `190.2 k`. */
export const EJE_NUMERICO = {
    ...EJE,
    allowDecimals: false,
    tickFormatter: (valor: number) => formatearNumeroCompacto(valor),
    axisLine: false,
} as const

export const ESTILO_TOOLTIP = { borderRadius: 10, borderColor: COLOR.cuadricula, fontSize: 13 } as const

/** A la derecha, lugar para la mitad de la última etiqueta, que va centrada en el borde. */
export const MARGEN = { top: 8, right: 24, bottom: 0, left: 0 } as const

/** Hasta dónde se recorta una categoría larga en el eje; el tooltip la muestra entera. */
export const LARGO_CATEGORIA = 18

/** Una categoría con más letras que esto no cabe bajo una barra vertical. */
const LARGO_PARA_HORIZONTAL = 16
/** Con más categorías que esto, hasta las medianas se encimarían en vertical. */
const MUCHAS_CATEGORIAS = 6
const LARGO_MEDIANO = 8

export interface FormaGrafica {
    /** Área para una serie en el tiempo, líneas si son varias, barras si no es tiempo. */
    tipo: 'area' | 'lineas' | 'barras'
    /** Barras acostadas, con la categoría en el eje izquierdo. */
    horizontal: boolean
    apilada: boolean
    /** El eje de categorías es de meses o fechas. */
    tiempo: boolean
    /** Con una sola serie la leyenda repite el título: solo va con varias. */
    leyenda: boolean
}

/**
 * Cómo dibujar lo que mandó el agente para que se parezca a las fijas:
 *  - Una serie en el tiempo, como "Registros por mes": área.
 *  - Varias series en el tiempo: líneas, que el área las taparía entre sí.
 *  - Categorías de texto largo, como "Diagnósticos más frecuentes": barras
 *    horizontales, que en vertical el texto no cabe bajo la barra.
 */
export function formaDeGrafica(block: AgentChartBlock): FormaGrafica {
    const valores = block.rows.map((fila) => fila[block.categoryKey])
    const tiempo = esClaveDeTiempo(block.categoryKey, valores)
    const apilada = block.type === 'stacked_bar'
    const leyenda = block.series.length > 1

    if (block.type === 'line_chart' || (tiempo && !apilada)) {
        return { tipo: block.series.length > 1 ? 'lineas' : 'area', horizontal: false, apilada: false, tiempo, leyenda }
    }

    const largos = valores.map((valor) => String(valor ?? '').length)
    const horizontal = !tiempo && (
        largos.some((largo) => largo > LARGO_PARA_HORIZONTAL)
        || (valores.length > MUCHAS_CATEGORIAS && largos.some((largo) => largo > LARGO_MEDIANO))
    )
    return { tipo: 'barras', horizontal, apilada, tiempo, leyenda }
}
