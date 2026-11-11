CREATE TABLE administrator (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    username TEXT NOT NULL UNIQUE CHECK (length(username) BETWEEN 1 AND 60),
    pin_hash TEXT NOT NULL,
    credential_version INTEGER NOT NULL DEFAULT 1 CHECK (credential_version > 0),
    failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
    locked_until INTEGER NOT NULL DEFAULT 0 CHECK (locked_until >= 0),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE administrator_audit (
    id TEXT PRIMARY KEY NOT NULL,
    administrator_id INTEGER NOT NULL REFERENCES administrator(id) ON DELETE RESTRICT,
    action TEXT NOT NULL CHECK (action IN ('SETUP', 'LOGIN_SUCCEEDED', 'LOGIN_FAILED', 'CREDENTIALS_CHANGED', 'LOGOUT')),
    occurred_at INTEGER NOT NULL,
    previous_username TEXT,
    new_username TEXT
);

CREATE INDEX idx_administrator_audit_time ON administrator_audit(occurred_at);

CREATE TRIGGER administrator_no_delete BEFORE DELETE ON administrator
BEGIN
    SELECT RAISE(ABORT, 'La identidad administrativa no se elimina');
END;

CREATE TRIGGER administrator_audit_no_update BEFORE UPDATE ON administrator_audit
BEGIN
    SELECT RAISE(ABORT, 'La auditoria no se modifica');
END;

CREATE TRIGGER administrator_audit_no_delete BEFORE DELETE ON administrator_audit
BEGIN
    SELECT RAISE(ABORT, 'La auditoria no se elimina');
END;
