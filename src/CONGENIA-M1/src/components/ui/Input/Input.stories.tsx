import type { Meta, StoryObj } from '@storybook/react-vite'
import { Input } from './Input'

const meta: Meta<typeof Input> = {
    title: 'UI/Input',
    component: Input,
    tags: ['autodocs'],
    parameters: {
        viewport: { defaultViewport: 'mobile1' },
    },
}

export default meta
type Story = StoryObj<typeof Input>

export const Default: Story = {
    args: {
        label: 'Nombre del médico evaluador',
        placeholder: 'Escriba el nombre...',
    },
}

export const Readonly: Story = {
    args: {
        label: 'Médico de la consulta',
        value: 'Dr. Nicolás Castro',
        readOnly: true,
    },
}

export const ReadonlyFecha: Story = {
    args: {
        label: 'Fecha inicial de consulta',
        value: '21 de Junio del 2023',
        readOnly: true,
    },
}

export const ConError: Story = {
    args: {
        label: 'Nombre del médico evaluador',
        placeholder: 'Escriba el nombre...',
        error: 'El nombre es requerido',
    },
}

export const ConHint: Story = {
    args: {
        label: 'Nombre del médico evaluador',
        placeholder: 'Escriba el nombre...',
        hint: 'Escriba el nombre completo del médico evaluador',
    },
}