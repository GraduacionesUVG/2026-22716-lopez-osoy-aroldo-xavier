FROM quay.io/keycloak/keycloak:26.6.1

COPY --chown=keycloak:keycloak realm-congenia.json /opt/keycloak/data/import/realm-congenia.json
COPY --chown=keycloak:keycloak themes/congenia /opt/keycloak/themes/congenia
# CA de RDS para KC_DB_URL con sslmode=verify-full&sslrootcert=<esta ruta>.
COPY --chown=keycloak:keycloak certs/rds-global-bundle.pem /opt/keycloak/conf/rds-global-bundle.pem

ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
CMD ["start", "--import-realm"]
