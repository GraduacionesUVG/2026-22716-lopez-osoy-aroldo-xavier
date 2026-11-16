# Operación del Pipeline de Reportería

`CONGENIA-REPORTING-PIPELINE` prepara datasets desidentificados para reportería
y evaluación del agente. No reemplaza a `CONGENIA-DO`: ese repo conserva la
investigación de data obscura y sus notebooks.

## Preparación local

```bash
pnpm install
cp .env.example .env
```

El CSV original debe permanecer en un entorno controlado y fuera del repositorio.

## Desidentificar

```bash
pnpm anonymize:sigsa -- \
  --input /ruta/segura/SIGSA3Migrado_Puro.csv \
  --output output/sigsa_desidentified.csv \
  --manifest output/manifest.json \
  --dataset-version sigsa-2026-10
```

## Validar

```bash
pnpm validate:sigsa -- --input output/sigsa_desidentified.csv
```

## Importar

```bash
REPORTING_DATABASE_ADMIN_URL='postgres://...' \
pnpm import:sigsa -- \
  --input output/sigsa_desidentified.csv \
  --manifest output/manifest.json
```

## Evaluar agente

```bash
AGENT_API_BASE_URL=http://localhost:3000 \
AGENT_API_TOKEN='<keycloak-token>' \
pnpm evaluate:agent -- --cases fixtures/evaluation_cases.json
```
