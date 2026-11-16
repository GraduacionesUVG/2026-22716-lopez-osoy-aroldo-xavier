/**
 * @fileoverview Logica de firma: genera puntos y JSON del trazo (sin UI)
 */

import { useMemo, useRef, useState } from 'react'

export type SignaturePoint = {
    x: number
    y: number
    dragging: boolean
    t: number
}

export interface SignaturePointsState {
    points: SignaturePoint[]
    isDrawing: boolean
    signatureJson: string
    start: (point: { x: number; y: number }) => void
    move: (point: { x: number; y: number }) => void
    end: () => void
    clear: () => void
    setPoints: (points: SignaturePoint[]) => void
}

export function useSignaturePoints(): SignaturePointsState {
    const [points, setPoints] = useState<SignaturePoint[]>([])
    const [isDrawing, setIsDrawing] = useState(false)
    const isDrawingRef = useRef(false)

    const start = (point: { x: number; y: number }) => {
        isDrawingRef.current = true
        setIsDrawing(true)
        setPoints((prev) => [
            ...prev,
            { x: point.x, y: point.y, dragging: false, t: Date.now() },
        ])
    }

    const move = (point: { x: number; y: number }) => {
        if (!isDrawingRef.current) return
        setPoints((prev) => [
            ...prev,
            { x: point.x, y: point.y, dragging: true, t: Date.now() },
        ])
    }

    const end = () => {
        isDrawingRef.current = false
        setIsDrawing(false)
    }

    const clear = () => {
        setPoints([])
        isDrawingRef.current = false
        setIsDrawing(false)
    }

    const signatureJson = useMemo(() => JSON.stringify(points, null, 2), [points])

    return {
        points,
        isDrawing,
        signatureJson,
        start,
        move,
        end,
        clear,
        setPoints,
    }
}

export function getPointFromEvent(
    element: HTMLElement,
    event:
        | PointerEvent
        | MouseEvent
        | TouchEvent
        | { clientX: number; clientY: number; touches?: Array<{ clientX: number; clientY: number }> }
) {
    const rect = element.getBoundingClientRect()
    const isTouch = 'touches' in event && !!event.touches && event.touches.length > 0
    const clientX = isTouch
        ? event.touches[0].clientX
        : 'clientX' in event
            ? event.clientX
            : 0
    const clientY = isTouch
        ? event.touches[0].clientY
        : 'clientY' in event
            ? event.clientY
            : 0
    return {
        x: Math.round(clientX - rect.left),
        y: Math.round(clientY - rect.top),
    }
}
