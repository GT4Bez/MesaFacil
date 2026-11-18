# 006 — Taxa de serviço persistida e troco

> Status: proposta · Regras: RN-07, RN-08, **RN-11 (nova)**

## Contexto

Hoje a taxa de serviço é só um parâmetro de consulta (`GET /orders/:id/bill?serviceTax=true`) e o fechamento (RN-07) ignora a taxa. Assim não se sabe se o cliente pagou a taxa, e o relatório do turno fica ambíguo. Também não há troco: um pagamento em dinheiro acima do saldo é aceito sem registro do que voltou ao cliente.

## Regras

**Taxa de serviço (RN-08 persistida)**

1. `orders.service_tax` (padrão `false`) é a única fonte de verdade da taxa; conta, saldo e fechamento usam esse valor.
2. Só `cashier` e `manager` alteram a taxa, e só com o pedido ativo (`409` se encerrado/cancelado).
3. Desligar a taxa quando o valor já pago ficaria maior que o novo total → `409`.

**Troco (RN-11)**

4. `payments.amount` é o valor **recebido**; `payments.change_amount` é o troco; o valor efetivo é `amount − change_amount`.
5. Saldo restante = total (com taxa, se ligada) − Σ valores efetivos.
6. Dinheiro acima do saldo: o backend calcula `change_amount = amount − saldo`. Cartão/Pix acima do saldo → `422`.
7. Pagamento em pedido já quitado (saldo ≤ 0) → `409`.
8. O frontend não envia troco: ele vem calculado na resposta.

## Modelo de dados

`011_add_service_tax_and_change.sql`:

```sql
ALTER TABLE orders ADD COLUMN service_tax BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE payments
  ADD COLUMN change_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  ADD CONSTRAINT payments_change_amount_check CHECK (change_amount >= 0 AND change_amount < amount),
  ADD CONSTRAINT payments_change_only_cash_check CHECK (payment_method = 'cash' OR change_amount = 0);
```

## Contrato da API

- `PATCH /orders/:id/service-tax` — `cashier`, `manager` — body `{ "enabled": true }` → conta atualizada.
- `GET /orders/:id/bill` — sem query param; resposta ganha `serviceTax: boolean`, e cada pagamento traz `{ id, amount, changeAmount, method, createdAt }`.
- `POST /orders/:id/payments` — body `{ amount, method }`; resposta `{ id, amount, changeAmount, remainingBalance }`.

Exemplo: saldo 73,50, `{ "amount": 100, "method": "cash" }` → `changeAmount: 26.5`, `remainingBalance: 0`.

## Telas

Caixa: chave "Taxa de serviço (10%)" que chama a rota nova; após pagamento em dinheiro, destaque "Troco: R$ 26,50"; histórico de pagamentos mostra recebido e troco.

## Critérios de aceite

- [ ] Fechar pedido com taxa ligada exige que o total com taxa esteja pago (`409` caso contrário).
- [ ] Dinheiro acima do saldo grava o troco; cartão/Pix acima do saldo → `422`.
- [ ] Desligar a taxa com pagamento maior que o novo total → `409`.
- [ ] `frontend/CONTRATO-API.md` atualizado (o `?serviceTax=` deixa de existir).
- [ ] `docs/ESPECIFICACAO.md`: RN-11 na nova seção 3.3 "Evoluções da squad" e linha na matriz de validação (§4).

## Fora de escopo

- Gorjeta separada da taxa, divisão automática de conta por pessoa.
