import type { Meta, StoryObj } from '@storybook/react-vite'
import { PagePlaceholder } from './PagePlaceholder'

const meta: Meta<typeof PagePlaceholder> = {
    title: 'UI/PagePlaceholder',
    component: PagePlaceholder,
    tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof PagePlaceholder>

/** Como se ve dentro del dashboard: el titulo lo pone la cabecera del layout. */
export const SoloDescripcion: Story = {
    args: {
        description: 'Reportes y exportaciones sobre las fichas registradas.',
    },
}

/** Con titulo propio, para usarlo fuera del dashboard. */
export const ConTitulo: Story = {
    args: {
        title: 'Búsqueda',
        description: 'Consulta de pacientes y fichas ya registradas.',
    },
}

export const NotaPropia: Story = {
    args: {
        description: 'Revisión y corrección de los códigos CIE-10 asignados a las fichas.',
        note: 'Aquí iría la tabla de códigos pendientes de revisar',
    },
}
