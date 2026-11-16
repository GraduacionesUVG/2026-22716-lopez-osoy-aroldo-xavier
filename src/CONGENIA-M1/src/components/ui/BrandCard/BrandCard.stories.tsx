import type { Meta, StoryObj } from '@storybook/react-vite'
import { BrandCard } from './BrandCard'
import { AppTopBar } from '../AppTopBar/AppTopBar'

const meta: Meta<typeof BrandCard> = {
    title: 'UI/BrandCard',
    component: BrandCard,
    tags: ['autodocs'],
    parameters: {
        viewport: { defaultViewport: 'mobile1' },
        layout: 'fullscreen',
    },
}

export default meta
type Story = StoryObj<typeof BrandCard>

/** Modo 'centered': lo que usan LoadingView, ErrorView y AccessDeniedView. */
export const Default: Story = {
    render: () => (
        <BrandCard>
            <p style={{ textAlign: 'center' }}>Contenido de la pantalla</p>
        </BrandCard>
    ),
}

/** Modo 'split': el azul carga la marca y el titulo, la tarjeta solo el formulario. */
export const ConBarraYHero: Story = {
    parameters: { viewport: { defaultViewport: 'responsive' } },
    render: () => (
        <BrandCard
            layout="split"
            topBar={<AppTopBar userName="Dra. Pérez" onLogout={() => {}} />}
            hero={
                <div style={{ color: 'var(--color-white)' }}>
                    <h1 style={{ fontSize: '2rem', lineHeight: 1.2 }}>Título de la pantalla</h1>
                    <p style={{ marginTop: 10 }}>Texto de apoyo sobre el fondo de marca.</p>
                </div>
            }
        >
            <p style={{ textAlign: 'center' }}>Contenido de la tarjeta</p>
        </BrandCard>
    ),
}
