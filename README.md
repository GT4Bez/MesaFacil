# 🍽️ MesaFácil

![MesaFácil — Painel de Acesso](docs/assets/mesa-facil-cover.jpg)

Sistema de PDV e gestão operacional presencial para restaurantes, conectando **salão**, **cozinha** e **caixa** em um fluxo único, transacional e auditável.

---

## 🔄 Visão Geral e Fluxo Operacional

O sistema organiza o atendimento presencial do restaurante ponta a ponta — da abertura de turno e ocupação da mesa até o preparo na cozinha, recebimento de pagamentos parciais e liberação da mesa.

```mermaid
flowchart LR
    A[Login] --> B[Abrir Turno / Mesa]
    B --> C[Lançar Itens]
    C --> D[Enviar à Cozinha]
    D --> E[Preparo e Entrega]
    E --> F[Pagamentos Parciais]
    F --> G[Encerrar e Liberar Mesa]
```

### Perfis de Acesso (RBAC)

| Papel (`role`) | Responsabilidade na Operação |
| :--- | :--- |
| `waiter` (Garçom) | Visualiza mesas, abre comandas, adiciona/edita itens pendentes, envia pedidos à cozinha e solicita a conta |
| `kitchen` (Cozinha) | Recebe itens enviados e atualiza o status de preparo (`sent` -> `preparing` -> `ready`) |
| `cashier` (Caixa) | Consulta extratos com ou sem taxa de 10%, registra pagamentos parciais e encerra pedidos quitados |
| `manager` (Gerente) | Abre e encerra turnos, cancela itens já enviados com justificativa e possui acesso completo à operação |

---

## 📋 Regras de Negócio e Arquitetura

- **Controle de Turno e Mesa (`RN-01`, `RN-02`):** impede múltiplos pedidos ativos na mesma mesa via constraint parcial no PostgreSQL e exige turno aberto para iniciar atendimentos, bloqueando o encerramento do turno enquanto houver comandas ativas.
- **Máquinas de Estado e Trava Pós-Envio (`RN-03`, `RN-04`, `RN-06`):** transições validadas em transação (`OrderService`); itens enviados não sofrem alteração por garçom/caixa e a conta só vai para pagamento quando todos os itens estão concluídos ou cancelados.
- **Cancelamento Auditado (`RN-05`):** itens já enviados à cozinha só podem ser cancelados pelo perfil `manager` mediante justificativa obrigatória gravada no banco.
- **Fechamento Financeiro e Preço Congelado (`RN-07`, `RN-08`, `RN-09`):** suporte a múltiplos pagamentos parciais, bloqueio de encerramento com saldo pendente, taxa de serviço opcional de 10% sobre itens ativos e snapshot de `unit_price` no ato do lançamento.

> 📌 **Atenção às Invariantes de Domínio:** As regras críticas (`RN-01`, `RN-02`, `RN-05`, `RN-07`) possuem dupla proteção — são validadas na camada de serviço (`OrderService`) com bloqueio de linha (`SELECT ... FOR UPDATE`) e garantidas por constraints e índices únicos parciais diretamente no PostgreSQL.

> 📄 **Documentação Complementar:** O detalhamento completo das máquinas de estado e especificações está em [`docs/ESPECIFICACAO.md`](docs/ESPECIFICACAO.md), [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) e [`frontend/CONTRATO-API.md`](frontend/CONTRATO-API.md).

### Stack e Estrutura do Projeto

- **Frontend:** React 19, Vite 8, React Router 7 (JavaScript ESM)
- **Backend:** Bun, Express 5, PostgreSQL (`pg` com SQL puro e transações), JWT (`jsonwebtoken`), `bcrypt`
- **Banco e Infra:** PostgreSQL 16 (migrations e seeds SQL versionados), Docker & Docker Compose

