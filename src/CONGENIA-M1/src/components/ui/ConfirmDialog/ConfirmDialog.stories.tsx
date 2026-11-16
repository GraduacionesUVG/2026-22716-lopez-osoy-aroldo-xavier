import type { Meta, StoryObj } from '@storybook/react-vite'
import { ConfirmDialog } from './ConfirmDialog'

const meta: Meta<typeof ConfirmDialog> = {
    title: 'UI/ConfirmDialog',
    component: ConfirmDialog,
    tags: ['autodocs'],
    parameters: {
        viewport: { defaultViewport: 'mobile1' },
    },
    args: {
        isOpen: true,
        onConfirm: () => {},
        onCancel: () => {},
    },
}

export default meta
type Story = StoryObj<typeof ConfirmDialog>

export const CerrarSesion: Story = {
    args: {
        title: '¿Está seguro de salir?',
        message: 'Se cerrará su sesión. Si tiene una ficha a medio capturar, se perderá lo que no haya guardado.',
        confirmLabel: 'Sí, cerrar sesión',
    },
}

export const SalirDeLaFicha: Story = {
    args: {
        title: '¿Está seguro de salir?',
        message: 'Se perderá lo que lleva capturado en esta ficha, incluida la firma.',
        confirmLabel: 'Sí, salir',
    },
}

export const Eliminar: Story = {
    args: {
        title: '¿Eliminar este signo de alerta?',
        message: '«Dedo meñique torcido» se eliminará junto con su fotografía. Esta acción no se puede deshacer.',
        confirmLabel: 'Sí, eliminar',
        tone: 'destructive',
    },
}

/** Sin `message`: solo la pregunta, cuando la consecuencia ya es obvia. */
export const SoloTitulo: Story = {
    args: {
        title: '¿Descartar los cambios?',
        confirmLabel: 'Sí, descartar',
        tone: 'destructive',
    },
}
