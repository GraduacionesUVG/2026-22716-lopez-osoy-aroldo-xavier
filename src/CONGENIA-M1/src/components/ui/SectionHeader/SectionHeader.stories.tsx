import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { SectionHeader } from './SectionHeader'

const meta: Meta<typeof SectionHeader> = {
    title: 'UI/SectionHeader',
    component: SectionHeader,
    tags: ['autodocs'],
    parameters: {
        viewport: { defaultViewport: 'mobile1' },
    },
}

export default meta
type Story = StoryObj<typeof SectionHeader>

export const Default: Story = {
    args: {
        title: 'Datos de la Consulta',
        progressCurrent: 0,
        progressTotal: 3,
        status: 'default',
        isOpen: true,
        onToggle: () => {},
    },
}

export const InProgress: Story = {
    args: {
        title: 'Datos de la Consulta',
        progressCurrent: 1,
        progressTotal: 3,
        status: 'in-progress',
        isOpen: true,
        onToggle: () => {},
    },
}

export const Completed: Story = {
    args: {
        title: 'Datos de la Consulta',
        progressCurrent: 3,
        progressTotal: 3,
        status: 'completed',
        isOpen: true,
        onToggle: () => {},
    },
}


export const Incomplete: Story = {
    args: {
        title: 'Datos de la Consulta',
        progressCurrent: 0,
        progressTotal: 3,
        status: 'incomplete',
        isOpen: true,
        onToggle: () => {},
    },
}

/**
 * Secciones que no llevan cuenta de completitud -listados como Signos de Alerta o
 * Estudios de Gabinete, y las bloqueadas en solo lectura-: sin indicador, porque
 * el circulo vacio se leia como "pendiente" sin que hubiera nada que llenar.
 */
export const SinIndicador: Story = {
    args: {
        title: 'Signos de Alerta',
        isOpen: true,
        onToggle: () => {},
    },
}

export const ExpandableMock: Story = {
    render: () => {
        const [isOpen, setIsOpen] = useState(true)

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                <div
                    style={{
                        border: isOpen ? '1.5px solid var(--color-border)' : '1.5px solid var(--color-border)',
                        borderRadius: 'var(--radius-lg)',
                        overflow: 'hidden',
                        background: 'var(--color-surface)',
                    }}
                >
                    <SectionHeader
                        title="Datos de la Consulta"
                        progressCurrent={1}
                        progressTotal={3}
                        status="in-progress"
                        isOpen={isOpen}
                        onToggle={() => setIsOpen((prev) => !prev)}
                        embedded
                    />
                    {isOpen && (
                        <div
                            style={{
                                borderTop: '1.5px solid var(--color-border)',
                                padding: '12px 14px',
                                color: 'var(--color-gray)',
                                fontSize: 'var(--font-size-sm)',
                            }}
                        >
                            Contenido de la seccion (mock)
                        </div>
                    )}
                </div>
            </div>
        )
    },
}
