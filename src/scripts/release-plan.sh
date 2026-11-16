#!/usr/bin/env bash
# =============================================================================
# Script: Plan de publicación de imágenes
# =============================================================================
# Calcula qué tag le toca a cada servicio, revisa si ese tag YA EXISTE en el
# registry y escribe los comandos que habría que correr.
#
# NO construye. NO publica. NO toca el registry más que para leer. La decisión
# de subir —y el orden -- es de quien opera.
#
# Por qué existe:
#   - Los servicios viven en repos distintos y avanzan a ritmos distintos.
#     Un tag compartido ("latest", o una versión suelta) obliga a republicar
#     las tres imágenes para mover una, y hace imposible saber qué código está
#     corriendo.
#   - El tag se deriva del commit: <version de package.json>-<sha corto>. Dos
#     builds del mismo commit dan el mismo tag; dos commits distintos, nunca.
#   - Con ECR en modo inmutable (modules/platform del repo de infraestructura),
#     el registry rechaza un push que pisaría un tag existente. El orden deja
#     de depender de que alguien se acuerde.
#
# Uso:
#   ./scripts/release-plan.sh                       # plan para ECR
#   ./scripts/release-plan.sh --registry dockerhub  # plan para Docker Hub
#   ./scripts/release-plan.sh --write ../CONGENIA-INFRA/envs/aws/images.tfvars
# =============================================================================

set -euo pipefail

REGISTRY_KIND="ecr"
WRITE_TO=""
AWS_REGION="${AWS_REGION:-us-east-1}"
DOCKER_HUB_USER="${DOCKER_HUB_USER:-xavierlopez25}"
DOCKER_HUB_REPO="${DOCKER_HUB_REPO:-congenia}"
PLATFORM="${PLATFORM:-linux/amd64}"

while [ $# -gt 0 ]; do
    case "$1" in
        --registry) REGISTRY_KIND="${2:?falta el valor de --registry}"; shift 2 ;;
        --write)    WRITE_TO="${2:?falta la ruta de --write}"; shift 2 ;;
        -h|--help)  sed -n '2,30p' "$0"; exit 0 ;;
        *) echo "Opción desconocida: $1" >&2; exit 1 ;;
    esac
done

# servicio | directorio del repo | repositorio ECR | prefijo en Docker Hub
SERVICIOS="
api|CONGENIA-M1-SERVER|congenia/api|api
frontend|CONGENIA-M1|congenia/frontend|frontend
pdf-worker|CONGENIA-M1-PDF-WORKER|congenia/pdf-worker|pdf-worker
cie10|CONGENIA-CIE10|congenia/cie10|cie10
keycloak|keycloak|congenia/keycloak|keycloak
"

registro_ecr() {
    local cuenta
    cuenta=$(aws sts get-caller-identity --query Account --output text 2>/dev/null) || return 1
    echo "${cuenta}.dkr.ecr.${AWS_REGION}.amazonaws.com"
}

version_de() {
    if [ -f "$1/package.json" ]; then
        node -p "require('./$1/package.json').version" 2>/dev/null || echo "0.0.0"
    elif [ -f "$1/VERSION" ]; then
        tr -d '[:space:]' < "$1/VERSION"
    else
        echo "0.0.0"
    fi
}

# El sha que identifica el contenido de una imagen.
#
# Los servicios son cada uno su propio repositorio y basta el HEAD. keycloak,
# en cambio, es un directorio del orquestador: usar el HEAD haría que un commit
# de documentación en este repo cambiara el tag de Keycloak sin que la imagen
# hubiera cambiado. Mirando el historial del directorio, el tag sigue al
# contenido.
#
# Es la misma regla que aplican los workflows de GitHub Actions. Las dos vías
# de publicación tienen que calcular el mismo tag para el mismo código, o el
# plan local diría "nueva" sobre algo que el pipeline ya publicó.
sha_de() {
    local dir="$1" sha
    if [ -d "$dir/.git" ]; then
        sha=$(git -C "$dir" rev-parse HEAD 2>/dev/null | cut -c1-7)
    else
        sha=$(git log -1 --format=%H -- "$dir" 2>/dev/null | cut -c1-7)
    fi
    echo "${sha:-sinrepo}"
}

