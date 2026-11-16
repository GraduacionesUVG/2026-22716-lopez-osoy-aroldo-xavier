/**
 * @fileoverview Cliente HTTP base para la API de CONGENIA M1.
 *
 * @compliance HIPAA 164.312(b)  - IDs de correlación en cada petición para trazabilidad de auditoría
 * @compliance HIPAA 164.312(c)  - Cache-Control: no-store en endpoints sensibles (que contienen PHI)
 * @compliance ISO 27001 A.12.4  - Los logs contienen solo método, ruta, estado e ID de petición - nunca el payload
 * @compliance ISO 27001 A.14.1  - Timeout con AbortController previene agotamiento de recursos
 */

import { v4 as uuidv4 } from 'uuid'
import { API_BASE_URL } from '../config/runtime'

// Resuelto en tiempo de arranque, no de build: ver src/config/runtime.ts.
// Cadena vacia = mismo origen, que es el caso normal detras del ALB.
const BASE_URL = API_BASE_URL

const DEFAULT_TIMEOUT_MS = 30_000

// Token cifrado de sesión, se establece una sola vez al cargar el formulario
// desde el parámetro ?sessionToken= de la URL. 
let _sessionToken: string | null = null

export function setSessionToken(token: string | null): void {
    _sessionToken = token
}

// Tipo de error
export class ApiError extends Error {
    readonly status: number
    readonly code: string
    readonly requestId: string

    constructor(status: number, code: string, message: string, requestId: string) {
        super(message)
        this.name = 'ApiError'
        this.status = status
        this.code = code
        this.requestId = requestId
    }
}

/**
 * Cómo se autentica la petición.
 *
 *  - `session`  (por defecto) el flujo SADC: `X-Session-Token` en las mutaciones.
 *  - `bearer`   el flujo del dashboard: `Authorization: Bearer` de Keycloak, en
 *               cualquier método. Necesario porque las lecturas del dashboard
 *               son GET y el modo `session` deliberadamente no los toca.
 */
export type ApiAuthMode = 'session' | 'bearer'

/**
 * Lo inyecta `main.tsx` para que este módulo no dependa de `auth.service`, que a
 * su vez importa configuración de OIDC. Sin esto el cliente HTTP quedaría atado
 * al proveedor de identidad.
 */
let _accessTokenProvider: (() => Promise<string>) | null = null

export function setAccessTokenProvider(provider: (() => Promise<string>) | null): void {
    _accessTokenProvider = provider
}

/**
 * Qué hacer cuando la API rechaza el token de Keycloak. Un solo lugar para
 * toda la app: antes cada pantalla mostraba su mensaje y nadie volvía a pedir
 * el login, así que un token rechazado dejaba al médico atascado.
 *
 * Solo aplica a peticiones con bearer. Un 401 de la capability (flujo SADC) no
 * se arregla con Keycloak: lo maneja la pantalla de la ficha.
 *
 * Igual que el token, lo inyecta `main.tsx`.
 */
export interface AuthFailureHandlers {
    /** 401: token ausente, inválido o vencido para el servidor. */
    onUnauthorized?: () => void
    /** 403 FORBIDDEN: el token es válido pero no trae el rol. */
    onForbidden?: () => void
}

let _authFailureHandlers: AuthFailureHandlers = {}

export function setAuthFailureHandlers(handlers: AuthFailureHandlers): void {
    _authFailureHandlers = handlers
}

// Envoltorio de fetch
interface ApiFetchOptions extends Omit<RequestInit, 'signal'> {
    bearer?: boolean
    timeoutMs?: number
    /**
     * Marca este endpoint como portador de PHI.
     * Agrega Cache-Control: no-store para que el navegador nunca almacene la respuesta en caché.
     * @compliance HIPAA 164.312(c)(1)
     */
    sensitive?: boolean
    auth?: ApiAuthMode
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
    const { timeoutMs = DEFAULT_TIMEOUT_MS, sensitive = false, auth = 'session', ...init } = options

    const requestId = uuidv4()

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    const method = (init.method ?? 'GET').toUpperCase()
    const headers = new Headers(init.headers)

    if (auth === 'bearer') {
        // El X-Request-Id sí va en GET aquí: estas lecturas tocan PHI y la
        // trazabilidad de auditoría no distingue entre leer y escribir.
        headers.set('X-Request-Id', requestId)

        if (!headers.has('Authorization') && _accessTokenProvider) {
            headers.set('Authorization', `Bearer ${await _accessTokenProvider()}`)
        }
    } else if (method !== 'GET') {
        headers.set('X-Request-Id', requestId)

        // Adjunta el token cifrado de sesión en mutaciones que lo requieren
        if (_sessionToken) {
            headers.set('X-Session-Token', _sessionToken)
        }
    } else if (_sessionToken) {
        headers.set('X-Request-Id', requestId)
        headers.set('X-Session-Token', _sessionToken)
    } else if (_accessTokenProvider) {
        headers.set('X-Request-Id', requestId)
        headers.set('Authorization', `Bearer ${await _accessTokenProvider()}`)
    }

    if (sensitive) {
        // Evita que el navegador o cualquier proxy intermedio almacene respuestas con PHI en caché
        headers.set('Cache-Control', 'no-store')
    }

    if (init.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json')
    }

    try {
        const response = await fetch(`${BASE_URL}${path}`, {
            ...init,
            ...(sensitive ? { cache: 'no-store' as const } : {}),
            headers,
            signal: controller.signal,
        })

        if (!response.ok) {
            const body = await response.json().catch(() => ({}))

            // El aviso se dispara además del error: la pantalla sigue
            // recibiendo su ApiError y decide qué pintar mientras tanto.
            const usedBearer = (headers.get('Authorization') ?? '').startsWith('Bearer ')
                && !headers.has('X-Session-Token')
            if (usedBearer && response.status === 401) {
                _authFailureHandlers.onUnauthorized?.()
            } else if (usedBearer && response.status === 403 && body.error === 'FORBIDDEN') {
                _authFailureHandlers.onForbidden?.()
            }

            // Solo se registra el estado - el cuerpo de la respuesta puede contener PHI
            console.error(
                `[CONGENIA API] ${method} → ${response.status} (reqId: ${requestId})`
            )

            throw new ApiError(
                response.status,
                body.error ?? 'API_ERROR',
                body.message ?? `HTTP ${response.status}`,
                requestId,
            )
        }

        if (response.status === 204) return undefined as T
        return response.json() as Promise<T>

    } catch (err) {
        if (err instanceof ApiError) throw err

        if (err instanceof Error && err.name === 'AbortError') {
            throw new ApiError(408, 'REQUEST_TIMEOUT', 'La petición superó el tiempo límite', requestId)
        }

        console.error(`[CONGENIA API] Error de red (reqId: ${requestId})`)
        throw new ApiError(0, 'NETWORK_ERROR', 'Error de conexión con el servidor', requestId)

    } finally {
        clearTimeout(timer)
    }
}
