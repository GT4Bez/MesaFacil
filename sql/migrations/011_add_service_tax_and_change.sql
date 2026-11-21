ALTER TABLE orders ADD COLUMN service_tax BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE payments
  ADD COLUMN change_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  ADD CONSTRAINT payments_change_amount_check CHECK (change_amount >= 0 AND change_amount < amount),
  ADD CONSTRAINT payments_change_only_cash_check CHECK (payment_method = 'cash' OR change_amount = 0);
