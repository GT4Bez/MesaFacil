# 015 — Limite de tentativas de senha

> Status: proposta · Regras: RN-16, RN-17, RN-18, **RN-19 (nova)** · Telas: Login, Caixa e Minha conta

## Contexto

Três lugares conferem uma senha, e nenhum limita quantas vezes ela pode ser tentada:

| Onde | Rota | Senha de quem |
| :-- | :-- | :-- |
| Login | `POST /auth/login` | do próprio usuário |
| Autorização do gerente (RN-17, e RN-18 da spec 014) | `POST /order-items/:id/authorized-cancel` e a sangria autorizada | do **gerente**, digitada no terminal do caixa |
| Troca da própria senha (spec 011) | `PATCH /me/password` | do próprio usuário |

O caso mais sério é a autorização. Um caixa logado pode testar senhas do gerente sem limite e sem que ninguém fique sabendo. As specs 013 e 014 deixaram isso para depois ("limite de tentativas fora de escopo").

## Regras (RN-19)

1. **Contagem de falhas por chave:**

   | Escopo | Chave |
   | :-- | :-- |
   | `login` | e-mail normalizado (`trim().toLowerCase()`), exista ou não |
   | `approval` | id do usuário **logado que pede** a autorização (o caixa), não o e-mail do gerente |
   | `password_change` | id do usuário logado |

   A chave da autorização é o caixa para que tentativas erradas no terminal dele **não bloqueiem o login do gerente**.
2. **Bloqueio:** 5 falhas seguidas dentro de 15 minutos bloqueiam a chave por 15 minutos.
   - Durante o bloqueio, a rota responde `429` com a mensagem `"Muitas tentativas. Tente novamente em N minutos."` (`N` arredondado para cima, no singular `"em 1 minuto."` quando `N = 1`). Isso vale **mesmo com a senha certa**: a senha não é conferida enquanto a chave estiver bloqueada.
   - Os valores ficam em constantes no código (`MAX_FAILURES = 5`, `WINDOW = LOCK = 15 min`), sem `.env`.
3. **Zerar:** um acerto zera a contagem da chave. A contagem também volta a zero quando a janela de 15 minutos (contada a partir da primeira falha da janela, `window_started_at`) expira.
4. **O que conta como falha:**
   - só a senha ou a autorização inválida (`401` do login, `403` da autorização, `422` de senha atual errada na troca);
   - campos em branco (`400`/`422`) não contam;
   - no login, e-mail inexistente e usuário inativo contam como falha, com a mesma resposta, para não revelar quais e-mails existem (RN-16).
5. **Atomicidade:** a contagem é gravada numa única instrução (`INSERT … ON CONFLICT … DO UPDATE`), para que duas tentativas simultâneas não se percam. A verificação do bloqueio acontece antes de qualquer chamada a `bcrypt` (inclusive antes de `bcrypt.hash` na troca de senha).
6. **Sessão do caixa:** o `429` da autorização não encerra a sessão. O frontend só faz logout com `401`, então nada muda nesse ponto.
7. **Auditoria do início de cada bloqueio**, gravada em **transação dedicada junto ao registro da falha** (isolada de eventuais rollbacks da operação principal, como no `422` da troca de senha), sempre com `entity = 'user'` e `entity_id = user.id`:
   - `approval`: `auth.approval_locked`, com `user_id` = caixa e `details: { approverEmail }`;
   - `login`: `auth.login_locked`, com `user_id` = dono do e-mail, só se o e-mail existir;
   - `password_change`: `auth.password_change_locked`, com o próprio usuário.
8. **Desbloqueio pelo admin:** redefinir a senha (`PUT /users/:id/password`, spec 011) zera os bloqueios de `login` e `password_change` daquele usuário. Assim, quem foi bloqueado não precisa esperar.

## Modelo de dados

`017_create_auth_throttles.sql` (próximo número livre):

