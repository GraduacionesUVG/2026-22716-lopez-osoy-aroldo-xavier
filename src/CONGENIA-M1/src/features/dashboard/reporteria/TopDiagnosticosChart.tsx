/**
 * @fileoverview Diagnósticos más frecuentes en barras horizontales.
 *
 * Horizontales porque los diagnósticos de producción ambulatoria son textos largos en
 * mayúsculas: en el eje se recortan y el tooltip muestra el nombre completo.
 */

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { TopDiagnosticoItem } from '../../../services/reporting.service'
import { COLOR, EJE_CATEGORIAS_LARGAS, EJE_NUMERICO, ESTILO_TOOLTIP, LARGO_CATEGORIA } from './estiloGraficas'
import { formatearNumero, truncar } from './formato'
import styles from './ReporteriaView.module.css'

interface TopDiagnosticosChartProps {
    items: TopDiagnosticoItem[]
}

export function TopDiagnosticosChart({ items }: TopDiagnosticosChartProps) {
    if (items.length === 0) {
        return <p className={styles.empty}>Todavía no hay diagnósticos registrados.</p>
    }

    return (
        // Llena la celda del tablero: todas las tarjetas miden lo mismo.
        <div style={{ height: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={items} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke={COLOR.cuadricula} horizontal={false} />
                    <XAxis type="number" {...EJE_NUMERICO} />
                    <YAxis
                        type="category"
                        dataKey="diagnostico"
                        tickFormatter={(diagnostico: string) => truncar(diagnostico, LARGO_CATEGORIA)}
                        {...EJE_CATEGORIAS_LARGAS}
                    />
                    <Tooltip
                        cursor={{ fill: COLOR.cursor }}
                        formatter={(valor) => [formatearNumero(Number(valor)), 'Registros']}
                        contentStyle={ESTILO_TOOLTIP}
                    />
                    <Bar dataKey="total" fill={COLOR.secundario} radius={[0, 4, 4, 0]} barSize={16} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    )
}
