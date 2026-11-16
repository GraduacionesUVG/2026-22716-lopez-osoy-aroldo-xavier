FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build && npm prune --omit=dev

FROM node:20-alpine AS runner
WORKDIR /app

RUN addgroup -S congenia && adduser -S congenia -G congenia

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/assets ./dist/assets
COPY package.json ./package.json
# CA de RDS para POSTGRES_SSL_MODE=verify-full; solo se lee si el modo la pide.
COPY certs/rds-global-bundle.pem ./certs/rds-global-bundle.pem
ENV POSTGRES_SSL_CA_FILE=/app/certs/rds-global-bundle.pem

USER congenia

CMD ["node", "dist/index.js"]
