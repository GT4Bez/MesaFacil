-- Turno de exemplo ja encerrado (historico). Fica fechado para que a demo
-- possa abrir um turno novo com POST /shifts sem esbarrar no 409.
INSERT INTO shifts (opened_by, opened_at, closed_at, status)
SELECT id, CURRENT_TIMESTAMP - INTERVAL '1 day 8 hours', CURRENT_TIMESTAMP - INTERVAL '1 day', 'closed'
FROM users
WHERE email = 'gerente@mesafacil.com';
