/**
 * @fileoverview Ruta de un lote CIE-10: `/dashboard/cie10/:runId`.
 *
 * Solo lee el id y sabe a dónde volver; la tabla y su estado viven en
 * `Cie10BatchReview`. El `key` la reinicia entera si se cambia de lote sin
 * pasar por la lista (atrás y adelante del navegador).
 */

import { useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ROUTES } from '../../../app/routes'
import { Cie10BatchReview } from './Cie10BatchReview'

// El permiso lo exige la ruta (DashboardRoutes + routePermissions).
export function Cie10LotePage() {
    const { runId = '' } = useParams()
    const navigate = useNavigate()

    // Vuelve a la pestaña donde está el lote: confirmado, ya no es pendiente.
    const volver = useCallback((revisado: boolean) => {
        navigate(revisado ? `${ROUTES.dashboardCie10}?estado=revisados` : ROUTES.dashboardCie10)
    }, [navigate])

    return <Cie10BatchReview key={runId} runId={runId} onVolver={volver} />
}
