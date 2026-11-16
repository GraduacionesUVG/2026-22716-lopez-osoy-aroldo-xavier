/**
 * @fileoverview Mensajes del chat del agente de datos.
 *
 * Convierte las respuestas de `POST /api/v1/agent/query` en mensajes que el
 * panel solo tiene que pintar. Reglas del contrato
 * (`docs/REPORTING_CHAT_OVERLAY_PLAN.md`): `answer` es texto plano, `result`
 * solo se muestra como tabla y nunca se pinta JSON crudo.
 */

import { ApiError } from '../../../services/api.client'
import type {
    AgentBlock,
    AgentResponse,
    AgentSuggestedAction,
} from '../../../services/reporting.service'
import { formatearCategoria, formatearNumero } from './formato'

export type FilaResultado = Record<string, unknown>

export type ChatMessage =
    | { id: string; role: 'user'; text: string }
    | {
        id: string
        role: 'agent'
        text: string
        /** `error` = la consulta no llegó a responderse (red, permisos, timeout). */
        tone: 'success' | 'blocked' | 'error'
        source?: AgentResponse['source']
        result?: FilaResultado[]
        blocks?: AgentBlock[]
        suggestedActions?: AgentSuggestedAction[]
    }

/** Las preguntas válidas del plan del agente, para arrancar sin página en blanco. */
export const PREGUNTAS_SUGERIDAS = [
    '¿Cuántos registros de producción ambulatoria hay en total?',
    '¿Cuáles son los diagnósticos más frecuentes en producción ambulatoria?',
    '¿Cuántas fichas pediátricas genéticas hay en CONGENIA?',
    '¿Cuántos registros de producción ambulatoria hay por sexo?',
] as const

const ETIQUETAS_FUENTE: Record<AgentResponse['source'], string> = {
    SIGSA: 'Producción ambulatoria',
    CONGENIA: 'Ficha clínica',
    MULTI: 'Producción ambulatoria + Ficha clínica',
    OUT_OF_SCOPE: 'Fuera de alcance',
}

export function etiquetaFuente(source: AgentResponse['source']): string {
    return ETIQUETAS_FUENTE[source] ?? source
}

export function mensajeDelUsuario(id: string, text: string): ChatMessage {
    return { id, role: 'user', text }
}

export function respuestaAMensaje(id: string, response: AgentResponse): ChatMessage {
    const blocked = response.status === 'blocked'
    const text = response.answer?.trim()
        || (blocked ? 'No puedo responder esa consulta.' : 'La consulta no devolvió una respuesta.')
    const blocks = blocked ? [] : bloquesSeguros(response.blocks)
    const hasTabularBlock = blocks.some((block) => block.type === 'table' || block.type === 'pivot')
    const result = blocked || hasTabularBlock ? [] : filasTabulares(response.result)
    const suggestedActions = blocked ? [] : accionesSeguras(response.suggestedActions)

    return {
        id,
        role: 'agent',
        text,
        tone: blocked ? 'blocked' : 'success',
        source: response.source,
        ...(result.length > 0 && { result }),
        ...(blocks.length > 0 && { blocks }),
        ...(suggestedActions.length > 0 && { suggestedActions }),
    }
}

export function bloquesSeguros(blocks: unknown): AgentBlock[] {
    if (!Array.isArray(blocks)) return []

    return blocks.flatMap((candidate): AgentBlock[] => {
        if (!isRecord(candidate) || typeof candidate.type !== 'string') return []

        if (candidate.type === 'table' || candidate.type === 'pivot') {
            const rows = filasTabulares(candidate.rows).slice(0, 50)
            const columns = stringArray(candidate.columns).slice(0, 20)
            if (rows.length === 0 || columns.length === 0) return []
            return [{
                type: candidate.type,
                title: safeText(candidate.title, 'Resultado'),
                columns,
                rows,
            }]
        }

        if (candidate.type === 'bar_chart' || candidate.type === 'line_chart' || candidate.type === 'stacked_bar') {
            const rows = filasTabulares(candidate.rows).slice(0, 25)
            const categoryKey = typeof candidate.categoryKey === 'string' ? candidate.categoryKey : ''
            const series = Array.isArray(candidate.series)
                ? candidate.series.filter(isSeries).slice(0, 5)
                : []
            if (!categoryKey || rows.length === 0 || series.length === 0) return []
            if (!rows.every((row) => categoryKey in row)) return []
            if (!series.every((item) => rows.some((row) => item.dataKey in row))) return []
            return [{
                type: candidate.type,
                title: safeText(candidate.title, 'Visualización'),
                categoryKey,
                series,
                rows,
            }]
        }

        if (candidate.type === 'metric'
            && typeof candidate.label === 'string'
            && (typeof candidate.value === 'string' || typeof candidate.value === 'number')) {
            return [{ type: 'metric', label: candidate.label.slice(0, 120), value: candidate.value }]
        }

        if (candidate.type === 'warning' && typeof candidate.message === 'string') {
            return [{ type: 'warning', message: candidate.message.slice(0, 500) }]
        }

        return []
    })
}

