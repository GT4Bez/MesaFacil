-- RN-15 (spec 009): insumos e fichas técnicas de demonstração.
-- Refrigerante Lata e Petit Gâteau ficam sem ficha, para mostrar a cobertura do CMV.
INSERT INTO ingredients (name, unit, stock_quantity, min_stock, unit_cost)
VALUES
    ('Picanha', 'kg', 12.000, 3.000, 69.90),
    ('Peito de frango', 'kg', 10.000, 2.000, 18.50),
    ('Batata', 'kg', 25.000, 5.000, 6.20),
    ('Filé de tilápia', 'kg', 6.000, 2.000, 39.00),
    ('Óleo de soja', 'l', 18.000, 4.000, 8.40),
    ('Arroz', 'kg', 20.000, 5.000, 5.80),
    ('Laranja', 'kg', 15.000, 4.000, 4.50),
    ('Leite condensado', 'un', 2.000, 6.000, 7.90),
    ('Ovo', 'un', 60.000, 24.000, 0.80),
    ('Açúcar', 'kg', 8.000, 2.000, 4.20);

INSERT INTO menu_item_recipes (menu_item_id, ingredient_id, quantity)
SELECT m.id, i.id, r.quantity
FROM (VALUES
    ('Picanha na Chapa', 'Picanha', 0.400),
    ('Picanha na Chapa', 'Arroz', 0.150),
    ('Picanha na Chapa', 'Batata', 0.200),
    ('Frango Grelhado', 'Peito de frango', 0.300),
    ('Frango Grelhado', 'Arroz', 0.150),
    ('Batata Frita', 'Batata', 0.400),
    ('Batata Frita', 'Óleo de soja', 0.050),
    ('Isca de Peixe', 'Filé de tilápia', 0.300),
    ('Isca de Peixe', 'Óleo de soja', 0.050),
    ('Suco Natural', 'Laranja', 0.500),
    ('Suco Natural', 'Açúcar', 0.020),
    ('Pudim', 'Leite condensado', 0.125),
    ('Pudim', 'Ovo', 0.500),
    ('Pudim', 'Açúcar', 0.020)
) AS r(item, ingredient, quantity)
JOIN menu_items m ON m.name = r.item
JOIN ingredients i ON i.name = r.ingredient;
