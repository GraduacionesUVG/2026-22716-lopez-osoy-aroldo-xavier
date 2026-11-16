import { describe, expect, it } from 'vitest'
import {
    accionDeTecla,
    opcionVecina,
    type ContextoTecla,
    avisoFaltante,
    avisoSoporte,
    codigoLibre,
    esSeleccionable,
    estadoFila,
    etiquetaPeriodo,
    fechaCorta,
    motivoSinCodigo,
    opcionesVisibles,
    recortar,
    seleccionDe,
    tieneAvisos,
    totalPaginas,
} from './lote'
import { CANTIDAD_MAX, CANTIDAD_MIN, CANTIDAD_POR_DEFECTO, clampCantidad } from './preferencias'
import type { ItemLoteCie10, OpcionCie10 } from '../../../types/cie10'

const opcion = (codigo: string, extra: Partial<OpcionCie10> = {}): OpcionCie10 => ({
    codigo, descripcionModelo: codigo, codigoInternoCatalogo: null, nombreCatalogo: codigo, ...extra,
})

function item(partial: Partial<ItemLoteCie10> = {}): ItemLoteCie10 {
    const sugerencias = partial.sugerencias ?? [opcion('S83.9'), opcion('S83.8'), opcion('S83.6'), opcion('S83.5')]
    return {
        codigoTraductor: 'REG-001', diagnostico: 'Esguince de rodilla', cie10Original: '-1', sugerencias,
        razonamientoClinico: null, error: null, modelo: 'm', procesadoEn: '2026-10-17T00:00:00.000Z',
        status: 'AUTOCODIFICADO', principal: sugerencias[0] ?? null, finalCode: sugerencias[0]?.codigo ?? '',
        corrected: false, correctionComment: null, reviewed: false,
        ...partial,
    }
}

describe('estadoFila', () => {
    it('distingue pendiente, sin código, aceptado, corregido y confirmado', () => {
        expect(estadoFila(item())).toBe('pendiente')
        expect(estadoFila(item({ sugerencias: [], principal: null, status: 'REQUIERE_ATENCION' }))).toBe('sin-codigo')
        expect(estadoFila(item({ reviewed: true }))).toBe('aceptado')
        expect(estadoFila(item({ reviewed: true, corrected: true, finalCode: 'R69' }))).toBe('corregido')
        expect(estadoFila(item({ status: 'CONFIRMADO', corrected: true }))).toBe('confirmado')
    })

    it('sin `reviewed` del servidor, la fila se ve pendiente', () => {
        expect(estadoFila(item({ reviewed: undefined }))).toBe('pendiente')
    })
})

describe('esSeleccionable', () => {
    it('solo lo pendiente con sugerencias entra en "Aceptar seleccionadas"', () => {
        expect(esSeleccionable(item())).toBe(true)
        expect(esSeleccionable(item({ sugerencias: [], principal: null }))).toBe(false)
        expect(esSeleccionable(item({ reviewed: true }))).toBe(false)
        expect(esSeleccionable(item({ reviewed: true, corrected: true }))).toBe(false)
        expect(esSeleccionable(item({ status: 'CONFIRMADO' }))).toBe(false)
    })
})

describe('opcionesVisibles y seleccionDe', () => {
    it('recorta a la cantidad de la tuerca', () => {
        expect(opcionesVisibles(item(), 2).map((o) => o.codigo)).toEqual(['S83.9', 'S83.8'])
    })

    it('marca la principal si el médico no eligió nada', () => {
        expect(seleccionDe(item(), undefined, 3)).toBe('S83.9')
    })

    it('respeta la elegida mientras siga a la vista', () => {
        expect(seleccionDe(item(), 'S83.6', 3)).toBe('S83.6')
        // Con la tuerca en 2, la tercera ya no se ve: vuelve a la principal.
        expect(seleccionDe(item(), 'S83.6', 2)).toBe('S83.9')
    })

    it('en una fila aceptada marca la que se aceptó', () => {
        expect(seleccionDe(item({ reviewed: true, finalCode: 'S83.8' }), undefined, 3)).toBe('S83.8')
    })

    it('sin sugerencias no hay nada que marcar', () => {
        expect(seleccionDe(item({ sugerencias: [], principal: null }), undefined, 3)).toBeNull()
    })
})

