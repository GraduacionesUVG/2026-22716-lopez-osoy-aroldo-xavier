/**
 * @fileoverview Los tres estados de una adenda, en un solo lugar.
 *
 * El tab vive en la barra de direcciones (`?estado=pendientes`) para que volver
 * desde la revision con el boton atras recupere la pestana en la que estaba el
 * revisor. Eso obliga a traducir entre el slug de la URL y el valor del
 * contrato, y tener las dos tablas juntas evita que se separen.
 */

import type { EstadoAdenda } from '../../../services/ficha.service'
import type { StatusTone } from '../../../components/ui/StatusBadge/StatusBadge'

export type SlugEstado = 'pendientes' | 'aprobadas' | 'rechazadas'

export const ESTADO_POR_SLUG: Record<SlugEstado, EstadoAdenda> = {
    pendientes: 'PENDIENTE',
    aprobadas:  'APROBADA',
    rechazadas: 'RECHAZADA',
}

export const SLUG_POR_ESTADO: Record<EstadoAdenda, SlugEstado> = {
    PENDIENTE: 'pendientes',
    APROBADA:  'aprobadas',
    RECHAZADA: 'rechazadas',
}

export const TONO_POR_ESTADO: Record<EstadoAdenda, StatusTone> = {
    PENDIENTE: 'pending',
    APROBADA:  'approved',
    RECHAZADA: 'rejected',
}

export const TABS: { id: SlugEstado; label: string }[] = [
    { id: 'pendientes', label: 'Pendientes de revisar' },
    { id: 'aprobadas',  label: 'Aprobadas' },
    { id: 'rechazadas', label: 'Rechazadas' },
]

/** Slug valido, o el de pendientes: es el tab con el que se entra a trabajar. */
export function slugValido(valor: string | null): SlugEstado {
    return valor !== null && valor in ESTADO_POR_SLUG ? (valor as SlugEstado) : 'pendientes'
}
