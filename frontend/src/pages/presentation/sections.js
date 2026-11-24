// Specs 023 e 024: conteúdo da página /apresentacao. Os trechos são cópias exatas do código, conferidas por
// tests/unit/presentationSnippets.test.js (arquivo e linha). Se o código mudar, atualize aqui.
export const GROUPS = [
  {
    "id": "poo",
    "title": "Programação Orientada a Objetos",
    "short": "POO",
    "intro": "O backend é organizado em classes: rotas chamam serviços, serviços chamam repositórios, e os erros formam uma hierarquia."
  },
  {
    "id": "solid",
    "title": "SOLID",
    "short": "SOLID",
    "intro": "Os cinco princípios aparecem na divisão em camadas, na hierarquia de erros e na troca de colaboradores nos testes."
  },
  {
    "id": "principios",
    "title": "KISS, YAGNI e DRY",
    "short": "KISS, YAGNI e DRY",
    "intro": "Preferimos a solução simples que resolve, deixamos de fora o que ainda não é necessário e mantemos cada regra num só lugar."
  },
  {
    "id": "padroes",
    "title": "Padrões de projeto",
    "short": "Padrões",
    "intro": "Padrões conhecidos que usamos, cada um com o trecho de código que o implementa."
  }
]

export const ENTRIES = [
  {
    "group": "poo",
    "id": "classes",
    "title": "Classes e encapsulamento",
    "concept": "Dados e comportamento juntos num objeto; o restante do sistema só usa a interface pública.",
    "where": "Cada repositório é uma classe que guarda a conexão e expõe métodos de consulta. Ninguém fora dele monta SQL de pedidos.",
    "file": "backend/src/repositories/OrderRepository.js",
    "line": 16,
    "code": "// Os métodos aceitam `db` para rodar dentro de uma transação (client do pool).\nexport class OrderRepository {\n  constructor(database = DatabaseConnection.getInstance()) {\n    this.database = database;\n  }\n\n  transaction(callback) {\n    return this.database.withTransaction(callback);\n  }",
    "note": null
  },
  {
    "group": "poo",
    "id": "privados",
    "title": "Métodos privados (#)",
    "concept": "Encapsulamento real da linguagem: métodos com # não podem ser chamados de fora da classe.",
    "where": "O OrderService esconde detalhes como travar o pedido; só as operações de negócio são públicas.",
    "file": "backend/src/services/OrderService.js",
    "line": 500,
    "code": "  async #lockOrder(orderId, db) {\n    const order = await this.orders.findById(orderId, { lock: true }, db);\n    if (!order) throw new NotFoundError('Pedido não encontrado.');\n    return order;\n  }",
    "note": null
  },
  {
    "group": "poo",
    "id": "heranca",
    "title": "Herança",
    "concept": "Subclasses reaproveitam e especializam a classe base.",
    "where": "Todos os erros de domínio herdam de AppError e só definem o status HTTP, o código e a mensagem padrão.",
    "file": "backend/src/errors/AppError.js",
    "line": 1,
    "code": "export class AppError extends Error {\n  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {\n    super(message);\n    this.name = new.target.name;\n    this.statusCode = statusCode;\n    this.code = code;\n    Error.captureStackTrace?.(this, new.target);\n  }\n}\n\nexport class BadRequestError extends AppError {\n  constructor(message = 'A requisição veio incompleta ou em formato inválido.') { super(message, 400, 'BAD_REQUEST'); }\n}\nexport class UnauthorizedError extends AppError {\n  constructor(message = 'Você não está logado. Faça login para continuar.') { super(message, 401, 'UNAUTHORIZED'); }\n}\nexport class ForbiddenError extends AppError {\n  constructor(message = 'Seu usuário não tem permissão para esta ação.') { super(message, 403, 'FORBIDDEN'); }",
    "note": null
  },
  {
    "group": "poo",
    "id": "composicao",
    "title": "Composição e injeção de dependência",
    "concept": "O objeto recebe os colaboradores de que precisa em vez de criá-los por dentro.",
    "where": "O OrderService é composto por repositórios e serviços passados no construtor, com padrões para a produção.",
    "file": "backend/src/services/OrderService.js",
    "line": 54,
    "code": "  constructor(\n    orderRepository = new OrderRepository(),\n    menuItemRepository = new MenuItemRepository(),\n    auditLogService = new AuditLogService(),\n    authService = new AuthService(),\n    stockRepository = new StockRepository(),\n    settingsService = new SettingsService()\n  ) {\n    this.settings = settingsService;\n    this.orders = orderRepository;\n    this.menuItems = menuItemRepository;\n    this.audit = auditLogService;\n    this.auth = authService;\n    this.stock = stockRepository;\n  }",
    "note": "Os valores padrão no construtor mantêm o uso simples; nos testes, os colaboradores são trocados por versões falsas."
  },
  {
    "group": "solid",
    "id": "s",
    "title": "S — Responsabilidade única",
    "concept": "Cada módulo tem um único motivo para mudar.",
    "where": "A rota só traduz HTTP (status, envelope); a regra fica no serviço e o SQL no repositório.",
    "file": "backend/src/routes/orderRoutes.js",
    "line": 8,
    "code": "const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });\n\n// Montado na raiz: o token é exigido rota a rota para não afetar caminhos de outros routers.\nrouter.post('/orders', authenticateToken, requireRole('waiter', 'manager'), async (req, res) =>\n  ok(res, await orderService.create(req.body, req.user), 201));",
    "note": null
  },
  {
    "group": "solid",
    "id": "o",
    "title": "O — Aberto/fechado",
    "concept": "Dá para estender o comportamento acrescentando código, sem alterar o existente.",
    "where": "Uma configuração nova entra como mais uma entrada em DEFINITIONS; leitura, validação e auditoria não mudam.",
    "file": "backend/src/services/SettingsService.js",
    "line": 6,
    "code": "const DEFINITIONS = {\n  maxItemQuantityPerLaunch: {\n    key: 'max_item_quantity_per_launch',\n    fallback: 10,\n    parse(value) {\n      if (!Number.isInteger(value) || value < 1 || value > 99) {\n        throw new DomainValidationError(\n          'O máximo de unidades iguais por lançamento deve ser um número inteiro de 1 a 99.'\n        );\n      }\n      return value;\n    }\n  }\n};",
    "note": null
  },
  {
    "group": "solid",
    "id": "l",
    "title": "L — Substituição de Liskov",
    "concept": "Qualquer subclasse pode ser usada onde a classe base é esperada.",
    "where": "O middleware de erros trata qualquer AppError do mesmo jeito: ConflictError, ForbiddenError etc. funcionam sem casos especiais.",
    "file": "backend/src/middlewares/errorMiddleware.js",
    "line": 14,
    "code": "export function errorMiddleware(error, req, res, next) {\n  if (res.headersSent) return next(error)\n\n  const appError = normalize(error)\n  if (appError) {\n    return res.status(appError.statusCode).json({\n      success: false,\n      error: appError.message,\n      code: appError.code,\n    })\n  }",
    "note": null
  },
  {
    "group": "solid",
    "id": "i",
    "title": "I — Segregação de interfaces",
    "concept": "Quem usa um módulo não deve depender do que não usa.",
    "where": "O hook useAction expõe só quatro itens (busy, error, clearError, run). As telas usam ações sem conhecer fetch nem estados internos.",
    "file": "frontend/src/hooks/useAction.js",
    "line": 3,
    "code": "// Executa uma chamada assíncrona controlando os estados de \"ocupado\" e de erro.\n// `run` resolve com true quando a ação termina sem erro.\nexport function useAction() {\n  const [busy, setBusy] = useState(false)\n  const [error, setError] = useState('')\n\n  async function run(action) {\n    setBusy(true)\n    setError('')\n    try {\n      await action()\n      return true\n    } catch (e) {\n      setError(e.message)\n      return false\n    } finally {\n      setBusy(false)\n    }\n  }\n\n  return { busy, error, clearError: () => setError(''), run }\n}",
    "note": "JavaScript não tem interfaces formais; o princípio aparece como módulos pequenos e focados."
  },
  {
    "group": "solid",
    "id": "d",
    "title": "D — Inversão de dependência",
    "concept": "Módulos de alto nível dependem de abstrações, não de implementações concretas.",
    "where": "O OrderService só precisa de objetos com os métodos certos. No teste, ele recebe repositórios falsos em memória, sem banco.",
    "file": "backend/tests/unit/orderService.test.js",
    "line": 13,
    "code": "function makeOrderService(overrides = {}) {\n  const orders = {\n    transaction: (callback) => callback({}),\n    lockById: async () => ({ id: '1', status: 'open', shiftId: '1', tableId: '1', serviceTax: true }),\n    findItemById: async () => ({ id: '10', orderId: '1', status: 'pending' }),\n    ...overrides.orders,\n  }\n  const menuItems = {\n    findAvailableById: async () => null,\n    ...overrides.menuItems,\n  }\n  const audit = { record: async () => {} }\n  return new OrderService(orders, menuItems, audit)\n}",
    "note": null
  },
  {
    "group": "principios",
    "id": "kiss-polling",
    "title": "KISS — polling em vez de WebSocket",
    "concept": "Manter simples: a solução mais simples que resolve o problema.",
    "where": "Salão, Caixa e Cozinha se atualizam com um temporizador que não sobrepõe chamadas, em vez de um canal de tempo real.",
    "file": "frontend/src/hooks/usePolling.js",
    "line": 28,
    "code": "    function schedule() {\n      clearTimeout(timer)\n      if (active && !hidden()) timer = setTimeout(tick, intervalMs)\n    }\n    async function tick() {\n      if (!active || running) return\n      running = true\n      setRefreshing(true)\n      try {\n        await saved.current(isActive)\n        if (active) setError('')\n      } catch (e) {\n        if (active) setError(e.message)\n      } finally {\n        running = false\n        setRefreshing(false)\n        schedule()\n      }\n    }",
    "note": "Atualiza a cada 5 a 10 s, não instantaneamente; para o volume de um restaurante, isso basta."
  },
  {
    "group": "principios",
    "id": "kiss-sql",
    "title": "KISS — SQL explícito",
    "concept": "Regras de dados no banco, de forma legível, sem camadas extras.",
    "where": "O saldo depois de cada movimento de estoque sai de uma única janela SQL (SUM OVER), sem ORM.",
    "file": "backend/src/repositories/StockRepository.js",
    "line": 52,
    "code": "      `WITH history AS (\n         SELECT sm.*, SUM(sm.quantity) OVER (ORDER BY sm.id) AS balance_after\n         FROM stock_movements sm\n         WHERE sm.ingredient_id = $1\n       )",
    "note": null
  },
  {
    "group": "principios",
    "id": "yagni-settings",
    "title": "YAGNI — só a configuração necessária",
    "concept": "Não construir o que ainda não é necessário.",
    "where": "A tabela de configurações nasceu com uma única chave permitida. Outras entram quando houver necessidade.",
    "file": "sql/migrations/020_create_settings.sql",
    "line": 10,
    "code": "    CONSTRAINT settings_key_check CHECK (key IN ('max_item_quantity_per_launch'))",
    "note": null
  },
  {
    "group": "principios",
    "id": "yagni-escopo",
    "title": "YAGNI — fora de escopo explícito",
    "concept": "Cada spec registra o que conscientemente não será feito.",
    "where": "A atualização automática deixou WebSocket para quando o polling não bastar.",
    "file": "docs/specs/020-atualizacao-automatica.md",
    "line": 56,
    "code": "- WebSocket ou Server-Sent Events (fica para quando o polling não bastar).",
    "note": null
  },
  {
    "group": "principios",
    "id": "dry-roles",
    "title": "DRY — uma regra de papel",
    "concept": "Cada conhecimento em um só lugar.",
    "where": "Toda checagem de papel passa por hasRole, que garante que o admin passa em tudo; ninguém compara user.role à mão.",
    "file": "backend/src/auth/roles.js",
    "line": 4,
    "code": "// O admin (superadmin) passa em toda checagem de papel. Use sempre este helper em vez de\n// comparar `user.role` diretamente, para não deixar o admin de fora sem perceber.\nexport const hasRole = (user, ...roles) =>\n  user?.role === 'admin' || roles.includes(user?.role);",
    "note": null
  },
  {
    "group": "principios",
    "id": "dry-labels",
    "title": "DRY — mensagens e rótulos compartilhados",
    "concept": "Textos e formatos repetidos ficam num módulo só.",
    "where": "A mensagem de permissão é montada num só lugar e usada pelo middleware e pelos serviços.",
    "file": "backend/src/domain/labels.js",
    "line": 38,
    "code": "// Quem pode fazer a ação (o admin passa em tudo e não é listado) e com que papel a pessoa entrou.\nexport function permissionMessage(allowedRoles, user, action = 'fazer isto') {\n  const roles = allowedRoles.filter((role) => role !== 'admin').map((role) => ROLE_LABELS[role] ?? role);\n  const who = roles.length ? `Só ${orList(roles)} ${roles.length > 1 ? 'podem' : 'pode'}` : 'Só o Administrador pode';\n  const current = user?.role ? ` Você entrou como ${ROLE_LABELS[user.role] ?? user.role}.` : '';\n  return `${who} ${action}.${current}`;\n}",
    "note": null
  },
  {
    "group": "padroes",
    "id": "repository",
    "title": "Repository",
    "concept": "Isola o acesso a dados atrás de uma classe com métodos de domínio.",
    "where": "O serviço pede findById(id, { lock: true }); o repositório decide o SQL e a trava FOR UPDATE.",
    "file": "backend/src/repositories/OrderRepository.js",
    "line": 53,
    "code": "  async findById(id, { lock = false } = {}, db = this.database) {\n    const { rows } = await db.query(\n      `SELECT o.id, o.table_id, o.shift_id, o.status, o.service_tax, o.created_at, t.number AS table_number,\n              o.cancellation_reason, o.canceled_by, cu.name AS canceled_by_name\n       FROM orders o\n       JOIN tables t ON t.id = o.table_id\n       LEFT JOIN users cu ON cu.id = o.canceled_by\n       WHERE o.id = $1\n       ${lock ? 'FOR UPDATE OF o' : ''}`,\n      [id]\n    );",
    "note": null
  },
  {
    "group": "padroes",
    "id": "service",
    "title": "Service Layer",
    "concept": "As regras de negócio ficam numa camada própria, entre a rota e o banco.",
    "where": "A reabertura da conta valida o estado, mantém os pagamentos e grava a auditoria na mesma transação.",
    "file": "backend/src/services/OrderService.js",
    "line": 341,
    "code": "    return this.orders.transaction(async (db) => {\n      const order = await this.#lockOrder(orderId, db);\n      if (order.status !== 'ready_to_pay') {\n        throw new ConflictError(\n          `Só dá para reabrir uma conta que está \"Aguardando pagamento\". Este pedido está ${orderStatus(order.status)}.`\n        );\n      }\n      const paidAmount = this.#effectivePaid(await this.orders.findPayments(orderId, db));\n      await this.orders.updateStatus(orderId, 'in_kitchen', db);\n      await this.audit.record(\n        {\n          userId: user.id,\n          shiftId: order.shiftId,\n          action: 'order.reopened',\n          entity: 'order',\n          entityId: order.id,\n          details: { reason: cleaned || null, paidAmount }\n        },\n        db\n      );\n      return { id: order.id, status: 'in_kitchen' };\n    });",
    "note": null
  },
  {
    "group": "padroes",
    "id": "singleton",
    "title": "Singleton",
    "concept": "Uma única instância compartilhada.",
    "where": "Um único pool de conexões com o PostgreSQL para toda a API.",
    "file": "backend/src/database/DatabaseConnection.js",
    "line": 6,
    "code": "export class DatabaseConnection {\n  static instance;\n\n  constructor() {\n    if (DatabaseConnection.instance) return DatabaseConnection.instance;\n    this.pool = new Pool({ connectionString: env.databaseUrl });\n    DatabaseConnection.instance = this;\n  }\n\n  static getInstance() {\n    return DatabaseConnection.instance ?? new DatabaseConnection();\n  }",
    "note": "Facilita o uso, mas é estado global: os repositórios aceitam outra conexão no construtor, o que mantém os testes possíveis."
  },
  {
    "group": "padroes",
    "id": "uow",
    "title": "Unit of Work (transação)",
    "concept": "Um conjunto de operações confirma ou desfaz tudo junto.",
    "where": "withTransaction abre BEGIN, executa o bloco e faz COMMIT ou ROLLBACK. Ação e auditoria nunca ficam pela metade.",
    "file": "backend/src/database/DatabaseConnection.js",
    "line": 23,
    "code": "  async withTransaction(callback) {\n    const client = await this.pool.connect();\n    try {\n      await client.query('BEGIN');\n      const result = await callback(client);\n      await client.query('COMMIT');\n      return result;\n    } catch (error) {\n      await client.query('ROLLBACK');\n      throw error;\n    } finally {\n      client.release();\n    }\n  }",
    "note": null
  },
  {
    "group": "padroes",
    "id": "chain",
    "title": "Middleware (Chain of Responsibility)",
    "concept": "A requisição passa por uma corrente de handlers; cada um decide seguir ou parar.",
    "where": "requireRole é uma fábrica de middleware: confere o papel e chama next() ou interrompe com 401/403.",
    "file": "backend/src/middlewares/authMiddleware.js",
    "line": 34,
    "code": "export function requireRole(...allowedRoles) {\n  return (req, res, next) => {\n    if (!req.user) return next(new UnauthorizedError('Você não está logado. Faça login para continuar.'));\n    if (!hasRole(req.user, ...allowedRoles)) {\n      return next(new ForbiddenError(permissionMessage(allowedRoles, req.user)));\n    }\n    return next();\n  };\n}",
    "note": null
  },
  {
    "group": "padroes",
    "id": "strategy",
    "title": "Strategy (tabela de funções)",
    "concept": "Escolhe o comportamento em tempo de execução por uma chave, sem if/else encadeado.",
    "where": "Cada ação da auditoria tem sua função que monta o texto; uma ação nova é só uma entrada nova.",
    "file": "frontend/src/utils/auditLabels.js",
    "line": 128,
    "code": "export function describeAudit(entry) {\n  const describe = DESCRIBERS[entry.action]\n  if (!describe) return { title: entry.action, summary: '' }\n  try {\n    return describe({ ...entry, details: entry.details ?? {} })\n  } catch {\n    return { title: entry.action, summary: '' }\n  }\n}",
    "note": null
  },
  {
    "group": "padroes",
    "id": "state",
    "title": "Máquina de estados",
    "concept": "Transições permitidas descritas como dados.",
    "where": "Quem pode levar o pedido a cada status (RN-03) fica numa tabela, consultada antes de qualquer transição.",
    "file": "backend/src/services/OrderService.js",
    "line": 32,
    "code": "const ORDER_TRANSITION_ROLES = {\n  in_kitchen: ['waiter', 'manager'],\n  ready_to_pay: ['waiter', 'manager'],\n  closed: ['cashier', 'manager'],\n  canceled: ['manager']\n};",
    "note": null
  },
  {
    "group": "padroes",
    "id": "adapter",
    "title": "Adapter",
    "concept": "Converte a interface de algo externo na interface que o sistema espera.",
    "where": "Erros do PostgreSQL (códigos SQLSTATE) viram AppErrors com status HTTP e mensagem para o usuário.",
    "file": "backend/src/errors/pgErrors.js",
    "line": 35,
    "code": "export function translatePgError(error) {\n  if (!error || typeof error.code !== 'string') return null\n\n  switch (error.code) {\n    case UNIQUE_VIOLATION:\n      return new ConflictError(\n        UNIQUE_MESSAGES[error.constraint] ?? 'Já existe um cadastro com esses dados (nome, e-mail ou número repetido).'\n      )\n    case FOREIGN_KEY_VIOLATION:\n      // Inserir referência inexistente (422) x apagar/alterar registro ainda referenciado (409).\n      return String(error.detail ?? '').includes('is not present in')\n        ? new DomainValidationError('Um dos itens escolhidos (mesa, item, insumo ou usuário) não existe mais. Atualize a tela e tente de novo.')\n        : new ConflictError('Este cadastro já é usado em pedidos ou movimentos e não pode ser apagado. Desative-o em vez de apagar.')",
    "note": null
  },
  {
    "group": "padroes",
    "id": "hooks",
    "title": "Custom Hooks",
    "concept": "Lógica de estado reutilizável entre componentes React.",
    "where": "usePolling devolve erro e indicador de atualização; KDS, Salão e Caixa usam o mesmo hook.",
    "file": "frontend/src/hooks/usePolling.js",
    "line": 10,
    "code": "export function usePolling(callback, intervalMs, { enabled = true } = {}) {\n  const saved = useRef(callback)\n  const [error, setError] = useState('')\n  // Verdadeiro enquanto uma atualização em segundo plano está em andamento (anima o botão \"Atualizar\").\n  const [refreshing, setRefreshing] = useState(false)",
    "note": null
  },
  {
    "group": "padroes",
    "id": "contract",
    "title": "Contract-First / Spec-Driven",
    "concept": "O contrato entre as partes é escrito antes do código.",
    "where": "O envelope da API foi definido no contrato e é seguido por backend (rotas) e frontend (api.js).",
    "file": "frontend/CONTRATO-API.md",
    "line": 16,
    "code": "- Sucesso: `{ \"success\": true, \"data\": ... }` — os formatos abaixo descrevem o conteúdo de `data`.\n- Erro: `{ \"success\": false, \"error\": \"mensagem\" }` — o frontend exibe `error` ao usuário.",
    "note": null
  },
  {
    "group": "padroes",
    "id": "contract-front",
    "title": "Contract-First no cliente",
    "concept": "O cliente HTTP desembrulha o envelope num lugar só.",
    "where": "As telas recebem só data; erros viram exceções com a mensagem do contrato.",
    "file": "frontend/src/services/api.js",
    "line": 56,
    "code": "async function request(method, path, body) {\n  const response = await send(method, path, body)\n  if (!response.ok) throw await failure(response)\n  const payload = await response.json().catch(() => null)\n  return payload?.data\n}",
    "note": null
  }
]
