INSERT INTO tables (number, status)
SELECT n, 'available'
FROM generate_series(1, 10) AS n;
