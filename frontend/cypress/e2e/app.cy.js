function garantirTurnoAberto() {
  const apiUrl = Cypress.expose('API_URL') || 'http://localhost:3001'

  cy.request('POST', `${apiUrl}/auth/login`, {
    email: 'gerente@mesafacil.com',
    password: '123',
  }).then(({ body }) => {
    const headers = { Authorization: `Bearer ${body.data.token}` }

    cy.request({ url: `${apiUrl}/shifts/active`, headers }).then(({ body: active }) => {
      if (active.data?.status !== 'open') {
        cy.request({ method: 'POST', url: `${apiUrl}/shifts`, headers })
      }
    })
  })
}

function fazerLogin(email, senha = '123') {
  cy.visit('/login')
  cy.get('#email').clear().type(email)
  cy.get('#password').clear().type(senha)
  cy.contains('button', /Entrar na plataforma/i).click()
  cy.url().should('not.include', '/login')
}

function sair() {
  cy.contains('button', /Sair da conta/i).click()
  cy.url().should('include', '/login')
}

function abrirPrimeiraMesaLivre() {
  cy.contains('button.table-card', 'Livre').first().click()
  cy.url().should('match', /\/orders\/\d+$/)
}

function garantirSemScrollHorizontal() {
  cy.window().then((win) => {
    expect(win.document.documentElement.scrollWidth).to.be.lte(win.innerWidth)
  })
}

function concluirPedidoNaCozinha(orderId) {
  fazerLogin('cozinha@mesafacil.com')
  cy.url().should('include', '/kitchen')

  cy.contains('.kds-card', `Pedido #${orderId}`).within(() => {
    cy.contains('button', 'Iniciar preparo').click()
    cy.contains('button', 'Pronto ✓').click()
  })

  cy.contains('.kds-card', `Pedido #${orderId}`).should('not.exist')
  sair()
}

function pedirConta(orderId) {
  fazerLogin('garcom@mesafacil.com')
  cy.visit(`/orders/${orderId}`)
  cy.contains('button', 'Pedir a conta').should('be.enabled').click()
  sair()
}

function pagarEFecharNoCaixa(orderId) {
  fazerLogin('caixa@mesafacil.com')
  cy.url().should('include', '/cashier')
  cy.contains('button.cash-table', `Comanda ativa · #${orderId}`).click()

  cy.contains('label', /Incluir 10% de taxa de serviço/i)
    .find('input[type="checkbox"]')
    .should('not.be.checked')
    .click()
    .should('be.checked')

  cy.contains('Taxa de serviço (10%)').should('be.visible')

  // Recarrega para comprovar persistência da taxa de serviço (RN-12)
  cy.reload()
  cy.contains('button.cash-table', `Comanda ativa · #${orderId}`).click()
  cy.contains('label', /Incluir 10% de taxa de serviço/i)
    .find('input[type="checkbox"]')
    .should('be.checked')

  cy.get('select[name="method"]').select('cash')
  cy.get('input[name="amount"]').type('500')
  cy.contains(/Troco estimado:/).should('be.visible')
  cy.contains('button', 'Adicionar pagamento').click()
  cy.contains('Pagamento registrado com sucesso!').should('be.visible')
  cy.contains(/^Troco: R\$/).should('be.visible')

  cy.contains('button', 'Finalizar pedido e liberar mesa').should('be.enabled').click()
  cy.contains('Pedido finalizado e mesa liberada com sucesso!').should('be.visible')
  sair()
}

describe('Fluxos ponta a ponta (Mesa Fácil)', () => {
  it('RBAC por papel e telas de administração (Users, Account e mobile 375px)', () => {
    fazerLogin('caixa@mesafacil.com')
    cy.url().should('include', '/cashier')
    cy.visit('/admin/users')
    cy.url().should('include', '/cashier')
    cy.visit('/kitchen')
    cy.url().should('include', '/cashier')
    cy.contains('h1', 'Frente de caixa').should('be.visible')
    sair()

    cy.viewport(375, 812)
    fazerLogin('admin@mesafacil.com')
    cy.url().should('include', '/admin/users')
    cy.contains('h1', 'Usuários').should('be.visible')
    garantirSemScrollHorizontal()

    cy.visit('/admin/shift')
    cy.contains('h1', 'Turno e relatório').should('be.visible')
    garantirSemScrollHorizontal()
  })

  it('ciclo operacional completo: Salão -> Comanda -> KDS -> Taxa + Troco -> Relatório', () => {
    garantirTurnoAberto()

    fazerLogin('garcom@mesafacil.com')
    cy.url().should('include', '/tables')
    abrirPrimeiraMesaLivre()

    cy.url()
      .then((url) => url.split('/').pop())
      .as('orderId')

    cy.get('.menu-list .add-btn').first().click()
    cy.get('input[name="notes"]').type('E2E Cypress Smoke')
    cy.contains('button', 'Adicionar à comanda').click()
    cy.contains('E2E Cypress Smoke').should('be.visible')

    cy.contains('button', /Enviar para a cozinha/i).click()
    cy.contains('button', 'Pedir a conta').should('be.disabled')
    sair()

    cy.get('@orderId').then((orderId) => {
      concluirPedidoNaCozinha(orderId)
      pedirConta(orderId)
      pagarEFecharNoCaixa(orderId)
    })

    fazerLogin('gerente@mesafacil.com')
    cy.visit('/admin/shift')
    cy.contains('h1', 'Turno e relatório').should('be.visible')
    cy.contains('Total do turno').should('be.visible')
    cy.contains('Pedidos encerrados').should('be.visible')
  })

  it('cancelamento gerencial de pedido com motivo obrigatório (RN-11)', () => {
    garantirTurnoAberto()

    fazerLogin('gerente@mesafacil.com')
    abrirPrimeiraMesaLivre()

    cy.contains('button', 'Cancelar pedido').click()
    cy.get('dialog[open]').within(() => {
      cy.get('textarea[name="reason"]').type('Cancelamento E2E')
      cy.contains('button', 'Cancelar pedido').click()
    })

    cy.contains('Cancelamento E2E').should('be.visible')
  })
})
