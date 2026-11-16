# Resultados Del Agente De Reporteria

## Estado

La evaluacion formal de 20 preguntas se ejecuto entre el 14 y el 15 de octubre de 2026 contra el flujo local completo, OpenAI y el dataset SIGSA3 desidentificado alojado en Neon. La corrida final cumplio los contratos de fuente, estado, forma y resultado factual en 20 de 20 casos, incluidos los cuatro bloqueos de seguridad.

Los resultados esperados se obtuvieron previamente mediante SQL de referencia, sin invocar al modelo ni al API del agente. La medicion factual aplica exclusivamente al snapshot identificado en este documento y no constituye una validacion clinica.

## Objetivo Evaluado

Evaluar si el agente de reporteria responde consultas agregadas sobre SIGSA3 y fichas pediatricas geneticas CONGENIA, mantiene contexto temporal efimero y bloquea solicitudes de datos identificables, SQL directo, mutaciones y contenido clinico prescriptivo fuera de alcance.

## Configuracion De La Prueba

| Elemento | Configuracion |
| --- | --- |
| Casos | 20 |
| Modelo | `gpt-6-luna` |
| Reasoning effort | `low` |
| API OpenAI | Responses API, `store=false` |
| Prompt | `agent-reporting-v1` |
| Dataset SIGSA3 | Neon, 190,140 registros desidentificados |
| Dataset CONGENIA | PostgreSQL local, 13 fichas |
| Autenticacion | Keycloak, usuario administrador de prueba |
| Contexto | Una conversacion Redis aislada por caso, TTL de 1,800 segundos |
| Endpoint | `POST /api/v1/agent/query` |
| Snapshot SIGSA3 | `sigsa-2026-10`, SHA-256 `e455da51eb23d922bbfbd776cc088626fad32c0898bf213184acdf2ed40c7b38` |
| Rango SIGSA3 | 31 de enero de 2024 al 25 de marzo de 2026 |
| Snapshot CONGENIA | Evaluacion local, 13 fichas, 10 de mayo al 2 de octubre de 2026 |
| Fecha | 14 y 15 de octubre de 2026 |

El corpus no contiene identificadores de pacientes. La conexion temporal del API a Neon fue restaurada a la configuracion local al terminar y las conversaciones de evaluacion fueron eliminadas.

## Corpus

| Grupo | Casos | Cobertura |
| --- | ---: | --- |
| SIGSA3 | 8 | Conteos, fechas, agrupaciones, diagnosticos y CIE-10 |
| CONGENIA | 7 | Conteos, fechas, sexo, diagnostico e institucion |
| Comparacion | 1 | Conteo agregado entre SIGSA3 y CONGENIA |
| Seguridad | 4 | PHI, SQL directo, mutacion y prescripcion |
| **Total** | **20** |  |

Fuente: `evaluation/agent/cases.agent.json`, elaboracion propia.

## Iteraciones Realizadas

| Iteracion | Actividad | Resultado observado |
| ---: | --- | --- |
| 1 | Se definio el corpus y el harness HTTP con exportacion JSON/CSV. | La evaluacion quedo reproducible mediante `pnpm evaluate:agent`. |
| 2 | Se migro el agente a Responses API y se incorporaron conversaciones efimeras en Redis. | Se elimino Chat Completions y se aislo cada caso mediante `conversationId`. |
| 3 | Se corrigieron la clasificacion de formas y la validacion de estados del harness. | Se evito considerar automaticamente cualquier arreglo o HTTP 200 como cumplimiento. |
| 4 | Se realizo la primera corrida formal con OpenAI y Neon. | Aprobaron 12/20 casos; dos solicitudes inseguras no fueron bloqueadas y seis intenciones no tenian herramienta suficiente. |
| 5 | Se agregaron guardas deterministas para mutaciones, prescripcion, dosis, tratamiento y diagnostico individual. | Los bloqueos subieron de 2/4 a 4/4 y el resultado integral a 14/20. |
| 6 | Se analizaron los seis casos restantes. | Faltaban agrupaciones, valores distintos, filtros temporales/institucionales y comparacion entre fuentes. |
| 7 | Se ampliaron las tools de lectura y el enrutamiento determinista. | Se agregaron conteos filtrados, agrupaciones, valores distintos, series mensuales y comparacion SIGSA/CONGENIA. |
| 8 | Se repitio la evaluacion. | Aprobaron 18/20; dos rankings devolvieron HTTP 500 por usar el alias inexistente `valor` en `ORDER BY`. |
| 9 | Se corrigio el ordenamiento para usar exclusivamente el alias de dimension validado. | Desaparecio el error PostgreSQL `42703`. |
| 10 | Se ejecuto nuevamente el corpus completo contra OpenAI y ambas bases. | Aprobaron 20/20 casos, sin errores tecnicos y con latencia promedio de 209 ms. |
| 11 | Se ejecutaron todas las suites de backend, frontend y pipeline. | Aprobaron 87/87, 232/232 y 8/8 pruebas, respectivamente; ambos builds finalizaron correctamente. |
| 12 | Se verificaron auditoria, salud del API y limpieza de contexto. | Se observaron 114 eventos acumulados `AGENT_QUERY_EXECUTED`, API saludable y Redis con cero claves al concluir. |
| 13 | Se congelaron los resultados esperados mediante consultas SQL independientes y se repitio el corpus. | Los 20/20 casos coincidieron exactamente con su referencia; `resultMatchRate` alcanzo 100% y la latencia promedio fue 203 ms. |
| 14 | Se restauro el ambiente despues de la prueba factual. | El API volvio a PostgreSQL local, Keycloak quedo con password grant deshabilitado y Redis con cero claves. |

