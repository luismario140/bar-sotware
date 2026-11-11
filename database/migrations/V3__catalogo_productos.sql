CREATE TABLE product (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
    category TEXT NOT NULL DEFAULT '' CHECK (length(category) <= 60),
    active INTEGER NOT NULL CHECK (active IN (0, 1)),
    image_id TEXT,
    version INTEGER NOT NULL CHECK (version > 0),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE INDEX idx_product_name ON product(name);
CREATE INDEX idx_product_category ON product(category);

CREATE TABLE sale_presentation (
    id TEXT PRIMARY KEY NOT NULL,
    product_id TEXT NOT NULL REFERENCES product(id) ON DELETE RESTRICT,
    kind TEXT NOT NULL CHECK (kind IN ('UNIT', 'SHOT')),
    price_minor INTEGER NOT NULL CHECK (price_minor BETWEEN 0 AND 9007199254740991),
    currency TEXT NOT NULL CHECK (currency = 'COP'),
    active INTEGER NOT NULL CHECK (active IN (0, 1)),
    UNIQUE (product_id, kind)
);

CREATE TABLE product_operation (
    id TEXT PRIMARY KEY NOT NULL,
    product_id TEXT NOT NULL REFERENCES product(id) ON DELETE RESTRICT,
    administrator_id INTEGER NOT NULL REFERENCES administrator(id) ON DELETE RESTRICT,
    action TEXT NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'STATUS')),
    request_hash TEXT NOT NULL,
    before_json TEXT,
    result_json TEXT NOT NULL,
    occurred_at INTEGER NOT NULL
);
CREATE INDEX idx_product_operation_product ON product_operation(product_id, occurred_at);

CREATE TRIGGER product_no_delete BEFORE DELETE ON product
BEGIN SELECT RAISE(ABORT, 'Los productos se desactivan, no se eliminan'); END;
CREATE TRIGGER presentation_no_delete BEFORE DELETE ON sale_presentation
BEGIN SELECT RAISE(ABORT, 'Las presentaciones se desactivan, no se eliminan'); END;
CREATE TRIGGER product_operation_no_update BEFORE UPDATE ON product_operation
BEGIN SELECT RAISE(ABORT, 'La auditoria no se modifica'); END;
CREATE TRIGGER product_operation_no_delete BEFORE DELETE ON product_operation
BEGIN SELECT RAISE(ABORT, 'La auditoria no se elimina'); END;
