import { describe, expect, it } from 'vitest'
import { ApiError } from '../../../services/api.client'
import {
    errorAMensaje,
    bloquesSeguros,
    etiquetaFuente,
    filasTabulares,
    formatearCelda,
    formatearEncabezado,
    mensajeDeError,
    respuestaAMensaje,
} from './chat'

describe('respuestaAMensaje', () => {
    it('una respuesta exitosa conserva texto, fuente y tabla', () => {
        const mensaje = respuestaAMensaje('m1', {
            status: 'success',
            source: 'SIGSA',
            answer: '  Se encontró 1 registro.  ',
            result: [{ total: 1 }],
        })
        expect(mensaje).toEqual({
            id: 'm1',
            role: 'agent',
            text: 'Se encontró 1 registro.',
            tone: 'success',
            source: 'SIGSA',
            result: [{ total: 1 }],
        })
    })

    it('una respuesta bloqueada nunca trae tabla', () => {
        const mensaje = respuestaAMensaje('m2', {
            status: 'blocked',
            source: 'OUT_OF_SCOPE',
            answer: 'La solicitud incluye instrucciones SQL o fuentes no permitidas.',
            result: [{ nombre: 'no debería verse' }],
        })
        expect(mensaje.role === 'agent' && mensaje.tone).toBe('blocked')
        expect(mensaje).not.toHaveProperty('result')
    })

    it('sin texto cae en un mensaje por defecto', () => {
        const mensaje = respuestaAMensaje('m3', { status: 'success', source: 'CONGENIA', answer: '', result: null })
        expect(mensaje.text).toBe('La consulta no devolvió una respuesta.')
        expect(mensaje).not.toHaveProperty('result')
    })

    it('prioriza bloques tabulares y conserva acciones conocidas', () => {
        const mensaje = respuestaAMensaje('m4', {
            status: 'success',
            source: 'SIGSA',
            answer: 'Resultado agrupado.',
            result: [{ duplicado: true }],
            blocks: [{
                type: 'table',
                title: 'Casos por área',
                columns: ['area', 'total'],
                rows: [{ area: 'Pediatría', total: 12 }],
            }],
            suggestedActions: [{ label: 'Ver gráfica', action: 'show_chart', resultId: 'result-1' }],
        })

        expect(mensaje).not.toHaveProperty('result')
        expect(mensaje.role === 'agent' && mensaje.blocks).toHaveLength(1)
        expect(mensaje.role === 'agent' && mensaje.suggestedActions?.[0].action).toBe('show_chart')
    })
})

describe('bloquesSeguros', () => {
    it('descarta HTML, tipos desconocidos y gráficas inconsistentes', () => {
        expect(bloquesSeguros([
            { type: 'html', content: '<script>alert(1)</script>' },
            { type: 'bar_chart', title: 'Vacía', categoryKey: 'area', series: [], rows: [] },
        ])).toEqual([])
    })

    it('limita datos y series de una gráfica válida', () => {
        const blocks = bloquesSeguros([{
            type: 'bar_chart',
            title: 'Casos',
            categoryKey: 'area',
            series: Array.from({ length: 8 }, (_, index) => ({ dataKey: `s${index}`, label: `S${index}` })),
            rows: Array.from({ length: 30 }, (_, index) => ({ area: `A${index}`, s0: index })),
        }])
        expect(blocks).toHaveLength(0)

        const valid = bloquesSeguros([{
            type: 'bar_chart',
            title: 'Casos',
            categoryKey: 'area',
            series: [{ dataKey: 'total', label: 'Total' }],
            rows: Array.from({ length: 30 }, (_, index) => ({ area: `A${index}`, total: index })),
        }])
        expect(valid[0]?.type === 'bar_chart' && valid[0].rows).toHaveLength(25)
    })

    it('acepta barras apiladas con una fila por mes y una serie por área', () => {
        const blocks = bloquesSeguros([{
            type: 'stacked_bar',
            title: 'Atenciones por área hospitalaria y mes',
            categoryKey: 'mes',
            series: [
                { dataKey: 'PEDIATRIA', label: 'PEDIATRIA' },
                { dataKey: 'MEDICINA GENERAL', label: 'MEDICINA GENERAL' },
            ],
            rows: [
                { mes: '2025-01', PEDIATRIA: 8, 'MEDICINA GENERAL': 5 },
                { mes: '2025-02', PEDIATRIA: 7, 'MEDICINA GENERAL': 6 },
            ],
        }])

        expect(blocks).toEqual([{
            type: 'stacked_bar',
            title: 'Atenciones por área hospitalaria y mes',
            categoryKey: 'mes',
            series: [
                { dataKey: 'PEDIATRIA', label: 'PEDIATRIA' },
                { dataKey: 'MEDICINA GENERAL', label: 'MEDICINA GENERAL' },
            ],
            rows: [
                { mes: '2025-01', PEDIATRIA: 8, 'MEDICINA GENERAL': 5 },
                { mes: '2025-02', PEDIATRIA: 7, 'MEDICINA GENERAL': 6 },
            ],
        }])
    })
})

describe('mensajeDeError', () => {
    it('traduce los casos accionables', () => {
        expect(mensajeDeError(new ApiError(408, 'TIMEOUT', '', 'r'))).toBe('La consulta tardó demasiado. Intente de nuevo.')
        expect(mensajeDeError(new ApiError(0, 'NETWORK', '', 'r'))).toBe('No hay conexión con el servidor.')
        expect(mensajeDeError(new ApiError(403, 'FORBIDDEN', '', 'r'))).toBe('Su sesión no tiene permiso para consultar el agente.')
    })

    it('no filtra el mensaje del servidor', () => {
        const error = new ApiError(500, 'INTERNAL', 'relation "ficha_clinica" does not exist', 'r')
        expect(mensajeDeError(error)).not.toContain('ficha_clinica')
    })

    it('errorAMensaje marca el tono de error', () => {
        const mensaje = errorAMensaje('m4', new Error('x'))
        expect(mensaje.role === 'agent' && mensaje.tone).toBe('error')
    })
})

describe('filasTabulares', () => {
    it('descarta lo que no es una fila', () => {
        expect(filasTabulares(null)).toEqual([])
        expect(filasTabulares('SELECT 1')).toEqual([])
        expect(filasTabulares([{ total: 1 }, 2, null, [3]])).toEqual([{ total: 1 }])
    })
})

describe('formato de la tabla', () => {
    it('encabezados legibles', () => {
        expect(formatearEncabezado('total_registros')).toBe('Total Registros')
        expect(formatearEncabezado('sigsa')).toBe('Producción ambulatoria')
        expect(formatearEncabezado('congenia')).toBe('Ficha clínica')
    })

    it('celdas sin JSON crudo', () => {
        expect(formatearCelda(null)).toBe('—')
        expect(formatearCelda(true)).toBe('Sí')
        expect(formatearCelda('F')).toBe('F')
        expect(formatearCelda({ a: 1 })).toBe('—')
        expect(formatearCelda(Number.NaN)).toBe('—')
    })

    it('fuentes con nombre amigable', () => {
        expect(etiquetaFuente('SIGSA')).toBe('Producción ambulatoria')
        expect(etiquetaFuente('CONGENIA')).toBe('Ficha clínica')
        expect(etiquetaFuente('MULTI')).toBe('Producción ambulatoria + Ficha clínica')
        expect(etiquetaFuente('OUT_OF_SCOPE')).toBe('Fuera de alcance')
    })
})
