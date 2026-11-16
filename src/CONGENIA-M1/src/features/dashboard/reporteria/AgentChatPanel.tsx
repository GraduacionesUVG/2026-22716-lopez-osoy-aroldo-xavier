/**
 * @fileoverview Panel lateral del agente de datos.
 *
 * Solo pinta: los mensajes, el borrador y la consulta en vuelo viven en
 * `ReporteriaPage`, para que cerrar y reabrir el panel no borre la sesión.
 * El ID no se guarda en storage; el backend conserva contexto efímero en Redis.
 *
 * Al lado de cada respuesta con datos van dos botones para llevarlos al
 * tablero: como tabla y como gráfica. El tablero sale de la fuente de la
 * respuesta; si mezcla las dos, va al que está abierto. Al agregar, el botón
 * muestra un check unos segundos y luego ofrece "Agregar de nuevo", por si la
 * tarjeta se quitó del tablero por error.
 */

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Bot, ChartColumn, Check, Eraser, RotateCcw, SendHorizontal, Table2, X } from 'lucide-react'
import { AgentResultTable } from './AgentResultTable'
import { AgentResultBlocks } from './AgentResultBlocks'
import type { AgentSuggestedAction } from '../../../services/reporting.service'
import { PREGUNTAS_SUGERIDAS, etiquetaFuente, type ChatMessage } from './chat'
import { TextoAgente } from './TextoAgente'
import {
    bloqueParaWidget,
    claveAgregado,
    destinoPorFuente,
    NOMBRE_DASHBOARD,
    type AgregadoAlTablero,
    type DashboardId,
    type TipoWidget,
} from './tablero'
import styles from './AgentChatPanel.module.css'

export const LIMITE_PREGUNTA = 500

/** Lo que dura el check de "agregada" antes de ofrecer agregarla de nuevo. */
export const DURACION_CHECK_MS = 3000

export interface AgentChatPanelProps {
    messages: ChatMessage[]
    question: string
    onQuestionChange: (question: string) => void
    onSend: (question: string, action?: AgentSuggestedAction) => void
    /** Hay una consulta en vuelo: se bloquea el envío y se muestra el indicador. */
    asking: boolean
    onClose: () => void
    onClear: () => void
    /** Lleva el bloque de una respuesta al tablero indicado; `true` si se agregó. */
    onAgregar: (messageId: string, tipo: TipoWidget, destino: DashboardId) => boolean
    /** Lo que ya se agregó alguna vez, por `claveAgregado`. */
    agregados: Record<string, AgregadoAlTablero>
    /** El tablero a la vista: ahí van las respuestas que mezclan las dos fuentes. */
    dashboardActivo: DashboardId
}

