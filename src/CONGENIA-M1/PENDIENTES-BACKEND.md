# Pendientes de backend

Contratos que el frontend ya consume pero que el servidor todavía no expone.
Mientras no existan, `src/services/fichaSearch.service.ts` desvía las llamadas a
`fichaSearch.mock.ts` (solo cuando `APP_ENV` es `development` / `dev` / `test`;
en producción nunca se sirven datos ficticios).

Cuando estos endpoints estén en pie, lo único que cambia en el frontend es el
flag `USE_MOCK` de ese servicio.

---

## 1. `GET /v1/fichas` - búsqueda de fichas

Alimenta el listado de cards del tab **Búsqueda** del dashboard.

### Query params

| Param | Tipo | Req. | Descripción |
|---|---|---|---|
| `q` | string | no | Texto libre: **nombre del paciente** o **número de historia clínica**. Sin distinguir mayúsculas ni acentos. El nombre se busca por **palabras completas** y exige todas las del término (ver 6.2); la historia clínica sí admite coincidencia parcial, porque no está cifrada. |
| `desde` | `YYYY-MM-DD` | no | Límite inferior **inclusivo** sobre `ficha_clinica.fecha_consulta`. |
| `hasta` | `YYYY-MM-DD` | no | Límite superior **inclusivo**. |
| `page` | int ≥ 1 | no | 1-based. Default `1`. |
| `pageSize` | int | no | Default `12` (lo que llena una pantalla del grid). Tope sugerido `50`. |

Un parámetro ausente significa "sin filtro". Ausente y cadena vacía se tratan
igual; el frontend directamente no manda los vacíos.

Los filtros se combinan con **AND**. Orden fijo: `fecha_consulta DESC`.

### Lo que manda el frontend, literal

`page` y `pageSize` van **siempre**; los otros tres solo si tienen valor
(`buildQuery` en `fichaSearch.service.ts`). Las tres formas posibles:

```http
GET /v1/fichas?page=1&pageSize=12
GET /v1/fichas?q=castro&page=1&pageSize=12
GET /v1/fichas?q=castro&desde=2026-01-01&hasta=2026-07-07&page=1&pageSize=12
```

"Cargar más" repite la misma consulta subiendo `page`, y el frontend **acumula**
las páginas en pantalla en vez de reemplazarlas.

> ⚠️ Consecuencia para la ventana por defecto: la página 2 llega igual de vacía de
> fechas que la 1, así que el servidor la recalcula. Calcúlala desde el reloj
> **una vez por petición** y ten presente que dos páginas pedidas a ambos lados de
> la medianoche pueden desalinearse. Si llega a molestar, la salida es que la
> respuesta devuelva la ventana que aplicó y el frontend la reenvíe.

### Ventana por defecto cuando no hay fechas

**Si `desde` y `hasta` faltan los dos, el backend acota al último mes.** No es
opcional: la pantalla deja el filtro de fechas vacío a propósito -dos fechas
precargadas se leen como algo que el médico eligió, y no lo eligió- así que la
mayoría de las búsquedas llegan sin fechas.

Eso deja al servidor como único lugar donde se puede imponer el límite, y un
listado sin límites es la petición más rentable para quien quiera extraer datos:
saca N pacientes de un golpe.

Basta con que llegue **una** de las dos fechas para respetar lo que el médico
pidió y no aplicar la ventana.

Junto con el tope de `pageSize` (sección 1) y el alcance por tenant (sección 4),
esto acota cuánta PHI puede salir en una sola llamada.

@compliance HIPAA 164.502(b) - mínimo dato necesario

### Respuesta `200`

```json
{
  "items": [
    {
      "fichaId": "9f1c2e7a-4b10-4c3e-8b21-0d4a6f2c9a15",
      "nombrePaciente": "Rachel Castro Morales",
      "fechaConsulta": "2026-07-07",
      "historiaClinica": "00445566777",
      "idTenant": 23
    }
  ],
  "total": 37,
  "page": 1,
  "pageSize": 12
}
```

`total` es el conteo **después** de aplicar los filtros y **antes** de paginar -
el frontend lo usa para decidir si muestra "Cargar más".

Sin coincidencias: `200` con `items: []` y `total: 0`. **No** `404`.

Tipos en `src/types/ficha-search.ts` → `FichaResumen`, `FichaSearchResult`.

### Errores

Mismo sobre en los dos endpoints. `apiFetch` lee `error` y `message`:

```json
{ "error": "CODIGO_EN_MAYUSCULAS", "message": "Texto para registro, no para el usuario" }
```

| Código | Cuándo | Qué muestra el frontend |
|---|---|---|
| `400` | Parámetro mal formado (fecha que no es ISO, `page` ≤ 0) | Mensaje genérico |
| `401` | Token ausente o vencido | "Tu sesión no tiene permiso para consultar fichas." |
| `403` | Token válido, sin el rol necesario | Igual que el 401 |
| `404` | Solo en el detalle: ficha inexistente **o de otro tenant** (sección 4) | "Esta ficha no existe o fue archivada." |
| `500` | Cualquier fallo del servidor | Mensaje genérico |

**El `message` nunca se pinta tal cual**: el frontend traduce por código
(`mensajeDeError` en `BusquedaPage.tsx` y `FichaDetailPage.tsx`), porque un
mensaje del servidor puede arrastrar detalles internos. Que sea útil en los logs,
no en la pantalla.

El frontend aborta a los **30 s** (`apiFetch`) y lo trata como `408`.

---

## 2. `GET /v1/fichas/:fichaId` - ficha completa en modo lectura

Alimenta el visor de solo-lectura (`/dashboard/busqueda/:fichaId`).

### Respuesta `200`

