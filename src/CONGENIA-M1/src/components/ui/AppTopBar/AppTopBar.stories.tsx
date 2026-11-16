import type { Meta, StoryObj } from '@storybook/react-vite'
import { AppTopBar } from './AppTopBar'

const meta: Meta<typeof AppTopBar> = {
    title: 'UI/AppTopBar',
    component: AppTopBar,
    tags: ['autodocs'],
    parameters: {
        layout: 'fullscreen',
    },
    decorators: [
        // La barra es transparente: sin el azul detras no se ve nada.
        (Story) => (
            <div style={{ background: 'var(--color-primary)', minHeight: '160px' }}>
                <Story />
            </div>
        ),
    ],
}

export default meta
type Story = StoryObj<typeof AppTopBar>

export const Default: Story = {
    args: {
        userName: 'Dra. Pérez',
        onLogout: () => console.log('logout'),
    },
}

/** Verifica el truncado con elipsis antes de que la barra desborde. */
export const NombreLargo: Story = {
    args: {
        ...Default.args,
        userName: 'Dra. María Fernanda Castro Morales de la Vega',
    },
}

/** Con rol de dashboard: aparece el boton para volver al panel. */
export const ConDashboard: Story = {
    args: {
        ...Default.args,
        onGoToDashboard: () => console.log('dashboard'),
    },
}

/** Entrada desde SADC con ?sessionToken=: no hay sesion propia que mostrar. */
export const SinSesion: Story = {
    args: {},
}
