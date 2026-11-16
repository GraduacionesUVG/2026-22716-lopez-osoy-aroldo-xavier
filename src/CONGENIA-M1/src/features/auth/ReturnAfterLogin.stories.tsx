import { useMemo, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import type { User } from 'oidc-client-ts'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { AuthContext, type AuthContextValue } from './AuthContext'
import type { Access } from './permissions'
import { ReturnAfterLogin } from './ReturnAfterLogin'

const medico = {
    profile: { name: 'Dr. Marco Paez' },
} as unknown as User

const admin = {
    profile: { name: 'Lic. Ana Ruiz' },
} as unknown as User

// Lo que devolveria `GET /me` para cada uno.
const PERMISOS = new Map<User, Access>([
    [medico, { permissions: new Set(['dashboard', 'fichas.crear']), roleLabel: 'Médico', tenants: [] }],
    [admin, { permissions: new Set(['dashboard', 'cie10.corregir', 'reporteria']), roleLabel: 'Administrador', tenants: [] }],
])

/** Simula la vuelta de Keycloak: hay sesion y una ruta pendiente. */
function VueltaDeKeycloakDemo({ returnPath, user = medico }: { returnPath: string; user?: User }) {
    const [pendiente, setPendiente] = useState<string | null>(returnPath)

    const auth = useMemo<AuthContextValue>(() => ({
        state: { status: 'authenticated', user, access: PERMISOS.get(user)! },
        signIn: () => undefined,
        logout: () => undefined,
        returnPath: pendiente,
        consumeReturnPath: () => setPendiente(null),
    }), [pendiente, user])

    return (
        <AuthContext.Provider value={auth}>
            <MemoryRouter initialEntries={['/']}>
                <ReturnAfterLogin />

                <nav>
                    <Link to="/dashboard/reporteria">Reportería</Link>
                    <Link to="/dashboard/cie10">CIE-10</Link>
                </nav>

                <Routes>
                    <Route path="/" element={<h2>Callback</h2>} />
                    <Route path="/dashboard" element={<h2>Inicio del dashboard</h2>} />
                    <Route path="/dashboard/reporteria" element={<h2>Página de reportería</h2>} />
                    <Route path="/dashboard/cie10" element={<h2>Página de CIE-10</h2>} />
                </Routes>
            </MemoryRouter>
        </AuthContext.Provider>
    )
}

const meta: Meta<typeof ReturnAfterLogin> = {
    title: 'Auth/ReturnAfterLogin',
    component: ReturnAfterLogin,
}

export default meta
type Story = StoryObj<typeof ReturnAfterLogin>

/**
 * Tras el login se vuelve una sola vez a la ruta pedida. Antes, cada click del
 * menu devolvia al usuario a esa ruta.
 */
export const NavegaUnaSolaVez: Story = {
    render: () => <VueltaDeKeycloakDemo returnPath="/dashboard/reporteria" />,
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement)

        await expect(await canvas.findByRole('heading', { name: 'Página de reportería' })).toBeInTheDocument()

        await userEvent.click(canvas.getByRole('link', { name: 'CIE-10' }))

        await expect(await canvas.findByRole('heading', { name: 'Página de CIE-10' })).toBeInTheDocument()
        // Darle tiempo a cualquier efecto que quisiera regresar a reportería.
        await new Promise((resolve) => setTimeout(resolve, 200))
        await waitFor(() => expect(canvas.queryByRole('heading', { name: 'Página de reportería' })).toBeNull())
    },
}

/** Con rol de dashboard, el login que empezo en `/` termina en el dashboard. */
export const AdminVaAlDashboard: Story = {
    render: () => <VueltaDeKeycloakDemo returnPath="/" user={admin} />,
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement)
        await expect(await canvas.findByRole('heading', { name: 'Inicio del dashboard' })).toBeInTheDocument()
    },
}

/** El medico sin otro rol se queda en el registro de fichas. */
export const MedicoSeQuedaEnElRegistro: Story = {
    render: () => <VueltaDeKeycloakDemo returnPath="/" />,
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement)
        await expect(await canvas.findByRole('heading', { name: 'Callback' })).toBeInTheDocument()
        await new Promise((resolve) => setTimeout(resolve, 200))
        await waitFor(() => expect(canvas.queryByRole('heading', { name: 'Inicio del dashboard' })).toBeNull())
    },
}