```json
{
  "fichaId": "9f1c2e7a-4b10-4c3e-8b21-0d4a6f2c9a15",
  "nombrePaciente": "Rachel Castro Morales",
  "historiaClinica": "00445566777",
  "idTenant": 23,

  "datosConsulta": {
    "fechaConsulta": "24 de octubre de 2026",
    "medicoConsulta": "Dr. Nicolás Castro",
    "especialidad": "Pediatra",
    "diagnosticos": "Síndrome de Down, malformación de ojos",
    "referidoDe":   { "value": "comadrona",      "label": "Comadrona" },
    "lugarDeParto": { "value": "hospital_local", "label": "Hospital local" }
  },

  "otrosDemograficos": {
    "familiaresAfectados": 1,
    "menoresEnHogar": 2,
    "adultosEnHogar": 3,
    "quienAfectado": ["hermano", "madre"],
    "afectadosComunidad": 1
  },

  "signosAlerta": [
    {
      "id": "...",
      "nombre": "Dedo meñique torcido",
      "parteDelCuerpo": {
        "regionValue": "extremidades_superiores",
        "parteValue": "mano",
        "lateralidad": "izquierda"
      },
      "parteDelCuerpoLabel": "Mano (Izq.)",
      "imagenUrl": "https://bucket.../signo.jpg?X-Amz-Signature=..."
    }
  ],

  "examenesSugeridos": [
    {
      "id": "...",
      "nombre": "Cariotipo (análisis cromosómico)",
      "imagenUrl": "https://bucket.../examen.png?X-Amz-Signature=...",
      "nombreArchivo": "cariotipo.png"
    }
  ]
}
```

Ficha inexistente: `404` con `{ "error": "FICHA_NOT_FOUND", "message": "..." }`.

Tipos en `src/types/ficha-search.ts` → `FichaDetalle`.

### Notas de forma

- **`fechaConsulta` viene ya formateada para mostrar**, en español y con el mes
  en letra: `"24 de octubre de 2026"`. El visor la pinta tal cual, no reformatea.
  (En `GET /v1/fichas` sí es ISO `YYYY-MM-DD`, porque ahí se ordena y se filtra.)
- **`parteDelCuerpoLabel` viene resuelto**, p. ej. `"Mano (Izq.)"` - el nombre de
  la parte y, entre paréntesis, la lateralidad si aplica. El visor lo pinta como
  chip en la card y en el detalle del signo; **sin él la ficha no muestra la
  localización anatómica por ningún lado**, porque los códigos de
  `parteDelCuerpo` no se traducen en el cliente. Mismo criterio que
  `referidoDe`: el catálogo se resuelve en el servidor.
- **Los `id` de `signosAlerta` y `examenesSugeridos` deben ser estables y únicos
  dentro de la ficha**: el frontend los usa como `key` de React.
- **`referidoDe` y `lugarDeParto` traen `value` + `label` juntos.** El `value` es
  el código de la base; el `label` es lo que lee el médico. Mandar los dos le
  ahorra al visor cargar los catálogos completos solo para traducir dos campos.
  Ambos pueden ser `null` si la ficha quedó incompleta.
- `familiaresAfectados` y `afectadosComunidad` son ternarios `0` (No) / `1` (Sí)
  / `2` (Desconoce), o `null` si no se respondió.
- `quienAfectado` son los códigos de `FamiliarAfectado` (`types/ficha.ts`).

---

## 3. Imágenes: URL prefirmada, resuelta en la misma llamada

**El bucket es la fuente.** El backend firma cada `imagen_bucket_ref` de
`signo_alerta_ficha` y `examen_ficha` contra SeaweedFS y devuelve la URL ya lista
en `signosAlerta[].imagenUrl` / `examenesSugeridos[].imagenUrl`, **dentro de la
misma respuesta** del `GET /v1/fichas/:fichaId`.

El frontend nunca ve el `objectKey` ni hace una segunda vuelta.

- **No** se crea un endpoint aparte para firmar. Sería N llamadas para pintar una
  sola pantalla, y expondría las claves del bucket al cliente sin necesidad.
- **TTL sugerido: 15 minutos.** Alcanza de sobra para revisar una ficha y es lo
  bastante corto para que un enlace filtrado no sirva de mucho.
- `Content-Disposition: inline` y el `Content-Type` real, para que la imagen se
  vea en el `<img>` y en el lightbox en vez de descargarse.
- El frontend **no cachea** la URL más allá de la respuesta. Si una imagen falla
  al cargar (enlace vencido), pinta el placeholder del `MediaCard`; la salida del
  usuario es recargar la ficha.
- `imagenUrl` es **opcional**: un examen puede no llevar adjunto, y un signo cuya
  imagen no se pudo resolver debe llegar sin el campo antes que con una URL rota.

---

## 4. Multitenancy: el alcance lo decide el token, nunca el cliente

**Regla dura: el frontend no manda el tenant, y el backend ignora cualquier cosa
que el cliente diga al respecto.**

Si `GET /v1/fichas?idTenant=23` decidiera el alcance, cualquiera abre las
herramientas del navegador, cambia el 23 por 41 y lee las fichas de otro
hospital. El token va firmado; un query param no. Por eso `idTenant` **no existe**
entre los parámetros de la sección 1.

### El claim

