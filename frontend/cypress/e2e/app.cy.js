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

    // 8 telas do admin: 4 na barra inferior e o resto em "Mais" (sem rolagem na barra).
    cy.get('nav[aria-label="Menu principal"]').then(($nav) => {
      expect($nav[0].scrollWidth).to.be.at.most($nav[0].clientWidth)
    })
    cy.get('button[aria-label="Mais telas"]').click()
    cy.get('dialog[open]').contains('a', 'Turno e relatório').click()
    cy.get('dialog[open]').should('not.exist')
    cy.url().should('include', '/admin/shift')
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

  it('sangria pelo caixa sem ver o esperado, com o gerente autorizando acima do limite; gerente vê o esperado (RN-13, RN-18)', () => {
    garantirTurnoAberto()
    const motivo = `Cofre E2E ${Date.now()}`

    fazerLogin('caixa@mesafacil.com')
    cy.contains('section', 'Gaveta: sangria e reforço').within(() => {
      // Reforço garante dinheiro na gaveta para a sangria autorizada (que volta a checar o esperado).
      cy.get('select[name="type"]').select('reinforcement')
      cy.get('input[name="amount"]').type('300')
      cy.get('input[name="reason"]').type('Troco do banco')
      cy.contains('button', 'Registrar movimento').click()
      cy.contains('Reforço registrado com sucesso!').should('be.visible')

      // RN-18: acima do limite, o gerente autoriza no mesmo terminal (senha errada primeiro).
      cy.get('select[name="type"]').select('withdrawal')
      cy.get('input[name="amount"]').type('250')
      cy.contains('fieldset', 'Autorização do gerente').should('be.visible')
      cy.get('input[name="reason"]').type(`${motivo} autorizada`)
      cy.get('input[name="approverEmail"]').type('gerente@mesafacil.com')
      cy.get('input[name="approverPassword"]').type('senha-errada')
      cy.contains('button', 'Registrar movimento').click()
      cy.contains('Autorização do gerente inválida.').should('be.visible')
      cy.get('input[name="approverPassword"]').should('have.value', '').type('123')
      cy.contains('button', 'Registrar movimento').click()
      cy.contains('Sangria registrada com sucesso!').should('be.visible')
      cy.contains('td', `${motivo} autorizada`).should('contain', 'autorizada por Gerente')

      // Até o limite, a sangria do caixa entra só com valor e motivo.
      cy.get('input[name="amount"]').type('10')
      cy.contains('fieldset', 'Autorização do gerente').should('not.exist')
      cy.get('input[name="reason"]').type(motivo)
      cy.contains('button', 'Registrar movimento').click()
      cy.contains('Sangria registrada com sucesso!').should('be.visible')
      cy.contains('td', new RegExp(`^${motivo}`)).should('be.visible')
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

    // RN-20: a auditoria do gerente mostra o cancelamento autorizado por ele.
    sair()
    fazerLogin('gerente@mesafacil.com')
    cy.contains('nav a', 'Auditoria').click({ force: true })
    cy.contains('h1', 'Auditoria')
    cy.contains('button', 'Cancelamentos').click()
    cy.get('@orderId').then((orderId) => {
      const doPedido = `:contains("Pedido ${orderId} ·")`
      cy.get('.audit-entry')
        .filter(doPedido)
        .filter(':contains("Cancelou item")')
        .should('have.length', 1)
        .and('contain', 'Motivo: Cliente não recebeu o prato')
        .and('contain', 'autorizado por Gerente')
        .and('contain', 'Caixa')
      cy.get('.audit-entry').filter(doPedido).filter(':contains("Cancelou pedido")').should('have.length', 1)
    })
  })

  it('insumos: entrada, ficha técnica e baixa automática no envio à cozinha (RN-15)', () => {
    garantirTurnoAberto()
    const estoquePicanha = () =>
      cy
        .get('article[aria-label="Picanha"] .ingredient-stock')
        .invoke('text')
        .then((text) => Number(text.replace(/[^0-9,-]/g, '').replace(',', '.')))

    fazerLogin('gerente@mesafacil.com')
    cy.visit('/admin/ingredients')
    cy.get('article[aria-label="Picanha"]').within(() => cy.contains('button', 'Entrada').click())
    cy.get('dialog[open]').within(() => {
      cy.get('input[type="number"]').first().type('1')
      cy.contains('button', 'Registrar entrada').click()
    })
    cy.contains('[role="status"]', 'Entrada registrada: Picanha').should('be.visible')
    estoquePicanha().as('antes')

    cy.visit('/admin/menu')
    cy.contains('.menu-item', 'Picanha na Chapa').contains('button', 'Ficha técnica').click()
    cy.get('dialog[open]').within(() => {
      cy.contains('Custo estimado').should('be.visible')
      cy.get('select').should('have.length.at.least', 1)
      cy.contains('button', 'Cancelar').click()
    })
    sair()

    fazerLogin('garcom@mesafacil.com')
    abrirPrimeiraMesaLivre()
    cy.url()
      .then((url) => url.split('/').pop())
      .as('orderId')
    cy.contains('.menu-pick', 'Picanha na Chapa').click()
    cy.get('dialog[open]').contains('button', 'Adicionar à comanda').click()
    cy.get('dialog[open]').should('not.exist')
    cy.contains('button', /Enviar para a cozinha/i).click()
    cy.contains('Enviado').should('be.visible')
    sair()

    // Limpeza logo depois do envio (a baixa já aconteceu e cancelar não devolve estoque): assim a
    // mesa é liberada mesmo se a conferência abaixo falhar.
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

    fazerLogin('gerente@mesafacil.com')
    cy.visit('/admin/ingredients')
    cy.get('@antes').then((antes) => {
      // A ficha do seed usa 0,400 kg de picanha por prato.
      estoquePicanha().should('be.closeTo', antes - 0.4, 0.0001)
    })

    // Spec 016: o histórico mostra a baixa da venda (com o pedido de origem) e a entrada.
    cy.get('article[aria-label="Picanha"]').within(() => cy.contains('button', 'Histórico').click())
    cy.get('dialog[open]').within(() => {
      cy.contains('h2', 'Histórico · Picanha')
      cy.get('@orderId').then((orderId) => {
        cy.get('tbody tr').first().should('contain', 'Venda').and('contain', `Pedido ${orderId}`).and('contain', '−0,4 kg')
      })
      cy.contains('button', 'Entradas').click()
      cy.get('tbody tr').first().should('contain', 'Entrada').and('contain', '+1 kg')
      cy.get('tbody tr').should('not.contain', 'Venda')

      // Spec 018: só o turno atual mostra a venda com o resumo, e o CSV traz a linha da venda.
      cy.contains('button', 'Todos').click()
      cy.contains('button', 'Só o turno atual').click().should('have.attr', 'aria-pressed', 'true')
      cy.get('@orderId').then((orderId) => {
        cy.get('tbody tr').first().should('contain', 'Venda').and('contain', `Pedido ${orderId}`)
      })
      cy.get('[role="status"]').should('contain', 'movimento').and('contain', 'saídas −')

      cy.intercept('GET', '**/ingredients/*/movements.csv*').as('csv')
      cy.contains('button', 'Exportar CSV').click()
      cy.wait('@csv').then(({ request, response }) => {
        expect(request.url).to.include('shiftId=')
        expect(response.statusCode).to.eq(200)
        expect(response.headers['content-disposition']).to.match(/historico-picanha-\d{4}-\d{2}-\d{2}\.csv/)
        cy.get('@orderId').then((orderId) => {
          const sale = String(response.body)
            .split('\r\n')
            .find((line) => line.includes(';venda;') && line.includes(`;${orderId};`))
          expect(sale, 'linha da venda no CSV').to.include('-0,4;kg')
        })
      })
      cy.contains('button', 'Exportar CSV').should('be.enabled')
    })
  })

  it('fechamento com conferência cega: caixa conta, gerente confere e encerra (RN-14)', () => {
    garantirTurnoAberto()

    fazerLogin('caixa@mesafacil.com')
    cy.url().should('include', '/cashier')
    cy.contains('section', 'Gaveta: sangria e reforço').within(() => {
      cy.contains('h3', 'Contagem de fechamento')
      cy.get('input[name="cash"]').type('1')
      cy.get('input[name="card"]').type('0')
      cy.get('input[name="pix"]').type('0')
      cy.contains('button', /Registrar contagem|Contar de novo/).click()
      cy.contains(/Contagem registrada às/).should('be.visible')
    })
    cy.contains(/esperado/i).should('not.exist')
    sair()

    fazerLogin('gerente@mesafacil.com')
    cy.visit('/admin/shift')
    cy.get('section[aria-labelledby="closing-title"]').within(() => {
      cy.contains('th', 'Esperado')
      cy.contains('td', 'Dinheiro').should('be.visible')
      cy.get('textarea[name="reason"]').type('Conferência do teste E2E')
      cy.contains('button', 'Encerrar turno').click()
    })
    cy.contains('Relatório do turno').should('contain', '(fechado)')
    cy.contains(/Motivo da diferença: Conferência do teste E2E/).should('be.visible')
  })
})
