# CONGENIA Reporting Pipeline

Herramienta operativa para preparar el dataset desidentificado usado por
reportería y por el agente Text-to-SQL. Este repo no es un servicio productivo:
no expone API, no publica imagen Docker y no forma parte del deploy de
`CONGENIA-INFRA`.

## Setup Local

```bash
pnpm install
cp .env.example .env
```

El CSV original hospitalario no debe versionarse ni subirse a servicios
externos. El usuario del proyecto compartirá el `.env` de `CONGENIA-ORCH` cuando
se necesite probar contra el ambiente local completo.

## Flujo Con Fixture Sintético

```bash
pnpm anonymize:sigsa -- \
  --input fixtures/sigsa_raw_fixture.csv \
  --output output/sigsa_desidentified.csv \
  --manifest output/manifest.json \
  --dataset-version sigsa-local-fixture

pnpm validate:sigsa -- --input output/sigsa_desidentified.csv

REPORTING_DATABASE_ADMIN_URL='postgres://congenia:congenia_dev_postgres_123@localhost:5432/congenia' \
pnpm import:sigsa -- \
  --input output/sigsa_desidentified.csv \
  --manifest output/manifest.json
```

El fixture sintético contiene pocos registros. No representa la base completa de
SIGSA3.

## Pruebas

```bash
pnpm build
pnpm test
```

## Evaluar El Agente

Con `CONGENIA-ORCH` levantado:

```bash
AGENT_API_BASE_URL=http://localhost:3000 \
AGENT_API_TOKEN='<bearer-token-keycloak>' \
pnpm evaluate:agent -- --cases evaluation/agent/cases.agent.json
```

El comando genera `output/evaluation/agent-report.json` y
`output/evaluation/agent-report.csv`. La suite formal incluye 20 consultas:
conteos simples, filtros temporales, multiples condiciones, agrupaciones,
SIGSA, CONGENIA y casos de seguridad esperados como bloqueados.

Las transformaciones multi-tool que reutilizan resultados temporales se validan
por separado, sobre los mismos resultados SQL congelados:

```bash
AGENT_API_BASE_URL=http://localhost:3000 \
AGENT_API_TOKEN='<bearer-token-keycloak>' \
pnpm evaluate:agent -- \
  --cases evaluation/agent/cases.agent-multitool.json \
  --output-dir output/evaluation-multitool
```

Usuarios locales útiles:

- Dashboard admin: `admin-doctor`
- Dashboard admin password: `congenia_dev_medico_123`
- Keycloak admin: `admin`
- Keycloak admin password: `congenia_dev_keycloak_123`
