# Pendientes de backend - dashboard: revisión CIE-10 por lote

Contratos que necesita la pantalla **Corrección CIE-10** (`/dashboard/cie10`) y
que el servidor todavía no expone, sobre el contrato vigente de
`GET /api/v1/cie10/lotes/activo` y
`PUT /api/v1/cie10/lotes/:runId/items/:codigoTraductor`.

Mientras no existan, `src/services/cie10.service.ts` desvía las llamadas a
`cie10.mock.ts` (solo cuando `APP_ENV` es `development` / `dev` / `test`, o con
`USE_CIE10_MOCK=true`; en producción nunca se sirven datos ficticios). El mock
implementa este documento, y dos pruebas lo fijan:

- `src/services/cie10Lote.mock.test.ts`: qué responde el servidor en cada caso.
- `src/services/cie10-contract.test.ts`: qué URL y qué cuerpo manda el cliente.

Si el servidor se comporta distinto en alguno de esos casos, el desacuerdo está
ahí.

Contra el servidor actual, la pantalla **no funciona**: la entrada es la lista
de lotes (punto 1), y la tabla lee el lote por su id (punto 2). Ninguno de los
dos existe todavía.

La revisión uno por uno (tarjetas e historial) y la exportación a CSV se
retiraron de la pantalla. Lo que el servidor puede dejar de mantener está en
el punto 9.

### Qué hace la pantalla

1. **Lista de lotes** (`/dashboard/cie10`): un lote por mes, en dos pestañas,
   **Pendientes** (sin confirmar) y **Revisados** (confirmados). Cada tarjeta
   muestra el mes, la fecha en que se procesó, cuántos diagnósticos tiene,
   cuántos faltan por revisar o cuándo se confirmó, y el botón **Ir al lote**.
2. **Tabla del lote** (`/dashboard/cie10/:runId`): los diagnósticos del lote,
   paginados de 20 en 20, con dos filtros arriba (confianza de la sugerencia
   principal y texto en la descripción médica). Por cada fila, el médico:
   1. ve las primeras N sugerencias (de 1 a 5, las elige con una tuerca), cada
      una con su confianza, y abre un globo con el razonamiento y la
      información faltante;
   2. **acepta** la sugerencia que marcó, o **rechaza** y elige otro código del
      catálogo, sin justificación (en filas sin sugerencias: **ingresar
      código**);
   3. o marca varias filas con una casilla (o todas las pendientes de la
      página) y pulsa **Aceptar seleccionadas**;
   4. al terminar todo el lote, acepta la cláusula y **confirma**.

Cada fila tiene que quedar aceptada o corregida antes de confirmar: aceptar,
de una en una o seleccionadas, es la confirmación de que el médico revisó ese
código, no un atajo.

---

## 1. Nuevo: `GET /api/v1/cie10/lotes`

La lista de lotes. Hoy solo existe `/lotes/activo`, que devuelve el último
lote completado: no hay forma de ver los meses anteriores, ni de saber cuáles
ya se confirmaron.

### Query params

| Param | Tipo | Regla |
|---|---|---|
| `estado` | `PENDIENTES` \| `REVISADOS` | Obligatorio. `PENDIENTES`: sin `confirmada_en`. `REVISADOS`: con `confirmada_en`. |
| `page` | entero ≥ 1 | Por defecto 1. |
| `pageSize` | entero 1-50 | Por defecto 10. La pantalla pide una página de 10 a la vez y navega con Anterior/Siguiente; nunca pide todos los lotes de golpe. |

Solo entran lotes con `cie10_run.estado = 'COMPLETED'`: uno que sigue
procesándose no se puede revisar.

**Orden:** `periodo DESC`, y a igual periodo, `finished_at DESC`.

### Respuesta `200`

