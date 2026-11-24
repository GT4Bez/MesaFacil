import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ENTRIES, GROUPS } from '../../src/pages/presentation/sections'

// Spec 023: cada trecho da página /apresentacao precisa estar exatamente no arquivo e na linha indicados.
// Se este teste falhar depois de uma refatoração, atualize o trecho em src/pages/presentation/sections.js.
const ROOT = resolve(__dirname, '../../..')

describe('Trechos da página de apresentação (spec 023)', () => {
  it.each(ENTRIES.map((entry) => [entry.id, entry]))('%s está no arquivo e na linha indicados', (_, entry) => {
    const lines = readFileSync(resolve(ROOT, entry.file), 'utf8').split('\n')
    const expected = entry.code.split('\n')
    const actual = lines.slice(entry.line - 1, entry.line - 1 + expected.length)
    expect(actual.join('\n'), `${entry.file}:${entry.line}`).toBe(entry.code)
    expect(entry.code.trim().length).toBeGreaterThan(0)
  })

  it('toda entrada pertence a um grupo, tem id único e explica o conceito e onde é usado', () => {
    const groups = new Set(GROUPS.map((group) => group.id))
    expect(new Set(ENTRIES.map((entry) => entry.id)).size).toBe(ENTRIES.length)
    for (const entry of ENTRIES) {
      expect(groups.has(entry.group), entry.id).toBe(true)
      expect(entry.concept && entry.where, entry.id).toBeTruthy()
    }
  })

  it('cobre as cinco letras do SOLID e KISS, YAGNI e DRY', () => {
    const titles = ENTRIES.map((entry) => entry.title).join(' | ')
    for (const word of ['S —', 'O —', 'L —', 'I —', 'D —', 'KISS', 'YAGNI', 'DRY', 'Herança', 'Singleton', 'Repository']) {
      expect(titles).toContain(word)
    }
  })
})
