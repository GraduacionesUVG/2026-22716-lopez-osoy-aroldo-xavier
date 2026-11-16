/**
 * @fileoverview Memoria de la ultima busqueda, viva mientras dure la pestana.
 *
 * Abrir una ficha desmonta la pantalla de busqueda, asi que sin esto el medico
 * volveria a una rejilla vacia y tendria que repetir los filtros por cada
 * registro que quiera revisar. Guardar el ultimo resultado convierte "Regresar"
 * en lo que la gente espera: volver justo a donde estaba.
 *
 * Es un modulo y no `sessionStorage` a proposito: son resultados con PHI y no
 * tienen por que sobrevivir a un cierre de pestana ni tocar disco.
 *
 * @compliance HIPAA 164.312(c) - la PHI no se persiste en el navegador
 */

import type { DateRange } from '../../../components/ui/DateRangeField/DateRangeField'
import type { FichaResumen, FichaSearchParams } from '../../../types/ficha-search'

export interface BusquedaSnapshot {
    q: string
    rango: DateRange
    /** Los filtros con los que se pidio, para que "Cargar mas" siga la misma serie. */
    filtros: FichaSearchParams
    results: FichaResumen[]
    total: number
    page: number
}

let snapshot: BusquedaSnapshot | null = null

export function readBusquedaSnapshot(): BusquedaSnapshot | null {
    return snapshot
}

export function writeBusquedaSnapshot(next: BusquedaSnapshot): void {
    snapshot = next
}

/** Para el cierre de sesion: la PHI en memoria tampoco debe sobrevivirlo. */
export function clearBusquedaSnapshot(): void {
    snapshot = null
}
