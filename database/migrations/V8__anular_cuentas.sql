CREATE TABLE account_cancellation (
    operation_id TEXT PRIMARY KEY NOT NULL,
    account_id TEXT NOT NULL UNIQUE REFERENCES customer_account(id) ON DELETE RESTRICT,
    administrator_id INTEGER NOT NULL REFERENCES administrator(id) ON DELETE RESTRICT,
    request_hash TEXT NOT NULL,
    result_json TEXT NOT NULL,
    occurred_at INTEGER NOT NULL
);
CREATE TRIGGER account_cancellation_no_update BEFORE UPDATE ON account_cancellation
BEGIN SELECT RAISE(ABORT, 'Las anulaciones no se modifican'); END;
CREATE TRIGGER account_cancellation_no_delete BEFORE DELETE ON account_cancellation
BEGIN SELECT RAISE(ABORT, 'Las anulaciones no se eliminan'); END;
