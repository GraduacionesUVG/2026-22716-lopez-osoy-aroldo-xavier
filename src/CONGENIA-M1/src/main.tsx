import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { AppRouter } from './app/AppRouter'
import { ErrorBoundary } from './components/ui/ErrorBoundary/ErrorBoundary'
import { ErrorView } from './components/forms/ErrorView/ErrorView'
import { setAccessTokenProvider, setAuthFailureHandlers } from './services/api.client'
import { getValidAccessToken, handleUnauthorized, refreshSession } from './services/auth.service'

// El cliente HTTP necesita el token de Keycloak para las lecturas del dashboard,
// pero importarlo directamente lo ataría al proveedor de identidad. Se inyecta
// aquí, en el único punto donde ya conviven las dos mitades de la app.
setAccessTokenProvider(getValidAccessToken)
// Mismo motivo: que hacer cuando la API rechaza ese token, en un solo lugar.
setAuthFailureHandlers({
    onUnauthorized: handleUnauthorized,
    onForbidden: () => { void refreshSession() },
})

// El boundary va por fuera del enrutador a propósito: así cubre también un fallo
// en el primer render, que es justo cuando no habría nada más que lo atrapara.
//
// "Reintentar" recarga la página entera en vez de limpiar el estado: cuando el
// árbol revienta a media captura no hay forma fiable de saber qué quedó a
// medias, y arrancar de cero es lo único que se puede prometer.
//
// El detalle del error no se pinta en pantalla - queda en la consola vía
// componentDidCatch. Un mensaje de excepción puede arrastrar datos del
// formulario, y esta app no expone eso en la interfaz.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary
      fallback={() => <ErrorView onRetry={() => window.location.reload()} />}
    >
      <AppRouter />
    </ErrorBoundary>
  </StrictMode>,
)
