ALTER TABLE administrator ADD COLUMN recovery_email TEXT;

CREATE TABLE administrator_recovery (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    code_hash TEXT,
    email TEXT,
    credential_version INTEGER,
    expires_at INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    next_request_at INTEGER NOT NULL DEFAULT 0,
    window_start INTEGER NOT NULL DEFAULT 0,
    requests INTEGER NOT NULL DEFAULT 0
);
INSERT INTO administrator_recovery (id) VALUES (1);
