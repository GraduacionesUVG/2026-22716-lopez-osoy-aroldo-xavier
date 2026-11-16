/**
 * @fileoverview Tabla con el `result` de una respuesta del agente.
 *
 * Las columnas salen de la primera fila: el agente solo devuelve agregados
 * (totales, conteos por dimensión), así que todas las filas comparten forma.
 */

import { columnasVisibles, formatearCelda, formatearEncabezado, type FilaResultado } from './chat'
import styles from './AgentChatPanel.module.css'

export function AgentResultTable({ rows, columns: preferredColumns, llenar = false }: {
    rows: FilaResultado[]
    columns?: string[]
    /** En la tarjeta del tablero: sin el tope de alto del chat; el alto lo pone la tarjeta. */
    llenar?: boolean
}) {
    const columns = columnasVisibles(rows, preferredColumns)
    if (columns.length === 0) return null

    return (
        <div className={llenar ? `${styles.tableWrap} ${styles.tableFill}` : styles.tableWrap}>
            <table className={styles.table}>
                <thead>
                    <tr>
                        {columns.map((column) => (
                            // Alineado como sus valores: sobre una columna de números, a la derecha.
                            <th
                                key={column}
                                scope="col"
                                className={rows.some((row) => typeof row[column] === 'number') ? styles.numeric : undefined}
                            >
                                {formatearEncabezado(column)}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, index) => (
                        <tr key={index}>
                            {columns.map((column) => (
                                <td
                                    key={column}
                                    className={typeof row[column] === 'number' ? styles.numeric : undefined}
                                >
                                    {formatearCelda(row[column], column)}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
