#!/bin/sh
# =============================================================================
# Genera /usr/share/nginx/html/config.js a partir del entorno del contenedor.
#
# La imagen de nginx ejecuta todos los *.sh de /docker-entrypoint.d antes de
# arrancar el servidor, asi que no hace falta sustituir el ENTRYPOINT.
#
# Esto es lo que permite que una misma imagen sirva para local, para el ALB y
# para congenia.app sin reconstruirla.
# =============================================================================
set -eu

CONFIG_FILE=/usr/share/nginx/html/config.js

# Vacio a proposito: significa "mismo origen". Detras del ALB, el frontend se
# sirve en / y la API en /v1/*, de modo que el navegador ya esta en el host
# correcto y no hay que decirle nada.
API_BASE_URL="${API_BASE_URL:-}"

# La busqueda en el SADC (Nursera) la hace la API; el navegador ya no llama a
# ese host y no necesita su URL.

APP_ENV="${APP_ENV:-production}"
OIDC_AUTHORITY="${OIDC_AUTHORITY:-}"
OIDC_CLIENT_ID="${OIDC_CLIENT_ID:-congenia-web}"
USE_FICHA_SEARCH_MOCK="${USE_FICHA_SEARCH_MOCK:-}"
USE_ADENDAS_MOCK="${USE_ADENDAS_MOCK:-}"
USE_CIE10_MOCK="${USE_CIE10_MOCK:-}"
ALLOW_DEV_SESSION="${ALLOW_DEV_SESSION:-false}"

# Se escriben con comillas dobles y se escapan las que vengan en el valor, para
# que una URL rara no pueda romper el archivo ni inyectar codigo.
escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

cat > "$CONFIG_FILE" <<CONFIG
window.__CONGENIA_CONFIG__ = {
  API_BASE_URL: "$(escape "$API_BASE_URL")",
  OIDC_AUTHORITY: "$(escape "$OIDC_AUTHORITY")",
  OIDC_CLIENT_ID: "$(escape "$OIDC_CLIENT_ID")",
  APP_ENV: "$(escape "$APP_ENV")",
  USE_FICHA_SEARCH_MOCK: "$(escape "$USE_FICHA_SEARCH_MOCK")",
  USE_ADENDAS_MOCK: "$(escape "$USE_ADENDAS_MOCK")",
  USE_CIE10_MOCK: "$(escape "$USE_CIE10_MOCK")",
  ALLOW_DEV_SESSION: "$(escape "$ALLOW_DEV_SESSION")",
};
CONFIG

echo "[congenia] config.js generado — API_BASE_URL='${API_BASE_URL:-(mismo origen)}' APP_ENV='${APP_ENV}' USE_FICHA_SEARCH_MOCK='${USE_FICHA_SEARCH_MOCK:-auto}' USE_ADENDAS_MOCK='${USE_ADENDAS_MOCK:-auto}' USE_CIE10_MOCK='${USE_CIE10_MOCK:-auto}' ALLOW_DEV_SESSION='${ALLOW_DEV_SESSION}'"
