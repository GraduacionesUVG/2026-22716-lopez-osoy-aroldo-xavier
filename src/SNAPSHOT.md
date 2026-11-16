# Procedencia del codigo fuente

La entrega se genero a partir de archivos versionados en referencias remotas limpias. Los directorios `.git`, working trees locales, artefactos de compilacion y archivos de entorno no fueron copiados.

| Componente | Referencia | Commit |
| --- | --- | --- |
| CONGENIA-ORCH | `origin/master` | `e4d5ef5676eab0defaf3aa455afe02bfd20583f8` |
| CONGENIA-M1 | `origin/main` | `2be534960a9fa8aed08e20adde2ec12f246c3d10` |
| CONGENIA-M1-SERVER | `origin/main` | `33498670305802ef598c366bda7c10997f8a5d70` |
| CONGENIA-CIE10 | `origin/main` | `84e691a9c140211d48288a57488dfea7612d299a` |
| CONGENIA-M1-PDF-WORKER | `origin/main` | `a2fbcdb44dd39240c90ab583954fe9e3eb21378b` |
| CONGENIA-REPORTING-PIPELINE | `origin/feature/reporting-pipeline-bootstrap` | `b01bd6051289ca097cb34bc089cd8168ab8b250b` |

La rama de reporting indicada contiene la rama de evaluacion y los ajustes posteriores. Ese repositorio no publicaba una rama remota `main` al preparar esta entrega.

## Ajustes exclusivos de la entrega

Se agregaron la orquestacion raiz, la plantilla de entorno sanitizada y esta documentacion. Tambien se actualizaron dependencias compatibles para resolver avisos de seguridad detectados al validar la copia publica:

- Zod se actualizo a una version corregida en el frontend.
- Dependencias transitivas de AWS se actualizaron en API y worker.
- El worker actualizo `tsx` y la API fijo una version corregida de `minimatch` para herramientas de desarrollo.

Estos ajustes se probaron dentro de la copia de entrega y no alteraron los repositorios de desarrollo originales.

Los archivos `certs/rds-global-bundle.pem` son certificados publicos de autoridades de confianza de AWS. Los archivos bajo `test/fixtures/tls` pertenecen a una autoridad llamada `CONGENIA test CA`, usan una llave deliberadamente compartida entre los fixtures y solo permiten reproducir pruebas TLS contra `localhost`. No contienen material criptografico productivo.
