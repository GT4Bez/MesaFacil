# Especificações (SDD — Spec-Driven Development)

Toda funcionalidade nova nasce de uma spec nesta pasta. A spec é o contrato entre banco, backend e frontend: quem implementa segue a spec, e mudança de contrato muda a spec no mesmo PR.

## Fluxo

1. **Spec** — escrita em `docs/specs/NNN-nome.md` e revisada num PR `docs(spec): NNN …` antes de qualquer código.
2. **Issues** — depois do merge da spec, abrir issues separadas `[BACKEND]`/`[BD/BACKEND]` e `[FRONTEND]`, cada uma com o link da spec e os critérios de aceite dela.
3. **Branch** — `feat/<nº-issue>-<slug>` (ou `chore/`, `fix/`), saindo da `main` atualizada.
4. **PR** — Conventional Commits em PT-BR, template do repositório (*O que foi feito / Por que foi feito*), `Closes #N`, testes passando no CI e ≥ 1 review antes do merge.

## Índice

| Nº | Spec | Fase | Depende de |
| :-- | :-- | :-- | :-- |
| 001 | [Testes de integração e CI](001-testes-integracao-e-ci.md) | MVP | — |
| 002 | [Administração do cardápio](002-cardapio-admin.md) | MVP | 001 |
| 003 | [KDS da cozinha](003-kds-cozinha.md) | MVP | 001 |
| 004 | [Navegação por papel](004-navegacao-por-papel.md) | MVP | — |
| 005 | [Auditoria e cancelamento de pedido](005-auditoria-e-cancelamento-de-pedido.md) | MVP | 001 |
| 010 | [Relatório do turno (v1)](010-relatorio-do-turno.md) | MVP | 001 |
| 006 | [Taxa de serviço persistida e troco](006-taxa-de-servico-e-troco.md) | Fase 2 | 005 |
| 007 | [Movimentos de caixa](007-movimentos-de-caixa.md) | Fase 2 | 005, 006 |
| 008 | [Fechamento com conferência cega](008-conferencia-cega.md) | Fase 2 | 007 |
| 009 | [Insumos e ficha técnica](009-insumos-e-ficha-tecnica.md) | Fase 2 | 002, 005 |
| 011 | [Administração de usuários e superadmin](011-usuarios-e-superadmin.md) | Fase 2 | 004, 005 |
| 012 | [Revisão de UX do frontend](012-ux-frontend.md) | Fase 2 | 004 |
| 013 | [Cancelamento de item no caixa com autorização do gerente](013-cancelamento-autorizado-no-caixa.md) | Fase 2 | 005, 006, 012 |

**MVP** fecha as regras obrigatórias RN-01 a RN-10 e as telas mínimas. **Fase 2** (pós-MVP) só é retomada depois do MVP entregue e com acordo da equipe; as regras novas são numeradas na ordem de implementação (RN-11 é a da spec 005).

Os números de migration (`sql/migrations/NNN_*.sql`) e de seed (`sql/seeds/NNN_*.sql`) citados nas specs são exemplos: na implementação usa-se o próximo número livre na `main`.

## Template

```markdown
# NNN — Título

> Status: proposta | aprovada | implementada · Regras: RN-xx

## Contexto
Por que existe e qual problema resolve.

## Regras
Numeradas, testáveis. Cada uma diz o código HTTP quando é violada.

## Modelo de dados
Migrations novas (`sql/migrations/NNN_*.sql`) e seeds, com constraints.

## Contrato da API
Rota, papéis, body, resposta (`data` do envelope `{ success, data | error }`) e erros.

## Telas
O que muda no frontend.

## Critérios de aceite
Checklist que vira o DoD das issues.

## Fora de escopo
O que conscientemente não será feito.
```
