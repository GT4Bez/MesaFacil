# 011 — Administração de usuários e superadmin

> Status: proposta · Fase: Fase 2 · Regras: controle de acesso por papel (RBAC) · Telas: Usuários, Minha conta

## Contexto

Hoje os usuários só existem pelo seed: não há como cadastrar um garçom novo, desligar um funcionário ou trocar uma senha. Também não existe um papel acima do gerente, responsável pelo sistema em si. Esta spec cria o papel **`admin`** (superadmin), com acesso completo, que é o único a administrar usuários.

## Regras

**Papel `admin`**

1. Novo papel `admin` ("Administrador"), além de `waiter`, `kitchen`, `cashier` e `manager`.
2. O `admin` passa em **toda** checagem de papel, no backend e no frontend. A regra fica num ponto central (middleware `requireRole` e helper de papel usado pelos services), substituindo comparações literais existentes (ex.: `OrderService` e `menuItemRoutes`) para não gerar falha silenciosa. Ações feitas por ele são gravadas com o próprio usuário (inclusive na auditoria da spec 005).
3. Apenas `admin` lista, cria, edita, desativa e redefine a senha de usuários (`403` para os demais, inclusive `manager`).
4. Pode haver mais de um `admin`, mas o sistema **nunca** fica com zero `admin` ativo: desativar ou rebaixar o último → `409`, protegido por trava transacional (`SELECT id FROM users WHERE role = 'admin' AND active = true FOR UPDATE`).
5. O `admin` logado não pode desativar nem rebaixar a si mesmo → `409` (outro admin faz isso).

**Usuários**

6. Usuário nunca é apagado: sai com `active = false` (pedidos, turnos e cancelamentos o referenciam). Não existe `DELETE`.
7. Usuário inativo não faz login (`401`, mesma mensagem de credencial inválida) e perde o acesso **na hora**: a cada requisição o middleware confere no banco `active`, `role` e `token_version`. Troca de papel vale na hora; desativação, troca/redefinição de senha e rebaixamento incrementam `token_version`, invalidando tokens JWT emitidos anteriormente (`401`).
8. Nome: 1–100 caracteres. E-mail: válido, gravado em minúsculas e sem espaços; repetido → `409`. Papel: um dos cinco.
9. Senha nova (criação, redefinição ou troca): 8 a 72 caracteres, guardada com `bcrypt`. Os usuários do seed (incluindo o superadmin de demonstração) mantêm `123` **exclusivamente** para ambiente local (`development`/`test`).
10. O `admin` define a senha inicial e pode redefini-la sem saber a atual. Qualquer usuário troca a própria senha informando a atual (senha atual errada → `422`).
11. Criação de usuário, alteração de papel, desativação/reativação e redefinição/troca de senha gravam trilha em `audit_logs` (spec 005) na mesma transação (`user.created`, `user.updated`, `user.password_reset`, `user.password_changed`).

## Modelo de dados

Próxima migration livre (números de migration são definidos na implementação), ex.: `009_add_admin_and_active_to_users.sql`:

```sql
ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
    CHECK (role IN ('admin', 'waiter', 'kitchen', 'cashier', 'manager'));

ALTER TABLE users ADD COLUMN active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 1;

-- E-mail sempre normalizado: a unicidade existente passa a valer sem diferenciar maiúsculas.
ALTER TABLE users ADD CONSTRAINT users_email_normalized_check
    CHECK (email = lower(trim(email)));
```

Seed novo `008_seed_admin.sql` (apenas desenvolvimento/testes locais — nunca aplicar senha padrão em produção): `Administrador`, `admin@mesafacil.com`, senha `123`, papel `admin`.

## Contrato da API

Usuário: `{ id, name, email, role, active, createdAt }` (nunca devolve hash de senha).

| Rota | Papéis | Body / query | Resposta (`data`) |
| :-- | :-- | :-- | :-- |
| `GET /users` | `admin` | `?role=waiter&active=true` (opcionais) | lista ordenada por nome |
| `POST /users` | `admin` | `{ name, email, role, password }` | usuário criado (`201`) |
| `PATCH /users/:id` | `admin` | subconjunto de `{ name, email, role, active }` | usuário atualizado |
| `PUT /users/:id/password` | `admin` | `{ password }` | `{ id }` |
| `GET /me` | todos | — | usuário logado |
| `PATCH /me/password` | todos | `{ currentPassword, newPassword }` | `{ id }` |

Erros: `401` sem token, usuário inativo ou removido; `403` papel; `404` usuário inexistente; `409` e-mail repetido, último admin ou autodesativação/autorrebaixamento; `422` validação ou senha atual errada.

`POST /auth/login` passa a recusar usuário inativo (`401`).

## Telas

- **Usuários** (`/admin/users`, só `admin`, home do admin): lista com nome, e-mail, papel e situação; filtros por papel e por ativos/inativos; formulário de criar/editar; ações "Redefinir senha" e "Desativar/Reativar" na linha.
- **Minha conta** (`/account`, todos os papéis): dados do usuário e troca da própria senha.
- Matriz de acesso (spec 004): `admin` vê todas as telas; o menu ganha "Usuários" (admin) e "Minha conta" (todos).

## Critérios de aceite

- [ ] Só `admin` acessa `/users` (gerente → `403`); admin consegue executar ações de qualquer papel (ex.: abrir turno, cancelar item enviado, registrar pagamento).
- [ ] Desativar um usuário ou redefinir/alterar sua senha invalida o token anterior (`401` por `token_version` / `active`) e bloqueia o login quando inativo.
- [ ] Trocar o papel de um usuário vale na próxima requisição, sem novo login.
- [ ] Último admin ativo (sob concorrência com trava `FOR UPDATE`) e o próprio admin não podem ser desativados/rebaixados (`409`).
- [ ] Eventos sensíveis de usuário/privilégio/senha são gravados em `audit_logs` na mesma transação.
- [ ] E-mail com maiúsculas é normalizado; repetido → `409`; senha com menos de 8 caracteres → `422`.
- [ ] Troca da própria senha exige a senha atual.
- [ ] `docs/ESPECIFICACAO.md` (perfis e permissões), README (credenciais de demonstração e rotas) e `frontend/CONTRATO-API.md` atualizados.

## Fora de escopo

- "Esqueci minha senha" por e-mail, troca obrigatória de senha no primeiro acesso, bloqueio por tentativas, permissões configuráveis por usuário, exclusão física.
