import type { Meta, StoryObj } from '@storybook/react-vite'
import { Dropdown } from './Dropdown'

const meta: Meta<typeof Dropdown> = {
    title: 'UI/Dropdown',
    component: Dropdown,
    tags: ['autodocs'],
    parameters: {
        viewport: { defaultViewport: 'mobile1' },
    },
}

export default meta
type Story = StoryObj<typeof Dropdown>

const referralOptions = [
    { value: 'hospital', label: 'Hospital Nacional' },
    { value: 'igss', label: 'IGSS' },
    { value: 'privado', label: 'Clínica Privada' },
]

export const Default: Story = {
    args: {
        label: 'Referido de',
        placeholder: 'Seleccione quién lo refirió...',
        options: referralOptions,
    },
}

export const ConValor: Story = {
    args: {
        label: 'Asistencia al parto',
        placeholder: 'Seleccione la asistencia al parto...',
        options: [
            { value: 'medico', label: 'Médico' },
            { value: 'enfermera', label: 'Enfermera' },
            { value: 'comadrona', label: 'Comadrona' },
        ],
        defaultValue: 'medico',
    },
}

export const ConError: Story = {
    args: {
        label: 'Asistencia al parto',
        placeholder: 'Seleccione la asistencia al parto...',
        options: [
            { value: 'medico', label: 'Médico' },
            { value: 'enfermera', label: 'Enfermera' },
        ],
        error: 'Este campo es requerido',
    },
}

export const ConHint: Story = {
    args: {
        label: 'Asistencia al parto',
        placeholder: 'Seleccione la asistencia al parto...',
        options: [
            { value: 'medico', label: 'Médico' },
            { value: 'enfermera', label: 'Enfermera' },
            { value: 'comadrona', label: 'Comadrona' },
        ],
        hint: 'Seleccione una opción válida',
    },
}

export const Disabled: Story = {
    args: {
        label: 'Referido de',
        placeholder: 'Seleccione quién lo refirió...',
        options: referralOptions,
        disabled: true,
    },
}