> **Resuelto en el servidor (PR #24 de M1-SERVER).** El alcance sale del claim
> `groups` (mapper `oidc-group-membership-mapper` con ruta completa), no de
> `tenants` ni de `realm_access.roles`. Cada grupo da los permisos de una función
> en una institución, según `config/access-policy.yaml`. El frontend lee el
> resultado en `GET /me` (`permissions`, `roleLabel`, `access[]`).

```json
{
  "groups": ["/instituciones/23/genetistas", "/instituciones/41/medicos"]
}
```

Una lista y no un valor suelto porque un genetista puede dar consulta en dos
hospitales y un coordinador supervisar varios. Con un solo elemento se comporta
igual que single-tenant, sin código aparte y sin migrar el claim después.

### Cómo se aplica

En los dos endpoints, siempre:

```sql
WHERE ficha_clinica.id_tenant = ANY($tenants_del_token)
```

- `GET /v1/fichas` filtra el listado por esa lista.
- `GET /v1/fichas/:fichaId` valida que la ficha pertenezca a uno de ellos. Si no,
  responde **404 y no 403**: un 403 confirmaría que esa ficha existe en otro
  hospital, y eso ya es información que el usuario no debería obtener.
- Token sin `tenants` o con la lista vacía: no ve nada. Nunca "ve todo" por
  defecto - un claim ausente es un error de configuración, no un permiso.
- `congenia-admin` puede saltarse el filtro si el negocio lo pide, pero que sea
  una excepción explícita en el código y auditada, no la ausencia de la regla.

### Pendiente en el flujo de captura

Hoy el tenant se **escribe a mano** en `PatientSearchView` y viaja como parámetro
a Nursera. Es el mismo agujero: teclear otro número consulta pacientes de otra
institución. Cuando el claim exista, ese campo debe desaparecer de la pantalla y
el tenant salir del token también ahí.

@compliance HIPAA 164.312(a)(1) - control de acceso por usuario
@compliance ISO 27001 A.9.4.1 - la decisión de acceso es del servidor

---

## 5. Autenticación

Estos dos `GET` salen del dashboard, que está detrás de Keycloak
(`RequireAuth` + permiso `dashboard` de `GET /me`).

- Van con **`Authorization: Bearer <access_token>`**, no con el `X-Session-Token`
  del flujo SADC. Ese token de capacidad es para la captura desde Nursera y no
  aplica aquí.
- El backend debe validar el rol además de la firma del token: leer fichas ajenas
  no es lo mismo que capturar la propia.
- Ambos llevan `X-Request-Id` para la traza de auditoría, también siendo GET.
  (Se ajustó `apiFetch` para esto: antes solo mandaba headers en mutaciones.)

---

## 6. Cambios de base de datos que esto requiere

### 6.1 `historia_clinica` e `id_tenant` en `ficha_clinica`

**Las dos son bloqueantes, por motivos distintos**, y ninguna existe hoy.

`historia_clinica` - fue **removida** en el commit `4b67fa8`. Es uno de los tres
datos que pinta la card del listado (nombre, fecha e historia clínica) y además
la mitad de lo que busca `q`. Sin ella el listado no se puede armar.

`id_tenant` - **nunca se envía**: `RegistrationOrchestratorView.tsx` lo fija en
`0` en su contexto de respaldo, y el payload de `POST /v1/patient` no lo lleva.
Hoy solo vive como parámetro de consulta a Nursera (`idInstitucion`). No es un
dato de adorno: es **la columna sobre la que se apoya todo el aislamiento entre
hospitales** (sección 4), así que necesita índice y `NOT NULL`. Sin ella no hay
forma de acotar la búsqueda a lo que el médico puede ver.

Hay que persistir ambas al dar de alta la ficha. Mientras no estén, el mock las
inventa.

`idTenant` sí viaja en la respuesta -es barato y no es PHI- pero **la interfaz no
lo muestra**: con una cuenta de un solo hospital sería el mismo número repetido en
cada resultado. El día que una cuenta abarque varios, conviene mostrar el
**nombre de la institución** antes que el id.

### 6.2 Búsqueda por nombre: índice ciego por palabras

`paciente.nombre_enc` / `nombre_dek_enc` están cifrados, así que `q` **no puede
ser un `LIKE`**. La solución elegida es un **índice ciego de palabras**.

#### Cómo funciona

Al guardar un paciente, su nombre se parte en palabras, cada una se normaliza
(minúsculas, sin acentos) y de cada una se guarda un **HMAC-SHA256**:

```sql
CREATE TABLE paciente_nombre_token (
    paciente_id  uuid    NOT NULL REFERENCES paciente(paciente_id) ON DELETE CASCADE,
    token_hmac   bytea   NOT NULL,
    PRIMARY KEY (paciente_id, token_hmac)
);
CREATE INDEX ON paciente_nombre_token (token_hmac);
```

"María José Castro" deja tres filas: `hmac("maria")`, `hmac("jose")`,
`hmac("castro")`.

Al buscar, el término se parte igual y se exige que **todas** sus palabras estén
presentes para el mismo paciente:

```sql
SELECT paciente_id FROM paciente_nombre_token
WHERE  token_hmac = ANY($tokens_del_termino)
GROUP BY paciente_id
HAVING count(DISTINCT token_hmac) = $cantidad_de_tokens
```

#### La llave es lo que hace esto seguro

**HMAC con una llave que viva fuera de la base** (variable de entorno o KMS),
nunca un SHA-256 pelón. Con un hash sin llave, quien robe un volcado hashea
"castro", "lópez", "garcía" y reconstruye apellidos sin descifrar nada. Con HMAC,
la base por sí sola no alcanza.

Queda un residuo aceptado: se puede ver **cuántos** pacientes comparten un token,
aunque no cuál es. Rotar la llave obliga a reconstruir la tabla entera.

#### Lo que sí y lo que no encuentra

| Búsqueda | Resultado |
|---|---|
| `Castro` | Todos los Castro |
| `María Castro` / `Castro María` | Solo quien tenga ambas palabras; el orden da igual |
| `maria` sobre "María" | Sí - se normaliza antes de hashear |
| `Cast` | **Nada.** Un hash no admite prefijos |

El límite del fragmento es deliberado y ya está reflejado en la interfaz: el
estado vacío avisa que el nombre debe ir completo. `fichaSearch.mock.ts` aplica
la misma regla, para que el frontend no quede probado contra una búsqueda más
permisiva de la que existirá.

Si más adelante hiciera falta buscar por fragmento, la única vía es descifrar en
memoria el conjunto ya recortado por tenant y fecha, y usarlo como respaldo
cuando el índice no devuelva nada.

---

## 7. Auditoría de las búsquedas

Cada llamada a los dos endpoints escribe en `auditoria_evento`: quién, cuándo,
desde qué IP, con qué filtros y cuántos resultados salieron. El `X-Request-Id`
que ya manda `apiFetch` sirve para correlacionar.

**El término de búsqueda no se guarda en claro**: "castro" en un registro de
auditoría es PHI por la puerta de atrás. Guarda los hashes del término, o solo la
cantidad de palabras.

Sobre una consulta que devuelve PHI, saber quién miró qué es un control más
efectivo que restringir la consulta: un listado acotado y auditado es preferible
a uno abierto, y también a uno tan cerrado que el médico termine pidiendo los
datos por otra vía.

@compliance HIPAA 164.312(b) - controles de auditoría
@compliance ISO 27001 A.12.4 - registro de eventos

---

## 8. Mínimo privilegio: sin consentimiento ni firma

El visor de búsqueda muestra **cuatro** secciones - Datos de la Consulta, Otros
Demográficos, Signos de Alerta y Estudios de Gabinete. **No** muestra el
consentimiento informado ni la firma.

Por eso `GET /v1/fichas/:fichaId` **no debe incluir** `consentimiento.firmaBase64`
ni el resto del bloque de consentimiento. Es PHI pesada sin ningún consumidor en
este flujo, y lo que no se manda no se puede filtrar.

Si más adelante alguna pantalla necesita el consentimiento, que sea un endpoint
aparte con su propio control de acceso.

@compliance HIPAA 164.502(b) - mínimo dato necesario

---

## 9. `GET /api/v1/fichas/adendas` - la bandeja de revisión

Alimenta los tres tabs de **Corrección de Adendas** (`/dashboard/adendas`).

Generaliza al `GET /api/v1/fichas/pendientes` que ya existe: ese devuelve solo
lo pendiente y sin filtros, y la pantalla nueva necesita además las resueltas,
búsqueda y paginación. El endpoint viejo puede quedarse como alias de
`?estado=PENDIENTE` mientras haga falta.

### Query params

| Param | Tipo | Req. | Descripción |
|---|---|---|---|
| `estado` | `PENDIENTE` \| `APROBADA` \| `RECHAZADA` | **sí** | Qué tab se está mirando. Sin valor por defecto: una bandeja que no dice qué muestra se lee mal. |
| `q` | string | no | Texto libre: **nombre del paciente**, **número de historia clínica** o **nombre del pediatra que la solicitó**. Sin distinguir mayúsculas ni acentos. |
| `desde` | `YYYY-MM-DD` | no | Límite inferior **inclusivo** sobre la **fecha de solicitud** de la adenda, no sobre `fecha_consulta`. |
| `hasta` | `YYYY-MM-DD` | no | Límite superior **inclusivo**. |
| `page` | int ≥ 1 | no | 1-based. Default `1`. |
| `pageSize` | int | no | Default `12`. Tope sugerido `50`. |

Los filtros se combinan con **AND**. Orden fijo: **fecha de solicitud DESC** - lo
más reciente arriba, que es por donde se empieza a revisar.

`estado` y la paginación viajan siempre; los otros tres solo si tienen valor
(`buildAdendasQuery` en `ficha.service.ts`):

```http
GET /api/v1/fichas/adendas?estado=PENDIENTE&page=1&pageSize=12
GET /api/v1/fichas/adendas?estado=RECHAZADA&q=castro&desde=2026-01-01&hasta=2026-07-07&page=1&pageSize=12
```

"Cargar más" repite la consulta subiendo `page`, y el frontend **acumula** las
páginas en pantalla en vez de reemplazarlas.

### Sobre `q`: tres campos, dos mecanismos

- **Nombre del paciente** - va por el índice ciego de la sección 6.2, así que son
  **palabras completas**: "Cast" no encuentra a "Castro", y todas las palabras
  del término deben estar presentes.
- **Historia clínica** - coincidencia parcial con `LIKE`; no está cifrada.
- **Nombre del pediatra** - coincidencia parcial. Viene de Keycloak y hoy no está
  cifrado, así que admite `LIKE` normal. Si algún día se cifrara, entra al mismo
  índice ciego y pasa a ser por palabras completas como el del paciente.

Los tres se combinan con **OR** entre sí: un solo campo de búsqueda, y el revisor
no tiene por qué declarar qué está escribiendo.

### Ventana por defecto: solo sobre lo ya resuelto

**Con `estado=APROBADA` o `RECHAZADA` y sin fechas, acota al último mes**, por el
mismo motivo que la sección 1: son listados que crecen sin techo y un listado sin
límites es la petición más rentable para quien quiera extraer datos.

**Con `estado=PENDIENTE`, no.** Ahí el conjunto ya está acotado por definición
-solo lo que falta revisar, y se vacía a medida que se trabaja- y esconder una
adenda de hace cinco semanas sería esconder trabajo por hacer. Una pendiente
vieja es justamente la que más urge.

Basta con que llegue **una** de las dos fechas para respetar lo que el revisor
pidió y no aplicar la ventana.

@compliance HIPAA 164.502(b) - mínimo dato necesario

### Respuesta `200`

```json
{
  "items": [
    {
      "fichaId": "9f1c2e7a-4b10-4c3e-8b21-0d4a6f2c9a15",
      "fichaRaizId": "3b7d1f40-8a22-4c19-9f01-5d2e8a7c1b03",
      "revision": 2,
      "estadoRevision": "PENDIENTE",
      "fechaSolicitud": "2026-07-07",
      "medicoSolicitante": "Dr. Marco Paez",
      "motivoSolicitud": "Las fotografías del primer registro no correspondían...",
      "paciente": {
        "nombre": "Rachel Castro Morales",
        "historiaClinica": "00445566777",
        "tenantId": "23"
      }
    }
  ],
  "total": 7,
  "page": 1,
  "pageSize": 12
}
```

`total` es el conteo **después** de filtrar y **antes** de paginar - el frontend
lo usa para decidir si muestra "Cargar más".

Sin coincidencias: `200` con `items: []` y `total: 0`. **No** `404`.

- `fechaSolicitud` es ISO `YYYY-MM-DD`, porque aquí se ordena y se filtra. El
  frontend la pinta como `DD-MM-YYYY`.
- **No hay `motivoRechazo`**: el revisor acepta o rechaza cada cambio y nada más.
  Si el servidor manda el campo, el frontend lo ignora.
- `medicoSolicitante` es el nombre para mostrar, ya resuelto. La card dice
  "Pediatra que lo solicita", así que un id no sirve.

Tipos en `src/services/ficha.service.ts` → `AdendaResumen`, `AdendaSearchResult`.

### Errores, alcance y auditoría

Mismo sobre de errores que la sección 1, mismo alcance por tenant del token
(sección 4 - `estado` no abre la puerta a ver otras instituciones) y misma
auditoría (sección 7). El frontend traduce por código en `mensajeDeError` de
`AdendasPage.tsx`; el `message` del servidor nunca se pinta tal cual.

Además del rol, conviene validar que quien consulta pueda **revisar**: leer la
bandeja de adendas de un hospital no es lo mismo que consultar una ficha.

---

## 10. `POST /api/v1/fichas/:fichaId/resolver` - decisión por cambio

Es el contrato central de la pantalla nueva, y **no existe hoy**: el servidor
solo tiene `POST /aprobar` y `POST /rechazar`, que resuelven la adenda entera.

El revisor decide **cambio por cambio**, y eso es deliberado: una adenda puede
traer tres correcciones de las que dos son correctas y una trae la fotografía
equivocada. Con todo-o-nada, aceptar las dos buenas obliga a tragarse la mala, y
rechazar la mala obliga a devolver las buenas y pedir que se capturen otra vez.

### Petición

```json
{
  "decisiones": [
    { "tipo": "SIGNO",  "id": "9f1c…", "decision": "APROBADO" },
    { "tipo": "SIGNO",  "id": "2ab4…", "decision": "APROBADO" },
    { "tipo": "EXAMEN", "id": "7c3e…", "decision": "RECHAZADO" }
  ]
}
```

`id` es el del **alta** -el `signoId` / `examenId` del registro con
`addedInRevision: true`-, no el del registro al que sustituye. `tipo` dice en
cuál de las dos colecciones buscarlo.

### Reglas

- **Debe llegar una decisión por cada alta de la revisión.** Si falta alguna,
  `400` y **no se aplica nada**. La operación es atómica: media adenda aplicada
  y media pendiente dejaría la ficha en un estado que nadie sabría leer después.
  El frontend ya no deja pulsar "Guardar cambios" hasta tenerlas todas, así que
  un `400` aquí es un error de programación, no del revisor.
- **Un alta aprobada se aplica**; si sustituía a un registro vigente, ese queda
  marcado como sustituido.
- **Un alta rechazada se descarta, y el registro que sustituía vuelve a quedar
  vigente** - no sustituido. Este es el punto fácil de olvidar: si el vínculo se
  dejara puesto, la ficha quedaría con un hallazgo marcado "CAMBIADA" y nada que
  lo hubiera cambiado.
- **Una decisión no lleva nada más**: ni motivo ni nota por cambio. El revisor
  acepta o rechaza, y eso es todo lo que viaja. Si el servidor recibe un `motivo`
  de un cliente viejo, puede ignorarlo.
- **Estado final**: `APROBADA` si se aceptó al menos un cambio, `RECHAZADA` si se
  rechazaron todos. Con al menos uno aceptado la revisión pasa a ser la ficha
  vigente del paciente; con ninguno, se conserva la vigente anterior.

### Respuesta `200`

```json
{ "fichaId": "9f1c…", "revision": 2, "estadoFicha": "COMPLETA" }
```

Mismo `RevisionResult` que ya devuelven `aprobar` y `rechazar`.

### Errores

| Código | Cuándo | Qué muestra el frontend |
|---|---|---|
| `400` | Falta una decisión, o un `id` que no es un alta de esta revisión | Mensaje genérico |
| `403` | Rol sin permiso para resolver | "Tu sesión no tiene permiso para revisar esta adenda." |
| `404` | Ficha inexistente **o de otro tenant** (sección 4) | "Esta adenda no existe o ya fue archivada." |
| `409` | La revisión ya no está `PENDIENTE` | "Esta adenda ya fue resuelta por otra persona." |

El `409` importa más de lo que parece: dos revisores pueden abrir la misma
adenda a la vez, y el segundo en guardar tiene que enterarse en vez de creer que
su decisión se aplicó.

### Migración desde `aprobar` / `rechazar`

Los dos endpoints actuales son los casos degenerados de este: todas las
decisiones `APROBADO`, o todas `RECHAZADO`. Pueden
mantenerse, reimplementados encima de `resolver`, o retirarse cuando el
frontend deje de tener quien los llame - hoy ya no los usa nadie.

---

## 11. El vínculo de sustitución, de vuelta en la lectura

**Bloqueante para el panel "Anterior → Nuevo".**

`GET /api/v1/fichas/:fichaId` debe devolver qué registro sustituye a cuál:

```json
{
  "warningSigns": [
    { "signoId": "viejo", "signDescription": "Dedo meñique torcido",
      "addedInRevision": false, "replacedBySignoId": "nuevo" },
    { "signoId": "nuevo", "signDescription": "Clinodactilia del quinto dedo",
      "addedInRevision": true,  "replacesSignoId": "viejo" }
  ]
}
```

**El dato ya llega al servidor**: `POST /fichas/:id/revisiones` lo recibe como
`replacesSignoId` / `replacesExamenId` (`buildRevisionPayload` en
`ficha.mapper.ts`). Falta persistirlo y devolverlo en la lectura.

Mientras no vuelva, el frontend lo declara opcional -"Ausente mientras el
servidor no persista el vinculo", en `ficha.service.ts`- y las consecuencias son
dos, las dos visibles:

1. El panel de revisión no puede pintar el "Anterior" y cada cambio se ve como
   un alta suelta, que es justo lo que la pantalla existe para evitar.
2. Los badges **CAMBIADA** / **ACTIVA** de la ficha no aparecen: `fichaToView`
   los deriva de `replacedBySignoId`.

**Las dos direcciones, no una.** `cambiosDeAdenda` acepta cualquiera de las dos y
funciona con la que llegue, pero mandar ambas ahorra invertir la relación en el
cliente y deja la ficha legible por sí sola en los dos sentidos de lectura
("¿qué sustituyó a esto?" y "¿a qué sustituye esto?").

Tras un rechazo (sección 10), el vínculo del registro devuelto a vigente debe
quedar en `null`.

---

## 12. `estadoRevision`, separado de `estadoFicha`

Los tabs **Aprobadas** y **Rechazadas** no se pueden derivar de lo que hay hoy.

`estadoFicha` toma los valores `BORRADOR | PENDIENTE | COMPLETA | VALIDADA`
(`FichaRecord.tsx`, `App.tsx`). Ahí no existen "aprobada" ni "rechazada", y
`COMPLETA` no distingue una revisión que un genetista aprobó de una ficha
original que nunca tuvo adendas. Son dos ejes distintos: uno describe **la
ficha**, el otro **la decisión del revisor sobre la adenda**.

Hace falta un campo propio, en `FichaDetail` y en el resumen de la sección 9:

```json
{
  "estadoRevision": "APROBADA",
  "fechaCreacion": "2026-07-07",
  "fechaResolucion": "2026-07-09T15:22:31Z",
  "resueltaPor": "Dra. Ana Gómez"
}
```

- `estadoRevision`: `PENDIENTE | APROBADA | RECHAZADA`. Una ficha que no nació de
  una adenda puede no traerlo; el frontend trata su ausencia como `PENDIENTE`
  solo dentro de la bandeja, donde por definición todo es una adenda.
- `fechaCreacion` - cuándo se solicitó. `PendingFicha` ya lo devuelve; hace falta
  también en `FichaDetail`, porque la pantalla de revisión lo muestra.
- `fechaResolucion` y `resueltaPor` - para la sección 13. No se pintan en la
  bandeja todavía, pero sin ellos no hay nada que auditar.

---

## 13. Auditoría de las resoluciones

La sección 7 cubre las **búsquedas**. Resolver una adenda no es una consulta: es
un acto que **cambia el expediente clínico** de un paciente, y aceptar o rechazar
cada cambio es una decisión con nombre y apellido detrás.

Cada `POST /resolver` debe escribir en `auditoria_evento`: quién resolvió, cuándo,
desde qué IP, sobre qué `fichaId` y `revision`, y **la decisión de cada cambio
con su id**. El `X-Request-Id` que ya manda `apiFetch` correlaciona la traza.

- **Lo que se guarda es la decisión, no un texto**: `APROBADO` / `RECHAZADO` por
  cada id. No hay motivo que registrar, así que tampoco hay texto clínico libre
  que proteger en esta traza.
- El registro es **inmutable y aparte de la ficha**: si una adenda se resuelve y
  después se corrige por otra vía, las dos cosas deben quedar.
- Conviene registrar también los `404` y `409`: un intento de resolver una adenda
  de otro hospital, o dos revisores pisándose, son justo lo que se quiere ver
  después.

@compliance HIPAA 164.312(b) - controles de auditoría
@compliance HIPAA 164.312(c)(1) - integridad de la información médica
@compliance ISO 27001 A.12.4 - registro de eventos

---

## 14. `fechaCreacion` en el listado de fichas del paciente

Este no es un endpoint por construir, sino **un campo que le falta a uno que ya
existe**: `GET /api/v1/pacientes/:tenantId/:historiaClinica/fichas`
(`listFichasPaciente` en `src/services/ficha.service.ts`).

### Para qué

El visor de una ficha (`/dashboard/busqueda/:fichaId`) muestra un selector con
las versiones del linaje -la ficha original y cada adenda aprobada- para poder
saltar entre ellas. Las etiquetas van así:

```
Versión 01 - 12 mar 2026
Versión 02 - 3 jun 2026
Versión 03 (actual) - 20 ago 2026
```

La fecha es lo que le dice al médico *cuándo* se hizo cada cambio, que es la
única forma de distinguir una versión de otra a simple vista.

### El problema

`FichaSummary` trae `fechaConsulta`, pero esa es la fecha de la **consulta**, y
todas las revisiones del mismo linaje la copian igual. Usarla pintaría la misma
fecha en las tres opciones, que es peor que no pintar ninguna.

`GET /api/v1/fichas/pendientes` ya devuelve `fechaCreacion` por revisión
(`PendingFicha`), así que el dato existe en la base: falta exponerlo también en
este listado.

### Lo que se pide

Añadir a cada elemento de la respuesta:

| Campo | Tipo | Descripción |
|---|---|---|
| `fechaCreacion` | ISO 8601 con hora | Alta de **esa revisión**, no de la consulta. El mismo valor que ya devuelve `/fichas/pendientes`. |

Tipo en `src/services/ficha.service.ts` → `FichaSummary.fechaCreacion`, hoy
declarado **opcional** justamente porque el servidor todavía no lo manda.

### Mientras tanto

El frontend degrada solo: si el campo no llega, las opciones se quedan en
`Versión 01`, `Versión 02`, `Versión 03 (actual)` y el selector sigue
funcionando. No hay nada que desplegar del lado del cliente cuando el campo
aparezca.

---

## 15. Dropdown para sexo del paciente

Lo pidieron para la ficha: capturar el sexo del paciente. En el frontend es un
dropdown **obligatorio** en *Datos de la Consulta*, debajo de *Lugar de parto*.

Como los demás dropdowns de la ficha (`/v1/ReferidoDe`, `/v1/AsistenciaParto`,
`/v1/Familiares`, `/v1/PartesCuerpo`), las opciones salen de un catálogo del
backend: el frontend no guarda la lista, solo el id elegido.

### 15.1 Catálogo nuevo: `GET /v1/Sexos`

Mismo formato que `GET /v1/ReferidoDe` y `GET /v1/AsistenciaParto`: datos de
referencia sin PHI, compartidos entre tenants y de solo lectura.

```json
[
  { "sexo_id": 1, "codigo": "M", "nombre": "Masculino" },
  { "sexo_id": 2, "codigo": "F", "nombre": "Femenino" },
  { "sexo_id": 3, "codigo": "I", "nombre": "Indeterminado" }
]
```

| Campo | Tipo | Descripción |
|---|---|---|
| `sexo_id` | `number` | Id que el frontend devuelve en `sexId`. |
| `codigo` | `'M' \| 'F' \| 'I'` | Código estable para reportería y para mapear a FHIR. |
| `nombre` | `string` | Texto que se muestra en el dropdown. |

- Devolver solo las filas activas; las opciones se muestran en el orden en que llegan.
- **Indeterminado** cubre los genitales ambiguos, un hallazgo frecuente en
  anomalías congénitas, así que no debe sobrar ni esconderse.
- Mapeo a HL7 FHIR R4 `AdministrativeGender`: `M → male`, `F → female`, `I → other`.

Tipo en `src/services/catalog.service.ts` → `CatSexo`.

### 15.2 Alta: `POST /v1/patient`

Campo nuevo en el cuerpo, junto a `referralSourceId` y `birthMethodId`:

```json
{
  "referralSourceId": 1,
  "birthMethodId": 2,
  "sexId": 1
}
```

| Campo | Tipo | Descripción |
|---|---|---|
| `sexId` | `number` | **Obligatorio.** `400` si falta, si no es entero o si no existe / está inactivo en el catálogo. |

Tipo en `src/types/patient-api.ts` → `PatientRegistrationPayload.sexId`.

### 15.3 Lectura: `FichaDetail.demographic`

```json
"demographic": {
  "referralSourceId": 1,
  "birthMethodId": 2,
  "sexId": 1
}
```

`sexId: number | null`. Es `null` en las fichas registradas antes de este cambio.
Tipo en `src/services/ficha.service.ts`, declarado **opcional** mientras el
servidor no lo mande.

### 15.4 Visor del dashboard: `GET /v1/fichas/:fichaId` (sección 2)

Campo nuevo en `datosConsulta`, con la misma forma `{ value, label }` que
`referidoDe` y `lugarDeParto`:

```json
"datosConsulta": {
  "referidoDe":   { "value": "1", "label": "Comadrona" },
  "lugarDeParto": { "value": "2", "label": "Hospital local" },
  "sexo":         { "value": "1", "label": "Masculino" }
}
```

`sexo: { value, label } | null`, `null` en las fichas anteriores. Tipo en
`src/types/ficha-search.ts` → `DatosConsultaDetalle.sexo`.

### 15.5 Revisiones y base de datos

- El cuerpo de las revisiones no cambia (solo lleva altas de signos y exámenes),
  pero al copiar la ficha el servidor debe **conservar `sexId`**.
- La columna en `ficha_clinica` va **nullable**: las fichas existentes no lo
  tienen. La obligatoriedad se valida en el alta, no en la base.

### Mientras tanto

Si `GET /v1/Sexos` falla, el frontend deja el dropdown vacío y el resto de los
catálogos carga igual. Pero como el campo es obligatorio, **no se puede
finalizar una ficha nueva hasta que el endpoint exista**.

---

## 16. Observaciones de la ficha

Los médicos pidieron un campo de texto libre para lo que quieran agregar y no
cabe en otra sección. En el frontend es la sección **Observaciones**, al final
de la ficha, con el mismo patrón que Signos de Alerta: una lista y un modal para
agregar.

Reglas de negocio:

- **Varias por ficha**, cada una de **hasta 1000 caracteres**, con saltos de línea.
- **Opcionales**: una ficha sin observaciones es válida.
- **En una adenda solo se agregan.** No se editan ni se borran, y no sustituyen a
  nada: por eso no llevan vínculo `replaces…` como los signos y los exámenes.
- En el alta se capturan después de firmar el consentimiento, igual que signos y
  exámenes.

### 16.1 Alta: `POST /v1/patient`

Campo nuevo, **opcional**:

```json
{
  "warningSigns": [],
  "examDiagnoses": [],
  "observations": [
    { "observationText": "La madre refiere que un primo materno presentó rasgos similares al nacer." }
  ]
}
```

| Campo | Tipo | Descripción |
|---|---|---|
| `observations` | `Observation[]` | **Opcional.** El frontend **no lo manda** si no hay ninguna. |
| `observations[].observationText` | `string` | 1 a 1000 caracteres, ya recortado. Puede traer `\n`. `400` si viene vacío o se pasa del límite. |

Tipo en `src/types/patient-api.ts` → `Observation`, `PatientRegistrationPayload.observations`.

### 16.2 Adenda: `POST /api/v1/fichas/:fichaId/revisiones`

Mismo campo, **solo con las altas** de esta revisión. Como pasa con signos y
exámenes, las observaciones ya registradas las copia el servidor.

```json
{
  "motivo": "Agrego un antecedente familiar que la madre recordó después.",
  "warningSigns": [],
  "examDiagnoses": [],
  "observations": [{ "observationText": "La abuela materna tuvo un hijo con rasgos similares." }]
}
```

- Una revisión con **solo observaciones** es válida. La regla pasa a ser
  "al menos un alta de cualquiera de los tres tipos".
- Si no hay observaciones nuevas, el campo **no se manda**.

Tipo en `src/services/ficha.service.ts` → `RevisionPayload.observations`.

### 16.3 Lectura: `FichaDetail.observations`

```json
"observations": [
  {
    "observacionId": "5d2e…",
    "observationText": "La madre refiere que…",
    "addedInRevision": false,
    "fechaCreacion": "2026-09-10T15:24:00Z"
  }
]
```

| Campo | Tipo | Descripción |
|---|---|---|
| `observacionId` | `string` | Estable y único en la ficha: el frontend lo usa como `key` y como ancla del panel de cambios. |
| `observationText` | `string` | El texto tal como se guardó. |
| `addedInRevision` | `boolean` | `true` si nació en **esta** revisión. Es lo que la vuelve un cambio a decidir (16.5). |
| `fechaCreacion` | ISO 8601 con hora | Alta de la observación. El visor la muestra bajo el texto. |

- Orden: por `fechaCreacion` ascendente.
- Siempre un arreglo: `[]` si no hay, no `null`.

Tipo en `src/services/ficha.service.ts` → `StoredObservation`, declarado
**opcional** en `FichaDetail` mientras el servidor no lo mande.

### 16.4 Visor del dashboard: `GET /v1/fichas/:fichaId` (sección 2)

```json
"observaciones": [
  { "id": "5d2e…", "texto": "La madre refiere que…", "fecha": "10 sep 2026" }
]
```

`fecha` viene **ya formateada**, igual que `fechaConsulta` en esa misma
respuesta. Tipo en `src/types/ficha-search.ts` → `ObservacionDetalle`.

### 16.5 Resolución de adendas (sección 10)

- `decisiones[].tipo` admite un tercer valor: **`"OBSERVACION"`**, con `id` = el
  `observacionId` del alta.
- La regla de "una decisión por cada alta" (`400 DECISION_INCOMPLETA`) **incluye
  las observaciones**.
- Una observación **rechazada desaparece**. No hay nada que devolver a vigente,
  porque no sustituía nada.
- Una observación aprobada se queda en la ficha nueva.

```json
{
  "decisiones": [
    { "tipo": "SIGNO",       "id": "9f1c…", "decision": "APROBADO" },
    { "tipo": "OBSERVACION", "id": "5d2e…", "decision": "RECHAZADO" }
  ]
}
```

### 16.6 Base de datos y privacidad

- Tabla nueva `observacion_ficha`: `observacion_id`, `ficha_id` (FK),
  `texto`, `agregada_en_revision`, `fecha_creacion` y `usuario_id` (quién la
  escribió). Relación 1:N con `ficha_clinica`.
- **El texto es PHI potencial.** Aunque el modal pide no incluir nombres ni
  datos personales, no hay forma de impedirlo, así que el texto se **cifra en
  reposo** como el resto del contenido clínico y **no entra al índice ciego** de
  la búsqueda (6.2).
- Las lecturas se **auditan** junto con la ficha (sección 7). No hace falta un
  evento aparte.

### Mientras tanto

- Si el servidor no manda `observations`, la sección aparece vacía y todo lo
  demás funciona.
- Una ficha o una adenda **sin** observaciones no manda el campo, así que no
  depende de este cambio.
- Una **con** observaciones sí lo manda. Si el servidor rechaza campos
  desconocidos, ese envío fallará hasta que 16.1 y 16.2 estén en pie.

---

## 17. Orden de trabajo

Las dependencias mandan: sin las dos primeras, las siguientes no se pueden probar
de verdad.

- [ ] **Migración de BD** (6.1): `historia_clinica` e `id_tenant` en
      `ficha_clinica`, ambas `NOT NULL` e `id_tenant` con índice. Persistirlas en
      `POST /v1/patient`.
- [ ] **Claim `tenants`** en Keycloak (4) y su validación en el middleware. Sin
      esto ningún endpoint puede acotar el alcance.
- [ ] **`GET /v1/fichas`** (1) sin `q`: fechas, ventana por defecto, paginación,
      orden y alcance por tenant. Ya sirve para pintar la pantalla completa.
- [ ] **Índice ciego** (6.2): tabla `paciente_nombre_token`, llave HMAC fuera de
      la base, y llenarla al alta. **Antes de cargar pacientes de verdad** - si se
      deja para después hay que reconstruirla descifrando todos los nombres.
- [ ] **`q`** sobre ese índice, más el `LIKE` de historia clínica.
- [ ] **`GET /v1/fichas/:fichaId`** (2), con `404` para la ficha de otro tenant.
- [ ] **Firma de imágenes** (3) dentro de esa misma respuesta.
- [ ] **Auditoría** (7) en los dos endpoints.
- [ ] Quitar el campo de tenant escrito a mano del flujo de captura (4).
- [ ] Poner `USE_MOCK` en `false` en `fichaSearch.service.ts`.
- [ ] **`fechaCreacion`** por revisión en el listado de fichas del paciente (14).
      Independiente del resto: el selector de versiones ya funciona sin él.
- [ ] **`estadoRevision`** y `fechaCreacion` en `FichaDetail` (12). Va primero de
      la tanda de adendas: sin él, los tabs "Aprobadas" y "Rechazadas" no se
      pueden construir.
- [ ] **Vínculo de sustitución** persistido y devuelto en la lectura (11). El
      servidor ya recibe el dato al crear la revisión; sin devolverlo, el panel
      "Anterior → Nuevo" y los badges CAMBIADA/ACTIVA quedan vacíos.
- [ ] **`GET /api/v1/fichas/adendas`** (9): estado, filtros, ventana por defecto
      solo en las resueltas, orden y paginación.
- [ ] **`POST /fichas/:id/resolver`** (10), atómico y con una decisión por alta.
      Retirar `aprobar` / `rechazar` cuando ya no los llame nadie.
- [ ] **Auditoría de las resoluciones** (13).
- [ ] Poner `USE_MOCK` en `false` en `ficha.service.ts` (el de adendas).
- [ ] **Catálogo de sexo** (15): `GET /v1/Sexos`, `sexId` obligatorio en
      `POST /v1/patient` y de vuelta en las dos lecturas. Independiente del resto,
      pero **bloquea el alta de fichas nuevas** en cuanto se despliegue el frontend.
- [ ] **Observaciones** (16): tabla `observacion_ficha` cifrada, `observations`
      opcional en el alta y en las revisiones, de vuelta en las dos lecturas, y
      `tipo: "OBSERVACION"` en `resolver`. Depende de `resolver` (10) solo para la
      parte de adendas.

### Cómo comprobar que el contrato calza

Hay dos mocks, y los dos son especificación ejecutable: si el backend se
comporta distinto en alguno de esos casos, el desacuerdo está ahí.

`fichaSearch.mock.ts` implementa las secciones 1 y 2, y `fichaSearch.mock.test.ts`
lo fija en 25 pruebas: filtrado por palabras completas, límite del fragmento,
rangos inclusivos, ventana por defecto, orden y paginación.

`adendas.mock.ts` implementa las secciones 9 y 10, y `adendas.mock.test.ts` fija
lo que tiene de propio: el filtro por estado, la búsqueda por las tres columnas,
que la ventana por defecto **no** toque el tab de pendientes, y las reglas de la
resolución parcial -decisión obligatoria por cada alta, el sustituido que vuelve
a vigente tras un rechazo, y el 409 al resolver dos veces-. `adendas-contract.test.ts`
congela aparte la URL y el cuerpo que salen del cliente.
