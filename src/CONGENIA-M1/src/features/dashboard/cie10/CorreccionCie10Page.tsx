/**
 * @fileoverview Entrada de la corrección CIE-10: `/dashboard/cie10`.
 *
 * Muestra la lista de lotes por mes (`Cie10Lotes`); cada lote abre su tabla en
 * `/dashboard/cie10/:runId` (`Cie10LotePage`). La revisión uno por uno, con
 * tarjetas e historial, se retiró: la tabla por lote la reemplaza.
 */

import { usePageHeader } from '../layout/usePageHeader'
import { Cie10Lotes } from './Cie10Lotes'

// El permiso lo exige la ruta (DashboardRoutes + routePermissions).
export function CorreccionCie10Page() {
    usePageHeader('Corrección CIE-10')
    return <Cie10Lotes />
}
