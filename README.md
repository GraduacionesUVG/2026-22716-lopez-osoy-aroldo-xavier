# Sistema de apoyo a la decisión clínica para la sospecha de condiciones genéticas pediátricas mediante inteligencia artificial y análisis de datos clínicos en el Hospital Regional de Cobán: Módulo de Inteligencia Artificial

## Descripcion

CONGENIA es un sistema de apoyo para el registro y revision de fichas pediatricas geneticas. Esta entrega corresponde al modulo de inteligencia artificial y su integracion con la plataforma clinica. Incluye un agente de reportería que responde consultas sobre datos agregados y un flujo de sugerencias CIE-10 para revision profesional.

Las sugerencias generadas por inteligencia artificial no sustituyen el criterio medico. El profesional responsable debe revisar y confirmar cada resultado antes de utilizarlo.

## Componentes

- Frontend clinico y dashboard en React, Vite y TypeScript.
- API de integracion en Node.js, Express y PostgreSQL.
- Agente analitico con Responses API, herramientas de consulta agregada y Redis.
- Batch CIE-10 con recuperacion aumentada, revision por lotes y catalogo vectorial.
- Pipeline reproducible para anonimizar, validar e importar datos de reportería.
- Worker asincrono de consentimientos con RabbitMQ y almacenamiento compatible con S3.
- Autenticacion y autorizacion mediante Keycloak.

## Tecnologias utilizadas

- Node.js 22.13 o posterior, TypeScript y JavaScript.
- React, Vite y Recharts.
- Express, PostgreSQL y Redis.
- Keycloak, RabbitMQ y SeaweedFS.
- OpenAI Responses API y embeddings.
- Docker y Docker Compose.

## Requisitos previos

- Git.
- Docker 24 o posterior.
- Docker Compose 2.20 o posterior.
- Al menos 8 GB de memoria disponibles para el entorno local.

Node.js 22.13 o posterior y npm solo son necesarios para ejecutar pruebas fuera de Docker.

## Instalacion

1. Clonar el repositorio y entrar al codigo fuente.

   ```bash
   git clone https://github.com/XavierLopez25/2026-22716-lopez-osoy-aroldo-xavier.git
   cd 2026-22716-lopez-osoy-aroldo-xavier/src
   ```

2. Crear la configuracion local.

   ```bash
   cp .env.example .env
   ```

3. Reemplazar los valores `change_me_local_*` de `src/.env`. Las llaves de OpenAI son opcionales para levantar la plataforma, pero se requieren para ejecutar consultas reales del agente y el batch CIE-10.

4. Construir e iniciar los servicios.

   ```bash
   npm run start
   ```

5. Verificar su estado.

   ```bash
   npm run status
   npm run health
   ```

La interfaz queda disponible en `http://localhost:8080`, la API en `http://localhost:3000` y Keycloak en `http://localhost:8082`.

## Ejecucion y pruebas

```bash
cd src

# Logs del entorno
npm run logs

# Pruebas de los componentes principales
npm run test

# Detener el entorno
npm run stop
```

El batch CIE-10 se ejecuta bajo demanda con:

```bash
docker compose --profile jobs run --rm cie10_batch
```

La entrega no incluye bases hospitalarias ni datos productivos. Los fixtures incluidos son sinteticos y sirven exclusivamente para pruebas tecnicas.

## Capturas

Las capturas sanitizadas de las funcionalidades principales se encuentran en [`/capturas`](capturas/).

| Flujo clínico | Agente y reportería | Revisión CIE-10 |
| --- | --- | --- |
| [Búsqueda](capturas/captura-01.png) | [Dashboard](capturas/captura-05.png) | [Lote](capturas/captura-08.png) |
| [Registro manual](capturas/captura-02.png) | [Agente abierto](capturas/captura-06.png) | [Configuración](capturas/captura-09.png) |
| [Confirmación](capturas/captura-03.png) | [Respuesta analítica](capturas/captura-07.png) | [Detalle de sugerencia](capturas/captura-10.png) |
| [Ficha](capturas/captura-04.png) |  | [Corrección](capturas/captura-11.png) |
|  |  | [Responsabilidad profesional](capturas/captura-12.png) |

## Demo

El recorrido funcional del sistema se encuentra en [`/demo/demo.mp4`](demo/demo.mp4).

## Documentacion

- [Informe final](docs/informe_final.pdf)
- [Consentimiento de uso de foto y video firmado](docs/consentimiento_firmado.pdf)
- [Instrucciones tecnicas del codigo fuente](src/README.md)

## Privacidad y seguridad

Este repositorio no contiene credenciales productivas, historias clinicas reales ni datasets hospitalarios. Las capturas fueron censuradas y el entorno local utiliza valores de ejemplo. Los secretos deben suministrarse mediante variables de entorno y nunca versionarse.

## Autor

**Aroldo Xavier Lopez Osoy**  
Carné **22716**

## Licencia

Los componentes `CONGENIA-M1` y `CONGENIA-CIE10` conservan sus licencias MIT originales. Los demas componentes mantienen su titularidad y condiciones originales. La autorizacion de publicacion academica de esta entrega no concede una licencia adicional sobre los componentes que no incluyen una licencia expresa.
