# CONGENIA M1 PDF Worker

Worker asíncrono para generar PDFs de consentimiento desde eventos RabbitMQ.

## Flujo

1. Consume `consent.pdf.generate`.
2. Lee `consentimiento` + `ficha_clinica` desde Postgres.
3. Descarga la firma PNG desde S3 (`consentimiento.firma_png_ref`) y verifica que su SHA-256 coincida con `firma_png_hash_sha256`; si no coincide, el job va a la DLQ (`signature_hash_mismatch`). La firma nunca se guarda en la base.
4. Genera PDF con PDFKit.
5. Sube PDF a SeaweedFS S3 (`congenia-docs`).
6. Actualiza `consentimiento.pdf_ref` y `consentimiento.pdf_hash_sha256`, y registra `PDF_CONSENTIMIENTO_GENERADO` con el hash de la firma usada.

## Desarrollo local

```bash
npm install
npm run build
npm run dev
```

## Variables requeridas

- `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`
- `RABBITMQ_HOST`, `RABBITMQ_PORT`, `RABBITMQ_USER`, `RABBITMQ_PASSWORD`, `RABBITMQ_VHOST`
- `RABBITMQ_QUEUE_MAIN`, `RABBITMQ_QUEUE_DLQ`
- `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`
- `WORKER_PREFETCH`, `WORKER_MAX_RETRIES`, `WORKER_RETRY_BACKOFF_MS`, `WORKER_RETRY_BACKOFF_MULTIPLIER`
