import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

const storageValues = new Map<string, string>()
const testStorage: Storage = {
  get length() { return storageValues.size },
  clear: () => storageValues.clear(),
  getItem: (key) => storageValues.get(key) ?? null,
  key: (index) => [...storageValues.keys()][index] ?? null,
  removeItem: (key) => { storageValues.delete(key) },
  setItem: (key, value) => { storageValues.set(key, String(value)) },
}

Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: testStorage })
Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
})

afterEach(() => {
  cleanup()
  localStorage.clear()
})
