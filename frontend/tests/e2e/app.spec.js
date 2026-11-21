import { expect, test } from '@playwright/test'

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001'

async function apiLogin(request, email, password = '123') {
  const res = await request.post(`${API_URL}/auth/login`, { data: { email, password } })
  expect(res.ok()).toBeTruthy()
  return (await res.json()).data.token
}

async function ensureOpenShift(request, managerToken) {
  const activeRes = await request.get(`${API_URL}/shifts/active`, {
    headers: { Authorization: `Bearer ${managerToken}` },
  })
  expect(activeRes.ok()).toBeTruthy()
  const active = (await activeRes.json()).data
  if (active?.status === 'open') return active.id

  const openRes = await request.post(`${API_URL}/shifts`, {
    headers: { Authorization: `Bearer ${managerToken}` },
  })
  expect(openRes.status()).toBe(201)
  return (await openRes.json()).data.id
}

async function uiLogin(page, email, password = '123') {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(password)
  await page.getByRole('button', { name: /Entrar na plataforma/i }).click()
  await expect(page).not.toHaveURL(/\/login$/)
}

async function logout(page) {
  await page.getByRole('button', { name: /Sair da conta/i }).click()
  await expect(page).toHaveURL(/\/login$/)
}

async function openTableCard(page, tableNumber) {
  await page
    .locator('button.table-card', {
      has: page.locator('strong', { hasText: new RegExp(`^${tableNumber}$`) }),
    })
    .click()
}

