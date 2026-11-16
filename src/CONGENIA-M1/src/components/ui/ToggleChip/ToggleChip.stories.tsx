import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { ToggleChip } from './ToggleChip'

const meta: Meta<typeof ToggleChip> = {
    title: 'UI/ToggleChip',
    component: ToggleChip,
    tags: ['autodocs'],
    parameters: {
        viewport: { defaultViewport: 'mobile1' },
    },
}

export default meta
type Story = StoryObj<typeof ToggleChip>

const opciones = [
    'Madre',
    'Padre',
    'Hermano(a)',
    'Abuelo(a) materno',
    'Abuelo(a) paterno',
    'Tío(a) materno',
    'Tío(a) paterno',
    'Primo(a)',
    'Otro familiar',
    'Ninguno',
]

export const Default: Story = {
    args: {
        children: 'Madre',
    },
}

export const Selected: Story = {
    args: {
        children: 'Padre',
        selected: true,
    },
}

export const GroupSingleSelect: Story = {
    render: () => {
        const [selected, setSelected] = useState<string>('Padre')

        return (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {opciones.map((label) => (
                    <ToggleChip
                        key={label}
                        selected={selected === label}
                        onClick={() => setSelected(label)}
                    >
                        {label}
                    </ToggleChip>
                ))}
            </div>
        )
    },
}

export const GroupMultiSelect: Story = {
    render: () => {
        const [selected, setSelected] = useState<string[]>(['Madre', 'Hermano(a)'])

        const toggle = (label: string) => {
            setSelected((prev) =>
                prev.includes(label) ? prev.filter((item) => item !== label) : [...prev, label]
            )
        }

        return (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {opciones.map((label) => (
                    <ToggleChip
                        key={label}
                        selected={selected.includes(label)}
                        onClick={() => toggle(label)}
                    >
                        {label}
                    </ToggleChip>
                ))}
            </div>
        )
    },
}

export const Disabled: Story = {
    args: {
        children: 'Ninguno',
        disabled: true,
    },
}
