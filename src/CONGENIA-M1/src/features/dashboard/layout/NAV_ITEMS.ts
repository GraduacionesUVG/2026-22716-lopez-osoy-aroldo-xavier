/**
 * @fileoverview Secciones del dashboard: fuente unica de la navegacion.
 *
 */

import { FileChartColumn, House, Pencil, Search, Stethoscope } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ROUTES } from '../../../app/routes'
import type { ROUTE_PERMISSIONS } from '../routePermissions'

export interface NavItem {
    to: keyof typeof ROUTE_PERMISSIONS
    label: string
    icon: LucideIcon
    end?: boolean
}

export const NAV_ITEMS: readonly NavItem[] = [
    { to: ROUTES.dashboard,           label: 'Inicio',                icon: House,           end: true },
    { to: ROUTES.dashboardBusqueda,   label: 'Búsqueda',              icon: Search },
    { to: ROUTES.dashboardCie10,      label: 'Corrección CIE-10',     icon: Pencil },
    { to: ROUTES.dashboardReporteria, label: 'Reportería',            icon: FileChartColumn },
    { to: ROUTES.dashboardAdendas,    label: 'Corrección de adendas', icon: Stethoscope },
]
