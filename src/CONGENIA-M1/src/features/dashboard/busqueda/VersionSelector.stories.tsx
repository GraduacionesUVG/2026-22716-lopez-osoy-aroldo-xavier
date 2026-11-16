import type { Meta, StoryObj } from '@storybook/react-vite'
import type { FichaSummary } from '../../../services/ficha.service'
import { VersionSelector } from './VersionSelector'

/** Nada de esto es real; solo ejercita las etiquetas del selector. */
function version(overrides: Partial<FichaSummary> & Pick<FichaSummary, 'fichaId'>): FichaSummary {
    return {
        fichaRaizId: 'raiz-demo',
        revision: 1,
        estado: 'COMPLETA',
        estadoFicha: 'COMPLETA',
        fechaConsulta: '2026-03-12',
        esVigente: false,
        medico: 'Dra. Ruiz',
        ...overrides,
    }
}

const TRES_VERSIONES: FichaSummary[] = [
    version({ fichaId: 'v-1', revision: 1, fechaCreacion: '2026-03-12T15:04:00Z' }),
    version({ fichaId: 'v-2', revision: 2, fechaCreacion: '2026-06-03T09:20:00Z' }),
    version({ fichaId: 'v-3', revision: 3, esVigente: true, fechaCreacion: '2026-08-20T11:45:00Z' }),
]

const meta: Meta<typeof VersionSelector> = {
    title: 'Dashboard/VersionSelector',
    component: VersionSelector,
    parameters: { layout: 'padded' },
    args: {
        versiones: TRES_VERSIONES,
        fichaActivaId: 'v-3',
        onSeleccionar: () => {},
    },
}

export default meta
type Story = StoryObj<typeof VersionSelector>

export const TresVersiones: Story = {}

/** Una versión anterior abierta: la vigente sigue marcada como "(actual)". */
export const ViendoUnaVersionAnterior: Story = {
    args: { fichaActivaId: 'v-1' },
}

/** La adenda todavía espera en la bandeja del genetista, así que se avisa. */
export const ConRevisionPendiente: Story = {
    args: {
        versiones: [
            ...TRES_VERSIONES,
            version({ fichaId: 'v-4', revision: 4, estadoFicha: 'PENDIENTE' }),
        ],
    },
}

/**
 * Mientras el servidor no mande `fechaCreacion` las versiones se numeran a secas.
 * Ver `PENDIENTES-BACKEND.md`.
 */
export const SinFechasDelServidor: Story = {
    args: {
        versiones: TRES_VERSIONES.map((version) => ({ ...version, fechaCreacion: undefined })),
    },
}

/** Mientras carga la versión elegida, para no encadenar peticiones. */
export const Deshabilitado: Story = {
    args: { disabled: true },
}

/**
 * Lo más común: una ficha sin adendas. No se pinta nada - no hay nada que elegir.
 */
export const UnaSolaVersion: Story = {
    args: { versiones: [TRES_VERSIONES[0]], fichaActivaId: 'v-1' },
}
