/**
 * @fileoverview Ruta inexistente.
 *
 * Manda a la ficha con una recarga completa y no con `navigate`: el destino es
 * el otro arbol de la aplicacion, y arrancarlo limpio evita heredar estado de
 * una navegacion que ya salio mal.
 */

import { ErrorView } from '../components/forms/ErrorView/ErrorView'
import { ROUTES } from './routes'

export function NotFoundPage() {
    return (
        <ErrorView
            title="Página no encontrada"
            message="La dirección que abriste no existe o cambió de lugar."
            retryLabel="Ir al inicio"
            onRetry={() => { window.location.href = ROUTES.ficha }}
        />
    )
}
