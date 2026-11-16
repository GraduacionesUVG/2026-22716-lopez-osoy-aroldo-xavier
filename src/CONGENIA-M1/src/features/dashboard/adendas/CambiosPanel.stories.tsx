import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { CambiosPanel } from './CambiosPanel'
import { ETIQUETA, type CambioSolicitado, type DecisionesPorCambio } from './cambios'

function imagen(texto: string, fondo: string): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320">
        <rect width="320" height="320" fill="${fondo}"/>
        <text x="160" y="165" font-family="Montserrat, sans-serif" font-size="20"
              font-weight="600" fill="#003E69" text-anchor="middle">${texto}</text>
    </svg>`
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const UNO: CambioSolicitado[] = [
    {
        id: 's-new-0',
        tipo: 'SIGNO',
        etiqueta: ETIQUETA.SIGNO,
        anterior: {
            id: 's-old-0',
            titulo: 'Dedo meñique torcido',
            imagenUrl: imagen('Anterior', '#E2E8F0'),
            chips: ['Mano', 'Extremidades superiores'],
        },
        nuevo: {
            id: 's-new-0',
            titulo: 'Clinodactilia del quinto dedo (mano izq.)',
            imagenUrl: imagen('Nuevo', '#D4F3FF'),
            chips: ['Mano', 'Extremidades superiores'],
        },
    },
]

const VARIOS: CambioSolicitado[] = [
    ...UNO,
    {
        id: 's-new-1',
        tipo: 'SIGNO',
        etiqueta: ETIQUETA.SIGNO,
        anterior: {
            id: 's-old-1',
            titulo: 'Paladar hendido',
            imagenUrl: imagen('Anterior', '#E2E8F0'),
            chips: ['Labio', 'Cabeza y cuello'],
        },
        nuevo: {
            id: 's-new-1',
            titulo: 'Hendidura palatina submucosa',
            imagenUrl: imagen('Nuevo', '#D4F3FF'),
            chips: ['Labio', 'Cabeza y cuello'],
        },
    },
    {
        id: 'e-new-2',
        tipo: 'EXAMEN',
        etiqueta: ETIQUETA.EXAMEN,
        nuevo: {
            id: 'e-new-2',
            titulo: 'Cariotipo (análisis cromosómico)',
            imagenUrl: imagen('Adjunto', '#D4F3FF'),
            chips: [],
        },
    },
]

/** Envoltorio con estado: el panel es controlado y sin esto no se puede tocar. */
function PanelInteractivo({ cambios }: { cambios: CambioSolicitado[] }) {
    const [indice, setIndice] = useState(0)
    const [decisiones, setDecisiones] = useState<DecisionesPorCambio>({})

    return (
        <div style={{ maxWidth: 400 }}>
            <CambiosPanel
                cambios={cambios}
                indice={indice}
                onIndiceChange={setIndice}
                decisiones={decisiones}
                onDecidir={(id, decision) => {
                    setDecisiones((previas) => ({ ...previas, [id]: decision }))
                    setIndice((actual) => Math.min(actual + 1, cambios.length - 1))
                }}
                onFocusRegistro={() => {}}
            />
        </div>
    )
}

const meta: Meta<typeof PanelInteractivo> = {
    title: 'Dashboard/CambiosPanel',
    component: PanelInteractivo,
    parameters: { layout: 'padded' },
}

export default meta
type Story = StoryObj<typeof PanelInteractivo>

/** Un solo cambio: las flechas y los puntos desaparecen. */
export const UnSoloCambio: Story = {
    args: { cambios: UNO },
}

/** Tres cambios: aparece la navegación, el contador y los puntos de progreso. */
export const VariosCambios: Story = {
    args: { cambios: VARIOS },
}

/** Un alta que no sustituye nada se pinta sin el bloque "Anterior". */
export const AltaSinSustitucion: Story = {
    args: { cambios: [VARIOS[2]] },
}
