import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { AgentChatPanel } from './AgentChatPanel'
import type { ChatMessage } from './chat'

const meta: Meta<typeof AgentChatPanel> = {
    title: 'Dashboard/AgentChatPanel',
    component: AgentChatPanel,
    parameters: { layout: 'padded' },
    decorators: [(Story) => <div style={{ width: 360 }}><Story /></div>],
    args: {
        messages: [],
        question: '',
        onQuestionChange: () => {},
        onSend: () => {},
        asking: false,
        onClose: () => {},
        onClear: () => {},
        onAgregar: () => true,
        agregados: {},
        dashboardActivo: 'produccion',
    },
}

export default meta
type Story = StoryObj<typeof AgentChatPanel>

export const Vacio: Story = {}

export const ConResultado: Story = {
    args: {
        messages: [
            { id: '1', role: 'user', text: '¿Cuántas fichas pediátricas genéticas hay en CONGENIA?' },
            {
                id: '2',
                role: 'agent',
                tone: 'success',
                source: 'CONGENIA',
                text: 'Hay 342 fichas pediátricas genéticas registradas.',
                blocks: [
                    { type: 'metric', label: 'Total de fichas', value: 342 },
                    {
                        type: 'bar_chart',
                        title: 'Fichas por especialidad',
                        categoryKey: 'especialidad',
                        series: [{ dataKey: 'total', label: 'Total' }],
                        rows: [
                            { especialidad: 'Genética', total: 180 },
                            { especialidad: 'Pediatría', total: 162 },
                        ],
                    },
                ],
            },
        ],
    },
}

export const Bloqueada: Story = {
    args: {
        messages: [
            { id: '1', role: 'user', text: 'DROP TABLE ficha_clinica' },
            {
                id: '2',
                role: 'agent',
                tone: 'blocked',
                source: 'OUT_OF_SCOPE',
                text: 'La solicitud incluye instrucciones SQL o fuentes no permitidas.',
            },
        ],
    },
}

/**
 * Respuesta con las etiquetas que el agente puede usar: párrafos, negrita,
 * cursiva, listas, códigos y saltos de línea. Al final trae HTML que no debe
 * pasar (script, imagen con onerror, enlace, negrita con evento): se ve solo
 * su texto, sin ejecutar nada.
 */
export const ConFormato: Story = {
    args: {
        messages: [
            { id: '1', role: 'user', text: '¿Cuáles son los diagnósticos más frecuentes este año?' },
            {
                id: '2',
                role: 'agent',
                tone: 'success',
                source: 'SIGSA',
                text: '<p>En <em>2025</em> hubo <strong>190,234 registros</strong> de producción ambulatoria.</p>'
                    + '<p>Los tres diagnósticos más frecuentes:</p>'
                    + '<ol>'
                    + '<li><strong>Infección urinaria</strong> (<code>N39.0</code>): 12,840</li>'
                    + '<li><strong>Rinofaringitis aguda</strong> (<code>J00</code>): 11,210</li>'
                    + '<li><strong>Parasitosis intestinal</strong> (<code>B82.9</code>): 9,876</li>'
                    + '</ol>'
                    + '<p>Observaciones:</p>'
                    + '<ul><li>La infección urinaria sube en <em>junio</em>.</li><li>Los datos son agregados.</li></ul>'
                    + '<p>Fuente: producción ambulatoria<br>Corte: 30 de septiembre</p>'
                    + '<p>Filtrado: <script>alert(1)</script><img src=x onerror="alert(1)">'
                    + '<a href="javascript:alert(1)">enlace</a> <b onclick="alert(1)">sin negrita</b></p>',
            },
        ],
    },
}

export const SinConexion: Story = {
    args: {
        messages: [
            { id: '1', role: 'user', text: '¿Cuántos registros de producción ambulatoria hay en total?' },
            { id: '2', role: 'agent', tone: 'error', text: 'No hay conexión con el servidor.' },
        ],
    },
}

/** Conversación de juguete: responde con eco para probar el scroll y el teclado. */
export const Interactivo: Story = {
    render: (args) => {
        const [messages, setMessages] = useState<ChatMessage[]>([])
        const [question, setQuestion] = useState('')

        const onSend = (texto: string) => {
            const id = String(messages.length)
            setMessages((previos) => [
                ...previos,
                { id: `${id}u`, role: 'user', text: texto.trim() },
                { id: `${id}a`, role: 'agent', tone: 'success', source: 'SIGSA', text: `Recibí: ${texto.trim()}` },
            ])
            setQuestion('')
        }

        return (
            <AgentChatPanel
                {...args}
                messages={messages}
                question={question}
                onQuestionChange={setQuestion}
                onSend={onSend}
                onClear={() => setMessages([])}
            />
        )
    },
}
