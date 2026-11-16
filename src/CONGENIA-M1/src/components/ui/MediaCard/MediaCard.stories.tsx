import type { Meta, StoryObj } from '@storybook/react-vite'
import { MediaCard } from './MediaCard'
import hero from '../../../assets/react.svg'

const meta: Meta<typeof MediaCard> = {
    title: 'UI/MediaCard',
    component: MediaCard,
    tags: ['autodocs'],
    parameters: {
        viewport: { defaultViewport: 'mobile1' },
    },
}

export default meta
type Story = StoryObj<typeof MediaCard>

export const WithChips: Story = {
    args: {
        title: 'Dedo menique torcido',
        imageSrc: hero,
        chips: ['Mano izq.'],
        onRemove: () => {},
    },
}

export const WithoutChips: Story = {
    args: {
        title: 'Cariotipo (analisis cromosomico)',
        imageSrc: hero,
        onRemove: () => {},
    },
}

export const WithoutImage: Story = {
    args: {
        title: 'Radiografía de torax',
        status: 'active',
        onRemove: () => {},
    },
}
