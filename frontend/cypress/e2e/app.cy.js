function garantirTurnoAberto() {
  const apiUrl = Cypress.expose('API_URL') || 'http://localhost:3001'

  cy.request('POST', `${apiUrl}/auth/login`, {
    email: 'gerente@mesafacil.com',
    password: '123',
  }).then(({ body }) => {
    const headers = { Authorization: `Bearer ${body.data.token}` }

    cy.request({ url: `${apiUrl}/shifts/active`, headers }).then(({ body: active }) => {
      if (active.data?.status !== 'open') {
        cy.request({ method: 'POST', url: `${apiUrl}/shifts`, headers, body: { openingFloat: 100 } })
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
  cy.contains('section', 'Extrato da conta').find('input[name="amount"]').type('500')
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

    // Spec 012: o card do item abre o modal de quantidade e observação.
    cy.get('.menu-list .menu-pick').first().click()
    cy.get('dialog[open]').within(() => {
      cy.get('button[aria-label="Aumentar quantidade"]').click()
      cy.get('textarea[name="notes"]').type('E2E Cypress Smoke')
      cy.contains('button', 'Adicionar à comanda').click()
    })
    cy.get('dialog[open]').should('not.exist')
    cy.contains('[role="status"]', 'adicionado à comanda').should('be.visible')
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

  it('celular 375px: barra inferior navega e "Sair" fica na barra superior (spec 012)', () => {
    cy.viewport(375, 812)
    fazerLogin('caixa@mesafacil.com')
    cy.get('nav[aria-label="Menu principal"]').should('be.visible').within(() => {
      cy.contains('a', 'Salão').click()
    })
    cy.url().should('include', '/tables')
    garantirSemScrollHorizontal()
    cy.get('nav[aria-label="Menu principal"] a[aria-label="Minha conta"]').click()
    cy.url().should('include', '/account')
    cy.contains('button', /^Sair$/).click()
    cy.url().should('include', '/login')
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

  it('sangria pelo caixa sem ver o esperado; gerente vê o dinheiro esperado (RN-13)', () => {
    garantirTurnoAberto()
    const motivo = `Cofre E2E ${Date.now()}`

    fazerLogin('caixa@mesafacil.com')
    cy.contains('section', 'Gaveta: sangria e reforço').within(() => {
      cy.get('select[name="type"]').select('withdrawal')
      cy.get('input[name="amount"]').type('9999999')
      cy.get('input[name="reason"]').type('Acima da gaveta')
      cy.contains('button', 'Registrar movimento').click()
      cy.contains('A sangria é maior que o dinheiro disponível na gaveta.').should('be.visible')

      cy.get('input[name="amount"]').clear().type('10')
      cy.get('input[name="reason"]').clear().type(motivo)
      cy.contains('button', 'Registrar movimento').click()
      cy.contains('Sangria registrada com sucesso!').should('be.visible')
      cy.contains('td', motivo).should('be.visible')
    })
    cy.contains(/esperado/i).should('not.exist')
    sair()

    fazerLogin('gerente@mesafacil.com')
    cy.visit('/admin/shift')
    cy.contains('section', 'Dinheiro na gaveta').within(() => {
      cy.contains('Dinheiro esperado').should('be.visible')
    })
    cy.contains('section', 'Movimentos de caixa').within(() => {
      cy.contains('td', motivo).should('be.visible')
    })
  })

  it('caixa cancela item com o gerente autorizando no mesmo terminal (RN-17)', () => {
    garantirTurnoAberto()

    fazerLogin('garcom@mesafacil.com')
    abrirPrimeiraMesaLivre()
    cy.url()
      .then((url) => url.split('/').pop())
      .as('orderId')
    for (const index of [0, 1]) {
      cy.get('.menu-list .menu-pick').eq(index).click()
      cy.get('dialog[open]').contains('button', 'Adicionar à comanda').click()
      cy.get('dialog[open]').should('not.exist')
    }
    cy.contains('button', /Enviar para a cozinha/i).click()
    sair()

    fazerLogin('caixa@mesafacil.com')
    cy.get('@orderId').then((orderId) => {
      cy.contains('button.cash-table', `Comanda ativa · #${orderId}`).click()
    })
    cy.get('.bill-item').should('have.length', 2)
    cy.get('.bill-item button[aria-label^="Cancelar "]').first().click()

    cy.get('dialog[open]').within(() => {
      cy.contains('h2', 'Cancelar item com autorização')
      cy.get('textarea[name="reason"]').type('Cliente não recebeu o prato')
      cy.get('input[name="email"]').type('gerente@mesafacil.com')
      cy.get('input[name="password"]').type('senha-errada')
      cy.contains('button', 'Cancelar item').click()
      cy.contains('Autorização do gerente inválida.').should('be.visible')

      cy.get('input[name="password"]').type('123')
      cy.contains('button', 'Cancelar item').click()
    })
    cy.get('dialog[open]').should('not.exist')
    cy.contains('[role="status"]', 'autorizado por Gerente').should('be.visible')
    cy.get('.bill-item').should('have.length', 1)
    // A sessão do caixa continua ativa depois do 403.
    cy.url().should('include', '/cashier')

    // Limpeza: o gerente cancela o pedido (sem pagamento) para liberar a mesa.
    const apiUrl = Cypress.expose('API_URL') || 'http://localhost:3001'
    cy.request('POST', `${apiUrl}/auth/login`, { email: 'gerente@mesafacil.com', password: '123' }).then(({ body }) => {
      cy.get('@orderId').then((orderId) => {
        cy.request({
          method: 'PATCH',
          url: `${apiUrl}/orders/${orderId}/status`,
          headers: { Authorization: `Bearer ${body.data.token}` },
          body: { status: 'canceled', reason: 'Limpeza do teste E2E' },
        })
      })
    })
  })
})
