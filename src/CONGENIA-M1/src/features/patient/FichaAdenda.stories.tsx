/**
 * @fileoverview Flujo completo de una ficha ya registrada y su adenda.
 *
 * Reproduce lo que ve el médico al abrir un paciente que ya tiene ficha: la última
 * versión vigente, en solo lectura, con el aviso de que un cambio se pide por adenda.
 *
 * Las subidas al bucket se interceptan solo aquí, dentro de la story, para que el flujo
 * de agregar una foto se pueda recorrer sin servidor. El componente y sus servicios no
 * cambian: `uploadImageFile` se ejecuta de verdad, lo único simulado es la respuesta
 * HTTP del presigned URL y el PUT al bucket.
 */

import { useEffect } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { RegistrationOrchestratorView } from '../../components/forms/RegistrationOrchestratorView/RegistrationOrchestratorView'
import type { AlertSignItem } from '../../components/forms/AlertSignsSection/AlertSignsSection'
import type { ExamItem } from '../../components/forms/ExamsSection/ExamsSection'
import hero from '../../assets/hero.png'

const BUCKET_SIMULADO = 'https://bucket.demo/objeto'

/** Responde los dos saltos del upload: presigned URL y PUT del binario. */
function ConUploadsSimulados({ children }: { children: React.ReactNode }) {
    useEffect(() => {
        const original = window.fetch
        window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
            if (url.includes('/uploads/presigned-url')) {
                return new Response(JSON.stringify({
                    success: true,
                    data: {
                        presignedUrl: BUCKET_SIMULADO,
                        documentId: 'documento-demo',
                        objectKey: `uploads/demo-${Date.now()}`,
                        headers: {},
                    },
                }), { status: 200, headers: { 'Content-Type': 'application/json' } })
            }
            if (url.startsWith(BUCKET_SIMULADO)) return new Response(null, { status: 200 })
            return original(input, init)
        }
        return () => { window.fetch = original }
    }, [])
    return <>{children}</>
}

const AVISO_FICHA_REGISTRADA =
    'Este paciente ya tiene una ficha asignada.'
const AVISO_ADENDA_DISPONIBLE =
    'Esta ficha admite adendas. Para agregar signos de alerta, estudios u observaciones, pulse «Solicitar adenda» al final.'
const AVISO_ADENDA_PENDIENTE =
    'Hay una adenda pendiente de aprobación. Podrá solicitar más cambios cuando se resuelva.'

/** Los signos y exámenes de la ficha vigente llegan bloqueados desde el servidor. */
const signosRegistrados: AlertSignItem[] = [
    { id: 'signo-1', title: 'Paladar hendido', imageSrc: hero, chips: ['Labio', 'Cabeza y cuello'], locked: true },
    { id: 'signo-2', title: 'Dedo meñique torcido', imageSrc: hero, chips: ['Dedos (Izq.)', 'Extremidades superiores'], locked: true },
    { id: 'signo-3', title: 'Pie equino varo', imageSrc: hero, chips: ['Pie (Der.)', 'Extremidades inferiores'], locked: true },
]

const examenesRegistrados: ExamItem[] = [
    { id: 'examen-1', title: 'Cariotipo (análisis cromosómico)', locked: true },
    { id: 'examen-2', title: 'Ecocardiograma', locked: true },
]

const fichaVigente = {
    patientName: 'Juan Alberto Pérez García',
    numeroExpediente: '00001234',
    fechaConsulta: '2026-06-21',
    medicoConsulta: 'Dra. Ana Lucía Morales',
    especialidad: 'Genética Clínica',
    diagnosticos: 'Paladar hendido',
    initialReferidoDe: '1',
    initialLugarDeParto: '2',
    initialFamiliaresAfectados: 1 as const,
    initialMenoresEnHogar: 1,
    initialAdultosEnHogar: 2,
    initialQuienAfectado: ['3'],
    initialAfectadosComunidad: 0 as const,
    initialAlertSigns: signosRegistrados,
    initialExams: examenesRegistrados,
    headerNotices: [{ text: AVISO_FICHA_REGISTRADA }],
    referidoDeOptions: [{ value: '1', label: 'Primer nivel de salud' }, { value: '2', label: 'Comadrona' }],
    lugarDePartoOptions: [{ value: '1', label: 'Comadrona' }, { value: '2', label: 'Hospital local' }],
    familiarAfectadoGroups: [{
        groupLabel: 'Núcleo familiar',
        options: [{ value: '1', label: 'Madre' }, { value: '2', label: 'Padre' }, { value: '3', label: 'Hermano(a)' }],
    }],
}

