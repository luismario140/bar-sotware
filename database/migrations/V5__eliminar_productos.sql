CREATE TABLE product_deletion (
    operation_id TEXT PRIMARY KEY NOT NULL,
    product_id TEXT NOT NULL UNIQUE REFERENCES product(id) ON DELETE RESTRICT,
    administrator_id INTEGER NOT NULL REFERENCES administrator(id) ON DELETE RESTRICT,
    request_hash TEXT NOT NULL,
    result_json TEXT NOT NULL,
    occurred_at INTEGER NOT NULL
);

CREATE TRIGGER product_deletion_no_update BEFORE UPDATE ON product_deletion
BEGIN SELECT RAISE(ABORT, 'El historial de eliminacion no se modifica'); END;
CREATE TRIGGER product_deletion_no_delete BEFORE DELETE ON product_deletion
BEGIN SELECT RAISE(ABORT, 'El historial de eliminacion no se elimina'); END;
