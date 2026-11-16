# Resultados De CIE-10 Sugerencia

> Nota de vigencia: estos resultados corresponden al contrato anterior que
> exigia exactamente cinco sugerencias filtradas por el catalogo institucional.
> Se conservan como evidencia historica y no representan el flujo RAG actual,
> que devuelve una sugerencia principal y hasta nueve alternativas con
> trazabilidad de soporte. El nuevo flujo requiere una corrida formal
> independiente antes de sustituir las metricas de este documento.

## Estado

Se ejecutaron nuevamente los corpus piloto de 40 casos y final de 100 casos contra la API real de OpenAI despues de exigir exactamente cinco sugerencias cuando el modelo responde con estado `suggestions`. Las corridas utilizaron `gpt-6-luna`, razonamiento medio y Responses API.

Los resultados son evidencia real y reproducible. No se consideran todavia un resultado clinico definitivo: los gold labels requieren validacion final del encargado CIE-10 y la cobertura disminuyo al exigir cinco alternativas para diagnosticos que con frecuencia tienen una unica codificacion directa.

## Objetivo Evaluado

Evaluar la capacidad del modulo para recibir un texto diagnostico, proponer codigos CIE-10 ordenados, coincidir con un codigo esperado y cumplir el contrato de cinco sugerencias sin persistir lotes parciales.

## Configuracion

| Elemento | Configuracion |
| --- | --- |
| Modelo | `gpt-6-luna` |
| Reasoning effort | `medium` |
| API | Responses API, `store=false` |
| Provider | OpenAI real |
| Catalogo | `CIE10.csv` institucional |
| Corpus piloto | `evaluation/cie10/pilot-40.json` |
| Corpus final | `evaluation/cie10/final-100.json` |
| Contrato | Exactamente 5 sugerencias unicas o abstencion sin sugerencias |
| Fecha local | 14 de octubre de 2026 |

Los corpus no contienen identificadores de pacientes.

## Iteraciones Realizadas

| Iteracion | Cambio o prueba | Resultado observado |
| ---: | --- | --- |
| 1 | Se construyeron corpus reproducibles de 40 y 100 casos con gold labels. | Se habilito medicion top-1, top-3 y top-5. |
| 2 | Se ejecuto la version previa que aceptaba entre 1 y 5 sugerencias. | Obtuvo 95% top-1 en 100 casos, pero normalmente devolvia una sola opcion; no comprobaba el requisito actual. |
| 3 | Se separo el ID del modelo del esfuerzo de razonamiento. | La configuracion valida quedo como `gpt-6-luna` y `medium`. |
| 4 | Se migro el proveedor a Responses API con Structured Outputs y `store=false`. | Las respuestas se reciben como JSON validado. |
| 5 | Se exigieron cinco sugerencias para estado `suggestions`. | Las respuestas parciales se rechazan y no pueden persistirse como listas incompletas. |
| 6 | Se agregaron validacion institucional y reparacion al batch productivo. | El batch conserva un resultado solo cuando obtiene cinco codigos validos; en caso contrario registra abstencion o error. |
| 7 | Se ejecuto el piloto de 40 casos contra OpenAI. | 21 lotes de cinco, 14 abstenciones y 5 errores por salida parcial. |
| 8 | Se ejecuto el corpus final de 100 casos contra OpenAI. | 61 lotes de cinco, 26 abstenciones y 13 errores por salida parcial. |
| 9 | Se agregaron metricas explicitas de cumplimiento de cinco sugerencias. | Se distingue cumplimiento entre respuestas aceptadas de cobertura total sobre el corpus. |

## Metricas

| Metrica | Definicion |
| --- | --- |
| `top1Accuracy` | Casos donde la primera sugerencia valida coincide con el gold label. |
| `top3Accuracy` | Casos donde una de las primeras tres sugerencias validas coincide. |
| `top5Accuracy` | Casos donde una de las cinco sugerencias validas coincide. |
| `exactFiveOutcomeRate` | Proporcion del corpus que termino con un lote de cinco. |
| `exactFiveComplianceRate` | Proporcion de respuestas aceptadas como `suggestions` que contiene exactamente cinco. |
| `abstentionRate` | Casos con `insufficient_information`. |
| `invalidCodeRate` | Codigos emitidos que no existen en el catalogo institucional cargado. |
| `catalogMismatchRate` | Casos con sugerencias, pero sin coincidencia con el gold label. |
| `errorRate` | Casos cuya respuesta no cumplio el contrato tecnico. |
| `averageLatencyMs` | Latencia media de una llamada al modelo. |

