import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { AlertSignsSection, type AlertSignItem } from './AlertSignsSection'
import hero from '../../../assets/react.svg'

const meta: Meta<typeof AlertSignsSection> = {
    title: 'forms/AlertSignsSection',
    component: AlertSignsSection,
    tags: ['autodocs'],
    parameters: {
        viewport: { defaultViewport: 'mobile1' },
    },
}

export default meta
type Story = StoryObj<typeof AlertSignsSection>

const initialItems: AlertSignItem[] = [
    {
        id: 'signo-1',
        title: 'Dedo menique torcido',
        imageSrc: hero,
        chips: ['Mano izq.'],
    },
    {
        id: 'signo-2',
        title: 'Paladar Hendido',
        imageSrc: hero,
        chips: ['Cara'],
    },
]

export const Default: Story = {
    render: () => {
        const [items, setItems] = useState(initialItems)

        const handleRemove = (id: string) => {
            setItems((prev) => prev.filter((item) => item.id !== id))
        }

        return (
            <AlertSignsSection
                title="Signos de Alerta"
                items={items}
                onRemove={handleRemove}
            />
        )
    },
}

/** Una ficha ya registrada: todo bloqueado y marcado con su vigencia. */
const storedItems: AlertSignItem[] = [
    { id: 'signo-1', title: 'Dedo menique torcido', imageSrc: hero, chips: ['Mano izq.'], locked: true },
    { id: 'signo-2', title: 'Paladar Hendido', imageSrc: hero, chips: ['Cara'], locked: true },
    { id: 'signo-3', title: 'Foto sustituida', imageSrc: hero, chips: ['Pie der.'], locked: true, status: 'replaced' },
]

export const FichaRegistrada: Story = {
    args: { items: storedItems, readOnly: true },
}

/** En una adenda solo se agrega, y el alta puede declarar a que signo sustituye. */
export const Adenda: Story = {
    render: () => {
        const [items, setItems] = useState<AlertSignItem[]>(storedItems)
        return (
            <AlertSignsSection
                items={items}
                allowReplacement
                onAdd={(item) => setItems((prev) => [...prev, item])}
                onRemove={(id) => setItems((prev) => prev.filter((item) => item.locked || item.id !== id))}
            />
        )
    },
}

/**
 * El aviso de imagen de un menor sale en el paso 2, antes de disparar: es el unico
 * momento en que el encuadre todavia se puede decidir.
 *
 * No dice "evita el rostro" a proposito. El consentimiento pide expresamente fotos
 * de rostro, porque algunas enfermedades geneticas se reconocen por rasgos faciales.
 */
export const AvisoAlFotografiarUnMenor: Story = {
    ...Default,
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement)
        await userEvent.click(canvas.getByRole('button', { name: /Agregar signo de alerta/ }))

        // Paso 1: region y parte del cuerpo
        await userEvent.click(canvas.getByRole('button', { name: 'Cabeza y cuello' }))
        await userEvent.click(canvas.getByRole('button', { name: 'Cráneo' }))
        await userEvent.click(canvas.getByRole('button', { name: /Siguiente/ }))

        // Paso 2: la captura, con el aviso ya visible
        await expect(canvas.getByText('Tome una foto del hallazgo clínico')).toBeInTheDocument()
        await expect(canvas.getByText(/Imagen clínica de un menor/)).toBeInTheDocument()
    },
}

/** El paso de sustitucion solo lista los signos vigentes, nunca el ya sustituido. */
export const AdendaPreguntaPorSustitucion: Story = {
    ...Adenda,
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement)
        await userEvent.click(canvas.getByRole('button', { name: /Agregar signo de alerta/ }))
        await expect(canvas.getByText('Paso 1 de 4')).toBeInTheDocument()
    },
}
