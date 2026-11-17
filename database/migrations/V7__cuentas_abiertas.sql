CREATE TABLE customer_account (
    id TEXT PRIMARY KEY NOT NULL,
    version INTEGER NOT NULL CHECK (version > 0),
    status TEXT NOT NULL CHECK (status IN ('OPEN', 'CLOSED')),
    result_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    closed_sale_id TEXT REFERENCES inventory_sale(operation_id) ON DELETE RESTRICT
);
CREATE TABLE account_operation (
    operation_id TEXT PRIMARY KEY NOT NULL,
    account_id TEXT NOT NULL REFERENCES customer_account(id) ON DELETE RESTRICT,
    administrator_id INTEGER NOT NULL REFERENCES administrator(id) ON DELETE RESTRICT,
    request_hash TEXT NOT NULL,
    result_json TEXT NOT NULL,
    occurred_at INTEGER NOT NULL
);
CREATE TRIGGER account_operation_no_update BEFORE UPDATE ON account_operation
BEGIN SELECT RAISE(ABORT, 'Las operaciones de cuenta no se modifican'); END;
CREATE TRIGGER account_operation_no_delete BEFORE DELETE ON account_operation
BEGIN SELECT RAISE(ABORT, 'Las operaciones de cuenta no se eliminan'); END;