# Un árbol sucio no puede publicarse: el tag apuntaría a un commit que no
# contiene lo que se construyó, y con tags inmutables eso no se corrige. Se
# acota al directorio por la misma razón que sha_de.
sucio() {
    if [ -d "$1/.git" ]; then
        [ -n "$(git -C "$1" status --porcelain 2>/dev/null)" ]
    else
        [ -n "$(git status --porcelain -- "$1" 2>/dev/null)" ]
    fi
}

existe_en_ecr() {
    aws ecr describe-images --region "$AWS_REGION" \
        --repository-name "$1" --image-ids "imageTag=$2" >/dev/null 2>&1
}

existe_en_dockerhub() {
    docker manifest inspect "$1" >/dev/null 2>&1
}

echo "═══════════════════════════════════════════════════════════════════════"
echo "  Plan de publicación — registry: ${REGISTRY_KIND}"
echo "═══════════════════════════════════════════════════════════════════════"

BASE=""
if [ "$REGISTRY_KIND" = "ecr" ]; then
    if ! BASE=$(registro_ecr); then
        echo "AVISO: sin credenciales de AWS. Se calculan los tags, pero no se"
        echo "       puede comprobar si ya existen en el registry."
        BASE="<cuenta>.dkr.ecr.${AWS_REGION}.amazonaws.com"
    fi
    echo "  Registro: ${BASE}"
else
    echo "  Registro: docker.io/${DOCKER_HUB_USER}/${DOCKER_HUB_REPO}"
fi
echo "  Plataforma: ${PLATFORM}"
echo ""

printf "  %-11s %-9s %-9s %-22s %s\n" SERVICIO VERSION COMMIT TAG ESTADO
printf "  %-11s %-9s %-9s %-22s %s\n" \
    "───────────" "─────────" "─────────" "──────────────────────" "──────"

COMANDOS=""
TFVARS=""
HAY_SUCIOS=0
HAY_COLISIONES=0

for linea in $SERVICIOS; do
    [ -z "$linea" ] && continue
    servicio="${linea%%|*}";      resto="${linea#*|}"
    directorio="${resto%%|*}";    resto="${resto#*|}"
    repo_ecr="${resto%%|*}"
    prefijo_hub="${resto##*|}"

    version=$(version_de "$directorio")
    sha=$(sha_de "$directorio")
    tag="${version}-${sha}"

    marca=""
    if sucio "$directorio"; then
        marca=" (sin commitear)"
        HAY_SUCIOS=1
    fi

    if [ "$REGISTRY_KIND" = "ecr" ]; then
        referencia="${BASE}/${repo_ecr}:${tag}"
        if [ "${BASE#<}" = "$BASE" ] && existe_en_ecr "$repo_ecr" "$tag"; then
            estado="YA EXISTE — no la vuelvas a subir"
            HAY_COLISIONES=1
        else
            estado="nueva"
        fi
    else
        referencia="${DOCKER_HUB_USER}/${DOCKER_HUB_REPO}:${prefijo_hub}-${tag}"
        if existe_en_dockerhub "$referencia"; then
            estado="YA EXISTE — no la vuelvas a subir"
            HAY_COLISIONES=1
        else
            estado="nueva (o repo privado sin login)"
        fi
    fi

    printf "  %-11s %-9s %-9s %-22s %s%s\n" "$servicio" "$version" "$sha" "$tag" "$estado" "$marca"

    COMANDOS="${COMANDOS}
docker buildx build --platform ${PLATFORM} \\
  -t ${referencia} \\
  -f ${directorio}/Dockerfile ${directorio} --push
"
    TFVARS="${TFVARS}  \"${servicio}\" = \"${tag}\"
"
done

