import { apiFetch } from './api.client'

export interface ReportingSummary {
    sigsa: {
        totalConsultas: number
        consultasMesActual: number
        codigosCie10: number
        datasetVersion: string | null
    }
    congenia: {
        totalFichas: number
        fichasMesActual: number
    }
}

export interface TopCie10Item {
    codigo: string
    descripcion: string
    total: number
}

export interface TopDiagnosticoItem {
    diagnostico: string
    total: number
}

export interface MonthlyItem {
    mes: string
    total: number
}

export interface AgentResponse {
    status: 'success' | 'blocked'
    source: 'SIGSA' | 'CONGENIA' | 'MULTI' | 'OUT_OF_SCOPE'
    result: Array<Record<string, unknown>> | null
    answer: string
    auditId?: string | null
    resultId?: string | null
    blocks?: AgentBlock[]
    suggestedActions?: AgentSuggestedAction[]
}

export interface AgentTableBlock {
    type: 'table' | 'pivot'
    title: string
    columns: string[]
    rows: Array<Record<string, unknown>>
}

export interface AgentChartBlock {
    type: 'bar_chart' | 'line_chart' | 'stacked_bar'
    title: string
    categoryKey: string
    series: Array<{ dataKey: string; label: string }>
    rows: Array<Record<string, unknown>>
}

export interface AgentMetricBlock {
    type: 'metric'
    label: string
    value: string | number
}

export interface AgentWarningBlock {
    type: 'warning'
    message: string
}

export type AgentBlock = AgentTableBlock | AgentChartBlock | AgentMetricBlock | AgentWarningBlock

export interface AgentSuggestedAction {
    label: string
    action: 'show_table' | 'show_chart'
    resultId: string
}

export interface AgentConversation {
    conversationId: string
    expiresIn: number
}

const options = { auth: 'bearer', sensitive: true } as const

export function obtenerResumenReporteria(): Promise<ReportingSummary> {
    return apiFetch<ReportingSummary>('/api/v1/reporting/summary', options)
}

export function obtenerTopCie10(limit = 10): Promise<{ items: TopCie10Item[] }> {
    return apiFetch<{ items: TopCie10Item[] }>(`/api/v1/reporting/sigsa/top-cie10?limit=${limit}`, options)
}

export function obtenerTopDiagnosticos(limit = 10): Promise<{ items: TopDiagnosticoItem[] }> {
    return apiFetch<{ items: TopDiagnosticoItem[] }>(`/api/v1/reporting/sigsa/top-diagnosticos?limit=${limit}`, options)
}

export function obtenerSerieMensualSigsa(): Promise<{ items: MonthlyItem[] }> {
    return apiFetch<{ items: MonthlyItem[] }>('/api/v1/reporting/sigsa/monthly', options)
}

export function obtenerSerieMensualCongenia(): Promise<{ items: MonthlyItem[] }> {
    return apiFetch<{ items: MonthlyItem[] }>('/api/v1/reporting/congenia/monthly', options)
}

export function crearConversacionAgente(): Promise<AgentConversation> {
    return apiFetch<AgentConversation>('/api/v1/agent/conversations', {
        ...options,
        method: 'POST',
    })
}

export function eliminarConversacionAgente(conversationId: string): Promise<void> {
    return apiFetch<void>(`/api/v1/agent/conversations/${encodeURIComponent(conversationId)}`, {
        ...options,
        method: 'DELETE',
    })
}

export function consultarAgente(
    conversationId: string,
    question: string,
    action?: AgentSuggestedAction,
): Promise<AgentResponse> {
    return apiFetch<AgentResponse>('/api/v1/agent/query', {
        ...options,
        method: 'POST',
        body: JSON.stringify({
            conversationId,
            question,
            ...(action && { action: action.action, resultId: action.resultId }),
        }),
        timeoutMs: 60_000,
    })
}

/**
 * Lo que consume el dashboard de reportería, agrupado para poder inyectarlo.
 *
 * A diferencia de cie10 y adendas no hay flag de mock: estos endpoints ya
 * existen, y encender datos inventados por `APP_ENV` escondería el backend real
 * en QA local. Storybook le pasa `reportingMock` a la página directamente.
 */
export interface ReportingService {
    obtenerResumenReporteria: typeof obtenerResumenReporteria
    obtenerTopDiagnosticos: typeof obtenerTopDiagnosticos
    obtenerSerieMensualSigsa: typeof obtenerSerieMensualSigsa
    obtenerSerieMensualCongenia: typeof obtenerSerieMensualCongenia
    crearConversacionAgente: typeof crearConversacionAgente
    eliminarConversacionAgente: typeof eliminarConversacionAgente
    consultarAgente: typeof consultarAgente
}

export const reportingService: ReportingService = {
    obtenerResumenReporteria,
    obtenerTopDiagnosticos,
    obtenerSerieMensualSigsa,
    obtenerSerieMensualCongenia,
    crearConversacionAgente,
    eliminarConversacionAgente,
    consultarAgente,
}
