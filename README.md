# 🍽️ MesaFácil — Sistema de Gestão Operacional para Restaurantes

> **Documento Oficial de Engenharia & Especificação de Produto (PO)**  
> Informações e diretrizes gerais declaradas para o projeto MesaFácil.

---

<a id="indice"></a>
## 📑 Índice Interativo

- [🎯 1. Visão Geral do Produto](#1-visao-geral-do-produto)
  - [1.1 O que é](#11-o-que-e)
  - [1.2 Foco](#12-foco)
  - [1.3 Fora do Escopo Obrigatório](#13-fora-do-escopo-obrigatorio)
- [👥 2. Usuários e Papéis](#2-usuarios-e-papeis)
- [🔄 3. Fluxo Principal da Operação](#3-fluxo-principal-da-operacao)
- [🏗️ 4. Stack Base Obrigatória](#4-stack-base-obrigatoria)
- [⚙️ 5. Máquinas de Estados](#5-maquinas-de-estados)
  - [5.1 Estados do Pedido](#51-estados-do-pedido)
  - [5.2 Estados do Item](#52-estados-do-item)
- [📋 6. Regras de Negócio do Domínio](#6-regras-de-negocio-do-dominio)
  - [6.1 Núcleo Obrigatório (RN-01 até RN-07)](#61-nucleo-obrigatorio-rn-01-ate-rn-07)
  - [6.2 Evoluções do Produto (RN-08 até RN-10)](#62-evolucoes-do-produto-rn-08-ate-rn-10)
  - [6.3 Matriz de Demonstração das Regras](#63-matriz-de-demonstracao-das-regras)
- [🗺️ 7. Mapa do Domínio (Módulos e Entidades)](#7-mapa-do-dominio-modulos-e-entidades)
- [🖥️ 8. Telas Mínimas](#8-telas-minimas)
- [🛣️ 9. Rotas Esperadas da API](#9-rotas-esperadas-da-api)
- [🚀 10. Execução do Ambiente](#10-execucao-do-ambiente)
- [📐 11. Régua de Avaliação de Engenharia](#11-regua-de-avaliacao-de-engenharia)

---

<a id="1-visao-geral-do-produto"></a>
## 🎯 1. Visão Geral do Produto

<details open>
<summary><b>Expandir / Recolher Visão Geral</b></summary>
<br/>

### 1.1 O que é
Sistema de operação interna para restaurantes, bares e *food parks*.  
Conecta o atendimento do salão ao preparo da cozinha e ao fechamento no caixa — funcionando como um PDV simplificado.

### 1.2 Foco
Gerenciamento exclusivo do atendimento presencial:
$$\text{SALÃO} \longrightarrow \text{COZINHA} \longrightarrow \text{CAIXA}$$

### 1.3 Fora do Escopo Obrigatório
*Não faz parte do produto obrigatório:*
- Delivery
- Entregadores
- Endereço de entrega
- Frete
- Geolocalização
- Rastreio
- Marketplace
- Integração com iFood
- Pagamento online real

</details>

[⬆ Voltar ao Índice](#indice)

---

<a id="2-usuarios-e-papeis"></a>
## 👥 2. Usuários e Papéis

<details open>
<summary><b>Expandir / Recolher Usuários e Atribuições</b></summary>
<br/>

Cada papel atua em uma etapa diferente da operação do restaurante:

| Papel | Responsabilidades Declaradas |
| :--- | :--- |
| **Garçom** | Mesas · abrir pedido · adicionar itens · enviar à cozinha · acompanhar |
| **Cozinha** | Ver itens enviados · iniciar preparo · marcar como pronto |
| **Caixa** | Visualizar conta · registrar pagamentos · finalizar pedido |
| **Gerente** | Cardápio · cancelamentos · turnos · relatórios |

</details>

[⬆ Voltar ao Índice](#indice)

---

<a id="3-fluxo-principal-da-operacao"></a>
## 🔄 3. Fluxo Principal da Operação

<details open>
<summary><b>Expandir / Recolher Fluxo Principal</b></summary>
<br/>

A sequência oficial de uso do produto:

```mermaid
flowchart LR
    A([Login]) --> B[Abrir Mesa]
    B --> C[Criar Pedido]
    C --> D[Adicionar Itens]
    D --> E[Enviar à Cozinha]
    E --> F[Preparar]
    F --> G[Itens Prontos]
    G --> H[Pagamento]
    H --> I[Encerrar Pedido]
    I --> J([Mesa Disponível])
```

$$\text{Login} \rightarrow \text{abrir mesa} \rightarrow \text{criar pedido} \rightarrow \text{adicionar itens} \rightarrow \text{enviar à cozinha} \rightarrow \text{preparar} \rightarrow \text{itens prontos} \rightarrow \text{pagamento} \rightarrow \text{encerrar pedido} \rightarrow \text{mesa disponível}$$

</details>

[⬆ Voltar ao Índice](#indice)

---

<a id="4-stack-base-obrigatoria"></a>
## 🏗️ 4. Stack Base Obrigatória

<details>
<summary><b>Expandir / Recolher Definição da Stack Técnica</b></summary>
<br/>

Todos os desafios partem do mesmo ambiente técnico padronizado:

| Área | Tecnologia & Requisitos Declarados |
| :--- | :--- |
| **Front-end** | • React<br/>• JavaScript ou TypeScript<br/>• API REST<br/>• Formulários, estado, loading e feedback |
| **Back-end** | • Node.js + Express<br/>• JWT + hash de senha<br/>• Validação de entrada<br/>• Controle de acesso por papel |
| **Banco** | • PostgreSQL<br/>• Relacionamentos + constraints<br/>• Migrations / scripts<br/>• Seed quando necessário |
| **Infra** | • Docker + Docker Compose<br/>• frontend + backend + PostgreSQL<br/>• Ambiente sobe com `docker compose up` |
| **Engenharia** | • GitHub Projects<br/>• Issues + branches + PRs<br/>• $\ge$ 1 review antes do merge<br/>• README técnico |

</details>

[⬆ Voltar ao Índice](#indice)

---

<a id="5-maquinas-de-estados"></a>
## ⚙️ 5. Máquinas de Estados

<details open>
<summary><b>Expandir / Recolher Máquinas de Estados</b></summary>
<br/>

### 5.1 Estados do Pedido
- **Fluxo normal:** `open` $\longrightarrow$ `in_kitchen` $\longrightarrow$ `ready_to_pay` $\longrightarrow$ `closed`
- **Cancelamento:** pode existir antes de `closed`.
- **Validação:** transição inválida deve ser rejeitada.

```mermaid
stateDiagram-v2
    [*] --> open: Criar pedido
    open --> in_kitchen: Enviar itens à cozinha
    open --> canceled: Cancelar
    in_kitchen --> ready_to_pay: Itens prontos/cancelados (RN-06)
    in_kitchen --> canceled: Cancelar
    ready_to_pay --> closed: Conta paga integralmente (RN-07)
    ready_to_pay --> canceled: Cancelar
    closed --> [*]
    canceled --> [*]
```

---

### 5.2 Estados do Item
- **Fluxo normal:** `pending` $\longrightarrow$ `sent` $\longrightarrow$ `preparing` $\longrightarrow$ `ready` (ou `canceled`)
- **Restrição de alteração:** depois de `sent`, garçom e caixa não alteram quantidade, produto ou observação.

```mermaid
stateDiagram-v2
    [*] --> pending: Item adicionado
    pending --> sent: Enviado à cozinha (RN-04)
    pending --> canceled: Remover
    sent --> preparing: Iniciar preparo
    sent --> canceled: Cancelado por gerente (RN-05)
    preparing --> ready: Pronto
    preparing --> canceled: Cancelado por gerente (RN-05)
    ready --> canceled: Cancelado por gerente (RN-05)
    ready --> [*]
    canceled --> [*]
```

</details>

[⬆ Voltar ao Índice](#indice)

---

<a id="6-regras-de-negocio-do-dominio"></a>
## 📋 6. Regras de Negócio do Domínio

<details open>
<summary><b>Expandir / Recolher Regras de Negócio Oficiais</b></summary>
<br/>

### 6.1 Núcleo Obrigatório (RN-01 até RN-07)
*São o núcleo do domínio. A equipe precisa demonstrar as sete funcionando no código — não basta descrevê-las no README. Não existe "escolher as sete mais fáceis". O conjunto obrigatório já está definido.*

* **01 · Uma mesa não pode ter dois pedidos abertos**  
  Se já existir `order.status = open` para a mesa, POST de novo pedido deve responder `409 Conflict` e não criar registro.
* **02 · É obrigatório existir um turno aberto**  
  Pedido só nasce com `shift.status = open`. O turno não fecha enquanto houver pedido ativo do próprio shift.
* **03 · O pedido possui máquina de estados**  
  Fluxo normal: `open` $\rightarrow$ `in_kitchen` $\rightarrow$ `ready_to_pay` $\rightarrow$ `closed`. Cancelamento pode existir antes de `closed`; transição inválida deve ser rejeitada.
* **04 · O item também possui estados**  
  `pending` $\rightarrow$ `sent` $\rightarrow$ `preparing` $\rightarrow$ `ready` (ou `canceled`). Depois de `sent`, garçom e caixa não alteram quantidade, produto ou observação.
* **05 · Cancelar item enviado exige gerente**  
  Se o item está `sent`, `preparing` ou `ready`: apenas gerente cancela, com motivo persistido. Sem motivo $\rightarrow$ `422`; papel sem permissão $\rightarrow$ `403`.
* **06 · Pedido só vai para pagamento quando a cozinha terminar**  
  `in_kitchen` $\rightarrow$ `ready_to_pay` somente se TODOS os `order_items` estiverem `ready` ou `canceled`. Restou `pending`, `sent` ou `preparing`? Rejeitar.
* **07 · Pedido só fecha quando estiver pago**  
  Vários payments são permitidos. Só muda para `closed` quando `saldo_restante <= 0`. Fechar com saldo aberto $\rightarrow$ `409 Conflict`.

---

### 6.2 Evoluções do Produto (RN-08 até RN-10)
*Aumentam a profundidade do projeto e são ótimos diferenciais depois que o núcleo obrigatório estiver sólido.*

* **08 · Taxa de serviço**  
  Taxa opcional de 10%, calculada apenas sobre itens não cancelados.
* **09 · Snapshot de preço**  
  `unit_price` é congelado em `order_items` no lançamento. Alterar o cardápio depois não muda pedidos antigos; `available=false` sai de novas listagens.
* **10 · Fechamento financeiro do turno**  
  `total_turno` = soma dos payments dos pedidos do shift. O backend deriva do banco; o React não "inventa" faturamento.

---

### 6.3 Matriz de Demonstração das Regras

| Regra | Ação no Backend | Reflexo na Interface | Como Demonstrar |
| :--- | :--- | :--- | :--- |
| **RN-01** | Valida se a mesa já possui pedido aberto; retorna `409 Conflict` se houver tentativa de duplicação. | Bloqueia/indica mesa ocupada visualmente no mapa. | Tentar abrir novo pedido para uma mesa que já possui pedido aberto. |
| **RN-02** | Exige `shift.status = open` para criar pedido; impede fechar turno se houver pedidos ativos no shift. | Alerta ausência de turno aberto; bloqueia fechamento de turno em andamento. | Tentar criar pedido sem turno aberto ou tentar fechar turno com pedido ativo. |
| **RN-03** | Rejeita transições de status fora do fluxo ou após finalização. | Ações de transição de estado orientadas por etapa. | Tentar forçar transição inválida de status do pedido. |
| **RN-04** | Bloqueia alteração de dados do item quando status $\ne$ `pending`. | Trava campos de edição/exclusão do item após envio. | Tentar editar quantidade ou observação de item já em `sent`. |
| **RN-05** | Exige papel de gerente e motivo obrigatório para cancelar item enviado; valida `403` e `422`. | Exibe modal solicitando perfil de gerente e campo de justificativa. | Tentar cancelar item com garçom (403) ou com gerente sem informar motivo (422). |
| **RN-06** | Valida se todos os itens estão `ready` ou `canceled` antes de liberar para `ready_to_pay`. | Bloqueia envio para pagamento se houver itens pendentes/em preparo. | Tentar avançar pedido para pagamento com item ainda na cozinha. |
| **RN-07** | Permite múltiplos pagamentos; só permite mudar para `closed` quando `saldo_restante <= 0` (senão `409`). | Exibe saldo devedor e impede conclusão até quitação total. | Registrar pagamento parcial e tentar fechar a conta (409). |

</details>

[⬆ Voltar ao Índice](#indice)

---

<a id="7-mapa-do-dominio-modulos-e-entidades"></a>
## 🗺️ 7. Mapa do Domínio (Módulos e Entidades)

<details open>
<summary><b>Expandir / Recolher Mapa do Domínio</b></summary>
<br/>

*Estrutura explícita declarada no projeto para posterior modelagem pelo time:*

### Módulos Declarados
- autenticação
- usuários
- mesas
- cardápio
- pedidos
- itens do pedido
- KDS / cozinha
- pagamentos
- turnos
- relatório do turno

### Entidades Declaradas
- `users`
- `tables`
- `menu_items`
- `orders`
- `order_items`
- `payments`
- `shifts`

### Relação-Chave
$$\text{shift} \longrightarrow \text{orders} \longrightarrow \text{items / payments}$$

> *Nota: A modelagem estrutural das tabelas, tipos de dados, chaves e atributos será concebida diretamente pela equipe de engenharia.*

</details>

[⬆ Voltar ao Índice](#indice)

---

<a id="8-telas-minimas"></a>
## 🖥️ 8. Telas Mínimas

<details>
<summary><b>Expandir / Recolher Telas Obrigatórias</b></summary>
<br/>

Interfaces que sustentam o fluxo central:
1. **Login**
2. **Mapa de mesas**
3. **Pedido da mesa**
4. **KDS da cozinha**
5. **Caixa**
6. **Admin do cardápio**
7. **Admin do turno**

</details>

[⬆ Voltar ao Índice](#indice)

---

<a id="9-rotas-esperadas-da-api"></a>
## 🛣️ 9. Rotas Esperadas da API

<details>
<summary><b>Expandir / Recolher Rotas Esperadas</b></summary>
<br/>

*Exemplos declarados para orientar a API — a squad pode organizar endpoints equivalentes:*

### Rotas Principais
- `POST /auth/login`
- `GET /tables`
- `GET /menu-items`
- `POST /menu-items`
- `PATCH /menu-items/:id`
- `POST /orders`
- `GET /orders/:id`
- `PATCH /orders/:id/status`

### Continuação
- `POST /orders/:id/items`
- `PATCH /order-items/:id/status`
- `GET /kitchen/orders`
- `POST /orders/:id/payments`
- `POST /shifts`
- `PATCH /shifts/:id/close`
- `GET /shifts/:id/report`

> *As rotas precisam refletir as regras do domínio, não apenas CRUD genérico.*

</details>

[⬆ Voltar ao Índice](#indice)

---

<a id="10-execucao-do-ambiente"></a>
## 🚀 10. Execução do Ambiente

<details open>
<summary><b>Expandir / Recolher Instruções de Inicialização</b></summary>
<br/>

O projeto está configurado com **Bun** e **PostgreSQL 16**. Você pode executá-lo de duas formas: diretamente pelo **DevContainer** (recomendado para isolamento total) ou via **terminal local**.

---

### 10.1 Pré-requisitos
- [Docker](https://www.docker.com/) e Docker Compose instalados e em execução.
- [Bun](https://bun.sh/) $\ge$ v1.3.x (caso execute fora do DevContainer).
- [VS Code](https://code.visualstudio.com/) com a extensão **Dev Containers** (opcional, para modo container).

---

### 10.2 Configuração das Variáveis de Ambiente

Antes de iniciar, crie o arquivo `.env` na raiz do projeto com base no modelo:

```bash
cp .env.example .env
```

> **Atenção à URL do Banco:**  
> - Se estiver rodando o Bun **na sua máquina local (host)**, utilize:  
>   `DATABASE_URL="postgresql://mesafacil:mesafacil@localhost:5432/mesafacil?schema=public"`  
> - Se estiver dentro do **DevContainer**, utilize o host interno:  
>   `DATABASE_URL="postgresql://mesafacil:mesafacil@db:5432/mesafacil?schema=public"`

---

### 10.3 Opção A: Execução via DevContainer (Recomendado)

O DevContainer inicializa todo o ecossistema (Bun + PostgreSQL 16) de forma automatizada e isolada:

1. Abra a pasta do projeto no **VS Code**.
2. Pressione `F1` (ou `Ctrl + Shift + P`) e selecione:  
   **`Dev Containers: Reopen in Container`**
3. O VS Code construirá o ambiente e abrirá o terminal já conectado dentro do container Linux com o Bun instalado.
4. Para instalar as dependências e rodar:
   ```bash
   bun install
   bun run dev
   ```

---

### 10.4 Opção B: Execução Local no Host (Bun + Docker Compose)

Se preferir rodar o Bun diretamente no seu sistema operacional, utilize o Docker apenas para orquestrar o banco de dados:

1. **Subir apenas o serviço de banco de dados (PostgreSQL):**
   ```bash
   docker compose -f .devcontainer/docker-compose.yml up -d db
   ```

2. **Instalar dependências do projeto:**
   ```bash
   bun install
   ```

3. **Executar em modo desenvolvimento:**
   ```bash
   bun run dev
   ```

4. **Para parar o banco de dados:**
   ```bash
   docker compose -f .devcontainer/docker-compose.yml down
   ```

---

### 10.5 Serviços e Portas Padrão

| Serviço | Porta Local | Credenciais Padrão |
|---|---|---|
| **PostgreSQL** | `5432` | Usuário: `mesafacil` \| Senha: `mesafacil` \| DB: `mesafacil` |
| **Backend API** | `3001` | `http://localhost:3001` |
| **Frontend Web** | `5173` | `http://localhost:5173` |

</details>

[⬆ Voltar ao Índice](#indice)

---

<a id="11-regua-de-avaliacao-de-engenharia"></a>
## 📐 11. Régua de Avaliação de Engenharia

<details>
<summary><b>Expandir / Recolher Requisitos de Avaliação</b></summary>
<br/>

*O objetivo não é apenas "fazer telas e CRUDs" — é demonstrar engenharia de software profissional.*

### O Produto Precisa Provar:
- Modelagem de domínio
- Autenticação e autorização
- Regras no backend
- Persistência relacional
- Tratamento correto de erros

### A Squad Precisa Operar:
- Transações em operações críticas
- Integração React + API
- Organização de código
- Docker, Git e Pull Requests ($\ge$ 1 review antes do merge)
- Documentação técnica

</details>

[⬆ Voltar ao Índice](#indice)