describe('motivoSinCodigo', () => {
    it('explica cuando el modelo no logra completar cinco alternativas válidas', () => {
        const motivo = motivoSinCodigo(item({
            sugerencias: [],
            principal: null,
            error: 'CIE10_EXACT_FIVE_SUGGESTIONS_NOT_MET',
        }))
        expect(motivo).toContain('cinco alternativas válidas')
    })

    it('no muestra el código del proveedor', () => {
        const motivo = motivoSinCodigo(item({ sugerencias: [], principal: null, error: 'OPENAI_RESPONSE_ERROR' }))
        expect(motivo).not.toContain('OPENAI')
        expect(motivo).toMatch(/no respondió/)
    })

    it('usa el razonamiento clínico cuando no hubo error', () => {
        const razon = 'El texto no contiene información clínica suficiente.'
        expect(motivoSinCodigo(item({ sugerencias: [], principal: null, razonamientoClinico: razon }))).toBe(razon)
    })
})

describe('avisos de una opción', () => {
    it('solo el catálogo institucional va sin aviso de soporte', () => {
        expect(avisoSoporte('VALIDADO_INSTITUCIONAL')).toBeNull()
        expect(avisoSoporte(undefined)).toBeNull()
        expect(avisoSoporte('REFERENCIA_EXTERNA')).toMatch(/referencia externa/)
        expect(avisoSoporte('REQUIERE_ATENCION')).toMatch(/catálogo recuperado/)
    })

    it('arma la lista de lo que falta', () => {
        expect(avisoFaltante(opcion('S83.9'))).toBeNull()
        expect(avisoFaltante(opcion('S83.9', { informacionFaltante: ['Ligamento afectado', 'Lateralidad'] })))
            .toMatch(/le falta: ligamento afectado y lateralidad\./)
    })

    it('el punto del "i" sale con cualquiera de los dos avisos', () => {
        expect(tieneAvisos(opcion('J18.9', { soporte: 'VALIDADO_INSTITUCIONAL' }))).toBe(false)
        expect(tieneAvisos(opcion('S83.004A', { soporte: 'REFERENCIA_EXTERNA' }))).toBe(true)
        expect(tieneAvisos(opcion('S83.9', { informacionFaltante: ['Lateralidad'] }))).toBe(true)
    })
})

describe('codigoLibre', () => {
    it('normaliza y acepta los formatos de referencia externa', () => {
        expect(codigoLibre(' r69 ')).toBe('R69')
        expect(codigoLibre('s83.004a')).toBe('S83.004A')
        expect(codigoLibre('Z99.99')).toBe('Z99.99')
    })

    it('rechaza lo que no es un código', () => {
        expect(codigoLibre('esguince')).toBeNull()
        expect(codigoLibre('R6')).toBeNull()
        expect(codigoLibre('S83.00412')).toBeNull()
    })
})

describe('etiquetaPeriodo y fechaCorta', () => {
    it('pone el mes con mayúscula y el año', () => {
        expect(etiquetaPeriodo('2026-06')).toBe('Junio 2026')
        expect(etiquetaPeriodo('2026-01')).toBe('Enero 2026')
    })

    it('devuelve tal cual lo que no es un periodo', () => {
        expect(etiquetaPeriodo('junio')).toBe('junio')
        expect(etiquetaPeriodo(undefined)).toBe('')
    })

    it('formatea un instante como DD-MM-YYYY', () => {
        expect(fechaCorta('2026-10-17T18:30:00.000Z')).toMatch(/^\d{2}-10-2026$/)
        expect(fechaCorta(null)).toBe('')
        expect(fechaCorta('nada')).toBe('')
    })
})

