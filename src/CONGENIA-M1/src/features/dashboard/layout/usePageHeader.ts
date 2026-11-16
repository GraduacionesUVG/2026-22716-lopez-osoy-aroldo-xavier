/**
 * @fileoverview Hook para que una página fije el encabezado del dashboard.
 */

import { useContext, useEffect } from 'react'
import type { ReactNode } from 'react'
import { PageHeaderContext } from './PageHeaderContext'

/**
 * Fija el título del topbar mientras el componente está montado y lo suelta al
 * desmontarse, de modo que el siguiente tab recupere su nombre por sí solo.
 *
 * `highlight` es la parte del título que va en el azul claro de la marca, y se
 * pinta a continuación de `title`.
 *
 * `action` se compara por identidad, así que pásala memoizada o como un elemento
 * estable; un JSX nuevo en cada render dispararía el efecto cada vez.
 */
export function usePageHeader(title: string, highlight?: string, action?: ReactNode): void {
    const context = useContext(PageHeaderContext)
    if (!context) {
        throw new Error('usePageHeader() requiere que el arbol este dentro de <DashboardLayout>')
    }

    const { setHeader } = context

    useEffect(() => {
        setHeader({ title, highlight, action })
        return () => setHeader(null)
    }, [setHeader, title, highlight, action])
}
