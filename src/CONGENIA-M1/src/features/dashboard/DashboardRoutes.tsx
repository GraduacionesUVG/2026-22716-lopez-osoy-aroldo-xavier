/**
 * @fileoverview Subarbol de rutas de `/dashboard`.
 *
 */

import { Suspense, lazy, type ReactNode } from 'react'
import { Route, Routes } from 'react-router-dom'
import { DashboardLayout } from './layout/DashboardLayout'
import { InicioPage } from './pages/InicioPage'
import { BusquedaPage } from './busqueda/BusquedaPage'
import { FichaDetailPage } from './busqueda/FichaDetailPage'
import { CorreccionCie10Page } from './cie10/CorreccionCie10Page'
import { Cie10LotePage } from './cie10/Cie10LotePage'
import { AdendasPage } from './adendas/AdendasPage'
import { AdendaReviewPage } from './adendas/AdendaReviewPage'
import { NotFoundPage } from '../../app/NotFoundPage'
import { ROUTES, dashboardChild } from '../../app/routes'
import { RequirePermission } from '../auth/RequirePermission'
import { ROUTE_PERMISSIONS } from './routePermissions'

// Aparte porque arrastra Recharts: el resto del dashboard no tiene por qué pagarlo.
const ReporteriaPage = lazy(() =>
    import('./reporteria/ReporteriaPage').then((module) => ({ default: module.ReporteriaPage })),
)

/** Cada pantalla detras del permiso de su ruta, el mismo que usa el menu. */
function guard(route: keyof typeof ROUTE_PERMISSIONS, page: ReactNode) {
    return <RequirePermission permission={ROUTE_PERMISSIONS[route]}>{page}</RequirePermission>
}

export default function DashboardRoutes() {
    return (
        <Routes>
            <Route element={<DashboardLayout />}>
                <Route index element={guard(ROUTES.dashboard, <InicioPage />)} />
                <Route path={dashboardChild(ROUTES.dashboardBusqueda)}   element={guard(ROUTES.dashboardBusqueda, <BusquedaPage />)} />
                <Route path={dashboardChild(ROUTES.dashboardFicha)}      element={guard(ROUTES.dashboardFicha, <FichaDetailPage />)} />
                <Route path={dashboardChild(ROUTES.dashboardCie10)}      element={guard(ROUTES.dashboardCie10, <CorreccionCie10Page />)} />
                <Route path={dashboardChild(ROUTES.dashboardCie10Lote)}  element={guard(ROUTES.dashboardCie10Lote, <Cie10LotePage />)} />
                <Route path={dashboardChild(ROUTES.dashboardReporteria)} element={guard(ROUTES.dashboardReporteria, <Suspense fallback={null}><ReporteriaPage /></Suspense>)} />
                <Route path={dashboardChild(ROUTES.dashboardAdendas)}    element={guard(ROUTES.dashboardAdendas, <AdendasPage />)} />
                <Route path={dashboardChild(ROUTES.dashboardAdenda)}     element={guard(ROUTES.dashboardAdenda, <AdendaReviewPage />)} />
                <Route path="*" element={<NotFoundPage />} />
            </Route>
        </Routes>
    )
}
