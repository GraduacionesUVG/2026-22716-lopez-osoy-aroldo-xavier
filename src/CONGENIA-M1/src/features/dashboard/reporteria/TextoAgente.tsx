/**
 * @fileoverview El texto de una respuesta del agente, con su formato básico.
 *
 * Pinta el árbol de `interpretarTexto` con elementos de React: la etiqueta de
 * cada nodo sale de una lista cerrada (`EtiquetaPermitida`) y el texto va como
 * texto, que React escapa. Ver `textoSeguro.ts` para qué se acepta y por qué.
 */

import { createElement, useMemo, type ReactNode } from 'react'
import { interpretarTexto, type Nodo } from './textoSeguro'
import styles from './AgentChatPanel.module.css'

export function TextoAgente({ texto }: { texto: string }) {
    const { formato, nodos } = useMemo(() => interpretarTexto(texto), [texto])

    // Sin etiquetas, como siempre: un párrafo que respeta los saltos de línea.
    if (!formato) return <p>{nodos.join('')}</p>
    return <div className={styles.textoFormato}>{pintar(nodos)}</div>
}

function pintar(nodos: Nodo[]): ReactNode[] {
    return nodos.map((nodo, indice) => typeof nodo === 'string'
        ? nodo
        : nodo.etiqueta === 'br'
            ? <br key={indice} />
            : createElement(nodo.etiqueta, { key: indice }, ...pintar(nodo.hijos)))
}
