-- Spec 003: momento do envio à cozinha, usado pelo KDS para ordenar a fila e medir a espera.
ALTER TABLE order_items ADD COLUMN sent_at TIMESTAMPTZ;

-- Bancos já populados: itens que já saíram de pending recebem o horário de abertura do pedido.
UPDATE order_items oi
SET sent_at = o.created_at
FROM orders o
WHERE o.id = oi.order_id AND oi.status IN ('sent', 'preparing', 'ready');

-- Item em sent, preparing ou ready sempre tem sent_at.
ALTER TABLE order_items ADD CONSTRAINT order_items_sent_at_check
    CHECK (status NOT IN ('sent', 'preparing', 'ready') OR sent_at IS NOT NULL);
