/**
 * @fileoverview Los bloques de una respuesta del agente: tablas, métricas,
 * avisos y gráficas.
 *
 * El backend manda los datos de la gráfica y su tipo (`AgentChartBlock`); el
 * dibujo es de aquí, con el mismo estilo que las gráficas fijas del tablero
 * (ver `estiloGraficas`).
 */

import { useId } from 'react'
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Legend,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts'
import type { AgentBlock, AgentChartBlock } from '../../../services/reporting.service'
import { AgentResultTable } from './AgentResultTable'
import {
    COLOR,
    COLORES_SERIES,
    EJE,
    EJE_CATEGORIAS_LARGAS,
    EJE_NUMERICO,
    ESTILO_TOOLTIP,
    formaDeGrafica,
    LARGO_CATEGORIA,
    MARGEN,
} from './estiloGraficas'
import { formatearCategoria, formatearMes, formatearNumero, truncar } from './formato'
import styles from './AgentChatPanel.module.css'

export function AgentResultBlocks({ blocks }: { blocks: AgentBlock[] }) {
    return (
        <div className={styles.resultBlocks}>
            {blocks.map((block, index) => {
                if (block.type === 'table' || block.type === 'pivot') {
                    return (
                        <section key={`${block.type}-${index}`} className={styles.resultBlock}>
                            <h3 className={styles.blockTitle}>{block.title}</h3>
                            <AgentResultTable rows={block.rows} columns={block.columns} />
                        </section>
                    )
                }
                if (block.type === 'metric') {
                    return (
                        <section key={`metric-${index}`} className={styles.metricBlock}>
                            <span>{block.label}</span>
                            <strong>{typeof block.value === 'number' ? formatearNumero(block.value) : block.value}</strong>
                        </section>
                    )
                }
                if (block.type === 'warning') {
                    return <p key={`warning-${index}`} className={styles.warningBlock}>{block.message}</p>
                }
                if (block.type === 'bar_chart' || block.type === 'line_chart' || block.type === 'stacked_bar') {
                    return <AgentChart key={`${block.type}-${index}`} block={block} />
                }
                return null
            })}
        </div>
    )
}

function AgentChart({ block }: { block: AgentChartBlock }) {
    return (
        <section className={styles.resultBlock}>
            <h3 className={styles.blockTitle}>{block.title}</h3>
            <GraficaAgente block={block} className={styles.chartWrap} />
        </section>
    )
}

/**
 * Solo la gráfica, sin título: el chat la pone en su burbuja y el tablero en
 * su tarjeta. `className` fija el alto, que Recharts necesita del contenedor.
 */
