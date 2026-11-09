# Issue #3 — Autenticação e autorização

Implementação inicial da API de autenticação do MesaFácil usando JavaScript ESM, Express, PostgreSQL via `pg`, SQL puro, bcrypt e JWT.

## Pré-requisitos

- Bun instalado
- PostgreSQL do projeto em execução
- Migração `sql/migrations/001_create_users.sql` aplicada
- Seed `sql/seeds/001_seed_users.sql` aplicado

## Configuração

Na raiz do repositório, copie `.env.example` para `.env` e configure `JWT_SECRET` com um valor forte. Não use `changeme`.

Dentro do devcontainer, mantenha a URL do banco apontando para o serviço `db` (conforme o ambiente Docker). Fora dele, use `localhost`.

## Instalação e execução

```bash
cd backend
bun install
bun run dev
```

A API inicia na porta definida em `PORT` (padrão 3001).

## Login

```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"gerente@mesafacil.com","password":"123"}'
```

Resposta de sucesso:

```json
{
  "success": true,
  "data": {
    "token": "<jwt>",
    "user": {
      "id": "1",
      "name": "Nome do usuário",
      "email": "gerente@mesafacil.com",
      "role": "manager"
    }
  }
}
```

O nome e o ID retornados dependem dos dados existentes no seed.

## Respostas de erro esperadas

- `400`: e-mail ou senha não informados.
- `401`: credenciais inválidas, token ausente, inválido ou expirado.
- `403`: usuário autenticado sem o papel exigido por `requireRole`.
- `500`: erro interno, sem exposição de detalhes ao cliente.

## Observações

- O middleware `authenticateToken` valida JWT e disponibiliza `req.user`.
- O middleware `requireRole(...roles)` permite restringir rotas por papel.
- IDs BIGINT são serializados como string para evitar perda de precisão em JavaScript.
- Não há testes automatizados neste pacote; valide a integração no ambiente do projeto e alinhe os testes com a pessoa responsável por CI/testes.
