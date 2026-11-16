/**
 * @fileoverview Componente SignaturePad
 *
 * Estados:
 *  - default: borde azul
 *  - signed: muestra estado verde
 *  - disabled: fondo gris claro
 *  - showHint: mano animada que traza una firma mientras el lienzo esta vacio
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Pointer } from 'lucide-react'
import styles from './SignaturePad.module.css'

interface SignaturePadProps {
    label: string
    helperText?: string
    clearLabel?: string
    successText?: string
    height?: number
    disabled?: boolean
    /**
     * Muestra una mano que traza una firma sobre el lienzo vacio. En las pruebas
     * de usabilidad el recuadro no se leia como algo que se toca; la pista se va
     * con el primer trazo y vuelve al borrar.
     */
    showHint?: boolean
    onChange?: (dataUrl: string | null) => void
    className?: string
}

// Mismo trazo para la linea y para el recorrido de la mano, asi van sincronizadas.
const HINT_PATH = 'M30 70 C 45 30, 62 28, 66 58 S 88 84, 100 52 S 124 26, 134 58 S 160 78, 176 46 S 204 38, 214 60 S 246 70, 270 48'
// Ciclo completo. Debe coincidir con la animacion `hint-draw` del CSS: el 70 % traza
// y el resto es pausa con la firma completa.
const HINT_DURATION = '2.8s'
// El icono mide 30 unidades; la punta del dedo cae en (10, 2.5) dentro de el.
const HAND_TIP = { x: 10, y: 2.5 }
const HINT_START = { x: 30, y: 70 }

function prefiereMenosMovimiento(): boolean {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function SignatureHint() {
    const [quieto] = useState(prefiereMenosMovimiento)

    return (
        <div className={styles.hint} aria-hidden="true">
            <svg className={styles.hintSvg} viewBox="0 0 300 100" preserveAspectRatio="xMidYMid meet">
                <path className={styles.hintStroke} d={HINT_PATH} pathLength={1} />
                <g>
                    {!quieto && (
                        <animateMotion
                            dur={HINT_DURATION}
                            repeatCount="indefinite"
                            path={HINT_PATH}
                            keyPoints="0;1;1"
                            keyTimes="0;0.7;1"
                            calcMode="linear"
                        />
                    )}
                    {/* animateMotion mueve el origen del grupo sobre el trazo; se
                        corre el icono para que ahi caiga la punta del dedo. Quieto,
                        se deja al inicio de la firma. */}
                    <Pointer
                        x={(quieto ? HINT_START.x : 0) - HAND_TIP.x}
                        y={(quieto ? HINT_START.y : 0) - HAND_TIP.y}
                        width={30}
                        height={30}
                        className={styles.hintHand}
                    />
                </g>
            </svg>
            <span className={styles.hintText}>Toque y deslice para firmar</span>
        </div>
    )
}

interface Point {
    x: number
    y: number
}

const getCssVar = (name: string, fallback: string) => {
    if (typeof window === 'undefined') return fallback
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    return value || fallback
}

export function SignaturePad({
    label,
    helperText = '(Espacio para Firma Electronica / Trazo en Pantalla)',
    clearLabel = 'Borrar firma',
    successText = 'Firma registrada',
    height = 120,
    disabled = false,
    showHint = false,
    onChange,
    className,
}: SignaturePadProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const drawingRef = useRef(false)
    const lastPointRef = useRef<Point | null>(null)
    const [hasSignature, setHasSignature] = useState(false)
    const hasSignatureRef = useRef(false)

    const strokeColor = useMemo(
        () => getCssVar('--color-primary', '#003E69'),
        []
    )

    useEffect(() => {
        hasSignatureRef.current = hasSignature
    }, [hasSignature])

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return

        const resize = () => {
            const rect = canvas.getBoundingClientRect()
            const ratio = window.devicePixelRatio || 1
            canvas.width = Math.round(rect.width * ratio)
            canvas.height = Math.round(rect.height * ratio)
            const ctx = canvas.getContext('2d')
            if (ctx) {
                ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
                ctx.lineWidth = 2
                ctx.lineCap = 'round'
                ctx.lineJoin = 'round'
                ctx.strokeStyle = strokeColor
            }
            if (hasSignatureRef.current) {
                setHasSignature(false)
                onChange?.(null)
            }
        }

        resize()
        const observer = new ResizeObserver(resize)
        observer.observe(canvas)
        return () => observer.disconnect()
    }, [strokeColor, onChange])

    const getPoint = (event: PointerEvent | React.PointerEvent<HTMLCanvasElement>): Point => {
        const canvas = canvasRef.current
        if (!canvas) return { x: 0, y: 0 }
        const rect = canvas.getBoundingClientRect()
        return {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
        }
    }

    const drawLine = (from: Point, to: Point) => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.beginPath()
        ctx.moveTo(from.x, from.y)
        ctx.lineTo(to.x, to.y)
        ctx.stroke()
    }

    const drawDot = (point: Point) => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.beginPath()
        ctx.arc(point.x, point.y, 1, 0, Math.PI * 2)
        ctx.fillStyle = strokeColor
        ctx.fill()
    }

    const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
        if (disabled) return
        event.preventDefault()
        drawingRef.current = true
        const point = getPoint(event)
        lastPointRef.current = point
        drawDot(point)
        setHasSignature(true)
        canvasRef.current?.setPointerCapture(event.pointerId)
    }

    const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
        if (!drawingRef.current || disabled) return
        event.preventDefault()
        const point = getPoint(event)
        const last = lastPointRef.current
        if (last) {
            drawLine(last, point)
        }
        lastPointRef.current = point
    }

    const finishDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => {
        if (!drawingRef.current) return
        drawingRef.current = false
        lastPointRef.current = null
        canvasRef.current?.releasePointerCapture(event.pointerId)
        if (canvasRef.current) {
            onChange?.(canvasRef.current.toDataURL('image/png'))
        }
    }

    const handleClear = () => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        drawingRef.current = false
        lastPointRef.current = null
        ctx.save()
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.restore()
        setHasSignature(false)
        onChange?.(null)
    }

    const containerClasses = [
        styles.container,
        disabled ? styles.disabled : '',
        className ?? '',
    ].filter(Boolean).join(' ')

    return (
        <div className={containerClasses}>
            <div className={styles.header}>
                <span className={styles.label}>{label}</span>
                {helperText && <span className={styles.helper}>{helperText}</span>}
            </div>
            <div className={styles.canvasWrapper} style={{ height }}>
                <canvas
                    ref={canvasRef}
                    className={styles.canvas}
                    aria-label={label}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={finishDrawing}
                    onPointerCancel={finishDrawing}
                />
                <div className={styles.baseline} aria-hidden="true" />
                {showHint && !disabled && !hasSignature && <SignatureHint />}
            </div>
            <div className={styles.footer}>
                <button
                    type="button"
                    className={styles.clearButton}
                    onClick={handleClear}
                    disabled={disabled || !hasSignature}
                >
                    <span className={styles.clearIcon} aria-hidden="true">
                        <svg
                            width="12"
                            height="12"
                            viewBox="0 0 12 12"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <path
                                d="M3 3L9 9M9 3L3 9"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                            />
                        </svg>
                    </span>
                    {clearLabel}
                </button>
                {hasSignature && (
                    <span className={styles.success}>
                        <span className={styles.successIcon} aria-hidden="true">
                            <svg
                                width="12"
                                height="12"
                                viewBox="0 0 16 16"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                                <path
                                    d="M4 8.25L6.5 10.75L12 5.25"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            </svg>
                        </span>
                        {successText}
                    </span>
                )}
            </div>
        </div>
    )
}
