import type { Meta, StoryObj } from '@storybook/react-vite'
import { SignaturePad } from './SignaturePad'

const meta: Meta<typeof SignaturePad> = {
    title: 'UI/SignaturePad',
    component: SignaturePad,
    tags: ['autodocs'],
    parameters: {
        viewport: { defaultViewport: 'mobile1' },
    },
}

export default meta
type Story = StoryObj<typeof SignaturePad>

export const Default: Story = {
    args: {
        label: 'Firma del Representante Legal',
        helperText: '(Espacio para Firma Electronica / Trazo en Pantalla)',
        clearLabel: 'Borrar firma',
        successText: 'Firma registrada',
        height: 130,
    },
}

/** Mano animada sobre el lienzo vacio. Desaparece con el primer trazo. */
export const ConPista: Story = {
    args: {
        label: 'Firma del Representante Legal',
        helperText: '',
        clearLabel: 'Borrar firma',
        successText: 'Firma registrada',
        height: 160,
        showHint: true,
    },
}

export const Disabled: Story = {
    args: {
        label: 'Firma del Representante Legal',
        helperText: '(Espacio para Firma Electronica / Trazo en Pantalla)',
        clearLabel: 'Borrar firma',
        successText: 'Firma registrada',
        height: 130,
        disabled: true,
    },
}
