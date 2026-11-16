import type { Meta, StoryObj } from '@storybook/react-vite'
import { ErrorBoundary } from './ErrorBoundary'
import { ErrorView } from '../../forms/ErrorView/ErrorView'

const meta: Meta<typeof ErrorBoundary> = {
    title: 'UI/ErrorBoundary',
    component: ErrorBoundary,
    tags: ['autodocs'],
    parameters: {
        viewport: { defaultViewport: 'mobile1' },
        layout: 'fullscreen',
    },
}

export default meta
type Story = StoryObj<typeof ErrorBoundary>

function ComponenteQueRevienta(): never {
    throw new Error('Fallo simulado durante el render')
}

export const AtrapaElError: Story = {
    render: () => (
        <ErrorBoundary fallback={() => <ErrorView onRetry={() => console.log('recargar')} />}>
            <ComponenteQueRevienta />
        </ErrorBoundary>
    ),
}
