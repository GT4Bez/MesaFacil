# 004 — Navegação por papel

> Status: proposta · Regras: controle de acesso por papel (frontend)

## Contexto

O `Layout` mostra os mesmos links para todos e o `App.jsx` não protege rotas por papel. Com KDS e telas de administração chegando, cada papel precisa ver só o que usa.

## Regras

1. Cada papel tem uma home e um menu próprios:

| Papel | Home | Menu |
| :-- | :-- | :-- |
| `waiter` | `/tables` | Salão e mesas |
| `kitchen` | `/kitchen` | KDS |
| `cashier` | `/cashier` | Caixa · Salão e mesas |
| `manager` | `/tables` | todos + Admin do cardápio, Admin do turno, Insumos |

2. Rota fora do papel redireciona para a home do papel (o backend continua sendo a barreira real com `403`).
3. A matriz fica num único lugar (`frontend/src/utils/access.js`) e é usada pelo menu e pelas rotas.

## Contrato da API

Sem mudanças.

## Telas

`Layout.jsx` monta o menu a partir da matriz; `App.jsx` usa um `<RoleRoute roles={[…]}>`. Telas das specs 002, 003, 007–010 entram na matriz quando forem criadas.

## Critérios de aceite

- [ ] Cozinha cai no KDS ao logar e não vê Caixa.
- [ ] Garçom digitando `/cashier` volta para `/tables`.
- [ ] Gerente vê todas as entradas.

## Fora de escopo

- Permissões configuráveis por usuário.
