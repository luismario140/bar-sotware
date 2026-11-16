ALTER TABLE product ADD COLUMN package_kind TEXT CHECK (package_kind IN ('MEDIA', 'BOTELLA', 'LITRO'));
ALTER TABLE product ADD COLUMN volume_ml INTEGER CHECK (volume_ml BETWEEN 1 AND 10000);

CREATE TABLE inventory_sale (
    operation_id TEXT PRIMARY KEY NOT NULL,
    administrator_id INTEGER NOT NULL REFERENCES administrator(id) ON DELETE RESTRICT,
    request_hash TEXT NOT NULL,
    total_minor INTEGER NOT NULL CHECK (total_minor BETWEEN 0 AND 9007199254740991),
    result_json TEXT NOT NULL,
    occurred_at INTEGER NOT NULL
);
CREATE TABLE inventory_movement (
    id TEXT PRIMARY KEY NOT NULL,
    operation_id TEXT NOT NULL,
    product_id TEXT NOT NULL REFERENCES product(id) ON DELETE RESTRICT,
    sale_id TEXT REFERENCES inventory_sale(operation_id) ON DELETE RESTRICT,
    administrator_id INTEGER NOT NULL REFERENCES administrator(id) ON DELETE RESTRICT,
    kind TEXT NOT NULL CHECK (kind IN ('RESTOCK', 'SALE')),
    quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 9007199254740991),
    request_hash TEXT NOT NULL,
    before_json TEXT NOT NULL,
    result_json TEXT NOT NULL,
    occurred_at INTEGER NOT NULL,
    UNIQUE (operation_id, product_id),
    CHECK ((kind = 'SALE' AND sale_id = operation_id) OR (kind = 'RESTOCK' AND sale_id IS NULL))
);
CREATE INDEX idx_inventory_movement_product ON inventory_movement(product_id, occurred_at);
CREATE TRIGGER inventory_sale_no_update BEFORE UPDATE ON inventory_sale
BEGIN SELECT RAISE(ABORT, 'Las ventas completadas no se modifican'); END;
CREATE TRIGGER inventory_sale_no_delete BEFORE DELETE ON inventory_sale
BEGIN SELECT RAISE(ABORT, 'Las ventas completadas no se eliminan'); END;
CREATE TRIGGER inventory_movement_no_update BEFORE UPDATE ON inventory_movement
BEGIN SELECT RAISE(ABORT, 'Los movimientos no se modifican'); END;
CREATE TRIGGER inventory_movement_no_delete BEFORE DELETE ON inventory_movement
BEGIN SELECT RAISE(ABORT, 'Los movimientos no se eliminan'); END;
