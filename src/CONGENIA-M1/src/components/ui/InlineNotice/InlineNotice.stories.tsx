/**
 * @fileoverview Aviso informativo en linea.
 *
 * Se creo para las secciones que quedan congeladas al finalizar el registro, pero
 * es generico: cualquier seccion puede explicar una regla sin recurrir a un toast
 * ni a un modal, que interrumpen.
 */

import type { Meta, StoryObj } from '@storybook/react-vite'
import { InlineNotice } from './InlineNotice'
import { AVISO_IMAGEN_MENOR, AVISO_SECCION_IRREVERSIBLE } from '../../forms/avisos'

const meta: Meta<typeof InlineNotice> = {
    title: 'UI/InlineNotice',
    component: InlineNotice,
    tags: ['autodocs'],
    parameters: {
        viewport: { defaultViewport: 'mobile1' },
    },
    decorators: [
        (Story) => (
            <div style={{ maxWidth: 360 }}>
                <Story />
            </div>
        ),
    ],
}

export default meta
type Story = StoryObj<typeof InlineNotice>

/** El aviso real de la ficha: marca que la seccion no admite adenda. */
export const Irreversible: Story = {
    args: { children: AVISO_SECCION_IRREVERSIBLE },
}

/** Tono informativo con un texto corto, para ver el aviso de una sola linea. */
export const Info: Story = {
    args: { children: 'Los datos de la consulta los envia el SADC.' },
}

/** Tono ambar: el aviso real que sale antes de fotografiar a un menor. */
export const Advertencia: Story = {
    args: { tone: 'warning', children: AVISO_IMAGEN_MENOR },
}

/** Tono rojo: un bloqueo que el medico no puede resolver por su cuenta. */
export const Peligro: Story = {
    args: {
        tone: 'danger',
        children: 'No tiene instituciones asignadas. Contacte al administrador.',
    },
}

/** Un texto largo no debe descolocar el icono: se alinea con la primera linea. */
export const TextoLargo: Story = {
    args: {
        children: 'Esta sección concentra los datos demográficos del núcleo familiar del paciente'
            + ' y de su comunidad. Revísala con calma antes de finalizar, porque una vez enviado'
            + ' el registro queda fijada y el flujo de adendas no admite correcciones sobre ella.',
    },
}
