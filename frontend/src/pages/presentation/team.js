// Spec 024: equipe e processo na página /apresentacao, a partir do relatório interno de participação.
// Só dados já públicos no README (nome e usuário do GitHub). Números contados até 24/11/2026.

export const MEMBERS = [
  {
    id: 'paulo',
    name: 'Paulo Henrique',
    github: 'PauloHenrrq',
    role: 'Tech Lead, Product Owner e QA',
    summary:
      'Responsável pela governança, pela priorização do backlog e pela qualidade das entregas, como parceiro de revisão e suporte técnico de toda a equipe.',
    areas: [
      {
        title: 'Gestão e organização',
        items: [
          'Backlog inicial em issues por frente ([BD], [BACKEND], [FRONTEND], [INFRA], [TEST]), incluindo o plano das regras RN-01 a RN-10.',
          'Guia da Sprint 1 (docs/SPRINT_1.md): meta da semana, divisão em duplas e contrato da API.',
          'Configuração inicial do repositório, template de PR e documentação de produto; README reorganizado para a apresentação.',
        ],
      },
      {
        title: 'Qualidade e revisão',
        items: [
          'Revisou 75 PRs de outros integrantes e fez o merge de 74.',
          'Aplicou ajustes de QA direto nas branches antes de aprovar.',
          'CI de guardrails (#79) e suítes Vitest e Cypress validadas no CI (#91).',
        ],
      },
      {
        title: 'Código',
        items: [
          'Condição de corrida na trava de turno (RN-02) e UX do caixa (#80).',
          'Taxa de serviço, bloqueio de pagamento acima do saldo e troco (RN-12, #81).',
          'Ordem das validações no preparo dos itens (#172) e Comanda somente leitura para o caixa (#173).',
        ],
      },
    ],
    numbers: [
      ['PRs próprios', '11'],
      ['PRs revisados', '75'],
      ['Commits', '~130'],
      ['Issues', '22'],
    ],
  },
  {
    id: 'rodolfo',
    name: 'Rodolfo Bertini',
    github: 'rodox83br',
    role: 'Infraestrutura/DevOps e engenharia full-stack',
    summary:
      'Criou o repositório e a infraestrutura de desenvolvimento e, a partir de novembro, conduziu a maior parte da evolução funcional no fluxo spec → issue → PR.',
    areas: [
      {
        title: 'Infraestrutura',
        items: [
          'Repositório e devcontainer com Bun (#8).',
          'Docker Compose com banco, backend e frontend (#41, #42).',
          'Testes de integração em PostgreSQL real e CI (#60).',
        ],
      },
      {
        title: 'Backend e regras de negócio',
        items: [
          'Rotas de mesas, turnos, pedidos e caixa (#44).',
          'Cardápio, KDS, cancelamento auditado (RN-11) e relatório do turno (RN-10).',
          'Usuários e superadmin (RN-16), movimentos de caixa (RN-13), conferência cega (RN-14), sangria com autorização (RN-18).',
          'Estoque, ficha técnica e CMV (RN-15), limite de tentativas de senha (RN-19) e trilha de auditoria (RN-20).',
          'Reabertura de conta, mensagens de erro informativas e limite de itens por lançamento (RN-21).',
        ],
      },
      {
        title: 'Frontend',
        items: [
          'Integrou o frontend base do Kauan e o alinhou à documentação (#40).',
          'Telas de KDS, cardápio, turno, usuários, sangria, insumos, auditoria e configurações.',
          'Revisão de UX (spec 012) e atualização automática do Salão e do Caixa (spec 020).',
        ],
      },
      {
        title: 'Especificação e documentação',
        items: [
          'Specs 001 a 024 em docs/specs/.',
          'Roteiro de demonstração e script de prova das regras.',
          'Contrato da API e matriz de regras.',
        ],
      },
    ],
    numbers: [
      ['PRs próprios', '80'],
      ['Commits', '~180'],
      ['Issues', '47'],
      ['Specs', '24'],
    ],
  },
  {
    id: 'jadson',
    name: 'Jadson Laurindo',
    github: 'jadsonelorraine',
    role: 'Banco de dados',
    summary: 'Modelagem relacional, migrations, constraints e seeds SQL das tabelas operacionais.',
    areas: [
      {
        title: 'Entregas (PRs #31 a #37)',
        items: [
          'Correção do hash bcrypt dos usuários caixa e gerente (#31).',
          'Tabelas shifts (RN-02), tables, menu_items, orders (RN-01), order_items (RN-05, RN-09) e payments (RN-07), com seeds.',
          'Primeira proposta das regras RN-01 a RN-07 (#30), depois incorporada à API do #44.',
        ],
      },
    ],
    numbers: [
      ['PRs próprios', '7'],
      ['Commits', '15'],
      ['Issues', '1'],
    ],
  },
  {
    id: 'abraao',
    name: 'Abraão Alves',
    github: 'AbraaoAlvs',
    role: 'Backend, autenticação e tratamento de erros',
    summary: 'Autenticação com JWT, middlewares e o tratamento padronizado de erros da API.',
    areas: [
      {
        title: 'Entregas',
        items: [
          'Tabela users e seed inicial (#12), base do login.',
          'Login com JWT e testes automatizados (#38).',
          'CORS e tradução dos erros do PostgreSQL em respostas da API (#39), base das mensagens de erro da spec 021.',
        ],
      },
    ],
    numbers: [
      ['PRs próprios', '3'],
      ['Commits', '6'],
    ],
  },
  {
    id: 'kauan',
    name: 'Kauan Santos',
    github: 'kauansantos01',
    role: 'Frontend',
    summary: 'Frontend e interfaces de operação em React.',
    areas: [
      {
        title: 'Entregas',
        items: [
          'Frontend base em React/Vite: estrutura do app, login, salão, comanda e caixa.',
          'O trabalho foi enviado ao Rodolfo, que o publicou como o commit "Frontend" do PR #40 (25 arquivos).',
        ],
      },
    ],
    numbers: [['Arquivos no frontend base', '25']],
    note: 'O trabalho entrou pela conta do Rodolfo; por isso não há commits nem PRs na conta do Kauan.',
  },
]

