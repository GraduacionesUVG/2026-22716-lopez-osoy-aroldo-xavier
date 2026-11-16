# Imagen de un solo uso para cargar el esquema en RDS.
#
# Los .sql se hornean en la imagen a proposito. La version manual de la prueba
# los descargaba al arrancar con `apk add curl`, lo que ataba la tarea al NAT
# Gateway y a que una URL siguiera viva. Horneados, la tarea solo necesita
# alcanzar ECR (ya hay endpoints de interface) y RDS.
#
# El contexto de build es `db/`, no este directorio: la imagen necesita ver
# tanto el entrypoint como los .sql de `db/init`, que son su fuente de verdad.
#
#   docker build -f db/migrate/Dockerfile db
#
# Antes este Dockerfile vivia en CONGENIA-INFRA y un script copiaba los .sql
# hasta alla como contexto de build. Junto al esquema que hornea, la imagen se
# construye sola y su pipeline es igual al de los demas servicios.
FROM postgres:16-alpine

COPY init/ /sql/
COPY migrate/entrypoint.sh /usr/local/bin/migrate

RUN chmod +x /usr/local/bin/migrate

# La imagen oficial arranca un servidor; aqui solo queremos el cliente.
ENTRYPOINT ["/usr/local/bin/migrate"]
