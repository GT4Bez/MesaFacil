import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ReasonModal from '../../src/components/ReasonModal'
import RoleRoute from '../../src/components/RoleRoute'
import StatCard from '../../src/components/StatCard'
import { AuthProvider } from '../../src/context/AuthContext'
import { mockFetch, seedSession } from '../support/helpers'

describe('Componentes compartilhados', () => {
  it('StatCard renderiza rótulo, valor e dica', () => {
    render(<StatCard label="Mesas" value={8} hint="no salão" valueClassName="green-text" />)
    expect(screen.getByText('Mesas')).toBeInTheDocument()
    expect(screen.getByText('8')).toHaveClass('green-text')
    expect(screen.getByText('no salão')).toBeInTheDocument()
  })

  it('RoleRoute protege rota por papel e redireciona para home do perfil', () => {
    const waiter = seedSession({ id: '1', name: 'Garçom', email: 'g@m.com', role: 'waiter' })
    mockFetch({}, waiter)

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/admin/menu']}>
          <Routes>
            <Route element={<RoleRoute roles={['manager']} />}>
              <Route path="/admin/menu" element={<div>Área Gerente</div>} />
            </Route>
            <Route path="/tables" element={<div>Home Garçom</div>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    )

    expect(screen.queryByText('Área Gerente')).not.toBeInTheDocument()
    expect(screen.getByText('Home Garçom')).toBeInTheDocument()
  })

  it('ReasonModal bloqueia motivo em branco e envia motivo normalizado ao confirmar', async () => {
    const onConfirm = vi.fn().mockResolvedValue(true)
    const onClose = vi.fn()
    render(
      <ReasonModal
        title="Cancelar pedido"
        confirmLabel="Confirmar cancelamento"
        busy={false}
        error=""
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    )

    const textarea = screen.getByLabelText('Motivo')
    textarea.reportValidity = vi.fn()
    fireEvent.change(textarea, { target: { value: '   ' } })
    fireEvent.submit(textarea.closest('form'))

    expect(onConfirm).not.toHaveBeenCalled()
    expect(textarea.reportValidity).toHaveBeenCalled()

    fireEvent.change(textarea, { target: { value: '  Cliente desistiu  ' } })
    fireEvent.submit(textarea.closest('form'))

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('Cliente desistiu'))
    expect(onClose).toHaveBeenCalled()
  })
})
