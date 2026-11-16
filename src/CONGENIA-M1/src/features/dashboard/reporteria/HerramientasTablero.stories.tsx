import type { Meta, StoryObj } from '@storybook/react-vite'
import { HerramientasTablero } from './HerramientasTablero'

const meta: Meta<typeof HerramientasTablero> = {
    title: 'Dashboard/HerramientasTablero',
    component: HerramientasTablero,
    parameters: { layout: 'padded' },
    // El cambio a "Opciones" depende del ancho del tablero, no de la ventana:
    // aquí el contenedor hace ese papel.
    decorators: [(Story, { parameters }) => (
        <div style={{ containerType: 'inline-size', width: parameters.ancho ?? 720 }}>
            <Story />
        </div>
    )],
    args: {
        nombreTablero: 'Producción ambulatoria',
        tarjetasAgente: 3,
        pdfDisponible: true,
        generandoPdf: false,
        onExportar: () => {},
        onImportar: () => {},
        onDescargarPdf: () => {},
        onBorrar: () => {},
    },
}

export default meta
type Story = StoryObj<typeof HerramientasTablero>

export const Escritorio: Story = {}

/** Sin tarjetas del agente no hay qué borrar. */
export const SinTarjetas: Story = {
    args: { tarjetasAgente: 0 },
}

export const GenerandoPdf: Story = {
    args: { generandoPdf: true },
}

/** Mientras cargan las secciones el PDF saldría con esqueletos. */
export const Cargando: Story = {
    args: { pdfDisponible: false },
}

/** Tablero angosto: las cuatro acciones pasan a la hoja de "Opciones". */
export const Angosto: Story = {
    parameters: { ancho: 340 },
}
