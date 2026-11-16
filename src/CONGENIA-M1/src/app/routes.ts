/**
 * @fileoverview Rutas de la aplicacion, en un solo lugar.
 *
 * Existen dos arboles independientes que solo comparten Keycloak y los tokens
 * de diseno:
 *
 *   `/`           la ficha clinica (flujo SADC por capability y flujo manual)
 *   `/dashboard`  el panel del medico
 *
 * Tenerlas aqui evita que una ruta se escriba a mano en un `<NavLink>` y en un
 * `navigate()` con una letra distinta: renombrar una seccion es cambiar una
 * linea de este archivo.
 */

export const ROUTES = {
    ficha: '/',

    dashboard:            '/dashboard',
    dashboardBusqueda:    '/dashboard/busqueda',
    /* Hija de busqueda a proposito: asi el `startsWith` que marca el tab activo
       deja "Busqueda" resaltada tambien mientras se ve una ficha. */
    dashboardFicha:       '/dashboard/busqueda/:fichaId',
    dashboardCie10:       '/dashboard/cie10',
    /* Hija de cie10 por el mismo motivo: el tab queda resaltado mientras se revisa un lote. */
    dashboardCie10Lote:   '/dashboard/cie10/:runId',
    dashboardReporteria:  '/dashboard/reporteria',
    dashboardAdendas:     '/dashboard/adendas',
    /* Hija de adendas por el mismo motivo que la ficha lo es de busqueda: el
       `startsWith` de la barra lateral deja el tab resaltado mientras se revisa. */
    dashboardAdenda:      '/dashboard/adendas/:fichaId',
} as const

export type AppRoute = (typeof ROUTES)[keyof typeof ROUTES]

/**
 * Segmento relativo de una ruta hija de `/dashboard`.
 *
 * Las `<Routes>` anidadas del dashboard resuelven contra su ruta padre, asi que
 * necesitan `busqueda` y no `/dashboard/busqueda`. Derivarlo aqui evita tener
 * cada ruta escrita dos veces: la de arriba sigue siendo la unica fuente.
 */
export function dashboardChild(route: AppRoute): string {
    return route.slice(ROUTES.dashboard.length + 1)
}

/**
 * Ruta concreta del visor de una ficha.
 *
 * Existe para que ningun `navigate()` arme la URL a mano y se olvide de escapar
 * el id.
 */
export function fichaRoute(fichaId: string): string {
    return ROUTES.dashboardFicha.replace(':fichaId', encodeURIComponent(fichaId))
}

/** Ruta concreta de la revision de una adenda. Mismo motivo que `fichaRoute`. */
export function adendaRoute(fichaId: string): string {
    return ROUTES.dashboardAdenda.replace(':fichaId', encodeURIComponent(fichaId))
}

export function cie10LoteRoute(runId: string): string {
    return ROUTES.dashboardCie10Lote.replace(':runId', encodeURIComponent(runId))
}
