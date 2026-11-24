# 024 — Apresentação por tópicos, com equipe e processo

> Status: proposta · Regras: nenhuma regra de negócio nova · Tela: Apresentação (`/apresentacao`, pública)

## Contexto

A spec 023 criou a página `/apresentacao` com POO, SOLID, KISS, YAGNI, DRY e padrões de projeto numa única página longa, e deixou o conteúdo sobre a equipe fora de escopo. Na apresentação, a banca também precisa ver quem fez o quê e como a equipe trabalhou. Com a equipe e o processo, a página longa fica difícil de navegar.

## Regras

1. **Tópicos separados:** a página passa a ter uma barra de tópicos, e só o tópico escolhido aparece na tela:
   - Visão geral: o que é o sistema, stack, números do projeto e a tabela-resumo "princípio → onde usamos";
   - Equipe;
   - Como trabalhamos;
   - POO;
   - SOLID;
   - KISS, YAGNI e DRY;
   - Padrões de projeto.
2. **Endereço por tópico:** cada tópico tem âncora própria (`/apresentacao#equipe`, `/apresentacao#solid`), que pode ser compartilhada e funciona com voltar/avançar do navegador. Um link para uma entrada (`#solid/d`) abre o tópico e rola até ela. Sem âncora, abre a Visão geral.
3. **Equipe:** um cartão por integrante com nome, GitHub, papel, principais entregas e números (PRs, commits, issues), a partir do relatório interno de participação. O frontend base do Kauan aparece com a autoria dele, com a observação de que foi publicado pela conta do Rodolfo. Uma nota explica como a participação foi medida (fontes, o que os números medem e o que fica fora).
4. **Como trabalhamos:** Contract-First, divisão por domínio, Spec-Driven Development, revisão e QA com CI, e gestão no GitHub Issues.
5. **Sem dados pessoais além do que já é público no README:** nome e usuário do GitHub; nada de e-mails.
6. As regras da spec 023 sobre os trechos de código (fidelidade testada, `arquivo:linha`, notas de trade-off) continuam valendo. A regra 6 da 023 ("sem dados da equipe") é substituída pela regra 3 desta spec.

## Telas

- Barra de tópicos fixa no topo, com o tópico atual destacado (`aria-current`). No celular, os botões quebram em linhas, sem rolagem horizontal.
- Os tópicos de arquitetura ganham uma frase de introdução.
- Botões "anterior" e "próximo" no fim de cada tópico, para conduzir a apresentação em sequência.

## Critérios de aceite

- [ ] `/apresentacao` abre na Visão geral; `#equipe`, `#processo` e os tópicos de arquitetura abrem direto.
- [ ] Trocar de tópico atualiza a âncora, e voltar no navegador retorna ao tópico anterior.
- [ ] A tabela-resumo leva à entrada no tópico certo.
- [ ] Os cinco integrantes aparecem com papel, entregas e números, e há a nota de medição.
- [ ] O teste de fidelidade dos trechos continua passando.
- [ ] Vitest (tópicos, âncoras, equipe) e Cypress (sem login e sem rolagem horizontal em 375 px).

## Fora de escopo

- Gráficos de participação: os números ficam em texto.
- Modo de slides em tela cheia.
