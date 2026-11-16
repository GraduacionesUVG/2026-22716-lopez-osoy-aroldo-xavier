# CONGENIA CIE10

Batch mensual para preparar la cola de correccion CIE-10 del dashboard de CONGENIA.

El servicio lee snapshots CSV, recupera contexto CIE-10 desde un indice versionado en S3 Vectors, solicita sugerencias a OpenAI y guarda los resultados en PostgreSQL. La revision humana ocurre en `CONGENIA-M1-SERVER` mediante `/api/v1/cie10/*`.

Los registros con estado `suggestions` intentan contener cinco opciones ordenadas. Si los reintentos no logran completar las cinco, el batch conserva y muestra las opciones validas disponibles; solo `insufficient_information` se guarda sin sugerencias. Cada codigo se marca como validado institucionalmente, respaldado por la referencia externa o pendiente de atencion, y no se descarta solo por estar fuera del catalogo institucional.

## Entradas

- `CIE10.csv`: catalogo maestro institucional.
  - `Codigo`: id interno.
  - `Codigo_Enfermedad`: codigo CIE-10 oficial.
  - `Nombre`: descripcion oficial/local.
- `CIE10_Traductor.csv`: registros historicos.
  - `Codigo`: id estable del item.
  - `Diagnostico`: texto libre.
  - `CIE_10`: id interno o codigo existente. `-1`, vacio o invalido queda pendiente.
- `cie-10-reference.csv`: referencia internacional complementaria fijada a un commit revisado de `verasativa/CIE-10`.

## Configuracion Local

```bash
cp .env.example .env
pnpm install
pnpm dev
```

Variables principales:

```env
OPENAI_API_KEY=...
CIE10_SOURCE_MODE=local
CIE10_CATALOG_CSV_PATH=./CIE10.csv
CIE10_TRANSLATOR_CSV_PATH=./CIE10_Traductor.csv
CIE10_REFERENCE_CSV_PATH=./cie-10-reference.csv
CIE10_COMMAND=index
CIE10_BATCH_PERIOD=2026-09
CIE10_VECTOR_BUCKET_NAME=...
CIE10_VECTOR_INDEX_NAME=...
CIE10_RAG_VERSION=2026-10-17
CIE10_EMBEDDING_PROVIDER=openai
CIE10_EMBEDDING_MODEL=text-embedding-3-small
CIE10_MAX_RECORDS=10
CIE10_OPENAI_MODEL=gpt-6-luna
CIE10_REASONING_EFFORT=medium
CIE10_REPAIR_ATTEMPTS=2
POSTGRES_HOST=localhost
POSTGRES_DB=congenia
POSTGRES_USER=congenia
POSTGRES_PASSWORD=...
```

El batch registra tokens de entrada, entrada cacheada, salida, razonamiento y
total por caso y corrida. El costo se calcula posteriormente con la tarifa que
corresponda a la fecha de la evaluación.

En el orquestador local:

```bash
docker compose --profile jobs run --rm cie10_batch
```

## Produccion

En AWS, `CONGENIA-INFRA` ejecuta una task ECS one-shot con EventBridge Scheduler al final de mes. Los CSV llegan por S3:

```env
CIE10_SOURCE_MODE=s3
CIE10_CATALOG_S3_URI=s3://<bucket>/cie10/input/CIE10.csv
CIE10_TRANSLATOR_S3_URI=s3://<bucket>/cie10/input/CIE10_Traductor.csv
CIE10_REFERENCE_CATALOG_S3_URI=s3://<bucket>/cie10/input/verasativa-cie-10.csv
CIE10_VECTOR_BUCKET_NAME=<vector-bucket>
CIE10_VECTOR_INDEX_NAME=cie10-catalog
```

`OPENAI_API_KEY` se inyecta desde Secrets Manager.

Sin `CIE10_BATCH_PERIOD`, cada corrida se asigna al mes calendario anterior en
`America/Guatemala`. El override `YYYY-MM` se reserva para pruebas y backfills.
La indexacion usa exclusivamente OpenAI. Las tareas CIE-10 no requieren ni
reciben permisos de Bedrock.

