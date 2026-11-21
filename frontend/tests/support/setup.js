import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import { setUnauthorizedHandler } from '../../src/services/api'

// jsdom não implementa <dialog>.showModal/close nativamente.
if (typeof HTMLDialogElement !== 'undefined') {
  HTMLDialogElement.prototype.showModal ??= function showModal() {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close ??= function close() {
    this.removeAttribute('open')
  }
}

afterEach(() => {
  cleanup()
  localStorage.clear()
  setUnauthorizedHandler(null)
  vi.restoreAllMocks()
})
