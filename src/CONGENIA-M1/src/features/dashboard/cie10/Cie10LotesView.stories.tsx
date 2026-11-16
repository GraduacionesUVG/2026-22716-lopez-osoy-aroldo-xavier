import type { Meta, StoryObj } from '@storybook/react-vite'
import { Cie10LotesView } from './Cie10LotesView'
import type { ResumenLoteCie10 } from '../../../types/cie10'

function lote(partial: Partial<ResumenLoteCie10> & Pick<ResumenLoteCie10, 'runId' | 'periodo'>): ResumenLoteCie10 {
    return {
        status: 'PENDIENTE_REVISION',
        finishedAt: '2026-10-17T18:30:00.000Z',
        total: 87,
        pendientes: 75,
        confirmedAt: null,
        ...partial,
    }
}

const PENDIENTES = [
    lote({ runId: 'run-2026-10-17', periodo: '2026-09' }),
    lote({ runId: 'run-2026-09-16', periodo: '2026-08', finishedAt: '2026-09-16T17:05:00.000Z', total: 12, pendientes: 0 }),
]

const REVISADOS = [
    lote({
        runId: 'run-2026-08-14', periodo: '2026-07', status: 'CONFIRMADO', finishedAt: '2026-08-14T16:40:00.000Z',
        total: 18, pendientes: 0, confirmedAt: '2026-08-20T15:12:00.000Z',
    }),
    lote({
        runId: 'run-2026-07-15', periodo: '2026-06', status: 'CONFIRMADO', finishedAt: '2026-07-15T16:10:00.000Z',
        total: 15, pendientes: 0, confirmedAt: '2026-07-22T14:30:00.000Z',
    }),
    lote({
        runId: 'run-2026-02-12', periodo: '2026-01', status: 'CONFIRMADO', finishedAt: '2026-02-12T15:55:00.000Z',
        total: 9, pendientes: 0, confirmedAt: '2026-02-19T16:45:00.000Z',
    }),
]

const meta: Meta<typeof Cie10LotesView> = {
    title: 'Dashboard/Cie10LotesView',
    component: Cie10LotesView,
    parameters: { layout: 'padded' },
    args: {
        filtro: 'PENDIENTES',
        onFiltroChange: () => {},
        status: 'ready',
        onReintentar: () => {},
        lotes: PENDIENTES,
        total: PENDIENTES.length,
        counts: { pendientes: PENDIENTES.length, revisados: REVISADOS.length },
        page: 1,
        pageSize: 10,
        pages: 1,
        onCambiarPagina: () => {},
        onIrALote: () => {},
    },
}

export default meta
type Story = StoryObj<typeof Cie10LotesView>

/** La entrada: un lote por mes por revisar. El de agosto ya está todo revisado y solo falta confirmarlo. */
export const Pendientes: Story = {}

/** Los confirmados, con la fecha y quién los confirmó. */
export const Revisados: Story = {
    args: { filtro: 'REVISADOS', lotes: REVISADOS, total: REVISADOS.length },
}

export const Cargando: Story = {
    args: { status: 'loading', lotes: [], counts: undefined },
}

export const SinPendientes: Story = {
    args: { lotes: [], total: 0, counts: { pendientes: 0, revisados: 3 } },
}

export const SinRevisados: Story = {
    args: { filtro: 'REVISADOS', lotes: [], total: 0, counts: { pendientes: 2, revisados: 0 } },
}

export const ErrorDeCarga: Story = {
    args: { status: 'error', errorMessage: 'No hay conexión con el servidor.', lotes: [], counts: undefined },
}

/** Más lotes de los que caben en una página: Anterior, "Página 2 de 2" y Siguiente al pie. */
export const VariasPaginas: Story = {
    args: {
        filtro: 'REVISADOS',
        lotes: REVISADOS,
        total: 13,
        counts: { pendientes: 2, revisados: 13 },
        page: 2,
        pages: 2,
    },
}