export function accionesSeguras(actions: unknown): AgentSuggestedAction[] {
    if (!Array.isArray(actions)) return []
    return actions.flatMap((candidate): AgentSuggestedAction[] => {
        if (!isRecord(candidate)
            || (candidate.action !== 'show_table' && candidate.action !== 'show_chart')
            || typeof candidate.resultId !== 'string'
            || candidate.resultId.length === 0) return []
        return [{
            action: candidate.action,
            label: safeText(candidate.label, candidate.action === 'show_chart' ? 'Ver como gráfica' : 'Ver como tabla'),
            resultId: candidate.resultId,
        }]
    })
}

export function errorAMensaje(id: string, error: unknown): ChatMessage {
    return { id, role: 'agent', text: mensajeDeError(error), tone: 'error' }
}

export function mensajeDeError(error: unknown): string {
    if (error instanceof ApiError) {
        // Los mensajes del servidor pueden arrastrar detalles internos, así que
        // solo se traducen los casos que el médico puede accionar.
        if (error.status === 408) return 'La consulta tardó demasiado. Intente de nuevo.'
        if (error.status === 0)   return 'No hay conexión con el servidor.'
        if (error.status === 401 || error.status === 403) {
            return 'Su sesión no tiene permiso para consultar el agente.'
        }
        if (error.status === 429) return 'Hizo demasiadas consultas seguidas. Espere un momento.'
    }
    return 'No se pudo consultar el agente. Intente de nuevo en un momento.'
}

/** Solo filas que son objetos planos; cualquier otra cosa no es una tabla. */
export function filasTabulares(result: unknown): FilaResultado[] {
    if (!Array.isArray(result)) return []
    return result.filter(
        (fila): fila is FilaResultado => typeof fila === 'object' && fila !== null && !Array.isArray(fila),
    )
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringArray(value: unknown): string[] {
    return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
        : []
}

function isSeries(value: unknown): value is { dataKey: string; label: string } {
    return isRecord(value)
        && typeof value.dataKey === 'string'
        && value.dataKey.length > 0
        && typeof value.label === 'string'
        && value.label.length > 0
}

function safeText(value: unknown, fallback: string): string {
    return typeof value === 'string' && value.trim() ? value.trim().slice(0, 160) : fallback
}

/**
 * Las columnas que se pintan: las que pidió el bloque y de verdad traen las
 * filas, o las de la primera fila si no pidió ninguna. La usan la tabla en
 * pantalla y la del PDF.
 */
export function columnasVisibles(rows: FilaResultado[], preferidas?: string[]): string[] {
    return preferidas?.filter((columna) => rows.some((row) => columna in row))
        ?? Object.keys(rows[0] ?? {})
}

/** `total_registros` → `Total Registros`. */
export function formatearEncabezado(columna: string): string {
    const etiquetas: Record<string, string> = {
        sigsa: 'Producción ambulatoria',
        congenia: 'Ficha clínica',
        produccion_ambulatoria: 'Producción ambulatoria',
        ficha_clinica: 'Ficha clínica',
    }
    if (etiquetas[columna]) return etiquetas[columna]
    return columna
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (letra) => letra.toUpperCase())
}

/** Valores anidados se muestran como guion: pintarlos sería volcar JSON. */
export function formatearCelda(valor: unknown, columna?: string): string {
    if (valor == null) return '—'
    if (typeof valor === 'boolean') return valor ? 'Sí' : 'No'
    if (typeof valor === 'number') return Number.isFinite(valor) ? formatearNumero(valor) : '—'
    // Las fechas llegan como ISO de PostgreSQL ("2025-01-01T00:00:00.000Z").
    if (typeof valor === 'string') return formatearCategoria(valor, columna)
    return '—'
}
