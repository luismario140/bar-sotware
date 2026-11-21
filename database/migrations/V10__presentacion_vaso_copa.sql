ALTER TABLE product ADD COLUMN serving_kind TEXT CHECK (serving_kind IN ('VASO', 'COPA'));
