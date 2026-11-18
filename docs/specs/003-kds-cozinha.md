# 003 — KDS da cozinha

> Status: proposta · Regras: RN-04, RN-06 · Tela mínima: KDS da cozinha

## Contexto

A cozinha já consegue mudar o status do item (`PATCH /order-items/:id/status`), mas não há uma fila para ver o que foi enviado, em que ordem e há quanto tempo.

## Regras

1. O KDS mostra itens `sent` e `preparing`; itens `ready` e `canceled` saem da tela.
2. A ordem é de chegada: `sent_at` ascendente (o item mais antigo primeiro), agrupado por pedido.
3. `sent_at` é preenchido no envio à cozinha (`pending → sent`), na mesma transação; nunca muda depois.
4. Acesso: `kitchen` e `manager` (`403` para os demais).
5. A tela atualiza por polling a cada 5 s; transições continuam pela rota existente (`sent → preparing → ready`).

## Modelo de dados

Migration `008_add_sent_at_to_order_items.sql`:

```sql
ALTER TABLE order_items ADD COLUMN sent_at TIMESTAMPTZ;
-- Item que já saiu de pending sempre tem sent_at (itens antigos do seed recebem o created_at do pedido).
```

Seed/backfill dos itens já enviados nos seeds existentes.

## Contrato da API

`GET /kitchen/orders` — `kitchen`, `manager`:

```json
[
  {
    "orderId": "12",
    "table": { "number": 4 },
    "items": [
      { "id": "40", "name": "Picanha na Chapa", "quantity": 2, "notes": "ao ponto", "status": "sent", "sentAt": "2026-11-18T19:02:11Z" }
    ]
  }
]
```

Pedidos ordenados pelo `sentAt` do item mais antigo. Só pedidos com ao menos um item `sent`/`preparing`.

## Telas

**KDS** (home do papel `kitchen`): cartões por mesa, com o tempo desde `sentAt` em cada item, botões "Iniciar preparo" e "Pronto", observação em destaque.

## Critérios de aceite

- [ ] Enviar à cozinha grava `sent_at` em todos os itens enviados.
- [ ] `GET /kitchen/orders` não traz itens `pending`, `ready` nem `canceled`, e respeita a ordem de chegada.
- [ ] Garçom recebe `403` na rota do KDS.
- [ ] A tela atualiza sozinha e mostra o tempo de espera.

## Fora de escopo

- WebSocket/SSE, impressão de comanda, praças de produção (bar/cozinha separados).
