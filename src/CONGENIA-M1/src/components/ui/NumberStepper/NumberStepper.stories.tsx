import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { NumberStepper } from './NumberStepper'

const meta: Meta<typeof NumberStepper> = {
    title: 'UI/NumberStepper',
    component: NumberStepper,
    tags: ['autodocs'],
    parameters: {
        viewport: { defaultViewport: 'mobile1' },
    },
}

export default meta
type Story = StoryObj<typeof NumberStepper>

export const Default: Story = {
    args: {
        label: 'Menores',
        defaultValue: 0,
    },
}

export const WithLimits: Story = {
    args: {
        label: 'Adultos',
        defaultValue: 2,
        min: 0,
        max: 10,
        step: 1,
    },
}

export const Disabled: Story = {
    args: {
        label: 'Menores',
        defaultValue: 0,
        disabled: true,
    },
}

export const GroupExample: Story = {
    render: () => {
        const [menores, setMenores] = useState(0)
        const [adultos, setAdultos] = useState(0)

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-black)' }}>
                    Personas en el hogar
                </span>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <NumberStepper label="Menores" value={menores} min={0} onChange={setMenores} />
                    <NumberStepper label="Adultos" value={adultos} min={0} onChange={setAdultos} />
                </div>
            </div>
        )
    },
}
