# ── Stage 1: dependencias ─────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# ── Stage 2: imagen de producción ─────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

# Usuario no-root por seguridad
RUN addgroup -S congenia && adduser -S congenia -G congenia

COPY --from=deps /app/node_modules ./node_modules
COPY src ./src
# Politica de permisos: va dentro de la imagen; cambiarla exige un despliegue.
COPY config ./config
COPY scripts ./scripts
COPY package.json ./
# CA de RDS para POSTGRES_SSL_MODE=verify-full; solo se lee si el modo la pide.
COPY certs/rds-global-bundle.pem ./certs/rds-global-bundle.pem
ENV POSTGRES_SSL_CA_FILE=/app/certs/rds-global-bundle.pem

USER congenia

EXPOSE 3000

CMD ["node", "src/server.js"]