describe('cantidad de sugerencias', () => {
    it('la tuerca queda entre 1 y 5, y un valor raro vuelve al de por defecto', () => {
        expect(clampCantidad(0)).toBe(CANTIDAD_MIN)
        expect(clampCantidad(12)).toBe(CANTIDAD_MAX)
        expect(clampCantidad(Number('basura'))).toBe(CANTIDAD_POR_DEFECTO)
    })

    it('recorta a las primeras, sin inventar las que no hay', () => {
        const opciones = ['A00', 'B01', 'C02', 'D03'].map((codigo) => opcion(codigo))
        expect(recortar(opciones, 3).map((o) => o.codigo)).toEqual(['A00', 'B01', 'C02'])
        expect(recortar(opciones.slice(0, 2), 5)).toHaveLength(2)
    })
})

describe('teclado', () => {
    const ctx = (partial: Partial<ContextoTecla> = {}): ContextoTecla => ({
        item: item(), objetivo: 'fila', conOpciones: true, soloLectura: false, verDetalle: true, ocupado: false, ...partial,
    })

    it('las flechas de arriba y abajo cambian de fila desde cualquier control', () => {
        expect(accionDeTecla('ArrowDown', ctx({ objetivo: 'boton' }))).toEqual({ tipo: 'fila', destino: 'siguiente' })
        expect(accionDeTecla('ArrowUp', ctx({ soloLectura: true }))).toEqual({ tipo: 'fila', destino: 'anterior' })
    })

    it('izquierda y derecha cambian de opción; Enter acepta; R rechaza; Espacio marca; I abre el detalle', () => {
        expect(accionDeTecla('ArrowRight', ctx())).toEqual({ tipo: 'opcion', delta: 1 })
        expect(accionDeTecla('Enter', ctx({ objetivo: 'opcion' }))).toEqual({ tipo: 'aceptar' })
        expect(accionDeTecla('R', ctx())).toEqual({ tipo: 'rechazar' })
        expect(accionDeTecla(' ', ctx())).toEqual({ tipo: 'marcar' })
        expect(accionDeTecla('i', ctx())).toEqual({ tipo: 'detalle' })
    })

    it('en una fila sin código, Enter y R abren "Ingresar código"', () => {
        const sinCodigo = item({ sugerencias: [], principal: null })
        expect(accionDeTecla('Enter', ctx({ item: sinCodigo, conOpciones: false }))).toEqual({ tipo: 'rechazar' })
        expect(accionDeTecla('r', ctx({ item: sinCodigo, conOpciones: false }))).toEqual({ tipo: 'rechazar' })
    })

    it('no hace nada si el foco está en un botón, si se está guardando o si el lote es de solo lectura', () => {
        expect(accionDeTecla('Enter', ctx({ objetivo: 'boton' }))).toBeNull()
        expect(accionDeTecla('Enter', ctx({ ocupado: true }))).toBeNull()
        expect(accionDeTecla('r', ctx({ soloLectura: true }))).toBeNull()
    })

    it('sin el detalle encendido, I no hace nada', () => {
        expect(accionDeTecla('i', ctx({ verDetalle: false }))).toBeNull()
    })

    it('la opción vecina no da la vuelta en los extremos', () => {
        expect(opcionVecina(item(), 'S83.9', 3, 1)).toBe('S83.8')
        expect(opcionVecina(item(), 'S83.9', 3, -1)).toBe('S83.9')
        expect(opcionVecina(item(), 'S83.6', 3, 1)).toBe('S83.6')
    })
})

describe('totalPaginas', () => {
    it('nunca baja de una', () => {
        expect(totalPaginas(0, 50)).toBe(1)
        expect(totalPaginas(120, 50)).toBe(3)
    })
})
