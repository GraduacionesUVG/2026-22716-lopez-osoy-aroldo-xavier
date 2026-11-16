import type { Meta, StoryObj } from '@storybook/react-vite'
import { LoadingView } from './LoadingView'

const meta: Meta<typeof LoadingView> = {
    title: 'Forms/LoadingView',
    component: LoadingView,
    tags: ['autodocs'],
    parameters: {
        viewport: { defaultViewport: 'mobile1' },
        layout: 'fullscreen',
    },
}

export default meta
type Story = StoryObj<typeof LoadingView>

export const Default: Story = {}

export const ConMensaje: Story = {
    args: { message: 'Abriendo la ficha' },
}