```json
{
  "items": [
    {
      "runId": "run-2026-10-17",
      "periodo": "2026-09",
      "status": "PENDIENTE_REVISION",
      "finishedAt": "2026-10-17T18:30:00.000Z",
      "total": 87,
      "pendientes": 75,
      "confirmedAt": null
    }
  ],
  "total": 2,
  "page": 1,
  "pageSize": 10,
  "counts": { "pendientes": 2, "revisados": 3 }
}
```

| Campo | Tipo | Qué es |
|---|---|---|
| `runId` | string | El id del lote: es el que va en la URL de la tabla. |
| `periodo` | `YYYY-MM` | **El mes de los diagnósticos** que procesó el lote. Es el título de la tarjeta ("Septiembre 2026"). Ver "Pregunta abierta" abajo. |
| `status` | `PENDIENTE_REVISION` \| `CONFIRMADO` | `CONFIRMADO` si tiene `confirmada_en`. `EXPORTADO` queda deprecado con el CSV (punto 9); si llega, la pantalla lo trata como `CONFIRMADO`. |
| `finishedAt` | ISO 8601 \| null | `cie10_run.finished_at`: "Procesado el 17-10-2026". |
| `total` | entero | Ítems del lote (`cie10_sugerencia` con ese `run_id`). |
| `pendientes` | entero | Ítems **sin fila** en `cie10_revision_item`. |
| `confirmedAt` | ISO 8601 \| null | `cie10_lote_confirmacion.confirmada_en`. |
| `total` (raíz) | entero | Lotes del `estado` pedido. |
| `counts` | objeto | Lotes de cada pestaña, sin importar el `estado` pedido: son los contadores. |

### Pregunta abierta: de dónde sale `periodo`

La pantalla agrupa por **el mes de los diagnósticos**, no por el día en que
corrió el proceso: el lote que corre el 17 de octubre revisa lo de septiembre.
`cie10_run` no tiene hoy ese dato. La propuesta es una columna
`cie10_run.periodo` (punto 6) que llene el proceso al crear la corrida, con el
mes de los diagnósticos que tomó. Si el proceso no trabaja por mes, hay que
acordar la regla, por ejemplo el mes de `min(fecha de consulta)` de sus
diagnósticos.

### Errores

| Status | `code` | Cuándo |
|---|---|---|
| 400 | `ESTADO_INVALIDO` | `estado` falta o no es `PENDIENTES` ni `REVISADOS`. |

---

## 2. Nuevo: `GET /api/v1/cie10/lotes/:runId`

La tabla de un lote. Es `GET /lotes/activo` con el lote elegido en la URL en vez
del último: misma respuesta, más los campos de abajo. La pantalla ya no usa
`/lotes/activo`; puede quedarse por compatibilidad o retirarse.

Abre también los lotes confirmados, en solo lectura, para consultarlos desde la
pestaña de revisados. El campo `export` de la respuesta queda deprecado con el
CSV (punto 9).

### Query params

`?page=1&pageSize=20&confianza=MEDIA&q=rodilla`.

| Param | Tipo | Regla |
|---|---|---|
| `page` | entero ≥ 1 | Por defecto 1. |
| `pageSize` | entero 1-50 | Por defecto 20. La pantalla pide 20: cada fila puede llevar hasta 5 sugerencias. |
| `confianza` | `ALTA` \| `MEDIA` \| `BAJA` | Opcional. Filtra por `sugerencias[0].confianza`. Las filas **sin sugerencias** no tienen confianza: solo salen sin este filtro. |
| `q` | string, 2-100 caracteres | Opcional. Texto dentro de `diagnostico`, **sin distinguir mayúsculas ni acentos**. |

Los filtros los tiene que aplicar el servidor: la tabla está paginada, y
filtrar solo la página recibida dejaría fuera lo que está en otras páginas.
Se combinan con `AND`. El orden no cambia (el `CASE` actual de
`listActiveBatch`). `total` pasa a ser el total **de lo filtrado**.

En SQL, más o menos:

