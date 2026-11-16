/**
 * @fileoverview Enrutado de la aplicacion.
 *
 * Dos arboles independientes bajo la misma sesion de Keycloak:
 *
 *   `/`            la ficha clinica, tal cual estaba
 *   `/dashboard/*` el panel del medico, con sesion y rol obligatorios
 *
 * El `AuthProvider` envuelve a los dos, pero solo observa la sesion: la ficha
 * abierta con una capability no debe pedir login. Quien la exige es
 * `<RequireAuth>`, y solo sobre el dashboard.
 */

import { Suspense, lazy } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import App from '../App'
import styles from './AppRouter.module.css'
import { ROUTES } from './routes'
import { NotFoundPage } from './NotFoundPage'
import { AuthProvider } from '../features/auth/AuthProvider'
import { RequireAuth } from '../features/auth/RequireAuth'
import { ReturnAfterLogin } from '../features/auth/ReturnAfterLogin'
import { LoadingView } from '../components/forms/LoadingView/LoadingView'

const DashboardRoutes = lazy(() => import('../features/dashboard/DashboardRoutes'))

export function AppRouter() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <ReturnAfterLogin />

                <Routes>
                    <Route
                        path={ROUTES.ficha}
                        element={<div className={styles.fichaShell}><App /></div>}
                    />

                    <Route
                        path={`${ROUTES.dashboard}/*`}
                        element={
                            <RequireAuth>
                                <Suspense fallback={<LoadingView message="Abriendo el dashboard" />}>
                                    <DashboardRoutes />
                                </Suspense>
                            </RequireAuth>
                        }
                    />

                    <Route path="*" element={<NotFoundPage />} />
                </Routes>
            </AuthProvider>
        </BrowserRouter>
    )
}
