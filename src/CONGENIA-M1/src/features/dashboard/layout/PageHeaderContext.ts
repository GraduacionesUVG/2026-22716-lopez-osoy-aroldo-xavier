/**
 * @fileoverview Contexto del encabezado del dashboard.
 *
 * Por defecto el topbar muestra el nombre del tab activo (`NAV_ITEMS`). Algunas
 * pantallas necesitan otra cosa: la búsqueda tiene su propio título, y el visor
 * de una ficha muestra el nombre del paciente más un botón para regresar.
 *
 * En vez de que cada página dibuje su propio encabezado -y queden dos títulos
 * apilados- la página le presta el suyo al layout mientras está montada.
 */

import { createContext } from 'react'
import type { ReactNode } from 'react'

export interface PageHeader {
    title: string
    /**
     * Parte del título que se pinta en el azul claro de la marca: hoy, el nombre
     * del paciente.
     *
     * Va como texto aparte y no como JSX dentro de `title` para que el efecto de
     * `usePageHeader` pueda comparar por valor. Un elemento nuevo en cada render
     * volvería a dispararlo sin parar.
     */
    highlight?: string
    /** Se pinta a la derecha del topbar. Hoy, el botón de regresar. */
    action?: ReactNode
}

export interface PageHeaderContextValue {
    header: PageHeader | null
    setHeader: (header: PageHeader | null) => void
}

export const PageHeaderContext = createContext<PageHeaderContextValue | null>(null)