```sql
AND ($confianza IS NULL OR s.sugerencias->0->>'confianza' = $confianza)
AND ($q IS NULL OR unaccent(s.diagnostico) ILIKE '%' || unaccent($q) || '%')
```

`diagnostico` es PHI: `q` no debe quedar en logs de acceso ni en la auditoría.

**Por qué no hay filtro de fechas:** todo el lote es de un mismo mes, y los
ítems no traen una fecha clínica (`procesadoEn` es cuándo los procesó la IA, y
en un lote caen todos en los mismos minutos). Si más adelante hace falta,
primero habría que agregar a cada ítem la fecha de la consulta.

### Campos nuevos en la respuesta

```json
{
  "runId": "run-2026-10-17",
  "periodo": "2026-09",
  "counts": { "pendientes": 75 },
  "items": [
    { "codigoTraductor": "REG-001", "reviewed": true, "...": "..." }
  ]
}
```

| Campo | Tipo | Qué es |
|---|---|---|
| `periodo` | `YYYY-MM` | El mismo del punto 1. Va en el título: "Lote CIE-10 de Septiembre 2026". |
| `counts.pendientes` | entero | Ítems de **todo el lote** (sin filtros ni página) **sin fila** en `cie10_revision_item`. Es el aviso de arriba de la tabla, y la pantalla bloquea "Confirmar" mientras sea mayor que 0. |
| `items[].reviewed` | boolean | `true` si el ítem tiene fila en `cie10_revision_item` (aceptado o corregido). |

`reviewed` hace falta porque `status: "AUTOCODIFICADO"` significa "lo codificó la
IA", no "lo revisó el médico", y `corrected: false` no distingue un ítem aceptado
de uno sin tocar. Ningún campo actual del contrato cambia de significado.

### Errores

| Status | `code` | Cuándo |
|---|---|---|
| 404 | `CIE10_BATCH_NOT_FOUND` | El `runId` no existe o su corrida no está `COMPLETED`. |

---

## 3. Nuevo: `POST /api/v1/cie10/lotes/:runId/items/:codigoTraductor/aceptar`

Hoy no hay forma de guardar que el médico aceptó una fila: `confirmBatch` da
por aceptado todo lo que no tiene corrección. Con este endpoint, la aceptación
queda registrada fila por fila y sobrevive a recargas y cambios de equipo.

### Petición

```json
{
  "codigo": "S83.8",
  "posicion": 2,
  "sugerenciasMostradas": 3
}
```

| Campo | Tipo | Regla |
|---|---|---|
| `codigo` | string | Debe ser `sugerencias[posicion - 1].codigo` del ítem. |
| `posicion` | entero ≥ 1 | 1-based: el lugar de la sugerencia aceptada. La principal es 1. |
| `sugerenciasMostradas` | entero 1-5 | Cuántas sugerencias veía el médico (la tuerca). `>= posicion`. |

`posicion` y `sugerenciasMostradas` son los mismos campos que ya guarda
`cie10_decision` en el flujo uno por uno. Hoy `confirmBatch` escribe
`posicion = 1` y `sugerencias_mostradas = sugerencias.length` para todo, así
que se pierde cuál eligió el médico y cuántas opciones vio.

### Respuesta `200`

Misma forma que la del `PUT` de corrección:

```json
{
  "codigoTraductor": "REG-001",
  "codigoFinal": "S83.8",
  "comentario": null,
  "corrected": false,
  "updatedAt": "2026-10-17T19:05:00.000Z"
}
```

### Reglas

- Hace upsert en `cie10_revision_item` con `codigo_final = codigo`,
  `comentario = null`, `corregido = false`, `posicion`,
  `sugerencias_mostradas` y `revisor_id`. **Reemplaza** una corrección previa
  de esa fila: así funciona "Cambiar" en la pantalla.
- Evento de auditoría `CIE10_BORRADOR_ACEPTADO`, con
  `{ runId, codigoTraductor, codigoFinal, posicion, sugerenciasMostradas }`.

