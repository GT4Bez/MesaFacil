# Mesa Fácil — Frontend

Frontend React + Vite do Mesa Fácil, executado com Bun.

## Como executar

1. Suba o backend (porta `3001`) — veja o `README.md` da raiz.
2. Nesta pasta, instale as dependências e inicie o servidor de desenvolvimento:
   ```bash
   bun install
   bun run dev
   ```
3. Abra `http://localhost:5173`.

A URL da API vem de `VITE_API_URL` e, por padrão, é `http://localhost:3001`. Para apontar para
outro endereço, copie `.env.example` para `.env` e ajuste o valor.

Usuários de teste (senha `123`): veja `docs/SPRINT_1.md`.

## Estrutura

- `src/pages`: Login, mesas, comanda e caixa.
- `src/components/Layout.jsx`: moldura das telas autenticadas.
- `src/context/AuthContext.jsx`: sessão do usuário (token e dados no `localStorage`).
- `src/hooks/useAction.js`: estados de carregamento e erro das chamadas à API.
- `src/services/api.js`: chamadas HTTP com token Bearer e envelope `{ success, data }`.
- `src/utils/format.js`: formatação de valores e rótulos em português dos estados do domínio.

## Integração com o backend

O contrato que o frontend espera está em `CONTRATO-API.md`. Hoje o backend implementa apenas
`POST /auth/login`; as telas de mesas, comanda e caixa dependem das demais rotas.
