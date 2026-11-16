/**
 * @fileoverview Observaciones: texto libre del medico, varias por ficha.
 */

import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { ObservationsSection, type ObservacionItem } from './ObservationsSection'

const meta: Meta<typeof ObservationsSection> = {
    title: 'forms/ObservationsSection',
    component: ObservationsSection,
    tags: ['autodocs'],
    parameters: {
        viewport: { defaultViewport: 'mobile1' },
    },
}

export default meta
type Story = StoryObj<typeof ObservationsSection>

const registradas: ObservacionItem[] = [
    {
        id: 'obs-1',
        text:
            'La madre refiere que un primo materno presentó rasgos similares al nacer.\n' +
            'Se sugiere valorar interconsulta con genética en el próximo control.',
        fecha: '10 sep 2026',
        locked: true,
    },
]

function Interactiva({ iniciales = [], ...props }: { iniciales?: ObservacionItem[] } & Partial<Parameters<typeof ObservationsSection>[0]>) {
    const [items, setItems] = useState<ObservacionItem[]>(iniciales)

    return (
        <ObservationsSection
            {...props}
            items={items}
            onAdd={(item) => setItems((prev) => [...prev, item])}
            onRemove={(id) => setItems((prev) => prev.filter((item) => item.id !== id))}
        />
    )
}

/** Ficha nueva, ya firmada: se agregan y se quitan libremente. */
export const Default: Story = {
    render: () => <Interactiva />,
}

/** Sin firma del consentimiento la seccion no deja capturar, igual que signos y examenes. */
export const SinFirma: Story = {
    render: () => <Interactiva disabled />,
}

/** Ficha registrada: se leen, no se agregan ni se quitan. */
export const SoloLectura: Story = {
    render: () => <Interactiva iniciales={registradas} readOnly />,
}

/** Solo lectura y sin observaciones: se dice, en vez de dejar un hueco. */
export const SoloLecturaVacia: Story = {
    render: () => <Interactiva readOnly />,
}

/** Adenda: las registradas quedan bloqueadas y se pueden sumar nuevas. */
export const Adenda: Story = {
    render: () => <Interactiva iniciales={registradas} />,
}
