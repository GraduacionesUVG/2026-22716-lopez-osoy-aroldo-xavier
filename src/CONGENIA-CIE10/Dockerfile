FROM node:22-alpine AS deps
WORKDIR /app

RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY tsconfig.json ./
COPY index.ts ./
COPY src ./src
RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app

RUN addgroup -S congenia && adduser -S congenia -G congenia && corepack enable
ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile
COPY --from=build /app/dist ./dist
# CA de RDS para POSTGRES_SSL_MODE=verify-full; solo se lee si el modo la pide.
COPY certs/rds-global-bundle.pem ./certs/rds-global-bundle.pem
ENV POSTGRES_SSL_CA_FILE=/app/certs/rds-global-bundle.pem

USER congenia
CMD ["node", "dist/index.js"]
