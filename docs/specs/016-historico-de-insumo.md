# 016 — Histórico de movimentos do insumo

> Status: proposta · Regras: RN-15 (extensão) · Tela: Insumos

## Contexto

A spec 009 (RN-15) grava cada entrada, ajuste e baixa por venda em `stock_movements`, mas a tela Insumos mostra só o saldo atual. Quando o estoque de um insumo parece errado, o gerente não tem como ver de onde veio a diferença, por exemplo:
- uma entrada lançada em dobro;
- um ajuste sem explicação;
- uma ficha técnica que baixa demais.

Os dados já existem. Esta spec só cria a consulta e a tela, sem mudar a baixa nem as regras do estoque.

## Regras

1. **Rota e acesso:** `GET /ingredients/:id/movements` (gerente; o admin passa pelo `hasRole`, RN-16).
   - O insumo vem no mesmo formato de `GET /ingredients`.
   - Outros papéis → `403`; sem token → `401`; insumo inexistente → `404`.
   - Insumo inativo também tem histórico.
2. **Ordem:** do mais recente para o mais antigo, por `id` decrescente.
3. **Paginação por cursor:** `limit` (padrão 50, de 1 a 100) e `before` (id do último movimento recebido).
   - Valores inválidos → `422`.
   - A resposta traz `nextBefore`, que é `null` quando não há mais páginas.
4. **Filtro opcional:** `type` = `purchase`, `adjustment` ou `sale`. Outro valor → `422`.
5. **Cada movimento traz:**
   - tipo, quantidade (positiva na entrada, negativa na baixa e com qualquer sinal no ajuste) e custo unitário congelado;
   - data, nome de quem lançou e motivo;
   - **saldo depois do movimento**.
6. **Saldo depois do movimento:** é a soma acumulada das quantidades até aquele movimento, **sempre sobre todos os tipos**, mesmo com o filtro aplicado.
   - É calculado no SQL, com `SUM(quantity) OVER (ORDER BY id)` filtrado pelo insumo.
   - O saldo do movimento mais recente bate com o `stock_quantity` do insumo, porque toda alteração de estoque passa por um movimento (spec 009 e seed com o estoque inicial). Se não bater, a resposta traz `consistent: false`, e a tela mostra um aviso para o gerente.
7. **Baixa por venda:** mostra a origem, com o número do pedido, a mesa, o item do cardápio e a quantidade vendida. O turno vem de `shift_id`.

## Modelo de dados

Sem migration. Usa o índice `stock_movements_ingredient_idx`, já existente.

## Contrato da API

`GET /ingredients/:id/movements?limit=50&before=120&type=sale`

```json
{
  "ingredient": { "id": "3", "name": "Picanha", "unit": "kg", "stockQuantity": 4.85, "minStock": 2, "unitCost": 79.9, "active": true, "belowMin": false },
  "consistent": true,
  "movements": [
    { "id": "131", "type": "sale", "quantity": -0.3, "unitCost": 79.9, "balanceAfter": 4.85,
      "createdAt": "...", "by": "Garçom", "reason": null, "shiftId": "7",
      "sale": { "orderId": "42", "tableNumber": 5, "menuItem": "Picanha na chapa", "itemQuantity": 2 } },
    { "id": "118", "type": "purchase", "quantity": 5, "unitCost": 79.9, "balanceAfter": 5.15,
      "createdAt": "...", "by": "Gerente", "reason": null, "shiftId": "7", "sale": null }
  ],
  "nextBefore": "118"
}
```

## Telas

- **Insumos:** o cartão de cada insumo ganha o botão "Histórico", que abre um `Modal` (spec 012). O modal tem:
  - cabeçalho com nome, unidade e saldo atual;
  - filtros "Todos", "Entradas", "Ajustes" e "Vendas" (botões de 44 px, com `aria-pressed`);
  - uma lista com data, tipo, quantidade (entrada em verde e baixa em vermelho), saldo depois do movimento, quem lançou e o motivo, ou "Pedido 42 · Mesa 5 · 2× Picanha na chapa" nas vendas;
  - o botão "Carregar mais" quando `nextBefore` não é nulo;
  - o aviso "O saldo atual não bate com a soma dos movimentos", quando `consistent` é `false`.
- No celular, o modal vira o painel inferior (spec 012), e cada movimento vira um cartão em vez de uma linha de tabela.

## Critérios de aceite

- [ ] **Ordem e saldo:** entrada, ajuste negativo e duas vendas aparecem do mais recente para o mais antigo, com o saldo depois de cada movimento correto e o último igual ao `stockQuantity`.
- [ ] **Filtro:** `type=sale` mostra só as vendas, e o saldo continua considerando todos os tipos.
- [ ] **Paginação:** `limit=2` com `before` percorre todos os movimentos sem repetir nem pular, e a última página tem `nextBefore: null`.
- [ ] **Erros:**
  - `limit`, `before` ou `type` inválidos → `422`;
  - insumo inexistente → `404`;
  - garçom, caixa e cozinha → `403`.
- [ ] **Venda:** a baixa traz pedido, mesa, item e quantidade vendida.
- [ ] **Divergência:** se o `stock_quantity` for alterado direto no banco (no teste), a resposta traz `consistent: false`.
- [ ] **Testes:** integração no backend, Vitest (o modal abre, o filtro troca a lista e "Carregar mais" acrescenta) e Cypress (o histórico da Picanha mostra a venda feita no cenário RN-15).
- [ ] **Documentação:**
  - `frontend/CONTRATO-API.md`;
  - `docs/ESPECIFICACAO.md` (RN-15 na matriz §4, com a menção ao histórico);
  - a spec 009 aponta para esta spec.

## Fora de escopo

- Exportar para CSV, filtrar por período ou por turno e mostrar gráficos.
- Corrigir divergências automaticamente (o gerente usa o ajuste, que já existe).
- Histórico consolidado de todos os insumos numa só tela.
