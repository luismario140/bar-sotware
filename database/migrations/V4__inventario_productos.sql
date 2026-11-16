ALTER TABLE product ADD COLUMN quantity_sold INTEGER NOT NULL DEFAULT 0
    CHECK (quantity_sold >= 0 AND quantity_sold <= 9007199254740991);
ALTER TABLE product ADD COLUMN quantity_remaining INTEGER NOT NULL DEFAULT 0
    CHECK (quantity_remaining >= 0 AND quantity_remaining <= 9007199254740991);
