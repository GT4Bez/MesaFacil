-- Fundo de troco do turno de exemplo (RN-13). Dinheiro esperado na gaveta:
-- fundo 100,00 + pagamento em dinheiro da mesa 2 (52,50) = 152,50.
INSERT INTO cash_movements (shift_id, user_id, type, amount, created_at)
SELECT s.id, s.opened_by, 'opening_float', 100.00, s.opened_at
FROM shifts s
WHERE s.status = 'closed';
