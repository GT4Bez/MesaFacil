import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import Modal from '../../src/components/Modal'
import QuantityStepper from '../../src/components/QuantityStepper'
import Toast from '../../src/components/Toast'

describe('Componentes de UX (spec 012)', () => {
  it('Modal abre como diálogo, fecha no ×, no Esc e no clique fora', () => {
    const onClose = vi.fn()
    render(
      <Modal title="Adicionar item" description="Escolha a quantidade" onClose={onClose}>
        <p>conteúdo</p>
      </Modal>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Adicionar item' })
    expect(dialog).toHaveAttribute('open')
    expect(screen.getByText('Escolha a quantidade')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    fireEvent.click(dialog)
    expect(onClose).toHaveBeenCalledTimes(3)

    // Clique no conteúdo não fecha.
    fireEvent.click(screen.getByText('conteúdo'))
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('Modal não fecha durante o envio (busy)', () => {
    const onClose = vi.fn()
    render(
      <Modal title="Salvando" busy onClose={onClose}>
        <p>...</p>
      </Modal>,
    )
    const dialog = screen.getByRole('dialog')
    const cancel = new Event('cancel', { cancelable: true })
    fireEvent(dialog, cancel)
    fireEvent.click(dialog)
    expect(screen.getByRole('button', { name: 'Fechar' })).toBeDisabled()
    expect(cancel.defaultPrevented).toBe(true)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('QuantityStepper respeita o mínimo e o máximo', () => {
    function Harness() {
      const [value, setValue] = useState(1)
      return <QuantityStepper value={value} onChange={setValue} max={3} />
    }
    render(<Harness />)
    const minus = screen.getByRole('button', { name: 'Diminuir quantidade' })
    const plus = screen.getByRole('button', { name: 'Aumentar quantidade' })
    expect(minus).toBeDisabled()
    fireEvent.click(plus)
    fireEvent.click(plus)
    expect(screen.getByRole('group', { name: 'Quantidade' })).toHaveTextContent('3')
    expect(plus).toBeDisabled()
    fireEvent.click(minus)
    expect(screen.getByRole('group', { name: 'Quantidade' })).toHaveTextContent('2')
  })

  it('Toast aparece como status e some sozinho', () => {
    vi.useFakeTimers()
    const onDone = vi.fn()
    render(<Toast message="2× Picanha adicionado à comanda" onDone={onDone} duration={1000} />)
    expect(screen.getByRole('status')).toHaveTextContent('2× Picanha adicionado à comanda')
    act(() => vi.advanceTimersByTime(1000))
    expect(onDone).toHaveBeenCalled()
    vi.useRealTimers()
  })
})