```sql
CREATE TABLE auth_throttles (
  scope VARCHAR(20) NOT NULL,                  -- login | approval | password_change
  key TEXT NOT NULL,                           -- e-mail normalizado ou id do usuário
  failures INTEGER NOT NULL DEFAULT 0,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  locked_until TIMESTAMPTZ,
  PRIMARY KEY (scope, key),
  CONSTRAINT auth_throttles_scope_check CHECK (scope IN ('login', 'approval', 'password_change')),
  CONSTRAINT auth_throttles_failures_check CHECK (failures >= 0)
);
-- audit_logs_action_check ganha 'auth.login_locked', 'auth.approval_locked' e
-- 'auth.password_change_locked', mantendo todas as ações anteriores.
```

A aplicação usa um `AuthThrottleRepository` (`isLocked`, `registerFailure`, `reset`), chamado pelo `AuthService` (`login` e `verifyApprover`) e pelo `UserService` (`changeOwnPassword` e `resetPassword`).

## Contrato da API

Sem mudança de body. As três rotas passam a responder também:

```json
{ "success": false, "error": "Muitas tentativas. Tente novamente em 15 minutos.", "code": "TOO_MANY_ATTEMPTS" }
```

com status `429`, por meio de uma nova subclasse de `AppError`, `TooManyAttemptsError`. Por ser genérico, o envelope não informa o número de falhas restantes.

## Telas

- **Login, Caixa (modal de autorização e sangria) e Minha conta:** o `429` aparece como os outros erros da API, no próprio formulário. Os campos de senha são limpos.
- **Nenhuma tela nova.** O desbloqueio é pela redefinição de senha que o admin já tem (tela Usuários).

## Critérios de aceite

- [ ] **Login:**
  - 5 senhas erradas → a 6ª tentativa responde `429`, mesmo com a senha certa;
  - depois do bloqueio (tempo simulado no teste), o login volta a funcionar;
  - um acerto antes da 5ª falha zera a contagem.
- [ ] **E-mail inexistente:** 5 tentativas → `429`, igual a um e-mail que existe, e sem auditoria.
- [ ] **Autorização:**
  - 5 autorizações inválidas do caixa (a 5ª ainda responde `403` e grava o bloqueio) → a partir da 6ª responde `429` em `authorized-cancel` e na sangria autorizada;
  - o gerente continua conseguindo fazer login;
  - `auth.approval_locked` é gravado uma única vez (`entity = 'user'`, `entity_id = caixa.id`);
  - a sessão do caixa continua válida.
- [ ] **Troca de senha:** 5 senhas atuais erradas → `429`. Redefinir a senha pelo admin zera os bloqueios do usuário.
- [ ] **Concorrência:** 10 tentativas simultâneas com senha errada deixam `failures` igual a 10 ou o bloqueio ativo, sem contagem perdida.
- [ ] **Campos em branco** não contam.
- [ ] **Testes:** integração no backend (cobrindo as três rotas, o desbloqueio e adaptando os casos consecutivos existentes em `authorizedCancel.test.js`), e Vitest mostrando a mensagem do `429` no login e no modal de autorização.
- [ ] **Documentação:**
  - `docs/ESPECIFICACAO.md`: RN-19 na §3.3 e na matriz (§4);
  - `frontend/CONTRATO-API.md`;
  - as specs 013 e 014: o item "limite de tentativas" passa a apontar para esta spec.

## Fora de escopo

- Bloqueio por IP. Atrás do túnel, o IP do cliente exige confiar em cabeçalhos do proxy, e no restaurante todos os terminais saem pelo mesmo IP.
- Cabeçalho HTTP `Retry-After` (o tempo restante já vai na mensagem e o frontend não faz retry automático).
- CAPTCHA, atraso progressivo e aviso por e-mail.
- Tela de auditoria para ver os bloqueios (ficam em `audit_logs`).
- **Limitações aceitas:**
  - por ser por e-mail, o bloqueio do login pode ser provocado por terceiros, com 5 senhas erradas no e-mail de alguém (até 15 min, ou até o admin redefinir a senha; se o único admin ficar bloqueado, aguarda os 15 min);
  - `PUT /users/:id/password` não zera `approval` (se o único caixa bloquear a autorização, o gerente pode operar com a própria conta no terminal durante os 15 min).