### Errores

| Status | `code` | Cuándo |
|---|---|---|
| 400 | `SUGERENCIA_INVALIDA` | `codigo` no está en esa `posicion` de `sugerencias`. |
| 400 | `SUGERENCIAS_MOSTRADAS_INVALIDAS` | `sugerenciasMostradas < posicion`, o fuera de 1-5. |
| 404 | `CIE10_BATCH_NOT_FOUND` | El `runId` no existe. |
| 404 | `CIE10_NOT_FOUND` | El registro no pertenece a ese lote. |
| 409 | `CIE10_BATCH_ALREADY_CONFIRMED` | El lote ya se confirmó. |

### Aceptar varias: `POST /api/v1/cie10/lotes/:runId/items/aceptar`

"Aceptar seleccionadas" manda todas las filas marcadas en **una sola llamada**,
en vez de una por fila: menos carga para el servidor y un resultado de todo o
nada.

```json
{
  "items": [
    { "codigoTraductor": "REG-001", "codigo": "S83.9", "posicion": 1, "sugerenciasMostradas": 3 },
    { "codigoTraductor": "REG-008", "codigo": "I10", "posicion": 1, "sugerenciasMostradas": 3 }
  ]
}
```

Cada fila tiene la misma forma y las mismas reglas que el endpoint de una sola
fila, más el `codigoTraductor`. La pantalla manda, por fila, la opción que el
médico tiene marcada (la principal si no la cambió).

**Respuesta `200`:** `{ "aceptados": [ ... ] }`, un objeto por fila con la misma
forma que la respuesta de aceptar una.

**Reglas:**

- Entre 1 y 50 filas por llamada. La pantalla nunca pasa de una página (20).
- **Todo o nada**, en una transacción: si una fila falla, no se guarda
  ninguna y la respuesta dice cuál (`detalle.codigoTraductor`).
- **No pisa correcciones:** si una fila ya tiene `corregido = true`, se
  rechaza la llamada. La pantalla solo deja marcar filas pendientes, pero otro
  médico pudo haberla corregido mientras tanto.
- Un evento de auditoría `CIE10_BORRADOR_ACEPTADO` por fila, como si se
  hubieran aceptado de una en una.

| Status | `code` | Cuándo |
|---|---|---|
| 400 | `ACEPTACION_MASIVA_INVALIDA` | `items` vacío o con más de 50 filas. |
| 400 | `SUGERENCIA_INVALIDA` / `SUGERENCIAS_MOSTRADAS_INVALIDAS` | Igual que arriba, para alguna fila. |
| 404 | `CIE10_BATCH_NOT_FOUND` / `CIE10_NOT_FOUND` | Igual que arriba. |
| 409 | `CIE10_BATCH_ALREADY_CONFIRMED` | El lote ya se confirmó. |
| 409 | `CIE10_YA_CORREGIDO` | Alguna fila ya tiene una corrección médica. |

---

## 4. Cambios en `PUT /api/v1/cie10/lotes/:runId/items/:codigoTraductor`

### El código tiene que estar en el catálogo vigente, salvo que el médico diga lo contrario

El modal busca en `GET /api/v1/cie10/catalogo`. Si el código no aparece, el
médico puede usar el que escribió (con formato CIE-10): la pantalla lo advierte
y lo manda con `fueraDeCatalogo: true`.

Hoy `saveBatchCorrection` solo valida el formato. Debe comprobar que el código
exista en `cie10_rag_catalogo` de la versión `ACTIVE`, como en `searchCatalog`:

- **Está en el catálogo:** se guarda como hoy.
- **No está y no trae `fueraDeCatalogo: true`:** `400 CIE10_FUERA_DE_CATALOGO`.
  Protege de un error de dedo o de un cliente que no pasó por el buscador.