Para pruebas OpenAI, usar una version RAG nueva y `CIE10_ACTIVATE_RAG=false`:
el resultado queda `READY` sin cambiar el puntero activo. La indexacion tambien
actualiza el catalogo SQL compartido; usar el snapshot institucional productivo.

### Publicacion desde GitHub Actions

Configura `AWS_REGION`, `AWS_ROLE_ARN` y `ECR_REGISTRY` como variables del repositorio.
No se necesita `INFRA_TOKEN`: el workflow solo publica en ECR. Para desplegar,
abrir `CONGENIA-INFRA → Actions → deploy-production → Run workflow`, elegir
`service=cie10` y el tag publicado. El manifiesto se registra con el `GITHUB_TOKEN`
de INFRA tras verificar el despliegue, sin PR.
El acceso a AWS usa OIDC, sin claves AWS permanentes. La confianza del rol se
administra en `CONGENIA-INFRA/envs/shared/variables.tf` y debe coincidir exactamente
con el `subject` mostrado por el workflow. Para este repositorio GitHub emite:

```text
repo:CONGENIAGT@271886543/CONGENIA-CIE10@1317646820:ref:refs/heads/main
```

Ese formato incluye IDs inmutables; un subject con solo los nombres no coincide.
Consulta la [referencia OIDC de GitHub](https://docs.github.com/en/actions/reference/security/oidc).
El paso de diagnostico publica solo metadatos, nunca el token OIDC.

`CIE10_MAX_RECORDS` limita los registros nuevos procesados por corrida: los items
que ya existen se omiten y no consumen ese limite.

## Persistencia

El batch escribe:

- `cie10_catalogo`
- `cie10_run`
- `cie10_sugerencia`
- `cie10_rag_version`

La API principal escribe:

- `cie10_decision`
- `cie10_decision_historial`
- eventos en `auditoria_evento`

La idempotencia es por `codigoTraductor`: una corrida no reprocesa items ya existentes salvo con `CIE10_FORCE=true`.

## Comandos

```bash
pnpm test
pnpm build
pnpm start
```

## Evaluacion Formal

El harness de evaluacion vive fuera del flujo productivo y se corre bajo demanda.
No forma parte de los tests unitarios que llaman a OpenAI.

Smoke deterministico sin costo:

```bash
pnpm evaluate:cie10 -- \
  --cases evaluation/cie10/pilot-40.json \
  --provider fixture
```

Corrida formal con modelo real:

```bash
OPENAI_API_KEY='sk-...' \
CIE10_OPENAI_MODEL=gpt-6-luna \
CIE10_OPENAI_REASONING_EFFORT=medium \
CIE10_VECTOR_BUCKET_NAME='<vector-bucket>' \
CIE10_VECTOR_INDEX_NAME='cie10-catalog' \
pnpm evaluate:cie10 -- \
  --cases evaluation/cie10/final-100.json \
  --catalog ./CIE10.csv \
  --reference-catalog ./cie-10-reference.csv \
  --rag-version "${EVAL_VERSION}-openai" \
  --provider openai \
  --embedding-provider openai
```

`--rag-version` hace que la evaluacion consulte el mismo indice de S3 Vectors
que produccion. Omitirlo sirve para comparar el modelo sin recuperacion, pero
ese resultado no debe presentarse como evaluacion del flujo RAG.

El comando genera `output/evaluation/<suite>-report.json` y CSV. Los archivos
`pilot-40.json` y `final-100.json` son bases sin identificadores de paciente;
antes del reporte final deben quedar revisados por el encargado CIE10.

El flujo actual evalua solamente OpenAI; `EVAL_VERSION` debe corresponder a una
version indexada y terminada en `READY`. Una comparacion futura con otro proveedor
requiere preparar por separado su acceso y sus recursos de evaluacion.
El reporte separa Recall@1/3/5 y MRR de recuperacion de las metricas de la
respuesta final, e incluye solicitudes, tokens, errores y latencia del proveedor
de embeddings para evitar atribuir al RAG cambios causados por el clasificador.
