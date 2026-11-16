/**
 * @fileoverview El dashboard de reportería con el agente, navegable de verdad.
 *
 * A diferencia de `ReporteriaView.stories`, que monta la vista tonta con datos
 * fijos, aquí se monta `ReporteriaPage` completa dentro de un `MemoryRouter`
 * con la barra lateral del dashboard. Se recorre igual que en la app: cargan
 * los indicadores, se cambia de tablero, se abre el agente y se le
 * pregunta.
 *
 * Los datos y el agente salen de `reporting.mock.ts`, que se le pasa a la
 * página por `servicio`. El agente no es un modelo: reconoce las preguntas del
 * plan (`docs/REPORTING_CHAT_OVERLAY_PLAN.md`) y bloquea las mismas que el
 * backend.
 *
 * La conversación se pierde al cambiar de story o recargar, igual que en la app.
 */

import type { Meta, StoryObj } from '@storybook/react-vite'
import type { User } from 'oidc-client-ts'
import { Toaster } from 'react-hot-toast'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { TOASTER_PROPS } from '../../../config/toast'
import { AuthContext, type AuthContextValue } from '../../auth/AuthContext'
import type { Access } from '../../auth/permissions'
import { DashboardLayout } from '../layout/DashboardLayout'
import { InicioPage } from '../pages/InicioPage'
import { reportingMock } from '../../../services/reporting.mock'
import type { ReportingService } from '../../../services/reporting.service'
import { ReporteriaPage } from './ReporteriaPage'

const medico = {
    profile: {
        name: 'Dr. Marco Paez',
        especialidad: 'Genetista',
    },
} as unknown as User

const access: Access = { permissions: new Set(['dashboard', 'fichas.crear', 'adendas.revisar', 'reporteria']), roleLabel: 'Genetista', tenants: [] }

const auth: AuthContextValue = {
    state: { status: 'authenticated', user: medico, access },
    signIn: () => undefined,
    logout: () => undefined,
    returnPath: null,
    consumeReturnPath: () => undefined,
}

/** Nunca responde: deja la pantalla en su estado de carga. */
const servicioColgado: ReportingService = {
    ...reportingMock,
    obtenerResumenReporteria: () => new Promise(() => {}),
    obtenerTopDiagnosticos: () => new Promise(() => {}),
    obtenerSerieMensualSigsa: () => new Promise(() => {}),
    obtenerSerieMensualCongenia: () => new Promise(() => {}),
}

/** Cae la serie mensual y el agente no tiene conexión; el resto funciona. */
const servicioConFallas: ReportingService = {
    ...reportingMock,
    obtenerSerieMensualSigsa: () => Promise.reject(new Error('sin conexión')),
    obtenerSerieMensualCongenia: () => Promise.reject(new Error('sin conexión')),
    consultarAgente: () => new Promise((_, reject) => setTimeout(() => reject(new Error('sin conexión')), 600)),
}

function FlujoReporteria({ servicio }: { servicio: ReportingService }) {
    return (
        <AuthContext.Provider value={auth}>
            <MemoryRouter initialEntries={['/dashboard/reporteria']}>
                <Routes>
                    <Route path="/dashboard" element={<DashboardLayout />}>
                        <Route index element={<InicioPage />} />
                        <Route path="reporteria" element={<ReporteriaPage servicio={servicio} />} />
                    </Route>
                </Routes>
            </MemoryRouter>
            <Toaster {...TOASTER_PROPS} />
        </AuthContext.Provider>
    )
}

const meta: Meta<typeof FlujoReporteria> = {
    title: 'Flujos/Reportería',
    component: FlujoReporteria,
    parameters: { layout: 'fullscreen' },
    args: { servicio: reportingMock },
    // El servicio es un objeto de funciones: no tiene sentido como control.
    argTypes: { servicio: { table: { disable: true } } },
}

export default meta
type Story = StoryObj<typeof FlujoReporteria>

/**
 * El recorrido completo.
 *
 * Cosas que probar:
 *  - Cambiar entre los tableros de Producción ambulatoria y Ficha clínica con
 *    el control de arriba a la izquierda (también con las flechas), y pasar
 *    el mouse sobre las gráficas para ver los tooltips.
 *  - Abrir el agente con el botón del robot: el tablero se angosta y, en
 *    Producción ambulatoria, las dos gráficas de abajo pasan a mitades.
 *  - Pulsar una pregunta sugerida, o escribir: "registros por sexo",
 *    "infección urinaria", "fichas este mes". Enter envía, Shift+Enter hace
 *    salto de línea.
 *  - Preguntas que se bloquean: "Dame nombres de pacientes con infección
 *    urinaria", "DROP TABLE ficha_clinica".
 *  - Llevar respuestas al tablero con los botones de la derecha de cada
 *    burbuja (tabla / gráfica): "registros por sexo" va a Producción
 *    ambulatoria, "fichas por mes" a Ficha clínica y "compara las dos
 *    fuentes" al tablero que esté abierto.
 *  - Mover las tarjetas por el asa (o con Espacio y flechas), quitar las del
 *    agente con la ✕, y recargar: el tablero se conserva en el navegador.
 *  - Exportar explica para qué sirve la copia y la descarga; Importar recibe
 *    ese archivo arrastrándolo (o buscándolo) y dice qué trae antes de
 *    reemplazar. Descargar PDF baja el tablero abierto. La goma de la barra
 *    borra, previa confirmación, las tarjetas del agente de ese tablero.
 *  - En celular, esas cuatro acciones están en "Opciones".
 *  - Cerrar el panel y reabrirlo: la conversación sigue ahí. El borrador
 *    también.
 *  - La goma del encabezado limpia la conversación; está deshabilitada
 *    mientras hay una consulta en vuelo.
 */
export const Completo: Story = {}

/** El agente en celular: el panel ocupa toda la pantalla. */
export const Movil: Story = {
    globals: { viewport: { value: 'mobile1' } },
}

/** Los indicadores y las gráficas mientras cargan. */
export const Cargando: Story = {
    args: { servicio: servicioColgado },
}

/**
 * Fallas parciales: la serie mensual no carga (aviso con "Reintentar") y el
 * agente responde con el error de conexión en ámbar.
 */
export const ConFallas: Story = {
    args: { servicio: servicioConFallas },
}
