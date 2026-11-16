# CONGENIA - Entorno local reproducible

Este directorio contiene un snapshot autorizado de los componentes necesarios para reproducir localmente el modulo de inteligencia artificial integrado con CONGENIA.

## Estructura

- `CONGENIA-M1`: frontend clinico y dashboard.
- `CONGENIA-M1-SERVER`: API, migraciones, auditoria e integracion del agente.
- `CONGENIA-CIE10`: batch de sugerencias e indexacion CIE-10.
- `CONGENIA-REPORTING-PIPELINE`: preparacion y evaluacion reproducible de reportería.
- `CONGENIA-M1-PDF-WORKER`: generacion asincrona de consentimientos.
- `keycloak`: realm local para autenticacion.
- `docker-compose.yml`: orquestacion del entorno de desarrollo.

## Configuracion

```bash
cp .env.example .env
```

Los valores con prefijo `change_me_local_` son marcadores para desarrollo y deben sustituirse antes del arranque. `OPENAI_API_KEY` y `LLM_API_KEY` pueden permanecer vacias si no se ejecutaran las funciones que llaman al proveedor de IA.

No se incluyen datos de SIGSA, SADC, bases productivas ni archivos de evaluacion con texto clinico. Para reportería deben utilizarse los fixtures sinteticos incluidos en `CONGENIA-REPORTING-PIPELINE/fixtures`.

## Arranque

```bash
npm run start
npm run status
```

Servicios principales:

- Frontend: `http://localhost:8080`
- API: `http://localhost:3000`
- Documentacion de API: `http://localhost:3000/docs`
- Keycloak: `http://localhost:8082`
- RabbitMQ: `http://localhost:15672`

## Pruebas

Las dependencias de cada componente deben instalarse antes de ejecutar todas las pruebas fuera de Docker.

```bash
npx --yes pnpm@11.23.0 --dir CONGENIA-M1 install --frozen-lockfile
npm --prefix CONGENIA-M1-SERVER ci
npx --yes pnpm@11.18.0 --dir CONGENIA-CIE10 install --frozen-lockfile
npx --yes pnpm@11.18.0 --dir CONGENIA-REPORTING-PIPELINE install --frozen-lockfile
npm --prefix CONGENIA-M1-PDF-WORKER ci
npm test
```

## Procedencia del snapshot

El snapshot fue generado desde referencias remotas limpias. No contiene historiales Git internos, working trees locales ni secretos de los repositorios de desarrollo.
