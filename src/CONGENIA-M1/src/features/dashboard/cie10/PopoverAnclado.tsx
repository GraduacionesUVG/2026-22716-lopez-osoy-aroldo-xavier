/**
 * @fileoverview Botón que abre un globo con clic, no con hover.
 *
 * Con hover no se puede abrir en una tableta, y el médico tendría que pasar el
 * mouse por cada opción para leer por qué se propuso. Usa el atributo `popover`
 * del navegador: el globo sale en la capa superior (la tabla tiene scroll y lo
 * recortaría), y Esc o un clic fuera lo cierran sin código propio.
 *
 * El navegador no sabe dónde está el botón, así que la posición se calcula al
 * abrir. Como queda fijo en pantalla, se cierra si la página se desplaza.
 */

import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode, ToggleEvent } from 'react'
import styles from './Cie10BatchReview.module.css'

export interface PopoverAncladoProps {
    /** Nombre del botón para el lector de pantalla: el botón solo lleva un ícono. */
    etiqueta: string
    icono: ReactNode
    children: ReactNode
    /** `end` alinea el borde derecho del globo con el botón, para los que van a la derecha. */
    alinear?: 'start' | 'end'
    botonClassName?: string
}

const ANCHO = 320
const MARGEN = 8

export function PopoverAnclado({ etiqueta, icono, children, alinear = 'start', botonClassName }: PopoverAncladoProps) {
    const id = useId()
    const botonRef = useRef<HTMLButtonElement>(null)
    const globoRef = useRef<HTMLDivElement>(null)
    const [abierto, setAbierto] = useState(false)

    const posicionar = (event: ToggleEvent<HTMLDivElement>) => {
        const boton = botonRef.current
        const globo = globoRef.current
        if (event.newState !== 'open' || !boton || !globo) return
        const r = boton.getBoundingClientRect()
        const deseado = alinear === 'end' ? r.right - ANCHO : r.left
        const left = Math.min(Math.max(MARGEN, deseado), window.innerWidth - ANCHO - MARGEN)
        globo.style.top = `${r.bottom + 6}px`
        globo.style.left = `${Math.max(MARGEN, left)}px`
    }

    useEffect(() => {
        if (!abierto) return
        const cerrar = () => globoRef.current?.hidePopover()
        window.addEventListener('scroll', cerrar, true)
        window.addEventListener('resize', cerrar)
        return () => {
            window.removeEventListener('scroll', cerrar, true)
            window.removeEventListener('resize', cerrar)
        }
    }, [abierto])

    return (
        <>
            <button
                ref={botonRef}
                type="button"
                className={botonClassName ?? styles.iconoBoton}
                popoverTarget={id}
                aria-label={etiqueta}
                aria-expanded={abierto}
            >
                {icono}
            </button>
            <div
                ref={globoRef}
                id={id}
                popover="auto"
                className={styles.globo}
                style={{ width: ANCHO }}
                onBeforeToggle={posicionar}
                onToggle={(event) => setAbierto(event.newState === 'open')}
            >
                {children}
            </div>
        </>
    )
}