export function AgentChatPanel({
    messages,
    question,
    onQuestionChange,
    onSend,
    asking,
    onClose,
    onClear,
    onAgregar,
    agregados,
    dashboardActivo,
}: AgentChatPanelProps) {
    const listRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)

    useEffect(() => {
        inputRef.current?.focus()
    }, [])

    // En movil el panel es una hoja a pantalla completa: sin esto, el tablero
    // de atras se seguiria desplazando bajo el dedo.
    useEffect(() => {
        if (!window.matchMedia('(max-width: 900px)').matches) return
        const previousOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => { document.body.style.overflow = previousOverflow }
    }, [])

    // Cada mensaje nuevo (o el indicador de "consultando") baja la lista al final.
    useEffect(() => {
        const list = listRef.current
        if (list) list.scrollTop = list.scrollHeight
    }, [messages.length, asking])

    const canSend = !asking && question.trim().length > 0

    const submit = (event: FormEvent) => {
        event.preventDefault()
        if (canSend) onSend(question)
    }

    // Enter envía y Shift+Enter hace salto de línea, como en cualquier chat.
    const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault()
            if (canSend) onSend(question)
        }
    }

    return (
        <aside
            className={styles.panel}
            aria-labelledby="agente-titulo"
            onKeyDown={(event) => { if (event.key === 'Escape') onClose() }}
        >
            <header className={styles.header}>
                <Bot size={20} aria-hidden="true" className={styles.headerIcon} />
                <h2 id="agente-titulo" className={styles.title}>Agente de datos</h2>
                {messages.length > 0 && (
                    <button
                        type="button"
                        className={styles.iconButton}
                        onClick={onClear}
                        disabled={asking}
                        aria-label="Limpiar la conversación"
                        title="Limpiar la conversación"
                    >
                        <Eraser size={18} aria-hidden="true" />
                    </button>
                )}
                <button
                    type="button"
                    className={styles.iconButton}
                    onClick={onClose}
                    aria-label="Cerrar el agente"
                    title="Cerrar"
                >
                    <X size={18} aria-hidden="true" />
                </button>
            </header>

            <div ref={listRef} className={styles.messages} role="log" aria-live="polite" aria-busy={asking}>
                <div className={`${styles.bubble} ${styles.agent}`}>
                    <p>
                        Hola, respondo preguntas con datos agregados de producción ambulatoria y de las fichas
                        CONGENIA. No muestro datos de pacientes individuales.
                    </p>
                </div>

                {messages.length === 0 && (
                    <div className={styles.suggestions}>
                        {PREGUNTAS_SUGERIDAS.map((sugerencia) => (
                            <button
                                key={sugerencia}
                                type="button"
                                className={styles.suggestion}
                                onClick={() => onSend(sugerencia)}
                                disabled={asking}
                            >
                                {sugerencia}
                            </button>
                        ))}
                    </div>
                )}

                {messages.map((message) => (
                    <MessageBubble
                        key={message.id}
                        message={message}
                        onAction={onSend}
                        asking={asking}
                        onAgregar={onAgregar}
                        agregados={agregados}
                        dashboardActivo={dashboardActivo}
                    />
                ))}

                {asking && (
                    <div className={`${styles.bubble} ${styles.agent} ${styles.typing}`}>
                        <span className={styles.dots} aria-hidden="true"><i /><i /><i /></span>
                        <span className={styles.srOnly}>Consultando…</span>
                    </div>
                )}
            </div>

            <form className={styles.composer} onSubmit={submit}>
                <label htmlFor="agente-pregunta" className={styles.srOnly}>Pregunta para el agente</label>
                <textarea
                    id="agente-pregunta"
                    ref={inputRef}
                    className={styles.input}
                    value={question}
                    onChange={(event) => onQuestionChange(event.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Escribe algo..."
                    maxLength={LIMITE_PREGUNTA}
                    rows={3}
                />
                <button type="submit" className={styles.send} disabled={!canSend} aria-label="Enviar pregunta">
                    <SendHorizontal size={16} aria-hidden="true" />
                </button>
            </form>
        </aside>
    )
}

function MessageBubble({ message, onAction, asking, onAgregar, agregados, dashboardActivo }: {
    message: ChatMessage
    onAction: (question: string, action?: AgentSuggestedAction) => void
    asking: boolean
    onAgregar: AgentChatPanelProps['onAgregar']
    agregados: AgentChatPanelProps['agregados']
    dashboardActivo: DashboardId
}) {
    if (message.role === 'user') {
        return (
            <div className={`${styles.bubble} ${styles.user}`}>
                <p>{message.text}</p>
            </div>
        )
    }

    // Bloqueada = el agente se negó (rojo); error = no hubo respuesta (ámbar).
    const toneClass = message.tone === 'blocked' ? styles.blocked
        : message.tone === 'error' ? styles.failed
        : ''

    const tipos = (['tabla', 'grafica'] as const).filter((tipo) => bloqueParaWidget(message, tipo))
    const destino = destinoPorFuente(message.source, dashboardActivo)

    const burbuja = (
        <div className={`${styles.bubble} ${styles.agent} ${toneClass}`}>
            {message.source && <span className={styles.source}>{etiquetaFuente(message.source)}</span>}
            {/* Solo la respuesta del agente lleva formato: la pregunta del médico va tal cual. */}
            <TextoAgente texto={message.text} />
            {message.blocks && <AgentResultBlocks blocks={message.blocks} />}
            {message.result && <AgentResultTable rows={message.result} />}
            {message.suggestedActions && (
                <div className={styles.resultActions}>
                    {message.suggestedActions.map((action) => (
                        <button
                            key={`${action.action}-${action.resultId}`}
                            type="button"
                            className={styles.resultAction}
                            disabled={asking}
                            onClick={() => onAction(
                                action.action === 'show_chart'
                                    ? 'Muéstralo ahora como gráfica.'
                                    : 'Muéstralo ahora como tabla.',
                                action,
                            )}
                        >
                            {action.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )

    if (tipos.length === 0) return burbuja

    return (
        <div className={styles.agentRow}>
            {burbuja}
            <div className={styles.addActions}>
                {tipos.map((tipo) => (
                    <BotonAgregar
                        key={tipo}
                        tipo={tipo}
                        destino={destino}
                        yaAgregado={claveAgregado(message.id, tipo) in agregados}
                        onAgregar={() => onAgregar(message.id, tipo, destino)}
                    />
                ))}
            </div>
        </div>
    )
}

/**
 * Tres estados: "Agregar"; el check verde unos segundos tras agregar; y
 * "Agregar de nuevo" después, por si la tarjeta se quitó del tablero por un
 * mal clic. El ícono del tipo se conserva siempre: dice qué se agrega, y la
 * insignia de la esquina dice en qué punto va.
 */
function BotonAgregar({ tipo, destino, yaAgregado, onAgregar }: {
    tipo: TipoWidget
    destino: DashboardId
    yaAgregado: boolean
    onAgregar: () => boolean
}) {
    const [reciente, setReciente] = useState(false)

    useEffect(() => {
        if (!reciente) return
        const timer = window.setTimeout(() => setReciente(false), DURACION_CHECK_MS)
        return () => window.clearTimeout(timer)
    }, [reciente])

    const que = tipo === 'tabla' ? 'tabla' : 'gráfica'
    const tablero = NOMBRE_DASHBOARD[destino]
    const etiqueta = reciente
        ? `${tipo === 'tabla' ? 'Tabla agregada' : 'Gráfica agregada'} a ${tablero}`
        : yaAgregado
            ? `Agregar de nuevo la ${que} a ${tablero}`
            : `Agregar ${que} a ${tablero}`
    const Icono = tipo === 'tabla' ? Table2 : ChartColumn
    const clases = [styles.addButton, reciente ? styles.added : ''].filter(Boolean).join(' ')

    return (
        <button
            type="button"
            className={clases}
            onClick={() => { if (onAgregar()) setReciente(true) }}
            disabled={reciente}
            aria-label={etiqueta}
            title={etiqueta}
        >
            <Icono size={16} aria-hidden="true" />
            {reciente && (
                <span className={styles.addedBadge} aria-hidden="true">
                    <Check size={10} strokeWidth={3.5} />
                </span>
            )}
            {!reciente && yaAgregado && (
                <span className={styles.againBadge} aria-hidden="true">
                    <RotateCcw size={9} strokeWidth={3.5} />
                </span>
            )}
        </button>
    )
}
