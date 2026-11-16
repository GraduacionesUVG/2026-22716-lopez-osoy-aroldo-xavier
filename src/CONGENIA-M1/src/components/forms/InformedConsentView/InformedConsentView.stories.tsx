import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { InformedConsentView } from './InformedConsentView'

const datosDelSADC = {
    nombrePaciente: 'Juan Alberto Pérez García',
    numeroExpediente: '12343546665555',
}

const datosGeneradosPorBackend = {
    codigoDocumento: 'CNS-2026-00312',
    fechaHora: '24/03/2026 10:45 AM',
}

const meta: Meta<typeof InformedConsentView> = {
    title: 'Forms/InformedConsentView',
    component: InformedConsentView,
    tags: ['autodocs'],
    parameters: {
        viewport: { defaultViewport: 'mobile1' },
    },
    args: {
        ...datosDelSADC,
        isOpen: true,
        onToggle: () => {},
    },
}

export default meta
type Story = StoryObj<typeof InformedConsentView>

// Firma de ejemplo: un PNG de 1x1 basta para que la seccion se de por firmada.
const firmaDeEjemplo =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

const todasLasDeclaraciones = {
    'autorizacion-principal': true,
    'contacto-futuro': true,
    'aceptacion-final': true,
}

/** Sin firmar: la seccion solo ofrece el boton que abre el modal. */
export const Default: Story = {}

/** El medico intento finalizar sin firmar. */
export const Incompleto: Story = {
    args: {
        showValidation: true,
    },
}

/** Ya firmado: solo la confirmacion, sin repetir lo capturado. */
export const Firmado: Story = {
    args: {
        consentValues: todasLasDeclaraciones,
        signerName: 'María López',
        signerRelation: 'Madre',
        signatureData: firmaDeEjemplo,
    },
}

export const ReadOnly: Story = {
    args: {
        ...datosGeneradosPorBackend,
        readOnly: true,
        consentValues: todasLasDeclaraciones,
        signerName: 'María López',
        signatureData: firmaDeEjemplo,
    },
}

/** Recorre el modal completo: leer, declarar, firmar y confirmar. */
export const Interactivo: Story = {
    render: (args) => {
        const [isOpen, setIsOpen] = useState(true)
        const [consentValues, setConsentValues] = useState<Record<string, boolean>>({})
        const [signerName, setSignerName] = useState('')
        const [signerRelation, setSignerRelation] = useState('Madre')
        const [signatureData, setSignatureData] = useState<string | null>(null)
        const [showValidation, setShowValidation] = useState(false)

        const handleConsentChange = (id: string, checked: boolean) => {
            setConsentValues((prev) => ({ ...prev, [id]: checked }))
        }

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <InformedConsentView
                    {...args}
                    isOpen={isOpen}
                    onToggle={() => setIsOpen((prev) => !prev)}
                    consentValues={consentValues}
                    onConsentChange={handleConsentChange}
                    signerName={signerName}
                    onSignerNameChange={setSignerName}
                    signerRelation={signerRelation}
                    onSignerRelationChange={setSignerRelation}
                    signatureData={signatureData}
                    onSignatureChange={setSignatureData}
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
