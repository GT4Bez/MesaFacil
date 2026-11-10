# Mesa Fácil — Frontend

Frontend React + Vite para o sistema de restaurante Mesa Fácil.

## Requisitos
- Node.js LTS instalado
- Backend da equipe rodando e com os endpoints descritos em `CONTRATO-API.md`

## Como executar
1. Extraia o ZIP.
2. Abra a pasta `mesa-facil` no VS Code.
3. Abra o terminal nessa pasta.
4. Execute `npm install`.
5. Copie `.env.example` para `.env` e ajuste `VITE_API_URL` para a URL do backend.
   Exemplo: `VITE_API_URL=http://localhost:3000`
6. Execute `npm run dev`.
7. Abra o endereço mostrado pelo Vite, normalmente `http://localhost:5173`.

## Pastas
- `src/pages`: Login, mesas, comanda e caixa.
- `src/components`: layout e proteção de rotas.
- `src/context`: sessão/autenticação.
- `src/services/api.js`: chamadas HTTP com token Bearer.

## Observações
- Não há banco de dados neste projeto; isso fica com a equipe do backend.
- O login espera `{ "token": "...", "user": { "id": 1, "name": "...", "role": "gerente" } }` ou `accessToken` no lugar de `token`.
- O frontend considera os papéis `gerente`/`manager`/`admin` e `caixa`/`cashier`. Garçom e demais perfis entram no painel de mesas.
- Os dados de mesa devem conter `id`, `number`, `status` (`available` ou `occupied`) e `activeOrderId` quando ocupada.
- Se o backend usar nomes de campos diferentes, ajuste os pontos indicados no contrato e nas páginas.