```text
MesaFacil/
├── backend/       # API REST (routes, controllers, services, repositories, middlewares, tests)
├── frontend/      # SPA React (pages, context, hooks, services) + CONTRATO-API.md
├── sql/           # Migrations (001–007) e seeds iniciais (001–007)
├── docker/        # Script de inicialização automática do PostgreSQL
└── docs/          # Especificação funcional, arquitetura e guias de sprint
```

---

## 🚀 Como Executar

### Opção 1: Stack Completa via Docker Compose (Recomendado)

1. **Crie o arquivo `.env`** na raiz a partir do modelo:
   ```bash
   cp .env.example .env
   ```

> ⚠️ **Atenção (`JWT_SECRET`):** Antes de subir os containers, substitua `JWT_SECRET=changeme` no `.env` por uma chave própria (ex.: `openssl rand -hex 32`). O arquivo `backend/src/config/env.js` bloqueia a inicialização caso o valor padrão `changeme` seja mantido.

2. **Suba o banco, a API e o Frontend** com um único comando:
   ```bash
   docker compose up --build
   ```

> 💡 **Inicialização do Banco:** As migrations (`sql/migrations/*.sql`) e os seeds (`sql/seeds/*.sql`) são aplicados automaticamente na primeira subida do volume. Para recriar o banco do zero após alterações em `sql/`, execute `docker compose down -v && docker compose up --build`.

3. **Acesse os serviços:**
   - **Frontend Web:** `http://localhost:5173`
   - **Backend API:** `http://localhost:3001`
   - **PostgreSQL:** `localhost:5432` (usuário, senha e banco: `mesafacil`)

### Opção 2: Execução Local com Bun

Suba apenas o banco via Docker e inicie **backend** e **frontend** em terminais dedicados:

```bash
# 1. Subir PostgreSQL
docker compose up -d db

# 2. Rodar Backend (terminal 1)
cd backend && bun install && bun run dev

# 3. Rodar Frontend (terminal 2)
cd frontend && bun install && bun run dev
```

> ⚠️ **Atenção à Estrutura de Pacotes:** Não há `package.json` na raiz do repositório. Os comandos `bun install` e `bun run dev` devem ser executados dentro de `backend/` e `frontend/` separadamente.

---

## 🔑 Credenciais de Demonstração

O seed inicial (`sql/seeds/001_seed_users.sql`) disponibiliza 4 usuários pré-cadastrados para testar cada perfil da operação:

| Perfil | E-mail | Senha | Papel (`role`) |
| :--- | :--- | :--- | :--- |
| **Garçom** | `garcom@mesafacil.com` | `123` | `waiter` |
| **Cozinha** | `cozinha@mesafacil.com` | `123` | `kitchen` |
| **Caixa** | `caixa@mesafacil.com` | `123` | `cashier` |
| **Gerente** | `gerente@mesafacil.com` | `123` | `manager` |

---

## 🛣️ Rotas da API e Testes

| Recurso | Endpoints | Controle de Acesso |
| :--- | :--- | :--- |
| **Autenticação** | `POST /auth/login` | Público |
| **Mesas e Turnos** | `GET /tables`, `GET /shifts/active`, `POST /shifts`, `PATCH /shifts/:id/close` | Autenticado (`POST`/`PATCH` restritos a `manager`) |
| **Cardápio** | `GET /menu-items` | Autenticado |
| **Pedidos** | `POST /orders`, `GET /orders/:id`, `PATCH /orders/:id/status` | Autenticado + RBAC por transição |
| **Cozinha (KDS)** | `GET /kitchen/orders` | Autenticado (`kitchen` e `manager`) |
| **Itens da Comanda** | `POST /orders/:id/items`, `PATCH /order-items/:id/quantity`, `PATCH /order-items/:id/status` | Autenticado + RBAC por operação |
| **Caixa** | `GET /orders/:id/bill?serviceTax=true\|false`, `POST /orders/:id/payments` | Autenticado (`POST` restrito a `cashier` e `manager`) |

