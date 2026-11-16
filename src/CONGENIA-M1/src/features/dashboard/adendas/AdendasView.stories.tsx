import type { Meta, StoryObj } from '@storybook/react-vite'
import { AdendasView } from './AdendasView'
import type { AdendaResumen } from '../../../services/ficha.service'

function adenda(partial: Partial<AdendaResumen> & { fichaId: string }): AdendaResumen {
    return {
        fichaRaizId: `${partial.fichaId}-raiz`,
        revision: 2,
        estadoRevision: 'PENDIENTE',
        fechaSolicitud: '2026-07-07',
        medicoSolicitante: 'Marco Paez',
        motivoSolicitud: 'Corrección de las fotografías del hallazgo.',
        paciente: { nombre: 'Rachel Castro', historiaClinica: '00445566777', tenantId: '23' },
        ...partial,
    }
}

const PENDIENTES: AdendaResumen[] = [
    adenda({ fichaId: 'ad-001' }),
    adenda({ fichaId: 'ad-002', fechaSolicitud: '2026-07-05' }),
]

const meta: Meta<typeof AdendasView> = {
    title: 'Dashboard/AdendasView',
    component: AdendasView,
    parameters: { layout: 'padded' },
    args: {
        tab: 'pendientes',
        q: '',
        rango: { desde: '', hasta: '' },
        results: [],
        total: 0,
        hasMore: false,
        isLoadingMore: false,
        onTabChange: () => {},
        onQChange: () => {},
        onRangoChange: () => {},
        onSubmit: () => {},
        onLoadMore: () => {},
        onVerRegistro: () => {},
    },
}

export default meta
type Story = StoryObj<typeof AdendasView>

export const Cargando: Story = {
    args: { status: 'loading' },
}

/** La bandeja tal como la abre el revisor: lo que le falta por resolver. */
export const Pendientes: Story = {
    args: { status: 'ready', results: PENDIENTES, total: PENDIENTES.length },
}

export const Aprobadas: Story = {
    args: {
        tab: 'aprobadas',
        status: 'ready',
        results: [
            adenda({
                fichaId: 'ad-004',
                estadoRevision: 'APROBADA',
                paciente: { nombre: 'Luis Fernando Pérez', historiaClinica: '00445566780', tenantId: '23' },
            }),
        ],
        total: 1,
    },
}

/** Las rechazadas se listan igual que el resto: lo unico que cambia es el badge. */
export const Rechazadas: Story = {
    args: {
        tab: 'rechazadas',
        status: 'ready',
        results: [
            adenda({
                fichaId: 'ad-006',
                estadoRevision: 'RECHAZADA',
                medicoSolicitante: 'Jorge Similox',
                paciente: { nombre: 'Carlos Estuardo Godoy', historiaClinica: '00445566782', tenantId: '23' },
            }),
        ],
        total: 1,
    },
}

/** Nada por revisar no es un error: el vacío de pendientes es una buena noticia. */
export const SinPendientes: Story = {
    args: { status: 'ready', results: [], total: 0 },
}

/** Con término escrito, el vacío explica el límite de la búsqueda por nombre. */
export const SinResultadosDeBusqueda: Story = {
    args: { status: 'ready', q: 'Cast', results: [], total: 0 },
}

export const ConMasPaginas: Story = {
    args: { status: 'ready', results: PENDIENTES, total: 14, hasMore: true },
}

export const Error: Story = {
    args: { status: 'error', errorMessage: 'No hay conexión con el servidor.' },
}

/** Al volver de resolver una adenda, la bandeja confirma lo que pasó. */
export const ConAvisoDeGuardado: Story = {
    args: {
        tab: 'aprobadas',
        status: 'ready',
        results: [adenda({ fichaId: 'ad-004', estadoRevision: 'APROBADA' })],
        total: 1,
        notice: 'Adenda resuelta: 2 de 3 cambios aplicados.',
    },
}
