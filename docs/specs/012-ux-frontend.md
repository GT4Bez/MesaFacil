# 012 — Revisão de UX do frontend

> Status: proposta · Regras: usabilidade e acessibilidade (frontend) · Sem mudança de API

## Contexto

Avaliação de usabilidade, hierarquia visual, consistência e acessibilidade das telas. O visual é limpo e coerente, mas o **fluxo** tem atritos: formulários surgem longe da ação que os abriu, e textos e alvos de toque são pequenos para o uso no salão (tablet e celular).

O caso mais visível é a comanda: ao tocar no "+" (30 px) de um item do cardápio, o formulário de quantidade e observação aparece **no fim do painel**, muitas vezes fora da tela.

## Achados

| # | Achado | Gravidade |
| :-- | :-- | :-- |
| 1 | Comanda: o formulário de item aparece no fim do cardápio, e só o "+" de 30 px é clicável | alta |
| 2 | Admin do cardápio e Usuários: "Editar" preenche um formulário em outro painel, que no celular fica abaixo da lista inteira | alta |
| 3 | 25 regras de texto com 9–11 px (rótulos, chips, textos de apoio) | média |
| 4 | Contraste: texto de apoio `#999` sobre branco ≈ 2,8:1 (mínimo WCAG AA é 4,5:1) | média |
| 5 | Alvos de toque menores que 44 px ("+", "×", chips de categoria) | média |
| 6 | Celular: navegação só com ícones Unicode, sem rótulo nem `aria-label`; a topbar ocupa altura | média |
| 7 | Quantidade do item pendente só salva ao sair do campo (`blur`), sem feedback | média |
| 8 | Nenhum aviso de "item adicionado" | baixa |
| 9 | 59 cores literais em `styles.css`, sem tokens; vermelhos quase iguais | baixa |
| 10 | KDS: itens e observações em 12 px, lidos a distância | baixa |

## Regras

1. Ações que pedem dados (adicionar item, novo/editar item do cardápio, novo/editar usuário, redefinir senha, motivo de cancelamento) abrem um **modal** sobre a tela, com o fundo escurecido e **desfocado**. Esc, o botão × e o clique fora fecham, exceto durante o envio. No celular (≤ 650 px), o modal vira um painel que sobe da base da tela.
2. Adicionar item: o card inteiro do cardápio abre o modal, que tem seletor de quantidade −/+, observação e o botão "Adicionar à comanda · R$ total". O total é só exibição; o preço continua congelado pelo backend (RN-09). O erro da API aparece no próprio modal. Com sucesso, o modal fecha e um aviso curto confirma ("2× Picanha adicionado à comanda").
3. A quantidade de item pendente usa o mesmo seletor −/+, que salva a cada toque (RN-04 inalterada).
4. Texto com no mínimo 12 px; texto de apoio com contraste ≥ 4,5:1.
5. Alvos de toque com no mínimo 44 × 44 px.
6. Celular (≤ 650 px): navegação numa barra inferior fixa com ícone **e** rótulo, `aria-label` e `aria-current`. A barra tem **no máximo 5 posições**: com mais telas (gerente e admin), as 4 primeiras ficam na barra e o resto vai para **"Mais"**, que abre a lista no painel do modal e fica marcado quando a tela atual está nele. Assim a barra cabe sem rolagem até em 320 px.
7. Cores, raios, sombras e tamanhos de fonte vêm de variáveis CSS em `:root` (tokens).
8. KDS legível a distância: item com 16 px e observação em destaque.

## Contrato da API

Sem mudanças.

## Telas

Componentes novos em `frontend/src/components/`: `Modal` (base sobre `<dialog>`), `QuantityStepper` e `Toast`. `ReasonModal` passa a usar o `Modal`. Mudam Comanda, Admin do cardápio, Usuários, Cozinha (KDS), o `Layout` e o `styles.css`.

## Critérios de aceite

- [ ] Comanda: tocar no card do item abre o modal com o fundo desfocado; −/+ atualiza o total; o erro aparece no modal; com sucesso aparece o aviso.
- [ ] Admin do cardápio e Usuários: novo/editar/redefinir senha em modal; a lista ocupa a largura toda.
- [ ] Nenhuma regra CSS com fonte < 12 px; texto de apoio com contraste ≥ 4,5:1.
- [ ] Botões de ícone e chips com ≥ 44 px.
- [ ] Celular (375 px): barra inferior com rótulos, sem rolagem horizontal em nenhuma tela, nem dentro da própria barra ("Mais" para gerente e admin).
- [ ] Testes de tela (Vitest) para `Modal`, `QuantityStepper` e o fluxo de adicionar item; Cypress atualizado (incluindo um cenário a 375 px).

## Fora de escopo

- Tema escuro, troca de fontes ou de identidade visual.
- Fotos dos itens do cardápio.
