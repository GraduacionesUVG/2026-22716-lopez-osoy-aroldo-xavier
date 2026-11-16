# Certificados de confianza para PostgreSQL

`rds-global-bundle.pem` es el paquete global de autoridades de Amazon RDS,
descargado de `https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem`
el 2026-10-30.

SHA-256: `90a6f1a7978a1b1b096dca6c57511ca48d3b8cf052f8e704baf358f34ea2f21b`

Va dentro de la imagen para que la conexion valide la CA y el nombre del
servidor (`POSTGRES_SSL_MODE=verify-full`) sin descargar nada al construir ni al
arrancar. Para renovarlo: volver a descargarlo, comparar la huella publicada por
AWS y actualizar este archivo en el mismo commit.
