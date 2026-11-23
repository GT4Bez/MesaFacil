-- RN-18 (spec 014): sangria do caixa acima do limite autorizada por um gerente (ou admin).
ALTER TABLE cash_movements ADD COLUMN approved_by BIGINT REFERENCES users (id);

-- Só sangria tem autorização.
ALTER TABLE cash_movements ADD CONSTRAINT cash_movements_approval_check
    CHECK (approved_by IS NULL OR type = 'withdrawal');
