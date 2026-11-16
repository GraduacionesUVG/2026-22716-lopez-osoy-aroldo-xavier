import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { RegistrationOrchestratorView } from './RegistrationOrchestratorView'

/**
 * SVG inline en vez de un base64 de verdad: mantiene el archivo legible y no
 * depende de la red. Mismo recurso que usa `fichaSearch.mock.ts`.
 */
function imagenPlaceholder(texto: string): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">
        <rect width="640" height="480" fill="#8AB3D6"/>
        <rect x="16" y="16" width="608" height="448" fill="none" stroke="#003E69" stroke-width="4"/>
        <text x="320" y="250" font-family="Montserrat, sans-serif" font-size="34"
              font-weight="600" fill="#003E69" text-anchor="middle">${texto}</text>
    </svg>`

    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const meta: Meta<typeof RegistrationOrchestratorView> = {
    title: 'Forms/RegistrationOrchestratorView',
    component: RegistrationOrchestratorView,
    tags: ['autodocs'],
    parameters: {
        viewport: { defaultViewport: 'mobile1' },
    },
    args: {
        // Sin onBack el boton "Regresar" no hace nada: la prop es opcional
        onBack: () => console.log('[storybook] regresar a la busqueda'),
    },
}

export default meta
type Story = StoryObj<typeof RegistrationOrchestratorView>

export const Empty: Story = {
    args: {
        patientName: 'Juan Alberto Perez Garcia',
        numeroExpediente: '12343546665555',
        fechaConsulta: '21 de Junio del 2023',
        medicoConsulta: 'Dr. Nicolas Castro',
        especialidad: 'Genetica Clinica',
        diagnosticos: 'Paladar hendido',
        initialOpenSection: 'appointment',
    },
}

/**
 * Lo que falta se anuncia antes de pulsar, y cada nombre del aviso es un atajo a
 * su seccion.
 */
export const FaltanCampos: Story = {
    ...Empty,
}

/**
 * El arreglo del comentario: pulsar el boton con campos sin llenar ya no es un
 * gesto muerto. Mientras falte algo se llama "Revisar ficha" y no "Finalizar
 * registro", porque no envia nada. Enciende los errores por campo, abre la primera seccion incompleta
 * y salta hasta ella.
 */
export const IntentoFinalizarIncompleto: Story = {
    ...Empty,
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement)

        // Antes el boton estaba deshabilitado y el clic no llegaba a ocurrir.
        // Incompleta, el boton se llama "Revisar ficha": dice lo que hara el clic.
        const finalizar = canvas.getByRole('button', { name: 'Revisar ficha' })
        await expect(finalizar).toBeEnabled()

        await expect(canvas.getByText(/Falta completar/)).toBeInTheDocument()

        await userEvent.click(finalizar)

        // showValidation se enciende: las secciones ya sabian pintar esto, pero
        // en la app nadie activaba nunca la prop.
        await waitFor(() => expect(canvas.getAllByText('Este campo es requerido').length).toBeGreaterThan(0))
    },
}

/** Pulsar un nombre del aviso lleva directo a esa seccion, sin pasar por el boton. */
export const AtajoDesdeElAviso: Story = {
    ...Empty,
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement)
        // 'Ir a ...' y no el nombre a secas: la cabecera de la seccion es otro
        // boton que se llama igual.
        await userEvent.click(canvas.getByRole('button', { name: 'Ir a Consentimiento' }))
        await waitFor(() => expect(canvas.getByRole('button', { name: /Ir a Consentimiento/ })).toBeInTheDocument())
    },
}

export const Completed: Story = {
    args: {
        patientName: 'Juan Alberto Perez Garcia',
        numeroExpediente: '12343546665555',
        fechaConsulta: '21 de Junio del 2023',
        medicoConsulta: 'Dr. Nicolas Castro',
        especialidad: 'Genetica Clinica',
        diagnosticos: 'Paladar hendido',
        initialReferidoDe: 'igss',
        initialLugarDeParto: 'hospital',
        initialFamiliaresAfectados: 1,
        initialMenoresEnHogar: 1,
        initialAdultosEnHogar: 3,
        initialQuienAfectado: ['madre', 'padre'],
        initialAfectadosComunidad: 1,
        initialConsentValues: {
            'autorizacion-principal': true,
            'contacto-futuro': true,
            'aceptacion-final': true,
        },
        // consentComplete exige las tres cosas: casillas, firma Y nombre del
        // firmante. Sin el nombre la ficha no estaba completa, pero el boton
        // apagado no lo decia y la historia aparentaba estarlo.
        initialSignatureData: 'signed',
        initialSignerName: 'Maria Garcia Lopez',
        initialOpenSection: 'appointment',
    },
}

/**
 * La ficha tal como la consume el visor del dashboard.
 *
 * `readOnly` oculta el header pegajoso (logo, barra de progreso, nombre) y el
 * footer, y omite el consentimiento por completo: lo que queda son las cuatro
 * secciones embebidas. No es un recorte de la story, es el modo embebido.
 *
 * El estado demografico reproduce a proposito un caso con varias respuestas
 * marcadas - "Si", "Hermana", "Desconoce" - porque un chip seleccionado y
 * deshabilitado a la vez es donde el contraste se rompia.
 */
export const ReadOnly: Story = {
    args: {
        readOnly: true,
        patientName: 'Adolfo Alejandro Caal Tiul',
        numeroExpediente: '00445566777',
        fechaConsulta: '7 de julio de 2026',
        medicoConsulta: 'Dr. Nicolas Castro',
        especialidad: 'Genetica Clinica',
        diagnosticos: 'Sindrome de Down, malformacion de ojos',
        // Igual que FichaDetailPage.opcionUnica: el <select> deshabilitado necesita
        // tener la opcion presente para pintar su label, sin cargar el catalogo.
        referidoDeOptions:   [{ value: 'comadrona',      label: 'Comadrona' }],
        lugarDePartoOptions: [{ value: 'hospital_local', label: 'Hospital local' }],
        initialReferidoDe:   'comadrona',
        initialLugarDeParto: 'hospital_local',
        initialFamiliaresAfectados: 1,
        initialMenoresEnHogar: 2,
        initialAdultosEnHogar: 3,
        initialQuienAfectado: ['hermana'],
        initialAfectadosComunidad: 2,
        initialAlertSigns: [
            {
                id: 'signo-1',
                title: 'Dedo menique torcido',
                imageSrc: imagenPlaceholder('Signo de alerta 1'),
                chips: ['Mano (Izq.)'],
                parteDelCuerpo: {
                    regionValue: 'extremidades_superiores',
                    parteValue: 'mano',
                    lateralidad: 'izquierda',
                },
            },
            {
                id: 'signo-2',
                title: 'Paladar hendido',
                imageSrc: imagenPlaceholder('Signo de alerta 2'),
                chips: ['Cara'],
                parteDelCuerpo: {
                    regionValue: 'cabeza',
                    parteValue: 'cara',
                },
            },
        ],
        initialExams: [
            {
                id: 'examen-1',
                title: 'Cariotipo (analisis cromosomico)',
                imageSrc: imagenPlaceholder('Cariotipo'),
            },
            // Un estudio puede no llevar adjunto: el visor lo pinta sin miniatura
            {
                id: 'examen-2',
                title: 'Ultrasonido abdominal',
            },
        ],
    },
}

const fichaRegistrada = {
    patientName: 'Juan Alberto Perez Garcia',
    numeroExpediente: '12343546665555',
    fechaConsulta: '21 de Junio del 2023',
    medicoConsulta: 'Dr. Nicolas Castro',
    especialidad: 'Genetica Clinica',
    diagnosticos: 'Paladar hendido',
    initialReferidoDe: 'igss',
    initialLugarDeParto: 'hospital',
    initialFamiliaresAfectados: 1 as const,
    initialAfectadosComunidad: 0 as const,
    headerNotices: [{ text: 'Este paciente ya tiene una ficha asignada.' }],
    initialAlertSigns: [
        { id: 'signo-1', title: 'Dedo menique torcido', chips: ['Mano izq.'], locked: true },
        { id: 'signo-2', title: 'Foto sustituida', chips: ['Pie der.'], locked: true, status: 'replaced' as const },
    ],
    initialExams: [
        { id: 'exam-1', title: 'Cariotipo (analisis cromosomico)', locked: true },
    ],
}

/** Ficha vigente en solo lectura: sin consentimiento, sin versionamiento, solo el aviso. */
export const FichaRegistrada: Story = {
    args: { ...fichaRegistrada, mode: 'view', initialOpenSection: 'alerts' },
}

/** Con una adenda pendiente no se puede encadenar otra solicitud. */
export const FichaConAdendaPendiente: Story = {
    args: {
        ...fichaRegistrada,
        mode: 'view',
        initialOpenSection: 'alerts',
        headerNotices: [
            { text: 'Hay una adenda pendiente de aprobación. Podrá solicitar más cambios cuando se resuelva.', tone: 'pending' as const },
        ],
    },
}

/** Adenda en curso: solo las dos secciones de imagenes admiten altas, y el aviso lo dice. */
export const Adenda: Story = {
    args: {
        ...fichaRegistrada,
        mode: 'append',
        initialOpenSection: 'alerts',
        headerNotices: [{
            text: 'Aquí puedes agregar una adenda: solo en Signos de Alerta y Estudios de Gabinete.',
            tone: 'action' as const,
        }],
        onRequestChanges: async () => {},
    },
}
