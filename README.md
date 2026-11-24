# 🍽️ MesaFácil

![MesaFácil - Painel de Acesso](docs/assets/mesa-facil-cover.jpg)

PDV e gestão operacional presencial para restaurantes, integrando **salão**, **cozinha** e **caixa** em fluxo transacional e auditável.

> 🌐 **Ambiente Online:** [mesafacil.shop](https://mesafacil.shop)

---

## 🔄 Visão Geral e Fluxo Operacional

Atendimento presencial de ponta a ponta: abertura de turno, comanda na mesa, preparo na cozinha, pagamentos parciais e liberação da mesa.

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

| Papel (`role`) | Responsabilidade Principal |
| :--- | :--- |
| `waiter` (Garçom) | Mesas, abertura de comandas, lançamento/envio de itens e solicitação de conta |
| `kitchen` (Cozinha) | Fila KDS e atualização de preparo (`sent` -> `preparing` -> `ready`) |
| `cashier` (Caixa) | Extrato, taxa de serviço, pagamentos parciais, fechamento cego e encerramento |
| `manager` (Gerente) | Turnos, cardápio, estoque/fichas técnicas, cancelamentos auditados e auditoria |
| `admin` (Administrador) | Acesso total, gestão de usuários (`RN-16`) e configurações globais (`settings`) |

---

## 📋 Regras de Negócio e Arquitetura

- **Turnos e Mesas (`RN-01`, `RN-02`):** bloqueio de múltiplos pedidos ativos por mesa no PostgreSQL e exigência de turno aberto.
- **Fluxo e Trava Pós-Envio (`RN-03`, `RN-04`, `RN-06`):** transições transacionais em `OrderService` com `SELECT ... FOR UPDATE`.
- **Auditoria e Cancelamentos (`RN-05`, `RN-11`, `RN-20`):** justificativa obrigatória, PIN de gerente no caixa e registro em `audit_logs`.
- **Financeiro e Estoque (`RN-07` a `RN-10`, `RN-12` a `RN-21`):** pagamentos parciais, preço congelado, fechamento cego, baixa automática por ficha técnica e exportação CSV.

### 📄 Documentação Técnica

| Documento | Conteúdo |
| :--- | :--- |
| [`docs/ESPECIFICACAO.md`](docs/ESPECIFICACAO.md) | Regras de negócio (`RN-01` a `RN-21`) e matriz de validação |
| [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) | Máquinas de estado, modelo relacional, camadas e ambiente |
| [`docs/ENGENHARIA.md`](docs/ENGENHARIA.md) | Engenharia de software, camadas, SOLID, KISS/DRY, equipe e QA |
| [`docs/specs/README.md`](docs/specs/README.md) | Índice das especificações numeradas (*Spec-Driven Development*) |
| [`frontend/CONTRATO-API.md`](frontend/CONTRATO-API.md) | Endpoints REST, payloads, RBAC e envelopes de resposta |

### Stack e Estrutura

- **Frontend:** React 19, Vite 8, React Router 7 (JavaScript ESM)
- **Backend:** Bun, Express 5, PostgreSQL (`pg` com SQL puro e transações), JWT, `bcrypt`
- **Banco e Infra:** PostgreSQL 16 (migrations e seeds SQL versionados), Docker & Docker Compose

```text
MesaFacil/
├── backend/       # API REST (routes, controllers, services, domain, repositories, errors, middlewares, tests)
├── frontend/      # SPA React (pages, components, context, hooks, services, utils) + CONTRATO-API.md
├── sql/           # 20 migrations (001-020) e 10 seeds (001-010)
├── docker/        # Inicialização automática do PostgreSQL
└── docs/          # Especificação, arquitetura, roteiro de demo e specs (docs/specs/)
```

---

## 🚀 Como Executar

### Opção 1: Docker Compose (Recomendado)

1. Crie o `.env` e defina um `JWT_SECRET` próprio (o backend bloqueia o valor padrão `changeme`):
   ```bash
   cp .env.example .env
   openssl rand -hex 32
   ```
2. Suba banco, API e frontend (migrations e seeds rodam na primeira subida; use `docker compose down -v` para recriar do zero):
   ```bash
   docker compose up --build
   ```
3. Serviços locais:
   - **Frontend:** `http://localhost:5173`
   - **Backend API:** `http://localhost:3001`
   - **PostgreSQL:** `localhost:5432` (`mesafacil`)

### Opção 2: Execução Local com Bun

Não há `package.json` na raiz; execute em `backend/` e `frontend/` separadamente:

```bash
docker compose up -d db
cd backend && bun install && bun run dev
cd frontend && bun install && bun run dev
```

---

## 🔑 Credenciais de Demonstração

Seeds em `sql/seeds/001_seed_users.sql` e `sql/seeds/008_seed_admin.sql` (credenciais exclusivas para ambiente local/dev com Docker; em produção e novos cadastros exigem senha de 8 a 72 caracteres):

| Perfil | E-mail | Senha | Papel (`role`) |
| :--- | :--- | :--- | :--- |
| **Garçom** | `garcom@mesafacil.com` | `123` | `waiter` |
| **Cozinha** | `cozinha@mesafacil.com` | `123` | `kitchen` |
| **Caixa** | `caixa@mesafacil.com` | `123` | `cashier` |
| **Gerente** | `gerente@mesafacil.com` | `123` | `manager` |
| **Administrador** | `admin@mesafacil.com` | `123` | `admin` |

---

## 🛣️ Rotas e Testes

- **Acesso Rápido (Produção):** [`mesafacil.shop/tables`](https://mesafacil.shop/tables) *(Salão e Mesas; após login, direciona conforme o perfil RBAC)*
- **Contrato da API:** [`frontend/CONTRATO-API.md`](frontend/CONTRATO-API.md) *(endpoints REST e envelope `{ "success": true, "data": ... }`)*

### Suítes Automatizadas

- **Backend (`backend/tests/`):** `5` suítes unitárias (`unit/`) e `20` de integração contra PostgreSQL real (`integration/`, regras `RN-01` a `RN-21`). Exige `TEST_DATABASE_URL` terminando em `_test`:
  ```bash
  docker compose up -d db
  docker compose exec db createdb -U mesafacil mesafacil_test   # 1a vez
  cd backend && bun install
  TEST_DATABASE_URL=postgresql://mesafacil:mesafacil@localhost:5432/mesafacil_test bun run test
  ```
- **Frontend (`frontend/tests/unit/` e `cypress/e2e/`):** `31` arquivos Vitest + E2E Cypress:
  ```bash
  cd frontend && bun install
  bun run test:unit
  bun run test:e2e
  ```
- **CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)):** Guardrails (JS ESM, higiene e LF), testes de backend, validação SQL, build/unitários do frontend e E2E.

