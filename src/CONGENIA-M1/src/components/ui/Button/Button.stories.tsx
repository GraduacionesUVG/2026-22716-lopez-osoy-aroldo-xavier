import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button } from './Button'

const meta: Meta<typeof Button> = {
    title: 'UI/Button',
    component: Button,
    tags: ['autodocs'],
    parameters: {
        viewport: { defaultViewport: 'mobile1' },
    },
}

export default meta
type Story = StoryObj<typeof Button>

export const Primary: Story = {
    args: {
        variant: 'primary',
        children: 'Finalizar registro',
        fullWidth: true,
    },
}

export const Secondary: Story = {
    args: {
        variant: 'secondary',
        children: 'Borrador',
        fullWidth: true,
    },
}

export const Destructive: Story = {
    args: {
        variant: 'destructive',
        children: 'X',
        size: 'sm',
    },
}

export const Ghost: Story = {
    args: {
        variant: 'ghost',
        children: '+ Agregar signo de alerta',
        fullWidth: true,
    },
}

export const Loading: Story = {
    args: {
        variant: 'primary',
        children: 'Guardando...',
        isLoading: true,
        fullWidth: true,
    },
}

export const Disabled: Story = {
    args: {
        variant: 'primary',
        children: 'Finalizar registro',
        disabled: true,
        fullWidth: true,
    },
}