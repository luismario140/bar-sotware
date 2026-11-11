-- Solo metadatos técnicos. No crea usuarios, credenciales ni entidades del POS.
CREATE TABLE app_metadata (
    metadata_key TEXT PRIMARY KEY NOT NULL,
    metadata_value TEXT NOT NULL
);

INSERT INTO app_metadata (metadata_key, metadata_value)
VALUES ('application', 'AppBarPOS');
