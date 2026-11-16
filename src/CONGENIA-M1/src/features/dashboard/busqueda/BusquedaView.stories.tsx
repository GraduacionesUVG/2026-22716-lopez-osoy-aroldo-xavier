import type { Meta, StoryObj } from '@storybook/react-vite'
import { BusquedaView } from './BusquedaView'
import { MOCK_FICHAS } from '../../../services/fichaSearch.mock'

const meta: Meta<typeof BusquedaView> = {
    title: 'Dashboard/BusquedaView',
    component: BusquedaView,
    parameters: { layout: 'padded' },
    args: {
        q: '',
        rango: { desde: '', hasta: '' },
        results: [],
        total: 0,
        hasMore: false,
        isLoadingMore: false,
        onQChange: () => {},
        onRangoChange: () => {},
        onSubmit: () => {},
        onLoadMore: () => {},
        onVerRegistro: () => {},
    },
}

export default meta
type Story = StoryObj<typeof BusquedaView>

/** Antes de la primera búsqueda: invita en vez de mostrar una rejilla vacía. */
export const Inicial: Story = {
    args: { status: 'idle' },
}

export const Cargando: Story = {
    args: { status: 'loading' },
}

export const ConResultados: Story = {
    args: {
        status: 'ready',
        results: [...MOCK_FICHAS].slice(0, 12),
        total: MOCK_FICHAS.length,
        hasMore: true,
    },
}

/** Última página: sin "Cargar más", el contador cierra la lista. */
export const ResultadosCompletos: Story = {
    args: {
        status: 'ready',
        results: [...MOCK_FICHAS],
        total: MOCK_FICHAS.length,
        hasMore: false,
    },
}

export const SinResultados: Story = {
    args: {
        status: 'ready',
        q: 'paciente que no existe',
        results: [],
        total: 0,
    },
}

export const ConError: Story = {
    args: {
        status: 'error',
        errorMessage: 'No hay conexión con el servidor.',
    },
}

/** El rango invertido se ataja antes de llamar al servicio. */
export const RangoInvalido: Story = {
    args: {
        status: 'idle',
        rango: { desde: '2026-08-01', hasta: '2026-01-01' },
        rangoError: 'La fecha inicial no puede ser posterior a la final.',
    },
}
