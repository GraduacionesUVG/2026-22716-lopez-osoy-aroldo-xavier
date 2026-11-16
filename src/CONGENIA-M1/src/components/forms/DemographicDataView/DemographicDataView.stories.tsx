import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { DemographicDataView } from './DemographicDataView'
import type { FamiliarAfectadoGroup } from './DemographicDataView'
import type { RespuestaTernaria } from '../../../types/ficha'

const familiarAfectadoGroups: FamiliarAfectadoGroup[] = [
    {
        groupLabel: 'Núcleo familiar',
        options: [
            { value: 'madre',   label: 'Madre' },
            { value: 'padre',   label: 'Padre' },
            { value: 'hermano', label: 'Hermano' },
            { value: 'hermana', label: 'Hermana' },
        ],
    },
    {
        groupLabel: 'Línea materna',
        options: [
            { value: 'abuela_materna', label: 'Abuela materna' },
            { value: 'abuelo_materno', label: 'Abuelo materno' },
            { value: 'tia_materna',    label: 'Tía materna' },
            { value: 'tio_materno',    label: 'Tío materno' },
            { value: 'prima_materna',  label: 'Prima materna' },
            { value: 'primo_materno',  label: 'Primo materno' },
        ],
    },
    {
        groupLabel: 'Línea paterna',
        options: [
            { value: 'abuela_paterna', label: 'Abuela paterna' },
            { value: 'abuelo_paterno', label: 'Abuelo paterno' },
            { value: 'tia_paterna',    label: 'Tía paterna' },
            { value: 'tio_paterno',    label: 'Tío paterno' },
            { value: 'prima_paterna',  label: 'Prima paterna' },
            { value: 'primo_paterno',  label: 'Primo paterno' },
        ],
    },
    {
        groupLabel: 'Otros',
        options: [
            { value: 'otro_familiar', label: 'Otro familiar' },
            { value: 'desconoce',     label: 'Desconoce' },
        ],
    },
]

const meta: Meta<typeof DemographicDataView> = {
    title: 'Forms/DemographicDataView',
    component: DemographicDataView,
    tags: ['autodocs'],
    parameters: {
        viewport: { defaultViewport: 'mobile1' },
    },
    args: {
        familiarAfectadoGroups,
        isOpen: true,
        onToggle: () => {},
    },
}

export default meta
type Story = StoryObj<typeof DemographicDataView>

export const Default: Story = {}
/**
 * Ficha ya registrada. El aviso de irreversibilidad desaparece: los controles
 * bloqueados ya dicen que no se puede tocar, y repetirlo seria ruido.
 */
export const SoloLectura: Story = {
    args: { readOnly: true },
}


export const Incompleto: Story = {
    args: {
        showValidation: true,
    },
}

export const EnProceso: Story = {
    args: {
        familiaresAfectados: 1,
        quienAfectado: ['madre', 'hermano'],
    },
}

export const Completado: Story = {
    args: {
        familiaresAfectados: 1,
        menoresEnHogar: 2,
        adultosEnHogar: 1,
        quienAfectado: ['madre', 'hermano'],
        afectadosComunidad: 0,
    },
}

export const Interactivo: Story = {
    render: (args) => {
        const [isOpen, setIsOpen] = useState(true)
        const [familiaresAfectados, setFamiliaresAfectados] = useState<RespuestaTernaria | null>(null)
        const [menoresEnHogar, setMenoresEnHogar] = useState<number | undefined>(undefined)
        const [adultosEnHogar, setAdultosEnHogar] = useState<number | undefined>(undefined)
        const [quienAfectado, setQuienAfectado] = useState<string[]>([])
        const [afectadosComunidad, setAfectadosComunidad] = useState<RespuestaTernaria | null>(null)
        const [showValidation, setShowValidation] = useState(false)

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <DemographicDataView
                    {...args}
                    isOpen={isOpen}
                    onToggle={() => setIsOpen((prev) => !prev)}
                    familiaresAfectados={familiaresAfectados}
                    menoresEnHogar={menoresEnHogar}
                    adultosEnHogar={adultosEnHogar}
                    quienAfectado={quienAfectado}
                    afectadosComunidad={afectadosComunidad}
                    onFamiliaresAfectadosChange={setFamiliaresAfectados}
                    onMenoresEnHogarChange={setMenoresEnHogar}
                    onAdultosEnHogarChange={setAdultosEnHogar}
                    onQuienAfectadoChange={setQuienAfectado}
                    onAfectadosComunidadChange={setAfectadosComunidad}
                    showValidation={showValidation}
                />
                <button
                    type="button"
                    onClick={() => setShowValidation(true)}
                    style={{
                        padding: '10px 16px',
                        borderRadius: 'var(--radius)',
                        border: '1.5px solid var(--color-primary)',
                        background: 'var(--color-primary)',
                        color: 'var(--color-white)',
                        fontFamily: 'var(--font-family)',
                        fontSize: 'var(--font-size-sm)',
                        fontWeight: 600,
                        cursor: 'pointer',
                    }}
                >
                    Enviar sección
                </button>
            </div>
        )
    },
}