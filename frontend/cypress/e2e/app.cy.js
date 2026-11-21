const API_URL = 'http://localhost:3001'

function apiLogin(email, password = '123') {
  return cy.request('POST', `${API_URL}/auth/login`, { email, password }).then((res) => {
    expect(res.status).to.eq(200)
    return res.body.data.token
  })
}

function ensureOpenShift(token) {
  return cy
    .request({
      url: `${API_URL}/shifts/active`,
      headers: { Authorization: `Bearer ${token}` },
    })
    .then((res) => {
      if (res.body.data?.status === 'open') return res.body.data.id
      return cy
        .request({
          method: 'POST',
          url: `${API_URL}/shifts`,
          headers: { Authorization: `Bearer ${token}` },
        })
        .then((openRes) => {
          expect(openRes.status).to.eq(201)
          return openRes.body.data.id
        })
    })
}

function loadOperationalFixture() {
  return apiLogin('gerente@mesafacil.com').then((token) =>
    ensureOpenShift(token).then(() =>
      cy
        .request({ url: `${API_URL}/tables`, headers: { Authorization: `Bearer ${token}` } })
        .then((tablesRes) => {
          const freeTable = tablesRes.body.data.find((t) => t.status === 'available')
          expect(freeTable, 'mesa disponível').to.be.an('object')
          return cy
            .request({ url: `${API_URL}/menu-items`, headers: { Authorization: `Bearer ${token}` } })
            .then((menuRes) => {
              const item = menuRes.body.data[0]
              expect(item, 'item do cardápio').to.be.an('object')
              return { freeTable, item }
            })
        }),
    ),
  )
}

function uiLogin(email, password = '123') {
  cy.visit('/login')
  cy.get('#email').clear().type(email)
  cy.get('#password').clear().type(password)
  cy.contains('button', /Entrar na plataforma/i).click()
  cy.location('pathname').should('not.eq', '/login')
}

function logout() {
  cy.contains('button', /Sair da conta/i).click()
  cy.location('pathname').should('eq', '/login')
}

function openTableCard(tableNumber) {
  cy.contains('button.table-card strong', new RegExp(`^${tableNumber}$`))
    .closest('button.table-card')
    .click()
}

function assertNoHorizontalOverflow() {
  cy.window().then((win) => {
    expect(win.document.documentElement.scrollWidth).to.be.lte(win.innerWidth)
  })
}

describe('Fluxos ponta a ponta (Mesa Fácil)', () => {
  it('RBAC por papel e telas de administração (Users, Account e mobile 375px)', () => {
    // 1) Caixa redireciona para /cashier e é barrado em rotas de admin/cozinha
    uiLogin('caixa@mesafacil.com')
    cy.location('pathname').should('eq', '/cashier')
    cy.visit('/admin/users')
    cy.location('pathname').should('eq', '/cashier')
    cy.visit('/kitchen')
    cy.location('pathname').should('eq', '/cashier')
    logout()

    // 2) Superadmin acessa /admin/users e /admin/shift sem overflow horizontal no mobile (375px)
    cy.viewport(375, 812)
    uiLogin('admin@mesafacil.com')
    cy.location('pathname').should('eq', '/admin/users')
    cy.contains('h1', 'Usuários').should('be.visible')
    assertNoHorizontalOverflow()

    cy.visit('/admin/shift')
    cy.contains('h1', 'Turno e relatório').should('be.visible')
    assertNoHorizontalOverflow()
  })

  it('ciclo operacional completo: Salão -> Comanda -> KDS -> Taxa + Troco -> Relatório', () => {
    loadOperationalFixture().then(({ freeTable, item }) => {
      // 1) Garçom abre mesa livre, lança item e envia à cozinha
      uiLogin('garcom@mesafacil.com')
      cy.location('pathname').should('eq', '/tables')
      openTableCard(freeTable.number)

      cy.location('pathname')
        .should('match', /^\/orders\/\d+$/)
        .then((pathname) => {
          const orderId = pathname.split('/').pop()

          cy.get(`button[aria-label="Adicionar ${item.name}"]`).click()
          cy.get('input[name="notes"]').type('E2E Cypress Smoke')
          cy.contains('button', 'Adicionar à comanda').click()
          cy.contains('E2E Cypress Smoke').should('be.visible')

          cy.contains('button', /Enviar para a cozinha/i).click()
          cy.contains('button', 'Pedir a conta').should('be.disabled')
          logout()

          // 2) Cozinha recebe no KDS e conclui preparo
          uiLogin('cozinha@mesafacil.com')
          cy.location('pathname').should('eq', '/kitchen')
          cy.contains('.kds-card', `Pedido #${orderId}`).within(() => {
            cy.contains('button', 'Iniciar preparo').click()
            cy.contains('button', 'Pronto ✓').click()
          })
          cy.contains('.kds-card', `Pedido #${orderId}`).should('not.exist')
          logout()

          // 3) Garçom libera para pagamento (RN-06)
          uiLogin('garcom@mesafacil.com')
          cy.visit(`/orders/${orderId}`)
          cy.contains('button', 'Pedir a conta').should('be.enabled').click()
          logout()

          // 4) Caixa testa taxa persistida (RN-12), paga em dinheiro com troco e encerra
          uiLogin('caixa@mesafacil.com')
          cy.location('pathname').should('eq', '/cashier')
          cy.contains('button.cash-table', `Comanda ativa · #${orderId}`).click()

          cy.contains('label', /Incluir 10% de taxa de serviço/i)
            .find('input[type="checkbox"]')
            .as('taxCheckbox')
          cy.get('@taxCheckbox').should('not.be.checked').click()
          cy.get('@taxCheckbox').should('be.checked')
          cy.contains('Taxa de serviço (10%)').should('be.visible')

          cy.reload()
          cy.contains('button.cash-table', `Comanda ativa · #${orderId}`).click()
          cy.contains('label', /Incluir 10% de taxa de serviço/i)
            .find('input[type="checkbox"]')
            .should('be.checked')

          const overpay = Number((Number(item.price) * 1.1 + 10).toFixed(2))
          cy.get('select[name="method"]').select('cash')
          cy.get('input[name="amount"]').type(String(overpay))
          cy.contains(/Troco estimado:/).should('be.visible')
          cy.contains('button', 'Adicionar pagamento').click()
          cy.contains(/Pagamento registrado com sucesso! Troco: R\$/).should('be.visible')

          cy.contains('button', 'Finalizar pedido e liberar mesa').should('be.enabled').click()
          cy.contains('Pedido finalizado e mesa liberada com sucesso!').should('be.visible')
          logout()

          // 5) Gerente valida relatório do turno (RN-10)
          uiLogin('gerente@mesafacil.com')
          cy.visit('/admin/shift')
          cy.contains('h1', 'Turno e relatório').should('be.visible')
          cy.contains('Total do turno').should('be.visible')
          cy.contains('Pedidos encerrados').should('be.visible')
        })
    })
  })

  it('cancelamento gerencial de pedido com motivo obrigatório (RN-11)', () => {
    loadOperationalFixture().then(({ freeTable }) => {
      uiLogin('gerente@mesafacil.com')
      openTableCard(freeTable.number)
      cy.location('pathname').should('match', /^\/orders\/\d+$/)

      cy.contains('button', 'Cancelar pedido').click()
      cy.get('dialog[open]').within(() => {
        cy.get('textarea[name="reason"]').type('Cancelamento E2E')
        cy.contains('button', 'Cancelar pedido').click()
      })
      cy.contains('Cancelamento E2E').should('be.visible')
    })
  })
})