const meta: Meta<typeof RegistrationOrchestratorView> = {
    title: 'Flujos/Ficha con adendas',
    component: RegistrationOrchestratorView,
    parameters: {
        viewport: { defaultViewport: 'mobile1' },
        layout: 'fullscreen',
    },
    decorators: [(Story) => <ConUploadsSimulados><Story /></ConUploadsSimulados>],
}

export default meta
type Story = StoryObj<typeof RegistrationOrchestratorView>

/**
 * Punto de partida: el médico busca al paciente y cae aquí.
 *
 * Todo está en solo lectura, no hay sección de Consentimiento Informado, no hay número de
 * revisión ni historial, y cada tarjeta lleva su badge de vigencia.
 */
export const FichaVigenteSoloLectura: Story = {
    args: { ...fichaVigente, mode: 'view', initialOpenSection: 'alerts' },
}

const adendaDisponible = {
    ...fichaVigente,
    mode: 'append' as const,
    initialOpenSection: 'appointment' as const,
    // En ambar y nombrando el boton: el aviso dice que la ficha admite adenda y con
    // que se empieza, en vez de mandar a buscar otra pantalla.
    headerNotices: [{ text: AVISO_ADENDA_DISPONIBLE, tone: 'action' as const }],
    onRequestChanges: async (motivo: string) => {
        // Retraso corto para que se vea el estado de envío antes del acuse.
        await new Promise((resolve) => setTimeout(resolve, 600))
        console.info('[story] Motivo de la adenda:', motivo)
    },
}

/**
 * El flujo de la adenda, recorrible de principio a fin. Va en dos pasos para que
 * se vea donde empieza: primero se lee la ficha, despues se agrega.
 *
 * 1. La ficha se abre en solo lectura, con el aviso ambar y "Solicitar adenda" al final.
 * 2. Al pulsarlo quedan solo Signos de Alerta, Estudios de Gabinete y Observaciones,
 *    con lo registrado bloqueado y los botones para agregar.
 * 3. "+ Agregar signo de alerta" abre el asistente; el ultimo paso pregunta si cambia
 *    alguno existente. Al guardar, el sustituido baja al final con badge "CAMBIADA".
 * 4. "Enviar adenda" pide el motivo y deja la solicitud en pendiente.
 * 5. "Cancelar adenda" (o "Regresar") vuelve a la ficha; si habia altas, pide
 *    confirmacion y las descarta.
 */
export const AdendaFlujoCompleto: Story = {
    args: adendaDisponible,
}

/** El segundo paso por si solo: la captura, sin Consulta ni Demográficos. */
export const AdendaEnCaptura: Story = {
    args: { ...adendaDisponible, initialFaseAdenda: 'captura' },
}

/**
 * Ya hay una adenda esperando al genetista: la ficha vigente sigue, sin botón de envío.
 *
 * El aviso de "realiza una adenda" no aparece aquí: invitar a algo que ahora no se puede
 * hacer solo confunde, así que el de pendiente lo sustituye.
 */
export const AdendaPendienteDeAprobacion: Story = {
    args: {
        ...fichaVigente,
        mode: 'view',
        initialOpenSection: 'alerts',
        headerNotices: [{ text: AVISO_ADENDA_PENDIENTE, tone: 'pending' as const }],
    },
}

/** Como queda la ficha cuando una adenda anterior ya sustituyó una foto. */
export const ConSustitucionYaAprobada: Story = {
    args: {
        ...fichaVigente,
        mode: 'view',
        initialOpenSection: 'alerts',
        initialAlertSigns: [
            { ...signosRegistrados[0], status: 'replaced' },
            ...signosRegistrados.slice(1),
            { id: 'signo-4', title: 'Paladar hendido (foto actualizada)', imageSrc: hero, chips: ['Labio', 'Cabeza y cuello'], locked: true },
        ],
    },
}