> 🔌 **Contrato de Resposta Padronizado:** Todas as rotas retornam o envelope `{ "success": true, "data": ... }` em caso de sucesso ou `{ "success": false, "error": "mensagem" }` em caso de falha, conforme documentado em [`frontend/CONTRATO-API.md`](frontend/CONTRATO-API.md).

### Executando os Testes Automatizados

Os testes rodam com `bun test` e ficam em `backend/tests/`:

- `unit/` — regras isoladas (serviço de autenticação, middleware de RBAC, tradução de erros do PostgreSQL);
- `integration/` — API completa contra um **PostgreSQL real** (login, CORS e o fluxo `RN-01` a `RN-09`), com o schema recriado a partir de `sql/migrations/` e o banco limpo entre os testes.

Os testes de integração exigem `TEST_DATABASE_URL` apontando para um banco cujo nome termina em `_test` (o schema dele é apagado a cada execução):

```bash
docker compose up -d db
docker compose exec db createdb -U mesafacil mesafacil_test   # só na primeira vez

cd backend
bun install
TEST_DATABASE_URL=postgresql://mesafacil:mesafacil@localhost:5432/mesafacil_test bun run test
# ou só uma camada: bun run test:unit | bun run test:integration
```

Dentro do container do backend, use o host `db` no lugar de `localhost`. O CI (`.github/workflows/ci.yml`) roda os testes em todo PR e no push para a `main`, junto com o build do frontend.

---

## 👥 Equipe e Gestão Ágil

| Integrante | GitHub | Atuação Principal |
| :--- | :--- | :--- |
| **Paulo Henrique** | [@PauloHenrrq](https://github.com/PauloHenrrq) | Tech Lead, Product Owner (PO), Governança, QA e Code Review |
| **Rodolfo Bertini** | [@rodox83br](https://github.com/rodox83br) | Infraestrutura/DevOps (Docker, DevContainer) e Engenharia Full-Stack |
| **Abraão Alves** | [@AbraaoAlvs](https://github.com/AbraaoAlvs) | Backend, Autenticação/JWT, Middlewares e Tratamento de Erros |
| **Jadson Laurindo** | [@jadsonelorraine](https://github.com/jadsonelorraine) | Banco de Dados (Modelagem relacional, Migrations, Constraints e Seeds SQL) |
| **Kauan Santos** | [@kauansantos01](https://github.com/kauansantos01) | Frontend e Interfaces de Operação em React |

### Como a Equipe Operou (Engenharia & Agilidade)

A condução do projeto seguiu práticas enxutas de engenharia para garantir entregas paralelas sem bloqueios entre as frentes:

- **Abordagem *Contract-First*:** antes da codificação das telas e rotas, o contrato de comunicação (`docs/SPRINT_1.md` e `frontend/CONTRATO-API.md`) definiu payloads e envelopes de erro padronizados, permitindo que Frontend, Backend e Banco avançassem simultaneamente sem depender uns dos outros.
- **Isolamento por Domínio e Zero Conflito no Git:** o repositório foi particionado por áreas de responsabilidade (`sql/`, `backend/`, `frontend/`, `docker/`), com branches curtas por funcionalidade (`feat/`, `fix/`, `chore/`) e proibição de commits diretos na `main`.
- **Governança de PRs com *KISS* e *YAGNI*:** todas as entregas passaram por Pull Requests granulares, revisão de código pelo Tech Lead, validação por suíte de testes e corte rigoroso de escopo desnecessário (*"Tesoura do PO"*), priorizando código limpo, SQL explícito em transações e regras de domínio auditáveis.
- **Sincronização Contínua:** acompanhamento por prioridades (`P0` a `P3`) no GitHub Issues combinado a *Dailies Assíncronas de 3 Linhas* (entregas do dia, próximo passo e bloqueios) para atuação imediata em impedimentos técnicos.