- **No está y trae `fueraDeCatalogo: true`:** se guarda. El evento de auditoría
  `CIE10_BORRADOR_CORREGIDO` lleva `fueraDeCatalogo: true` en `detalle`, y al
  confirmar, `cie10_decision.codigo_interno_catalogo` queda en `null`.

| Status | `code` | Cuándo |
|---|---|---|
| 400 | `CIE10_FUERA_DE_CATALOGO` | El código no está en el catálogo vigente y no se pidió `fueraDeCatalogo`. |

### Formato de códigos de referencia externa

`FORMATO_CIE10 = /^[A-Z]\d{2}(\.\d{1,2})?$/` rechaza códigos que el propio
catálogo ofrece como referencia externa, por ejemplo `S83.004A`. Elegir uno de
esos en el modal hoy devuelve `400 FORMATO_CIE10`. Con la validación contra el
catálogo de arriba, la expresión regular puede relajarse a algo como
`/^[A-Z]\d{2}(\.[0-9A-Z]{1,4})?$/`. `codigo_final varchar(8)` ya alcanza
para `S83.004A`.

### Se quita la justificación

La corrección del lote es **solo el código**: el modal ya no pide
justificación. El cuerpo deja de llevar `comentario`, y el servidor ya no debe
exigirlo (hoy responde `400 COMENTARIO_REQUERIDO` sin él).

```json
{
  "codigo": "R69",
  "sugerenciasMostradas": 3,
  "fueraDeCatalogo": true
}
```

- `cie10_revision_item.comentario` queda en `null` en las correcciones nuevas,
  y la respuesta trae `"comentario": null`.
- Al confirmar, `cie10_decision.comentario` queda en `null`.
- Si llega un `comentario` (un cliente viejo), se ignora.

### Campos nuevos opcionales: `sugerenciasMostradas` y `fueraDeCatalogo`

- `sugerenciasMostradas`: mismo sentido que en el punto 3, cuántas sugerencias
  veía el médico cuando decidió corregir. Se guarda en
  `cie10_revision_item.sugerencias_mostradas`; `posicion` queda en `null`.
- `fueraDeCatalogo`: ver arriba. La pantalla solo lo manda cuando es `true`.

---

## 5. Cambios en `POST /api/v1/cie10/lotes/:runId/confirmar`

- **Bloqueo:** hoy solo rechaza los ítems sin principal y sin corrección. Debe
  rechazar si **cualquier** ítem del lote no tiene fila en
  `cie10_revision_item`:

  | Status | `code` | Mensaje |
  |---|---|---|
  | 422 | `CIE10_BATCH_INCOMPLETE` | `N registros sin aceptar ni corregir.` |

- **Decisiones:** al insertar en `cie10_decision`, usar los datos guardados:

  | Columna | Aceptado (`corregido = false`) | Corregido (`corregido = true`) |
  |---|---|---|
  | `decision` | `ACEPTADA` | `RECHAZADA` |
  | `codigo_final` | `ri.codigo_final` (puede ser una alternativa, no solo la principal) | `ri.codigo_final` |
  | `posicion` | `ri.posicion` | `null` |
  | `sugerencias_mostradas` | `ri.sugerencias_mostradas` | `ri.sugerencias_mostradas` |

  `code = row.corrected_code ?? principal.codigo` ya toma `ri.codigo_final`
  cuando hay fila. Lo que hay que cambiar es `posicion` (hoy fija en `1`) y
  `sugerencias_mostradas` (hoy `sugerencias.length`).

- **Sin CSV:** confirmar ya no genera ni sube el CSV a S3 (punto 9). Basta con
  escribir las decisiones y `confirmada_por` / `confirmada_en`.

---

## 6. Cambios de base de datos

