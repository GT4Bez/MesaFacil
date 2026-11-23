# 021 — Mensagens de erro informativas

> Status: proposta · Regras: todas (envelope de erro da API) · Telas: todas

## Contexto

As mensagens de erro chegam ao usuário exatamente como a API as devolve (`{ success: false, error, code }`), e o frontend só as exibe. Boa parte já é específica, mas um grupo continua genérico:
- **não diz o estado atual nem o próximo passo:** "Transição de status do pedido inválida.", "Não é possível adicionar itens a este pedido.", "Não é possível registrar pagamento neste pedido.", "Ainda há itens em preparo na cozinha.", "O pedido ainda possui saldo em aberto.", "Não há turno aberto.";
- **não diz quem pode fazer a ação:** "Você não possui permissão para esta ação." e "Você não possui permissão para alterar para este status.";
- **não diz o formato esperado:** "Quantidade inválida.", "Preço inválido.", "Valor do pagamento inválido.", "Forma de pagamento inválida.", "Papel inválido.", "E-mail inválido.", "Custo unitário inválido.", entre outras;
- **termos técnicos:** "Token inválido ou expirado.", "from deve ser anterior a to.", "limit deve ser um inteiro de 1 a 100.", "shiftId deve ser um id numérico.", "category inválida: use ...";
- **fallbacks do banco e do servidor:** "Dados inválidos.", "Já existe um registro com esses dados.", "Formato de identificador ou valor inválido.", "Ocorreu um erro interno no servidor.";
- **frontend:** quando a resposta não traz o envelope (por exemplo, o túnel devolvendo 502), aparece "Erro 502. Tente novamente.".

## Regras

1. **Toda mensagem diz o que aconteceu e, quando houver, o que fazer.** Status, papéis e formas de pagamento aparecem com os mesmos rótulos da tela (ex.: "Aguardando pagamento", "Gerente", "Pix"). Valores em reais com `R$` no formato brasileiro.
2. **Permissão (`403`):** a mensagem cita quem pode fazer a ação e com que papel a pessoa entrou. Ex.: "Só Gerente ou Caixa podem fazer isto. Você entrou como Garçom." O admin passa em toda checagem e não aparece na lista.
3. **Estado do pedido (`409`):** cita o status atual e o próximo passo. Ex.: "A conta já foi pedida (Aguardando pagamento). Reabra a conta para lançar mais itens."; "Ainda faltam R$ 46,90 para quitar o pedido."; "2 itens ainda estão em preparo na cozinha."
4. **Validação (`422`/`400`):** diz o formato ou faixa aceitos. Ex.: "A quantidade deve ser um número inteiro maior que zero."; "Forma de pagamento inválida: use Dinheiro, Cartão ou Pix."
5. **Sessão (`401`):** linguagem de usuário, sem "token": "Sua sessão expirou. Faça login novamente." Login com credenciais erradas continua sem dizer qual campo errou (segurança).
6. **Filtros de consulta:** os nomes técnicos viram rótulos ("data inicial", "data final", "turno", "usuário", "quantidade por página").
7. **Fallbacks do banco:** usam a constraint quando conhecida (ex.: e-mail ou nome repetido) e, no geral, dizem qual tipo de dado foi recusado.
8. **Erro inesperado (`500`):** "Erro inesperado no servidor. Tente de novo; se continuar, informe o código XXXXXXXX ao suporte." O código (8 caracteres) também vai para o log junto com o erro, para achar a causa.
9. **Frontend sem envelope:** mensagens por status: `502`/`503`/`504` → "O servidor está indisponível no momento (reiniciando ou fora do ar). Tente de novo em alguns segundos."; `413` → "Os dados enviados são grandes demais."; demais → "O servidor respondeu com erro N e não explicou o motivo. Tente de novo."; sem conexão → "Sem conexão com o servidor. Verifique a internet e tente de novo."
10. **Códigos (`code`) e status HTTP não mudam.** Só o texto.

## Critérios de aceite

- [ ] Nenhuma mensagem da lista do contexto continua genérica.
- [ ] Testes de integração conferem as mensagens novas nos casos principais (permissão, transição, item em pedido com conta pedida, pagamento, saldo, cozinha, validações, 500 com código).
- [ ] Vitest para o `api.js` sem envelope (502, 413, status desconhecido e sem conexão).
- [ ] `frontend/CONTRATO-API.md` explica o formato das mensagens.

## Fora de escopo

- Tradução para outros idiomas.
- Mudar `code` ou status HTTP.
