# 002 — Administração do cardápio

> Status: proposta · Regras: RN-09 · Tela mínima: Admin do cardápio

## Contexto

Hoje só existe `GET /menu-items` (itens disponíveis). O gerente não consegue cadastrar itens, mudar preços nem tirar um item de linha pelo sistema.

## Regras

1. Apenas `manager` cria e altera itens do cardápio (`403` para os demais).
2. `name` (1–100 caracteres), `category` (1–50) e `price` (≥ 0, 2 casas) são obrigatórios na criação; inválido → `422`.
3. A categoria é **texto livre**; a API lista as categorias já usadas para o front sugerir.
4. Item nunca é apagado: sai de linha com `available = false`. Não existe `DELETE`.
5. RN-09: mudar o preço não altera `order_items.unit_price` de pedidos já lançados.
6. Toda mudança de preço é registrada em auditoria (`menu_item.price_changed`, ver spec 005) quando a 005 estiver implementada.

## Modelo de dados

Sem migration nova (`menu_items` já tem `name`, `category`, `price`, `available`).

## Contrato da API

| Rota | Papéis | Body | Resposta (`data`) |
| :-- | :-- | :-- | :-- |
| `GET /menu-items` | todos | — | itens disponíveis (inalterado) |
| `GET /menu-items?all=true` | `manager` | — | todos, com `available` |
| `GET /menu-items/categories` | todos | — | `["Bebidas", "Pratos", …]` |
| `POST /menu-items` | `manager` | `{ name, category, price, available? }` | item criado (`201`) |
| `PATCH /menu-items/:id` | `manager` | qualquer subconjunto de `{ name, category, price, available }` | item atualizado |

Item: `{ id, name, category, price, available }`. Erros: `404` item inexistente, `422` validação, `403` papel.

## Telas

**Admin do cardápio** (gerente): tabela agrupada por categoria com nome, preço e disponibilidade; formulário de criar/editar com sugestão de categorias; alternar disponível/indisponível na própria linha.

## Critérios de aceite

- [ ] Gerente cria, edita preço e desativa item; garçom recebe `403`.
- [ ] Item desativado some de `GET /menu-items` e de `POST /orders/:id/items` (`404`).
- [ ] Alterar o preço não muda o `unitPrice` de itens já lançados (teste de integração).
- [ ] `frontend/CONTRATO-API.md` e tabela "Rotas da API" do README atualizados.

## Fora de escopo

- Tabela de categorias, fotos, ordenação manual, adicionais/variações do produto.