---

## 🎬 Roteiro de Demonstração

Guia completo de apresentação em [`docs/ROTEIRO-DEMO.md`](docs/ROTEIRO-DEMO.md):
- Fluxo pela interface perfil por perfil;
- Mapeamento regra a regra (serviço, constraint e teste);
- Prova pela API via [`scripts/demo-regras.sh`](scripts/demo-regras.sh) (`401`, `403`, `409`, `422`).

---

## 👥 Equipe e Gestão Ágil

| Integrante | GitHub | Atuação Principal |
| :--- | :--- | :--- |
| **Paulo Henrique** | [@PauloHenrrq](https://github.com/PauloHenrrq) | Tech Lead, Product Owner (PO), Governança, QA e Code Review |
| **Rodolfo Bertini** | [@rodox83br](https://github.com/rodox83br) | Infraestrutura/DevOps (Docker, DevContainer) e Engenharia Full-Stack |
| **Abraão Alves** | [@AbraaoAlvs](https://github.com/AbraaoAlvs) | Backend, Autenticação/JWT, Middlewares e Tratamento de Erros |
| **Jadson Laurindo** | [@jadsonelorraine](https://github.com/jadsonelorraine) | Banco de Dados (Modelagem relacional, Migrations, Constraints e Seeds SQL) |
| **Kauan Santos** | [@kauansantos01](https://github.com/kauansantos01) | Frontend e Interfaces de Operação em React |

### Como a Equipe Operou

- ***Contract-First* e *Spec-Driven Development*:** contratos ([`docs/SPRINT_1.md`](docs/SPRINT_1.md), [`frontend/CONTRATO-API.md`](frontend/CONTRATO-API.md)) e especificações ([`docs/specs/`](docs/specs/README.md)) antes do código para desenvolvimento paralelo sem bloqueios.
- **Isolamento no Git:** domínios separados (`sql/`, `backend/`, `frontend/`, `docker/`), branches curtas (`feat/`, `fix/`, `chore/`) e `main` protegida.
- **Governança (*KISS* e *YAGNI*):** PRs granulares com Code Review, testes obrigatórios e corte de escopo fora do MVP.
- **Sincronização:** prioridades (`P0` a `P3`) no GitHub Issues e dailies assíncronas de 3 linhas.

### Apresentação Interativa (Arquitetura & Equipe)

- 🔗 **Acesse:** [https://mesafacil.shop/apresentacao](https://mesafacil.shop/apresentacao)

<img src="docs/assets/qr-apresentacao.png" alt="QR Code de Acesso à Apresentação MesaFácil" width="220" />
