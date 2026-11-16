/**
 * @fileoverview Red de seguridad para excepciones durante el render.
 *
 * Sin esto, una excepción en cualquier componente desmonta el árbol entero y el
 * médico se queda viendo una página en blanco, con el error solo en la consola.
 *
 * Ojo con el alcance: React solo entrega aquí los errores de render, de los
 * métodos de ciclo de vida y de los constructores. Lo que falle dentro de un
 * manejador de eventos o de una promesa NO pasa por aquí - eso ya lo atrapan
 * los `.catch` de App.tsx.
 *
 * @compliance ISO 27001 A.12.4 - se registra el mensaje y la pila de
 *                                componentes, nunca datos del formulario
 */

import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface ErrorBoundaryProps {
    children: ReactNode
    /** Qué pintar cuando el árbol reventó. */
    fallback: (error: Error) => ReactNode
}

interface ErrorBoundaryState {
    error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = { error: null }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { error }
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error(
            '[CONGENIA] Error no controlado en el render:',
            error.message,
            info.componentStack,
        )
    }

    render() {
        const { error } = this.state
        if (error) return this.props.fallback(error)
        return this.props.children
    }
}
