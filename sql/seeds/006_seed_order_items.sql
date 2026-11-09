-- Itens dos pedidos de exemplo. unit_price copiado do cardapio (RN-09).
-- Mesa 1: 2x Picanha na Chapa + 2x Refrigerante Lata
-- Mesa 2: 1x Frango Grelhado + 1x Suco Natural + 1x Pudim (cancelado pelo gerente, RN-05)
-- Mesa 3: 1x Batata Frita + 3x Refrigerante Lata
INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, notes, status, canceled_by, cancellation_reason)
SELECT o.id, m.id, i.quantity, m.price, i.notes, i.status,
       CASE WHEN i.status = 'canceled' THEN g.id END,
       i.cancellation_reason
FROM (VALUES
    (1, 'Picanha na Chapa', 2, 'ao ponto', 'ready', NULL),
    (1, 'Refrigerante Lata', 2, NULL, 'ready', NULL),
    (2, 'Frango Grelhado', 1, NULL, 'ready', NULL),
    (2, 'Suco Natural', 1, 'sem acucar', 'ready', NULL),
    (2, 'Pudim', 1, NULL, 'canceled', 'Cliente desistiu da sobremesa'),
    (3, 'Batata Frita', 1, NULL, 'ready', NULL),
    (3, 'Refrigerante Lata', 3, NULL, 'ready', NULL)
) AS i (table_number, item_name, quantity, notes, status, cancellation_reason)
JOIN tables t ON t.number = i.table_number
JOIN orders o ON o.table_id = t.id
JOIN menu_items m ON m.name = i.item_name
CROSS JOIN (SELECT id FROM users WHERE email = 'gerente@mesafacil.com') g;
