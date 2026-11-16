#!/bin/sh
# =============================================================================
# Aplica los .sql horneados en /sql contra la base que apunten las variables
# PG*. El password llega por PGPASSWORD, inyectado desde Secrets Manager por el
# bloque `secrets` de la task definition (nunca como environment en claro).
# =============================================================================
set -eu

: "${PGHOST:?falta PGHOST}"
: "${PGDATABASE:?falta PGDATABASE}"
: "${PGUSER:?falta PGUSER}"
: "${PGPASSWORD:?falta PGPASSWORD}"

echo "==> Migracion CONGENIA contra ${PGHOST}:${PGPORT:-5432}/${PGDATABASE}"

# RDS puede seguir arrancando cuando la tarea ya corre.
intentos=0
until pg_isready -q; do
  intentos=$((intentos + 1))
  if [ "$intentos" -ge 30 ]; then
    echo "!!! ${PGHOST} no acepta conexiones despues de 60s" >&2
    exit 1
  fi
  sleep 2
done

# El rol congenia_app lo crea 06_audit_trail.sql sin login. Aqui recibe LOGIN y
# contrasena, que llega por APP_DB_PASSWORD igual que PGPASSWORD y nunca se
# escribe en un .sql. La variable de psql la cita como literal (:'app_pw').
configurar_rol_app() {
  if [ -z "${APP_DB_PASSWORD:-}" ]; then
    echo "==> APP_DB_PASSWORD no definido: congenia_app queda sin login."
    return 0
  fi
  echo "==> Configurando login de congenia_app"
  printf "ALTER ROLE congenia_app WITH LOGIN PASSWORD :'app_pw';\n" |
    psql -v ON_ERROR_STOP=1 -q -v app_pw="$APP_DB_PASSWORD"
}

# El esquema no es idempotente: 23 CREATE TABLE sin IF NOT EXISTS. Correrlo dos
# veces aborta en la primera tabla. Se detecta por la presencia de "usuario",
# que es la primera que crea 01_schema.sql.
cargado=$(psql -tAc "SELECT to_regclass('public.usuario') IS NOT NULL")

if [ "$cargado" = "t" ] && [ "${MIGRATE_FORCE:-0}" != "1" ]; then
  echo "==> El esquema base ya esta cargado. Aplicando migraciones incrementales idempotentes."
  psql -v ON_ERROR_STOP=1 -q -c "CREATE TABLE IF NOT EXISTS schema_migrations (version varchar(200) PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"
  psql -v ON_ERROR_STOP=1 -q -c "INSERT INTO schema_migrations(version) VALUES ('01_schema.sql'), ('02_seed.sql') ON CONFLICT DO NOTHING"
  for archivo in /sql/[0-9][0-9]_*.sql; do
    nombre=$(basename "$archivo")
    if [ "$nombre" = "01_schema.sql" ] || [ "$nombre" = "02_seed.sql" ]; then
      continue
    fi
    aplicado=$(psql -tAc "SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '$nombre')")
    if [ "$aplicado" = "t" ]; then
      echo "==> Saltando ${nombre} (ya aplicada)"
      continue
    fi
    echo "==> Aplicando ${nombre}"
    psql -v ON_ERROR_STOP=1 -q -f "$archivo"
    psql -v ON_ERROR_STOP=1 -q -c "INSERT INTO schema_migrations(version) VALUES ('$nombre') ON CONFLICT DO NOTHING"
  done
  configurar_rol_app
  exit 0
fi

for archivo in /sql/*.sql; do
  echo "==> Aplicando $(basename "$archivo")"
  psql -v ON_ERROR_STOP=1 -q -f "$archivo"
  psql -v ON_ERROR_STOP=1 -q -c "CREATE TABLE IF NOT EXISTS schema_migrations (version varchar(200) PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"
  psql -v ON_ERROR_STOP=1 -q -c "INSERT INTO schema_migrations(version) VALUES ('$(basename "$archivo")') ON CONFLICT DO NOTHING"
done

configurar_rol_app

tablas=$(psql -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'")
echo "==> Listo. Tablas en el esquema public: ${tablas}"