test.describe('Fluxos ponta a ponta (Mesa Fácil)', () => {
  test('RBAC por papel e telas de administração (Users, Account e mobile 375px)', async ({ page }) => {
    // 1) Caixa redireciona para /cashier e é barrado em rotas de admin/cozinha
    await uiLogin(page, 'caixa@mesafacil.com')
    await expect(page).toHaveURL(/\/cashier$/)
    await page.goto('/admin/users')
    await expect(page).toHaveURL(/\/cashier$/)
    await page.goto('/kitchen')
    await expect(page).toHaveURL(/\/cashier$/)
    await logout(page)

    // 2) Superadmin acessa /admin/users e verifica ausência de overflow horizontal no celular (375px)
    await page.setViewportSize({ width: 375, height: 812 })
    await uiLogin(page, 'admin@mesafacil.com')
    await expect(page).toHaveURL(/\/admin\/users$/)
    await expect(page.getByRole('heading', { name: 'Usuários' })).toBeVisible()
    const usersOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    expect(usersOverflow).toBe(false)

    // 3) Admin também acessa relatório do turno sem overflow horizontal no mobile (PR #88)
    await page.goto('/admin/shift')
    await expect(page.getByRole('heading', { name: 'Turno e relatório' })).toBeVisible()
    const shiftOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    expect(shiftOverflow).toBe(false)
  })

  test('ciclo operacional completo: Salão -> Comanda -> KDS -> Taxa + Troco -> Relatório', async ({
    page,
    request,
  }) => {
    const managerToken = await apiLogin(request, 'gerente@mesafacil.com')
    await ensureOpenShift(request, managerToken)

    const tablesRes = await request.get(`${API_URL}/tables`, {
      headers: { Authorization: `Bearer ${managerToken}` },
    })
    const freeTable = (await tablesRes.json()).data.find((t) => t.status === 'available')
    expect(freeTable).toBeTruthy()

    const menuRes = await request.get(`${API_URL}/menu-items`, {
      headers: { Authorization: `Bearer ${managerToken}` },
    })
    const item = (await menuRes.json()).data[0]
    expect(item).toBeTruthy()

    // 1) Garçom abre mesa livre, lança item e envia à cozinha
    await uiLogin(page, 'garcom@mesafacil.com')
    await expect(page).toHaveURL(/\/tables$/)
    await openTableCard(page, freeTable.number)
    await expect(page).toHaveURL(/\/orders\/\d+$/)
    const orderId = page.url().split('/').pop()

    await page.getByRole('button', { name: `Adicionar ${item.name}` }).click()
    await page.getByPlaceholder(/sem cebola/i).fill('E2E Smoke 82')
    await page.getByRole('button', { name: 'Adicionar à comanda' }).click()
    await expect(page.getByText('E2E Smoke 82')).toBeVisible()

    await page.getByRole('button', { name: /Enviar para a cozinha/i }).click()
    await expect(page.getByRole('button', { name: 'Pedir a conta' })).toBeDisabled()
    await logout(page)

    // 2) Cozinha recebe no KDS e conclui preparo
    await uiLogin(page, 'cozinha@mesafacil.com')
    await expect(page).toHaveURL(/\/kitchen$/)
    const kdsCard = page.locator('.kds-card', { hasText: `Pedido #${orderId}` })
    await expect(kdsCard).toBeVisible()
    await kdsCard.getByRole('button', { name: 'Iniciar preparo' }).click()
    await kdsCard.getByRole('button', { name: 'Pronto ✓' }).click()
    await expect(kdsCard).toBeHidden()
    await logout(page)

    // 3) Garçom libera para pagamento (RN-06)
    await uiLogin(page, 'garcom@mesafacil.com')
    await page.goto(`/orders/${orderId}`)
    const askBillBtn = page.getByRole('button', { name: 'Pedir a conta' })
    await expect(askBillBtn).toBeEnabled()
    await askBillBtn.click()
    await logout(page)

    // 4) Caixa testa taxa persistida (RN-12), paga em dinheiro com troco e encerra
    await uiLogin(page, 'caixa@mesafacil.com')
    await expect(page).toHaveURL(/\/cashier$/)
    await page.getByRole('button', { name: new RegExp(`Comanda ativa · #${orderId}\\b`) }).click()

    const taxCheckbox = page.getByLabel(/Incluir 10% de taxa de serviço/i)
    await expect(taxCheckbox).not.toBeChecked()
    await taxCheckbox.click()
    await expect(taxCheckbox).toBeChecked()
    await expect(page.getByText('Taxa de serviço (10%)')).toBeVisible()
    await page.reload()
    await page.getByRole('button', { name: new RegExp(`Comanda ativa · #${orderId}\\b`) }).click()
    await expect(page.getByLabel(/Incluir 10% de taxa de serviço/i)).toBeChecked()

    const overpay = Number((Number(item.price) * 1.1 + 10).toFixed(2))
    await page.getByLabel(/Forma de pagamento/i).selectOption('cash')
    await page.getByLabel(/Valor \(R\$\)/i).fill(String(overpay))
    await expect(page.getByText(/Troco estimado:/)).toBeVisible()
    await page.getByRole('button', { name: 'Adicionar pagamento' }).click()
    await expect(page.getByText(/Pagamento registrado com sucesso! Troco: R\$/)).toBeVisible()

    const closeBtn = page.getByRole('button', { name: 'Finalizar pedido e liberar mesa' })
    await expect(closeBtn).toBeEnabled()
    await closeBtn.click()
    await expect(page.getByText('Pedido finalizado e mesa liberada com sucesso!')).toBeVisible()
    await logout(page)

    // 5) Gerente valida relatório do turno (RN-10)
    await uiLogin(page, 'gerente@mesafacil.com')
    await page.goto('/admin/shift')
    await expect(page.getByRole('heading', { name: 'Turno e relatório' })).toBeVisible()
    await expect(page.getByText('Total do turno', { exact: true })).toBeVisible()
    await expect(page.getByText('Pedidos encerrados', { exact: true })).toBeVisible()
  })

  test('cancelamento gerencial de pedido com motivo obrigatório (RN-11)', async ({ page, request }) => {
    const managerToken = await apiLogin(request, 'gerente@mesafacil.com')
    await ensureOpenShift(request, managerToken)

    const freeTable = (
      await (await request.get(`${API_URL}/tables`, { headers: { Authorization: `Bearer ${managerToken}` } })).json()
    ).data.find((t) => t.status === 'available')
    expect(freeTable).toBeTruthy()

    await uiLogin(page, 'gerente@mesafacil.com')
    await openTableCard(page, freeTable.number)
    await expect(page).toHaveURL(/\/orders\/\d+$/)

    await page.getByRole('button', { name: 'Cancelar pedido' }).click()
    const modal = page.locator('dialog[open]')
    await modal.getByLabel('Motivo').fill('Cancelamento E2E')
    await modal.getByRole('button', { name: 'Cancelar pedido' }).click()
    await expect(page.getByText(/Cancelamento E2E/)).toBeVisible()
  })
})
