-- Pedidos ja encerrados do turno de exemplo (mesas 1, 2 e 3).
-- Como estao 'closed', as mesas continuam 'available' para a demo.
INSERT INTO orders (table_id, shift_id, user_id, status, created_at)
SELECT t.id, s.id, u.id, 'closed', s.opened_at + INTERVAL '1 hour' * t.number
FROM tables t
CROSS JOIN (SELECT id, opened_at FROM shifts ORDER BY id LIMIT 1) s
CROSS JOIN (SELECT id FROM users WHERE email = 'garcom@mesafacil.com') u
WHERE t.number IN (1, 2, 3)
ORDER BY t.number;
