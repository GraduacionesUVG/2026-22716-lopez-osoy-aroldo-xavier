import type { Meta, StoryObj } from '@storybook/react-vite'
import { ErrorView } from './ErrorView'

const meta: Meta<typeof ErrorView> = {
    title: 'Forms/ErrorView',
    component: ErrorView,
    tags: ['autodocs'],
    parameters: {
        viewport: { defaultViewport: 'mobile1' },
        layout: 'fullscreen',
    },
}

export default meta
type Story = StoryObj<typeof ErrorView>

export const Default: Story = {
    args: {
        onRetry: () => console.log('reintentar'),
    },
}

export const ConDetalle: Story = {
    args: {
        ...Default.args,
        detail: 'No se pudo conectar con el servidor. Revise su conexión.',
    },
}

export const SesionInvalida: Story = {
    args: {
        ...Default.args,
        title: 'No se pudo abrir la ficha',
        message: 'Falta la sesión temporal de acceso.',
        retryLabel: 'Volver a la búsqueda',
    },
}
