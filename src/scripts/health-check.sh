#!/usr/bin/env bash
# =============================================================================
# Script: Health Check del Stack CONGENIA
# =============================================================================
# Verifica el estado de salud de todos los servicios
#
# Uso:
#   ./scripts/health-check.sh
# =============================================================================

set -euo pipefail

# Cargar variables de .env si existe
if [ -f .env ]; then
    source .env
fi

POSTGRES_PORT="${POSTGRES_PORT:-5432}"
API_PORT="${API_PORT:-3000}"
FRONTEND_PORT="${FRONTEND_PORT:-8080}"
SEAWEED_MASTER_PORT="${SEAWEED_MASTER_PORT:-9333}"

echo "═══════════════════════════════════════════════════════════"
echo "  CONGENIA Stack Health Check"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Función para verificar un servicio
check_service() {
    local name=$1
    local url=$2
    local expected_pattern=$3

    printf "%-20s" "${name}:"

    if response=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "${url}" 2>/dev/null); then
        if [[ "${response}" =~ ${expected_pattern} ]]; then
            echo "✅ OK (HTTP ${response})"
            return 0
        else
            echo "⚠️  Respuesta inesperada (HTTP ${response})"
            return 1
        fi
    else
        echo "❌ NO DISPONIBLE"
        return 1
    fi
}

# Función para verificar PostgreSQL
check_postgres() {
    printf "%-20s" "PostgreSQL:"

    if docker compose exec -T postgres pg_isready -U "${POSTGRES_USER:-congenia}" -d "${POSTGRES_DB:-congenia}" >/dev/null 2>&1; then
        echo "✅ OK"
        return 0
    else
        echo "❌ NO DISPONIBLE"
        return 1
    fi
}

# Función para verificar contenedor Docker
check_container() {
    local name=$1
    local container_name=$2

    printf "%-20s" "${name} container:"

    if docker ps --format '{{.Names}}' | grep -q "^${container_name}$"; then
        local status=$(docker inspect --format='{{.State.Health.Status}}' "${container_name}" 2>/dev/null || echo "unknown")
        case "${status}" in
            healthy)
                echo "✅ HEALTHY"
                return 0
                ;;
            starting)
                echo "🔄 STARTING"
                return 1
                ;;
            unhealthy)
                echo "❌ UNHEALTHY"
                return 1
                ;;
            *)
                echo "⚠️  NO HEALTHCHECK"
                return 0
                ;;
        esac
    else
        echo "❌ NO CORRIENDO"
        return 1
    fi
}

# Contador de errores
errors=0

echo "Verificando contenedores..."
echo "───────────────────────────────────────────────────────────"
check_container "DB" "congenia_db" || ((errors++))
check_container "API" "congenia_api" || ((errors++))
check_container "Frontend" "congenia_frontend" || ((errors++))
check_container "SeaweedFS" "congenia_seaweedfs" || ((errors++))
check_container "PDF Worker" "congenia_pdf_worker" || ((errors++))
echo ""

echo "Verificando endpoints..."
echo "───────────────────────────────────────────────────────────"
check_postgres || ((errors++))
check_service "API Health" "http://localhost:${API_PORT}/health" "200" || ((errors++))
check_service "API Docs" "http://localhost:${API_PORT}/docs" "200" || ((errors++))
check_service "Frontend" "http://localhost:${FRONTEND_PORT}/" "200" || ((errors++))
check_service "SeaweedFS Master" "http://localhost:${SEAWEED_MASTER_PORT}/cluster/status" "200" || ((errors++))
echo ""

echo "Estadísticas de contenedores..."
echo "───────────────────────────────────────────────────────────"
docker compose ps
echo ""

if [ ${errors} -eq 0 ]; then
    echo "═══════════════════════════════════════════════════════════"
    echo "✅ Todos los servicios están saludables"
    echo "═══════════════════════════════════════════════════════════"
    exit 0
else
    echo "═══════════════════════════════════════════════════════════"
    echo "⚠️  ${errors} servicio(s) con problemas"
    echo "═══════════════════════════════════════════════════════════"
    echo ""
echo "Para ver logs:"
echo "  docker compose logs -f [postgres|api|frontend|seaweedfs|pdf_worker]"
    echo ""
    exit 1
fi
