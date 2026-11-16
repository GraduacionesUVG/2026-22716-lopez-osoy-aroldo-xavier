/**
 * @fileoverview Los tableros de reportería, guardados en el navegador.
 *
 * Se guardan por usuario (la clave lleva el `sub` del token) y en el mismo
 * formato que se exporta. Para llevarlos a otra computadora están Exportar e
 * Importar.
 */

import { useEffect, useState } from 'react'
import { leerArchivoTableros, serializarTableros, tablerosIniciales, type Tableros } from './tablero'

function cargar(clave: string): Tableros {
    try {
        const guardado = window.localStorage.getItem(clave)
        return guardado ? leerArchivoTableros(guardado) : tablerosIniciales()
    } catch {
        // Sin almacenamiento, o con un guardado que ya no vale: se arranca de cero.
        return tablerosIniciales()
    }
}

export function useTableros(clave: string) {
    const [tableros, setTableros] = useState<Tableros>(() => cargar(clave))

    useEffect(() => {
        try {
            window.localStorage.setItem(clave, serializarTableros(tableros))
        } catch {
            // Sin almacenamiento (o lleno) el tablero dura lo que la pestaña.
        }
    }, [clave, tableros])

    return [tableros, setTableros] as const
}
