# 023 — Página de apresentação da arquitetura (POO, SOLID e padrões)

> Status: proposta · Regras: nenhuma regra de negócio nova · Tela: Apresentação (nova, pública)

## Contexto

Na apresentação do projeto, a banca precisa ver **onde** o MesaFácil aplica Programação Orientada a Objetos, SOLID, KISS, YAGNI, DRY e padrões de projeto conhecidos, com o código real como prova. Hoje isso só aparece espalhado no README e nos comentários do código.

## Regras

1. **Rota pública `/apresentacao`** no app React: abre sem login, fora do menu e fora do layout autenticado. Quem está logado também consegue abrir.
2. **Conteúdo em seções:** POO, SOLID (uma entrada por letra), princípios (KISS, YAGNI, DRY) e padrões de projeto (Repository, Service Layer, Singleton, Middleware/Chain of Responsibility, Strategy/tabelas de dispatch, Adapter, Custom Hooks, Unit of Work/transação e Contract-First/Spec-Driven).
3. **Cada entrada traz:** o conceito em uma frase, onde aparece no MesaFácil, o trecho de código real com `arquivo:linha` e, quando couber, uma nota de trade-off. Nada é afirmado sem um trecho que comprove.
4. **Trechos fiéis ao código:** os trechos ficam em `frontend/src/pages/presentation/sections.js`. Um teste (Vitest) lê os arquivos do repositório e falha se algum trecho não estiver exatamente no arquivo e na linha indicados. Assim, uma refatoração que mude o código obriga a atualizar a página.
5. **Navegação:** índice no topo com links para as seções, e uma tabela-resumo "princípio → onde usamos". Responsiva até 375 px; blocos de código com rolagem horizontal própria, sem rolagem horizontal na página.
6. **Sem dados de usuários nem da equipe:** a página mostra só código e arquitetura.

## Critérios de aceite

- [ ] `/apresentacao` abre sem login e não aparece no menu.
- [ ] Cada princípio ou padrão listado na regra 2 tem pelo menos um trecho real.
- [ ] O teste de fidelidade dos trechos passa e falha se um trecho for alterado.
- [ ] Vitest da página (rota pública, índice, seções) e Cypress (abre sem login).
- [ ] Sem rolagem horizontal da página em 375 px.

## Fora de escopo

- Realce de sintaxe por biblioteca externa (os trechos usam bloco monoespaçado simples).
- Conteúdo sobre a equipe (fica num documento interno).