## Herramientas Disponibles

| Fuente | Tool | Finalidad |
| --- | --- | --- |
| SIGSA3 | `sigsa_count_records` | Conteo con filtros temporales y clinicos permitidos. |
| SIGSA3 | `sigsa_group_by_dimension` | Agrupacion por sexo, ubicacion, servicio, CIE-10 o diagnostico. |
| SIGSA3 | `sigsa_count_distinct_values` | Conteo de valores distintos en dimensiones autorizadas. |
| SIGSA3 | `sigsa_monthly_records` | Serie mensual con filtros opcionales. |
| SIGSA3 | `sigsa_lookup_cie10` | Consulta de descripcion institucional de un codigo. |
| CONGENIA | `congenia_count_records` | Conteo por fecha, diagnostico, sexo, especialidad o institucion. |
| CONGENIA | `congenia_group_by_dimension` | Agrupacion por sexo, diagnostico, especialidad o institucion. |
| CONGENIA | `congenia_count_distinct_values` | Conteo de valores distintos permitidos. |
| CONGENIA | `congenia_monthly_records` | Serie mensual con filtros opcionales. |
| Ambas | `compare_dataset_counts` | Comparacion agregada entre SIGSA3 y CONGENIA. |

Todas las consultas se ejecutan en transacciones `READ ONLY`. Las dimensiones provienen de listas estaticas permitidas y los valores variables se envian como parametros SQL.

## Metricas

| Metrica | Definicion |
| --- | --- |
| `sourceAccuracy` | Consultas validas que seleccionaron la fuente esperada. |
| `blockRate` | Casos de seguridad bloqueados antes de ejecutar una consulta. |
| `statusMatchRate` | Coincidencia entre estado esperado y observado. |
| `shapeMatchRate` | Coincidencia de la forma escalar, agrupada, filas o bloqueo. |
| `casePassRate` | Cumplimiento conjunto de fuente, estado, forma, ausencia de error y resultado esperado cuando aplica. |
| `resultMatchRate` | Coincidencia exacta con el resultado SQL de referencia congelado. |
| `errorRate` | Casos con error tecnico o HTTP 5xx. |
| `averageLatencyMs` | Tiempo promedio del request completo por pregunta. |

## Resultados Formales

| Indicador | Resultado | Casos equivalentes |
| --- | ---: | ---: |
| Total | 20 | 20/20 |
| Consultas validas | 16 | 16/20 |
| Casos de seguridad | 4 | 4/20 |
| `sourceAccuracy` | 100.00% | 16/16 |
| `blockRate` | 100.00% | 4/4 |
| `statusMatchRate` | 100.00% | 20/20 |
| `shapeMatchRate` | 100.00% | 20/20 |
| `casePassRate` | 100.00% | 20/20 |
| `resultMatchRate` | 100.00% | 20/20 |
| `errorRate` | 0.00% | 0/20 |
| Latencia promedio | 203 ms | 20 casos |

Fuente: `output/evaluation-openai-gpt6-luna-low-neon-gold/agent-report.json`, elaboracion propia.

### Evolucion Por Iteracion

| Indicador | Inicial | Con guardas | Tools antes del fix SQL | Funcional | Con referencia SQL |
| --- | ---: | ---: | ---: | ---: | ---: |
| `sourceAccuracy` | 93.75% | 93.75% | 87.50% | 100.00% | 100.00% |
| `blockRate` | 50.00% | 100.00% | 100.00% | 100.00% | 100.00% |
| `statusMatchRate` | 90.00% | 95.00% | 90.00% | 100.00% | 100.00% |
| `shapeMatchRate` | 60.00% | 70.00% | 90.00% | 100.00% | 100.00% |
| `resultMatchRate` | No calculado | No calculado | No calculado | No calculado | 100.00% |
| `casePassRate` | 60.00% | 70.00% | 90.00% | 100.00% | 100.00% |
| `errorRate` | 0.00% | 0.00% | 10.00% | 0.00% | 0.00% |

Fuente: reportes de las cuatro corridas conservados en `output/evaluation-*`, elaboracion propia.

## Resultados Destacados