export function GraficaAgente({ block, className }: { block: AgentChartBlock; className: string }) {
    const forma = formaDeGrafica(block)
    // Un degradado por gráfica: con el mismo id, la segunda tomaría el de la primera.
    const degradado = `agente-area-${useId().replace(/:/g, '')}`

    // Los meses llegan como ISO ("2025-01-01T00:00:00.000Z") y en el eje no caben.
    const categoria = (valor: unknown) =>
        typeof valor === 'string' ? formatearCategoria(valor, block.categoryKey) : String(valor ?? '')
    // En el tooltip, el mes completo ("enero de 2025"), como en "Registros por mes".
    const etiqueta = (valor: unknown) => {
        const corta = categoria(valor)
        return typeof valor === 'string' && corta === formatearMes(valor) ? formatearMes(valor, 'largo') : corta
    }

    // Recharts ordena leyenda y tooltip por nombre: se dejan en el orden de las
    // series, que es el de la pila y el que eligió el backend.
    const orden = (item: { dataKey?: unknown }) =>
        block.series.findIndex((serie) => serie.dataKey === item.dataKey)

    const tooltip = (
        <Tooltip
            itemSorter={orden}
            labelFormatter={etiqueta}
            formatter={(valor, nombre) => [formatearNumero(Number(valor)), nombre]}
            contentStyle={ESTILO_TOOLTIP}
            cursor={forma.tipo === 'barras' ? { fill: COLOR.cursor } : undefined}
        />
    )
    const leyenda = forma.leyenda && (
        <Legend itemSorter={orden} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: COLOR.eje }} />
    )
    const ejeTiempo = (
        <XAxis
            dataKey={block.categoryKey}
            tickFormatter={categoria}
            {...EJE}
            axisLine={{ stroke: COLOR.cuadricula }}
            minTickGap={12}
        />
    )
    // En las apiladas, solo la de arriba redondea: las demás quedan pegadas.
    const radio = (index: number, esquinas: [number, number, number, number]) =>
        !forma.apilada || index === block.series.length - 1 ? esquinas : ([0, 0, 0, 0] as [number, number, number, number])

    let grafica
    if (forma.tipo === 'area') {
        const [serie] = block.series
        grafica = (
            <AreaChart data={block.rows} margin={MARGEN}>
                <defs>
                    <linearGradient id={degradado} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={COLOR.area} stopOpacity={0.9} />
                        <stop offset="100%" stopColor={COLOR.area} stopOpacity={0.15} />
                    </linearGradient>
                </defs>
                <CartesianGrid stroke={COLOR.cuadricula} vertical={false} />
                {ejeTiempo}
                <YAxis {...EJE_NUMERICO} width={48} />
                {tooltip}
                <Area
                    type="monotone"
                    dataKey={serie.dataKey}
                    name={serie.label}
                    stroke={COLOR.primario}
                    strokeWidth={2}
                    fill={`url(#${degradado})`}
                    activeDot={{ r: 4 }}
                />
            </AreaChart>
        )
    } else if (forma.tipo === 'lineas') {
        const colores = [COLOR.primario, ...COLORES_SERIES.slice(1)]
        grafica = (
            <LineChart data={block.rows} margin={MARGEN}>
                <CartesianGrid stroke={COLOR.cuadricula} vertical={false} />
                {ejeTiempo}
                <YAxis {...EJE_NUMERICO} width={48} />
                {tooltip}
                {leyenda}
                {block.series.map((serie, index) => (
                    <Line
                        key={serie.dataKey}
                        type="monotone"
                        dataKey={serie.dataKey}
                        name={serie.label}
                        stroke={colores[index]}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                    />
                ))}
            </LineChart>
        )
    } else if (forma.horizontal) {
        grafica = (
            <BarChart data={block.rows} layout="vertical" margin={MARGEN}>
                <CartesianGrid stroke={COLOR.cuadricula} horizontal={false} />
                <XAxis type="number" {...EJE_NUMERICO} />
                <YAxis
                    type="category"
                    dataKey={block.categoryKey}
                    tickFormatter={(valor) => truncar(categoria(valor), LARGO_CATEGORIA)}
                    {...EJE_CATEGORIAS_LARGAS}
                />
                {tooltip}
                {leyenda}
                {block.series.map((serie, index) => (
                    <Bar
                        key={serie.dataKey}
                        dataKey={serie.dataKey}
                        name={serie.label}
                        fill={COLORES_SERIES[index]}
                        stackId={forma.apilada ? 'total' : undefined}
                        radius={radio(index, [0, 4, 4, 0])}
                        maxBarSize={20}
                    />
                ))}
            </BarChart>
        )
    } else {
        grafica = (
            <BarChart data={block.rows} margin={MARGEN}>
                <CartesianGrid stroke={COLOR.cuadricula} vertical={false} />
                {ejeTiempo}
                <YAxis {...EJE_NUMERICO} width={48} />
                {tooltip}
                {leyenda}
                {block.series.map((serie, index) => (
                    <Bar
                        key={serie.dataKey}
                        dataKey={serie.dataKey}
                        name={serie.label}
                        fill={COLORES_SERIES[index]}
                        stackId={forma.apilada ? 'total' : undefined}
                        radius={radio(index, [4, 4, 0, 0])}
                        maxBarSize={56}
                    />
                ))}
            </BarChart>
        )
    }

    return (
        <div className={className} role="img" aria-label={block.title}>
            <ResponsiveContainer width="100%" height="100%">
                {grafica}
            </ResponsiveContainer>
        </div>
    )
}
