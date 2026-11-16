import type { Meta, StoryObj } from '@storybook/react-vite'
import type { User } from 'oidc-client-ts'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DashboardLayout } from './DashboardLayout'
import { AuthContext, type AuthContextValue } from '../../auth/AuthContext'
import type { Access } from '../../auth/permissions'
import { InicioPage } from '../pages/InicioPage'
import { BusquedaPage } from '../busqueda/BusquedaPage'
import { ReporteriaPage } from '../reporteria/ReporteriaPage'
import { CorreccionCie10Page } from '../cie10/CorreccionCie10Page'
import { Cie10LotePage } from '../cie10/Cie10LotePage'
import { reportingMock } from '../../../services/reporting.mock'

const medico = {
    profile: {
        name: 'Dr. Marco Paez',
        especialidad: 'Genetista',
    },
} as unknown as User

// El menu se filtra por permiso: sin permisos no habria nada que mostrar.
const access: Access = { permissions: new Set(['dashboard', 'fichas.crear', 'adendas.revisar', 'reporteria', 'cie10.corregir']), roleLabel: 'Genetista', tenants: [] }

const auth: AuthContextValue = {
    state: { status: 'authenticated', user: medico, access },
    signIn: () => undefined,
    logout: () => undefined,
    returnPath: null,
    consumeReturnPath: () => undefined,
}

function DashboardLayoutDemo({ path }: { path: string }) {
    return (
        <AuthContext.Provider value={auth}>
            <MemoryRouter initialEntries={[path]}>
                <Routes>
                    <Route path="/dashboard" element={<DashboardLayout />}>
                        <Route index element={<InicioPage />} />
                        <Route path="busqueda" element={<BusquedaPage />} />
                        <Route path="reporteria" element={<ReporteriaPage servicio={reportingMock} />} />
                        <Route path="cie10" element={<CorreccionCie10Page />} />
                        <Route path="cie10/:runId" element={<Cie10LotePage />} />
                    </Route>
                </Routes>
            </MemoryRouter>
        </AuthContext.Provider>
    )
}

const meta: Meta<typeof DashboardLayout> = {
    title: 'Dashboard/DashboardLayout',
    component: DashboardLayout,
    parameters: { layout: 'fullscreen' },
}

export default meta
type Story = StoryObj<typeof DashboardLayout>

export const Inicio: Story = {
    render: () => <DashboardLayoutDemo path="/dashboard" />,
}

export const SeccionReporteria: Story = {
    render: () => <DashboardLayoutDemo path="/dashboard/reporteria" />,
}

/**
 * La revisión CIE-10 completa, contra `cie10.mock.ts` (en Storybook `APP_ENV`
 * queda en `development` y el mock se enciende solo).
 *
 * Arranca en la lista de lotes por mes: dos pendientes (septiembre y agosto) y
 * doce revisados (dos páginas, para probar la paginación). "Ir al lote" abre la tabla, y el botón de regresar del
 * topbar vuelve a la lista. En la tabla se puede recorrer todo: filtrar por
 * confianza o por descripción (prueba `rodilla`), mover la tuerca, abrir el
 * "i", aceptar, marcar varias filas y "Aceptar seleccionadas", rechazar con el
 * buscador del catálogo (prueba `r69`, `esguince` o un código que no esté,
 * como `R78`), aceptar la declaración y confirmar. El lote de agosto es chico: sirve para
 * confirmarlo entero y verlo pasar a revisados.
 *
 * El mock guarda en memoria: para empezar de cero, recarga la página de Storybook.
 */
export const SeccionCie10: Story = {
    render: () => <DashboardLayoutDemo path="/dashboard/cie10" />,
}

/** Directo en la tabla del lote de septiembre, sin pasar por la lista. */
export const SeccionCie10Lote: Story = {
    render: () => <DashboardLayoutDemo path="/dashboard/cie10/run-2026-10-17" />,
}

export const Movil: Story = {
    parameters: { viewport: { defaultViewport: 'mobile1' } },
    render: () => <DashboardLayoutDemo path="/dashboard/busqueda" />,
}
