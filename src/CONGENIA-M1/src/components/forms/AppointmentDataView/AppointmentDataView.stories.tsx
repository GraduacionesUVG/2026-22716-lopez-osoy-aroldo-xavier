import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { AppointmentDataView } from './ApointmentDataView'
import type { DropdownOption } from '../../ui/Dropdown/Dropdown'

const meta: Meta<typeof AppointmentDataView> = {
    title: 'Forms/AppointmentDataView',
    component: AppointmentDataView,
    tags: ['autodocs'],
    parameters: {
        viewport: { defaultViewport: 'mobile1' },
    },
    args: {
        fechaConsulta: '21 de Junio del 2026',
        medicoConsulta: 'Dr. Nicolás Castro',
        especialidad: 'Genética Clínica',
        diagnosticos: 'Síndrome de down, malformación de ojos',
        referidoDeOptions: [
            { value: 'medico_general', label: 'Médico General' },
            { value: 'pediatra', label: 'Pediatra' },
            { value: 'neonatologo', label: 'Neonatólogo' },
            { value: 'genetista', label: 'Genetista' },
            { value: 'otro', label: 'Otro' },
            { value: 'ninguno', label: 'Ninguno' },
        ] satisfies DropdownOption[],
        lugarDePartoOptions: [
            { value: 'medico', label: 'Con médico' },
            { value: 'comadrona', label: 'Comadrona' },
            { value: 'familiar', label: 'Familiar' },
            { value: 'solo', label: 'Solo' },
            { value: 'otro', label: 'Otro' },
        ] satisfies DropdownOption[],
        sexoOptions: [
            { value: '1', label: 'Masculino' },
            { value: '2', label: 'Femenino' },
            { value: '3', label: 'Indeterminado' },
        ] satisfies DropdownOption[],
        isOpen: true,
        onToggle: () => {},
    },
}

export default meta
type Story = StoryObj<typeof AppointmentDataView>

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
        referidoDe: 'pediatra',
    },
}

export const Completado: Story = {
    args: {
        referidoDe: 'pediatra',
        lugarDeParto: 'medico',
        sexo: '2',
    },
}

export const Interactivo: Story = {
    render: (args) => {
        const [isOpen, setIsOpen] = useState(true)
        const [referidoDe, setReferidoDe] = useState('')
        const [lugarDeParto, setLugarDeParto] = useState('')
        const [sexo, setSexo] = useState('')
        const [showValidation, setShowValidation] = useState(false)

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <AppointmentDataView
                    {...args}
                    isOpen={isOpen}
                    onToggle={() => setIsOpen((prev) => !prev)}
                    referidoDe={referidoDe}
                    lugarDeParto={lugarDeParto}
                    sexo={sexo}
                    onReferidoDeChange={setReferidoDe}
                    onLugarDePartoChange={setLugarDeParto}
                    onSexoChange={setSexo}
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
                    Enviar Sección
                </button>
            </div>
        )
    },
}