## Resultados Del Piloto

| Indicador | Resultado | Conteo |
| --- | ---: | ---: |
| Casos | 40 | 40 |
| `top1Accuracy` | 52.50% | 21/40 |
| `top3Accuracy` | 52.50% | 21/40 |
| `top5Accuracy` | 52.50% | 21/40 |
| `exactFiveOutcomeRate` | 52.50% | 21/40 |
| `exactFiveComplianceRate` | 100.00% | 21/21 respuestas aceptadas |
| `abstentionRate` | 35.00% | 14/40 |
| `errorRate` | 12.50% | 5/40 |
| `invalidCodeRate` | 2.86% | 3/105 sugerencias |
| `catalogMismatchRate` | 0.00% | 0/40 |
| Latencia promedio | 13,883 ms | 40 casos |

Fuente: `output/evaluation-openai-gpt6-luna-medium-exact5/pilot-40-report.json`, elaboracion propia.

Los errores del piloto fueron `P008`, `P012`, `P023`, `P024` y `P039`. En todos, el proveedor devolvio menos de cinco opciones y el parser aplico el rechazo `OpenAI must return exactly five suggestions`. Los casos `P016`, `P034` y `P040` incluyeron un codigo ausente del catalogo.

## Resultados Finales

| Indicador | Resultado | Conteo |
| --- | ---: | ---: |
| Casos | 100 | 100 |
| `top1Accuracy` | 55.00% | 55/100 |
| `top3Accuracy` | 57.00% | 57/100 |
| `top5Accuracy` | 57.00% | 57/100 |
| `exactFiveOutcomeRate` | 61.00% | 61/100 |
| `exactFiveComplianceRate` | 100.00% | 61/61 respuestas aceptadas |
| `abstentionRate` | 26.00% | 26/100 |
| `errorRate` | 13.00% | 13/100 |
| `invalidCodeRate` | 13.77% | 42/305 sugerencias |
| `catalogMismatchRate` | 4.00% | 4/100 |
| Latencia promedio | 11,499 ms | 100 casos |

Fuente: `output/evaluation-openai-gpt6-luna-medium-exact5/final-100-report.json`, elaboracion propia.

## Distribucion De Resultados

| Estado final directo del provider | Piloto 40 | Final 100 |
| --- | ---: | ---: |
| Cinco sugerencias | 21 | 61 |
| Abstencion | 14 | 26 |
| Error por lote parcial | 5 | 13 |
| **Total** | **40** | **100** |

Fuente: reportes JSON de ambas corridas, elaboracion propia.

## Casos Relevantes

| Caso | Diagnostico | Gold | Resultado observado |
| --- | --- | --- | --- |
| `F013` | comunicacion interauricular | `Q21.1` | Emitio cinco subcodigos no presentes en el catalogo cargado. |
| `F044` | sinusitis aguda | `J01.9` | Emitio cinco codigos mas especificos, todos fuera del catalogo institucional. |
| `F068` | conjuntivitis aguda | `H10.3` | Cuatro de cinco codigos no estaban en el catalogo y no hubo coincidencia gold. |
| `F087` | tumor cerebral no especificado | `D43.2` | El gold aparecio en cuarta posicion; dos alternativas estaban fuera del catalogo. |
| `F088` | neurofibromatosis | `Q85.0` | Emitio cinco subcodigos no presentes en el catalogo institucional. |

Fuente: reporte final JSON, elaboracion propia.

Los 13 errores finales ocurrieron en `F008`, `F012`, `F022`, `F024`, `F056`, `F061`, `F062`, `F064`, `F066`, `F076`, `F081`, `F082` y `F096`. Las 26 abstenciones y todos los detalles por caso permanecen en los reportes JSON y CSV.

## Comparacion Con La Version Anterior

| Configuracion | Top-1 final | Cinco opciones verificadas | Abstencion | Error | Latencia media |
| --- | ---: | ---: | ---: | ---: | ---: |
| Contrato anterior, 1 a 5 | 95.00% | No | 0.00% | 0.00% | 2,376 ms |
| Contrato actual, exactamente 5 | 55.00% | 61/100 | 26.00% | 13.00% | 11,499 ms |

