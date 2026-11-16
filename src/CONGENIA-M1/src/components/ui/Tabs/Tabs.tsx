/**
 * @fileoverview Tabs subrayadas.
 *
 * Solo pinta la fila de pestanas; el panel lo renderiza quien la usa. Asi la
 * pagina decide si desmonta el contenido al cambiar de tab o lo conserva, que
 * es justo lo que distingue una bandeja con tres listados de un acordeon.
 *
 * Teclado segun el patron ARIA: las flechas mueven el foco y seleccionan,
 * Inicio/Fin saltan a los extremos. `tabIndex` deja solo la activa en el orden
 * de tabulacion, para que Tab entre y salga del grupo de una vez.
 */

import { useRef } from 'react'
import styles from './Tabs.module.css'

export interface TabItem {
    id: string
    label: string
    /** Cuantos elementos hay en esa pestana. Se omite mientras no se sepa. */
    count?: number
}

export interface TabsProps {
    items: TabItem[]
    activeId: string
    onChange: (id: string) => void
    /** Describe el grupo para un lector de pantalla. */
    label: string
    /**
     * `underline` (por defecto) para pestanas dentro de una seccion;
     * `segmented` para elegir entre vistas completas, con el activo relleno.
     */
    variant?: 'underline' | 'segmented'
    className?: string
}

export function Tabs({ items, activeId, onChange, label, variant = 'underline', className }: TabsProps) {
    const refs = useRef<Record<string, HTMLButtonElement | null>>({})

    const move = (delta: number) => {
        const index = items.findIndex((item) => item.id === activeId)
        if (index < 0) return
        // Circular: desde la ultima, la flecha derecha vuelve a la primera.
        const next = items[(index + delta + items.length) % items.length]
        onChange(next.id)
        refs.current[next.id]?.focus()
    }

    const jumpTo = (item: TabItem) => {
        onChange(item.id)
        refs.current[item.id]?.focus()
    }

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'ArrowRight')      { event.preventDefault(); move(1) }
        else if (event.key === 'ArrowLeft')  { event.preventDefault(); move(-1) }
        else if (event.key === 'Home')       { event.preventDefault(); jumpTo(items[0]) }
        else if (event.key === 'End')        { event.preventDefault(); jumpTo(items[items.length - 1]) }
    }

    return (
        <div
            className={[
                styles.tablist,
                variant === 'segmented' ? styles.segmented : '',
                className ?? '',
            ].filter(Boolean).join(' ')}
            role="tablist"
            aria-label={label}
            onKeyDown={handleKeyDown}
        >
            {items.map((item) => {
                const selected = item.id === activeId

                return (
                    <button
                        key={item.id}
                        ref={(node) => { refs.current[item.id] = node }}
                        type="button"
                        role="tab"
                        id={`tab-${item.id}`}
                        aria-selected={selected}
                        aria-controls={`panel-${item.id}`}
                        tabIndex={selected ? 0 : -1}
                        className={selected ? `${styles.tab} ${styles.tabActive}` : styles.tab}
                        onClick={() => onChange(item.id)}
                    >
                        {item.label}
                        {item.count !== undefined && (
                            <span className={styles.count}>{item.count}</span>
                        )}
                    </button>
                )
            })}
        </div>
    )
}
