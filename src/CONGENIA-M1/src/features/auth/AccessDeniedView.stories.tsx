import type { Meta, StoryObj } from '@storybook/react-vite'
import { AccessDeniedView } from './AccessDeniedView'

/**
 * En la aplicacion esta pantalla es dificil de alcanzar a proposito: hace falta
 * una sesion valida de Keycloak con una cuenta a la que le falte el rol. La
 * historia es la unica forma practica de revisarla.
 */
const meta: Meta<typeof AccessDeniedView> = {
    title: 'Auth/AccessDeniedView',
    component: AccessDeniedView,
    tags: ['autodocs'],
    parameters: { layout: 'fullscreen' },
}

export default meta
type Story = StoryObj<typeof AccessDeniedView>

export const SinRol: Story = {
    args: {
        displayName: 'Dr. Marco Paez',
        onLogout: () => undefined,
    },
}

/** Si el perfil OIDC llega sin `name` ni `preferred_username`. */
export const SinNombre: Story = {
    args: {
        onLogout: () => undefined,
    },
}