export const MEASUREMENT = [
  'Fontes: histórico do Git, PRs, revisões e issues no GitHub, a seção de equipe do README e o docs/SPRINT_1.md.',
  'Commits medem quem publicou, não quem fez: o frontend base do Kauan entrou pela conta do Rodolfo, e os números do Paulo incluem merges e ajustes feitos durante a revisão.',
  'Revisões contam PRs distintos de outras pessoas; a revisão automática do Copilot não entra.',
  'Linhas de código não foram usadas: favorecem arquivos gerados e não refletem complexidade nem valor.',
  'Reuniões, dailies e trocas de arquivos só aparecem onde ficaram registradas nos documentos.',
]

export const PRACTICES = [
  {
    title: 'Contract-First',
    text: 'O contrato da API (docs/SPRINT_1.md e depois frontend/CONTRATO-API.md) definiu payloads e o envelope de erro antes do código. Banco, backend e frontend avançaram em paralelo.',
  },
  {
    title: 'Divisão por domínio',
    text: 'Pastas por área (sql/, backend/, frontend/, docker/), branches curtas por funcionalidade (feat/, fix/, chore/, docs/) e nenhum commit direto na main.',
  },
  {
    title: 'Spec-Driven Development',
    text: 'A partir de 18/11, cada funcionalidade nasceu como spec em docs/specs/, com regras, contrato, critérios de aceite e o que fica fora de escopo. A spec vira issue, e a issue vira PR com "Closes #N".',
  },
  {
    title: 'Revisão, QA e CI',
    text: 'Todo PR passa por revisão e pelo CI: testes de backend em PostgreSQL real, Vitest, Cypress de ponta a ponta e guardrails (ESM, higiene do repositório, fim de linha). Na reta final, os PRs entraram depois de uma revisão de QA independente e com o CI verde.',
  },
  {
    title: 'Gestão',
    text: 'Backlog no GitHub Issues com rótulos por área, tipo, fase e prioridade (P0 a P3), e dailies assíncronas de três linhas: entregue, próximo passo e bloqueios.',
  },
]

export const FLOW = ['Spec', 'Issue', 'Branch', 'PR com testes', 'Revisão e CI', 'Merge']

export const FACTS = [
  ['PRs mergeados', '101'],
  ['Specs', '24'],
  ['Integrantes', '5'],
]
