-- Pagamentos que quitam os pedidos de exemplo (RN-07), com e sem os 10% (RN-08).
-- Mesa 1: subtotal 193,80 + 10% = 213,18 (pix + cartao)
-- Mesa 2: subtotal 52,50 sem taxa (pudim cancelado fica fora)  (dinheiro)
-- Mesa 3: subtotal 49,00 + 10% = 53,90 (cartao)
-- Total do turno (RN-10): 319,58
INSERT INTO payments (order_id, amount, payment_method, created_at)
SELECT o.id, p.amount, p.payment_method, o.created_at + INTERVAL '50 minutes'
FROM (VALUES
    (1, 100.00, 'pix'),
    (1, 113.18, 'card'),
    (2, 52.50, 'cash'),
    (3, 53.90, 'card')
) AS p (table_number, amount, payment_method)
JOIN tables t ON t.number = p.table_number
JOIN orders o ON o.table_id = t.id;