```sql
-- Punto 1: el mes de los diagnósticos que procesó la corrida.
ALTER TABLE cie10_run
  ADD COLUMN periodo char(7)
    CHECK (periodo ~ '^\d{4}-(0[1-9]|1[0-2])$');

-- Punto 3: qué sugerencia se aceptó y cuántas se mostraban.
ALTER TABLE cie10_revision_item
  ADD COLUMN posicion smallint,
  ADD COLUMN sugerencias_mostradas smallint,
  ADD CONSTRAINT cie10_revision_item_aceptado_chk
    CHECK (corregido OR posicion IS NOT NULL),
  ADD CONSTRAINT cie10_revision_item_mostradas_chk
    CHECK (sugerencias_mostradas IS NULL OR sugerencias_mostradas BETWEEN 1 AND 5);
```

- Las filas de `cie10_revision_item` que ya existen son todas correcciones
  (`corregido = true`), así que las restricciones no chocan con datos previos.
- `comentario` ya admite `null` (`varchar(300)` sin `NOT NULL`): no hace falta
  cambiar la columna para quitar la justificación (punto 4).
- Para las corridas que ya existen, `periodo` puede llenarse una vez con la
  regla que se acuerde (punto 1).

---

## 7. Reglas comunes

Las mismas de los endpoints de lote actuales:

- **Permiso:** `cie10.corregir`.
- **Datos sensibles:** respuestas con `Cache-Control: no-store`. Los diagnósticos son PHI.
- **Auditoría:** dentro de la misma transacción que el cambio.

## 8. Orden sugerido

1. `GET /lotes` y `GET /lotes/:runId` con `periodo` (puntos 1, 2 y 6): sin
   ellos la pantalla no abre.
2. Columnas de `cie10_revision_item` y los endpoints de aceptar, de una fila y
   de varias (puntos 3 y 6): con eso **Aceptar** y **Aceptar seleccionadas**
   funcionan.
3. `reviewed`, `counts` y los filtros `confianza` y `q` (punto 2): el aviso
   de lo que falta, la búsqueda, y la confirmación se bloquea mientras falte
   algo.
4. En el `PUT` (punto 4): quitar la justificación obligatoria, validar contra
   el catálogo y el formato. Y las reglas de `confirmar` (punto 5).

---

## 9. Deprecado: ya no lo usa la pantalla

La revisión uno por uno (tarjetas e historial) se retiró: la tabla por lote la
reemplaza. La exportación a CSV también quedó deprecada y no se usará. Nada de
esto lo llama ya el frontend, así que el servidor puede retirarlo cuando le
convenga.

| Qué | Por qué |
|---|---|
| `GET /api/v1/cie10/sugerencias` | La cola de pendientes de la vista uno por uno. |
| `GET /api/v1/cie10/sugerencias/:codigoTraductor` | Leer un ítem suelto para "Corregir" desde el historial. |
| `POST` y `PUT /api/v1/cie10/sugerencias/:codigoTraductor/decision` | Decidir y corregir uno por uno. En el lote, las decisiones se escriben al confirmar (punto 5). |
| `GET /api/v1/cie10/decisiones` | El historial de la vista uno por uno. |
| `GET /api/v1/cie10/lotes/activo` | Lo reemplaza `GET /lotes/:runId` (punto 2). |
| `GET /api/v1/cie10/export-url` | La descarga del CSV. |
| Generar y subir el CSV al confirmar (`uploadConfirmedBatchCsv`, `CIE10_REVIEW_EXPORT_S3_PREFIX`) | El CSV ya no se usa. |
| `cie10_lote_confirmacion.csv_object_key` y `csv_sha256` | Quedan en `null`; pueden borrarse cuando no queden lotes que los usen. |
| `status: "EXPORTADO"` y el campo `export` de `GET /lotes/:runId` | Salían del CSV. Si llegan, la pantalla los ignora (`EXPORTADO` cuenta como `CONFIRMADO`). |
| `objectKey` y `sha256` en la respuesta de `POST /confirmar` | Del CSV; la pantalla solo lee `total`. |

Quedan las decisiones en `cie10_decision` al confirmar (punto 5): son el
registro de lo que el médico aprobó, con o sin CSV.
