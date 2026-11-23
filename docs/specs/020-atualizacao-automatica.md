# 020 — Atualização automática do Salão e do Caixa

> Status: proposta · Regras: RN-03 (visibilidade do status da conta) · Telas: Salão, Caixa e Cozinha (KDS)

## Contexto

A spec 019 mostra "Aguardando pagamento" no Salão e no Caixa, mas as duas telas só se atualizam quando alguém clica em "Atualizar":
- o **caixa** não vê a mesa que acabou de pedir a conta;
- o **garçom** não vê que o caixa reabriu ou encerrou uma conta, nem que outra pessoa ocupou uma mesa;
- quem está com a tela aberta age sobre um estado velho, e o erro só aparece no clique (`409`).

A cozinha (KDS, spec 003) já resolve isso com polling a cada 5 s. Esta spec leva o mesmo comportamento ao Salão e ao Caixa, com um hook único e sem mudanças no backend.

## Regras

1. **Hook `usePolling(callback, intervalMs, { enabled })`** em `frontend/src/hooks/usePolling.js`, usado pelo KDS, pelo Salão e pelo Caixa:
   - chama `callback` a cada `intervalMs`, sem sobrepor chamadas (a próxima só agenda depois que a anterior terminar);
   - **pausa com a aba oculta** (`document.visibilityState === 'hidden'`) e, ao voltar a ficar visível, atualiza na hora e retoma o intervalo;
   - **pausa com `enabled: false`**: a tela desliga a atualização enquanto há ação em andamento (`busy`) ou um modal aberto, para não trocar dados embaixo de quem está digitando;
   - descarta a resposta que chegar depois de a tela ser desmontada;
   - erro da atualização em segundo plano não apaga dados nem trava botões: aparece como aviso discreto ("Sem conexão com o servidor. Tentando de novo...") e some na próxima atualização bem-sucedida.
2. **Intervalos:** KDS continua em 5 s; Salão e Caixa em 10 s.
3. **Salão:** recarrega mesas e turno (`GET /tables` e `GET /shifts/active`). Tags, contadores e o banner do turno mudam sozinhos.
4. **Caixa:**
   - recarrega a lista de mesas e, com uma conta selecionada, o extrato (`GET /orders/:id/bill`);
   - o valor digitado no campo de pagamento e a forma de pagamento escolhida **não** são apagados pela atualização;
   - se a conta selecionada deixar de estar ativa (encerrada ou cancelada em outro terminal), o extrato some e aparece o aviso "A comanda #N não está mais ativa.";
   - a gaveta (sangria, reforço e contagem) **não** entra no polling nesta spec.
5. **Indicação de frescor:** Salão e Caixa mostram "Atualizado às HH:MM" ao lado do botão "Atualizar", que continua existindo para forçar a atualização.

## Modelo de dados e API

Sem mudanças. As rotas usadas já existem e são leituras.

## Telas

- **Salão:** "Atualizado às 19:42" ao lado de "↻ Atualizar". Com erro de rede, o aviso discreto aparece abaixo do cabeçalho, sem esconder o mapa de mesas.
- **Caixa:** mesmo indicador ao lado de "↻ Atualizar mesas". O extrato selecionado é atualizado no lugar, sem piscar o "Carregando".
- **Cozinha:** sem mudança visível; passa a usar o hook e a pausar com a aba oculta.

## Critérios de aceite

- [ ] `usePolling`: intervalo, sem chamadas sobrepostas, pausa com aba oculta e retomada imediata ao voltar, pausa com `enabled: false`, limpeza ao desmontar.
- [ ] Salão: uma mesa que passa a `ready_to_pay` em outro terminal aparece com a tag sem clicar em "Atualizar".
- [ ] Caixa: a lista e o extrato atualizam sozinhos; o valor digitado no pagamento sobrevive à atualização; conta encerrada em outro terminal some com o aviso.
- [ ] Nenhuma atualização com modal aberto ou ação em andamento.
- [ ] Erro de rede no polling mostra o aviso e não apaga os dados; some na atualização seguinte.
- [ ] KDS mantém o comportamento atual (5 s) usando o hook.
- [ ] **Testes:**
  - Vitest com timers falsos (hook, Salão, Caixa e KDS);
  - Cypress: com o caixa na tela, o garçom pede a conta por API e a tag aparece no Caixa sem recarregar.
- [ ] **Documentação:** `docs/ESPECIFICACAO.md` (RN-03, coluna Frontend) e `docs/ROTEIRO-DEMO.md`.

## Fora de escopo

- WebSocket ou Server-Sent Events (fica para quando o polling não bastar).
- Atualização automática da Comanda, das telas de administração e da gaveta do caixa.
- Notificação sonora ou visual chamativa quando uma mesa pede a conta.