# La imagen de migración se construye desde CONGENIA-M1-SERVER/db, junto a los
# .sql que hornea, y forma parte del mismo manifiesto inmutable.
#
# El tag sigue a db/ entero y no solo a db/init: el entrypoint y el Dockerfile
# también son contenido de la imagen. Mirando solo los .sql, un arreglo en el
# entrypoint no cambiaría el tag y ECR rechazaría la publicación por duplicado
# sin que nada la corrigiera.
schema_sha=$(git -C "CONGENIA-M1-SERVER" log -1 --format=%H -- db 2>/dev/null | cut -c1-7)
migrate_tag="schema-${schema_sha:-sinrepo}"
if [ "$REGISTRY_KIND" = "ecr" ]; then
    if [ "${BASE#<}" = "$BASE" ] && existe_en_ecr "congenia/migrate" "$migrate_tag"; then
        migrate_estado="YA EXISTE — no la vuelvas a subir"
        HAY_COLISIONES=1
    else
        migrate_estado="nueva"
    fi
    printf "  %-11s %-9s %-9s %-22s %s\n" "migrate" "schema" "$schema_sha" "$migrate_tag" "$migrate_estado"
    COMANDOS="${COMANDOS}
(cd ../CONGENIA-INFRA && make migrate-image ENV=aws ORCH_DIR=../ProjectUVG IMAGE_TAG=${migrate_tag})
#   ...o dejar que lo haga el workflow publish-migrate al mergear en main.
"
else
    printf "  %-11s %-9s %-9s %-22s %s\n" "migrate" "schema" "$schema_sha" "$migrate_tag" "solo ECR"
fi
TFVARS="${TFVARS}  \"migrate\" = \"${migrate_tag}\"
"

echo ""
if [ "$HAY_SUCIOS" = "1" ]; then
    echo "  ⚠  Hay repos con cambios sin commitear. El tag apuntaría a un commit"
    echo "     que no contiene lo construido: commitea antes de publicar."
    echo ""
fi
if [ "$HAY_COLISIONES" = "1" ]; then
    echo "  ⚠  Algún tag ya existe. Con ECR inmutable el push será rechazado;"
    echo "     en Docker Hub sobrescribiría lo que hay. Si el contenido cambió,"
    echo "     lo que falta es un commit nuevo, no otro push."
    echo ""
fi

echo "───────────────────────────────────────────────────────────────────────"
echo "  Comandos (revisalos y corrélos vos; este script no publica)"
echo "───────────────────────────────────────────────────────────────────────"
if [ "$REGISTRY_KIND" = "ecr" ]; then
    echo "
aws ecr get-login-password --region ${AWS_REGION} \\
  | docker login --username AWS --password-stdin ${BASE}"
else
    echo "
docker login"
fi
echo "$COMANDOS"
echo "  Nota: el frontend ya NO necesita --build-arg VITE_API_BASE_URL."
echo "        La URL de la API se resuelve al arrancar el contenedor."
echo ""

BLOQUE="# Generado por scripts/release-plan.sh — que imagen corre cada servicio.
# Se aplica con: terraform apply -var-file=images.tfvars
image_tags = {
${TFVARS}}"

if [ -n "$WRITE_TO" ]; then
    printf '%s\n' "$BLOQUE" > "$WRITE_TO"
    # CONGENIA-INFRA verifica `terraform fmt -check` en cada PR. Sin esto, un
    # manifiesto escrito a mano fallaría su propia verificación.
    command -v terraform >/dev/null && terraform fmt "$WRITE_TO" >/dev/null
    echo "───────────────────────────────────────────────────────────────────────"
    echo "  Escrito en ${WRITE_TO}"
    echo "  Commiteálo: es el registro de qué versión está desplegada."
else
    echo "───────────────────────────────────────────────────────────────────────"
    echo "  Manifiesto para el repo de infraestructura (--write para guardarlo)"
    echo "───────────────────────────────────────────────────────────────────────"
    printf '%s\n' "$BLOQUE"
fi
