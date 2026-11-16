# =============================================================================
# CONGENIA Frontend - Dockerfile Multi-Stage
# =============================================================================
# Build de aplicación React/Vite para producción con servidor Nginx
# =============================================================================

# ── Stage 1: Instalación de dependencias ─────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

# Instalar pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copiar archivos de dependencias
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Instalar dependencias
RUN pnpm install --frozen-lockfile

# ── Stage 2: Build de la aplicación ──────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

# Instalar pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copiar dependencias del stage anterior
COPY --from=deps /app/node_modules ./node_modules

# Copiar código fuente
COPY . .

# Variables de build.
#
# VITE_API_BASE_URL y VITE_APP_ENV siguen aceptandose por compatibilidad, pero
# ya NO hacen falta: la configuracion se resuelve al arrancar el contenedor
# desde las variables API_BASE_URL y APP_ENV (ver docker-entrypoint.d/). Eso es
# lo que permite mover la API de sitio sin reconstruir ni volver a publicar la
# imagen. Los valores horneados quedan solo como ultimo recurso.
ARG VITE_OIDC_AUTHORITY
ARG VITE_OIDC_CLIENT_ID
ARG VITE_OIDC_REDIRECT_URI
ARG VITE_FHIR_BASE_URL
ARG VITE_API_BASE_URL
ARG VITE_APP_ENV=production

# Establecer variables de entorno para Vite
ENV VITE_OIDC_AUTHORITY=${VITE_OIDC_AUTHORITY}
ENV VITE_OIDC_CLIENT_ID=${VITE_OIDC_CLIENT_ID}
ENV VITE_OIDC_REDIRECT_URI=${VITE_OIDC_REDIRECT_URI}
ENV VITE_FHIR_BASE_URL=${VITE_FHIR_BASE_URL}
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_APP_ENV=${VITE_APP_ENV}

# Build de producción
RUN pnpm build

# ── Stage 3: Servidor de producción con Nginx ────────────────────────────────
FROM nginx:alpine AS runner

# Instalar wget para healthcheck
RUN apk add --no-cache wget

# Eliminar configuración por defecto de nginx
RUN rm -rf /usr/share/nginx/html/*

# Copiar build estático
COPY --from=builder /app/dist /usr/share/nginx/html

# Copiar configuración personalizada de nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Generador de la configuración de arranque. La imagen de nginx ejecuta todo
# lo que encuentre en /docker-entrypoint.d antes de levantar el servidor.
COPY docker-entrypoint.d/40-congenia-runtime-config.sh /docker-entrypoint.d/40-congenia-runtime-config.sh
RUN chmod +x /docker-entrypoint.d/40-congenia-runtime-config.sh

# Usuario no-root por seguridad
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid

# Exponer puerto 80
EXPOSE 80

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:80 || exit 1

# Ejecutar nginx en primer plano
CMD ["nginx", "-g", "daemon off;"]