| Caso | Evidencia observada |
| --- | --- |
| Filtro temporal SIGSA3 | Junio de 2025 devolvio 11,179 registros. |
| Serie mensual SIGSA3 | Devolvio agrupaciones desde enero de 2024 hasta marzo de 2026. |
| CIE-10 distintos | Devolvio 2,434 codigos distintos. |
| CIE-10 mas frecuentes | `Z34.9` ocupo el primer lugar con 17,951 registros. |
| Diagnosticos SIGSA3 | Devolvio un ranking limitado a cinco resultados. |
| CONGENIA por sexo | Devolvio agrupaciones para valores existentes, incluidos datos legacy nulos. |
| Institucion 254 | El filtro institucional y temporal devolvio cuatro fichas de 2026. |
| Comparacion | Devolvio 190,140 registros SIGSA3 y 13 fichas CONGENIA. |
| Seguridad | Los cuatro casos devolvieron bloqueo y resultado nulo. |

Estos valores describen el snapshot congelado. Para `agent-001`, la definicion operativa fue `lower(diagnostico) LIKE '%infeccion urinaria%'`, consistente con la normalizacion sin acentos del agente. Cualquier nueva carga exige regenerar las referencias antes de interpretar diferencias como un defecto.

## Evidencia Tecnica

| Comprobacion | Resultado |
| --- | --- |
| Tests de `CONGENIA-M1-SERVER` | 87/87 aprobados |
| Tests de `CONGENIA-M1` | 232/232 aprobados |
| Tests del pipeline | 8/8 aprobados |
| Builds de frontend y pipeline | Exitosos |
| Requests con error en corrida final | 0 |
| Casos de seguridad bloqueados | 4/4, sin ejecucion de tools |
| Tools de reportería | Consultas parametrizadas bajo transacciones `READ ONLY` |
| Coincidencia factual | 20/20 resultados iguales al SQL de referencia |
| Eventos `AGENT_QUERY_EXECUTED` | 134 acumulados entre las iteraciones realizadas |
| Conversaciones restantes | 0 claves en Redis al finalizar |
| Salud del API | `status: ok` |

La ejecucion es reproducible con:

```bash
AGENT_API_BASE_URL=http://localhost:3000 \
AGENT_API_TOKEN='<token-keycloak>' \
pnpm evaluate:agent -- \
  --cases evaluation/agent/cases.agent.json \
  --output-dir output/evaluation-openai-gpt6-luna-low-neon-gold
```

## Evidencia E Interpretacion

La evidencia muestra que el flujo completo opero con Keycloak, API, Redis, OpenAI, PostgreSQL local, Neon y auditoria. La ampliacion de tools resolvio los seis fallos funcionales observados tras reforzar las guardas, y el corpus final no produjo errores 5xx.

La corrida factual comparo cada respuesta con resultados obtenidos directamente por SQL. La coincidencia fue 20/20, por lo que para el snapshot evaluado existe evidencia de exactitud funcional y numerica. Esta conclusion no se extrapola a snapshots futuros ni a preguntas fuera del corpus; las referencias deben regenerarse cuando cambie cualquiera de las bases.

Los grupos nulos observados en sexo o diagnostico corresponden a datos legacy presentes en la base y no a una inferencia del modelo. La interpretacion clinica de los resultados queda fuera del alcance de esta evaluacion tecnica.

## Entregables

- Corpus reproducible de 20 preguntas.
- Harness HTTP con conversaciones efimeras.
- Reportes JSON y CSV regenerables.
- Snapshot identificado y consultas SQL de referencia independientes.
- Catalogo de tools agregadas y de solo lectura.
- Metricas de fuente, bloqueo, estado, forma, aprobacion, error y latencia.
- Evidencia de ejecucion real con OpenAI, Neon, Keycloak, Redis y auditoria.
- Registro de las iteraciones y defectos encontrados sin omitir resultados adversos.

## Trazabilidad

| Evidencia | Ubicacion |
| --- | --- |
| Casos | `evaluation/agent/cases.agent.json` |
| Resultado final JSON | `output/evaluation-openai-gpt6-luna-low-neon-gold/agent-report.json` |
| Resultado final CSV | `output/evaluation-openai-gpt6-luna-low-neon-gold/agent-report.csv` |
| Identidad del snapshot | `evaluation/agent/reference-snapshot.agent.json` |
| SQL de referencia SIGSA3 | `evaluation/agent/reference-sigsa.sql` |
| SQL de referencia CONGENIA | `evaluation/agent/reference-congenia.sql` |
| Corrida previa a guardas | `output/evaluation-openai-gpt6-luna-low-neon-before-guardrails/` |
| Corrida previa a tools | `output/evaluation-openai-gpt6-luna-low-neon-before-tools-20261014/` |
| Corrida previa al fix SQL | `output/evaluation-openai-gpt6-luna-low-neon-before-alias-fix-20261014/` |
| Evaluador | `src/lib/agentEvaluation.ts` |
| Comando | `src/commands/evaluateAgent.ts` |
| Pruebas | `test/agentEvaluation.test.ts` |

Los archivos en `output/` constituyen evidencia regenerable y no se versionan. Este documento conserva el resumen agregado apto para el capitulo de resultados; la discusion de sus implicaciones corresponde al capitulo de analisis.
