/**
 * @fileoverview Servicio de catálogos para la API de CONGENIA M1.
 *
 * Los catálogos son datos de referencia sin PHI, compartidos entre todos los tenants.
 * Todas las escrituras pasan por el backend - el frontend nunca muta la base de datos directamente.
 *
 * @compliance HL7 FHIR R4 - las entradas de catálogo se corresponden con conceptos CodeSystem / ValueSet
 */

import { apiFetch } from './api.client'

// Tipos de respuesta 

export interface CatRegionAnatomica {
    region_id: number
    nombre: string
    orden: number
    activo: boolean
}

export interface CatLateralidad {
    lateralidad_id: number
    codigo: string
    nombre: string
    orden: number
    activo: boolean
}

export interface CatParteCuerpo {
    parte_id: number
    region_id: number
    nombre: string
    orden: number
    requiere_lateralidad: boolean
    permite_linea_media: boolean
    activo: boolean
}

export interface CatSigno {
    signo_catalogo_id: number
    nombre_normalizado: string
    categoria: string
    descripcion_medica: string
    activo: boolean
}

export interface CatExamen {
    examen_catalogo_id: number
    nombre_normalizado: string
    tipo: string
    descripcion: string
    activo: boolean
}

export interface CatAsistenciaParto {
    asistencia_parto_id: number
    nombre: string
}

export interface CatReferidoDe {
    referido_de_id: number
    nombre: string
}

export interface CatFamiliar {
    familiar_catalogo_id: number
    nombre: string
}

export interface CatSexo {
    sexo_id: number
    codigo: 'M' | 'F' | 'I'
    nombre: string
}

// Partes agrupadas por región (para AlertSignsSection) 

export interface CatParteCuerpoAgrupada {
    regionId: number
    region:   string
    orden:    number
    partes: Array<{
        parteId:             number
        nombre:              string
        orden:               number
        requiereLateralidad: boolean
        permiteLineaMedia:   boolean
    }>
}

// Endpoints de lectura 

export const getRegiones              = () => apiFetch<CatRegionAnatomica[]>('/v1/Regiones')
export const getLateralidades         = () => apiFetch<CatLateralidad[]>('/v1/Lateralidades')
export const getPartesCuerpo          = () => apiFetch<CatParteCuerpo[]>('/v1/PartesCuerpo')
export const getPartesCuerpoAgrupadas = () => apiFetch<CatParteCuerpoAgrupada[]>('/v1/PartesCuerpo?groupBy=region')
export const getSignos                = () => apiFetch<CatSigno[]>('/v1/Signos')
export const getExamenes              = () => apiFetch<CatExamen[]>('/v1/Examenes')
export const getAsistenciaParto       = () => apiFetch<CatAsistenciaParto[]>('/v1/AsistenciaParto')
export const getReferidoDe            = () => apiFetch<CatReferidoDe[]>('/v1/ReferidoDe')
export const getFamiliares            = () => apiFetch<CatFamiliar[]>('/v1/Familiares')
export const getSexos                 = () => apiFetch<CatSexo[]>('/v1/Sexos')