Fuente: reporte anterior `output/evaluation-openai-gpt6-luna-medium/final-100-report.json` y reporte actual exact-five.

La tabla muestra evidencia, no una conclusion clinica. El descenso no implica por si solo menor capacidad de identificar el codigo principal: el contrato nuevo obliga a producir cuatro alternativas adicionales incluso cuando el texto apunta de forma directa a una sola categoria. El modelo se abstuvo o genero una lista parcial en 39 casos, y varios subcodigos emitidos pertenecen a variantes del catalogo que no existen en el snapshot institucional.

## Alcance Del Benchmark Y Del Batch

El benchmark llama una vez al proveedor por caso para medir su salida directa. El batch productivo agrega controles posteriores:

- valida codigo y descripcion contra el catalogo institucional;
- elimina duplicados y codigos inventados;
- solicita reparacion cuando quedan menos de cinco codigos validos;
- no persiste una lista parcial;
- registra abstencion o error por elemento sin detener la corrida.

Por ello, la tasa de codigos invalidos del benchmark mide el comportamiento bruto del modelo. Los codigos invalidos no son aceptados por el batch. Las pruebas automatizadas confirman tanto la reparacion como el rechazo de lotes incompletos.

## Evidencia Tecnica

| Comprobacion | Resultado |
| --- | --- |
| `pnpm test` | 8/8 pruebas aprobadas |
| `pnpm build` | Exitoso |
| Provider real | OpenAI Responses API |
| Modelo y esfuerzo | `gpt-6-luna`, `medium` |
| Persistencia de menos de cinco | Bloqueada por prueba automatizada |
| Reparacion de codigos rechazados | Validada por prueba automatizada |

Comandos reproducibles:

```bash
CIE10_OPENAI_MODEL=gpt-6-luna \
CIE10_REASONING_EFFORT=medium \
pnpm evaluate:cie10 -- \
  --cases evaluation/cie10/pilot-40.json \
  --catalog ./CIE10.csv \
  --provider openai \
  --output-dir output/evaluation-openai-gpt6-luna-medium-exact5

CIE10_OPENAI_MODEL=gpt-6-luna \
CIE10_REASONING_EFFORT=medium \
pnpm evaluate:cie10 -- \
  --cases evaluation/cie10/final-100.json \
  --catalog ./CIE10.csv \
  --provider openai \
  --output-dir output/evaluation-openai-gpt6-luna-medium-exact5
```

## Evidencia E Interpretacion

La evidencia demuestra que ninguna respuesta aceptada como `suggestions` contiene menos de cinco opciones y que el batch cuenta con barreras para evitar persistir codigos no validados. Tambien demuestra que solo 61% del corpus final obtuvo un lote de cinco en la llamada directa y que 13.77% de los codigos brutos no pertenecia al catalogo cargado.

Estos resultados no respaldan afirmar que el requisito de cinco alternativas mejora la calidad clinica. Respaldan que el contrato se aplica de forma estricta y revelan su costo en cobertura, latencia y compatibilidad con el catalogo. La interpretacion, la eventual equivalencia entre categorias y subcategorias, y la decision de mantener siempre cinco opciones deben discutirse con el encargado CIE-10.

## Entregables Y Trazabilidad

| Evidencia | Ubicacion |
| --- | --- |
| Corpus piloto | `evaluation/cie10/pilot-40.json` |
| Corpus final | `evaluation/cie10/final-100.json` |
| Reporte piloto JSON/CSV | `output/evaluation-openai-gpt6-luna-medium-exact5/pilot-40-report.*` |
| Reporte final JSON/CSV | `output/evaluation-openai-gpt6-luna-medium-exact5/final-100-report.*` |
| Evaluador | `src/evaluation/cie10-evaluation.ts` |
| Provider | `src/ai/openai-provider.ts` |
| Validacion productiva | `src/pipeline/run.ts` |
| Pruebas | `test/evaluation.test.ts` y `test/pipeline.test.ts` |

Los reportes de `output/` son evidencia regenerable y no se versionan. Este documento contiene un resumen agregado apto para el capitulo de resultados; la discusion de implicaciones corresponde al capitulo posterior.
