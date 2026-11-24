import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ENTRIES, GROUPS } from './sections'

const REPO_URL = 'https://github.com/GT4Bez/MesaFacil/blob/main'

// Remove a indentação comum só na exibição (o teste confere o trecho original, com indentação).
export function dedent(code) {
  const lines = code.split('\n')
  const indents = lines.filter((line) => line.trim()).map((line) => line.match(/^ */)[0].length)
  const min = indents.length ? Math.min(...indents) : 0
  return lines.map((line) => line.slice(min)).join('\n')
}

const lineCount = (code) => code.split('\n').length

function Entry({ entry }) {
  const end = entry.line + lineCount(entry.code) - 1
  const location = `${entry.file}:${entry.line}${end > entry.line ? `–${end}` : ''}`
  return (
    <article className="pres-entry" id={entry.id} aria-labelledby={`${entry.id}-title`}>
      <h3 id={`${entry.id}-title`}>{entry.title}</h3>
      <p className="pres-concept">{entry.concept}</p>
      <p>
        <b>No MesaFácil:</b> {entry.where}
      </p>
      <figure className="pres-code">
        <figcaption>
          <a href={`${REPO_URL}/${entry.file}#L${entry.line}-L${end}`} target="_blank" rel="noreferrer">
            {location}
          </a>
        </figcaption>
        <pre tabIndex={0}>
          <code>{dedent(entry.code)}</code>
        </pre>
      </figure>
      {entry.note && (
        <p className="pres-note">
          <b>Trade-off:</b> {entry.note}
        </p>
      )}
    </article>
  )
}

// Spec 023: onde o MesaFácil usa POO, SOLID, KISS, YAGNI, DRY e padrões de projeto, com o código real.
export default function Presentation() {
  useEffect(() => {
    const previous = document.title
    document.title = 'MesaFácil · Arquitetura'
    return () => {
      document.title = previous
    }
  }, [])

  return (
    <div className="pres-page">
      <header className="pres-hero">
        <span className="eyebrow">APRESENTAÇÃO</span>
        <h1>Como o MesaFácil é construído</h1>
        <p>
          Onde aplicamos Programação Orientada a Objetos, SOLID, KISS, YAGNI, DRY e padrões de projeto conhecidos,
          com trechos do código real. Cada trecho indica o arquivo e a linha, e um teste automatizado garante que ele
          continua igual ao código.
        </p>
        <p className="pres-stack">Bun · Express 5 · PostgreSQL 16 · React + Vite · Vitest · Cypress</p>
        <Link className="outline-btn" to="/login">
          Entrar no sistema →
        </Link>
      </header>

      <nav className="pres-index" aria-label="Índice">
        {GROUPS.map((group) => (
          <a key={group.id} href={`#grupo-${group.id}`}>
            {group.title}
          </a>
        ))}
      </nav>

      <section className="panel pres-summary" aria-labelledby="resumo">
        <h2 id="resumo">Resumo: princípio → onde usamos</h2>
        <div className="pres-table-wrap">
          <table className="report-table">
            <thead>
              <tr>
                <th>Princípio ou padrão</th>
                <th>Onde</th>
              </tr>
            </thead>
            <tbody>
              {ENTRIES.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <a href={`#${entry.id}`}>{entry.title}</a>
                  </td>
                  <td>
                    <code>{entry.file.split('/').pop()}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {GROUPS.map((group) => (
        <section key={group.id} className="pres-group" id={`grupo-${group.id}`} aria-labelledby={`grupo-${group.id}-title`}>
          <h2 id={`grupo-${group.id}-title`}>{group.title}</h2>
          {ENTRIES.filter((entry) => entry.group === group.id).map((entry) => (
            <Entry key={entry.id} entry={entry} />
          ))}
        </section>
      ))}

      <footer className="pres-footer">
        <p>
          Fluxo de trabalho: cada funcionalidade nasce como spec em <code>docs/specs/</code>, vira issue e PR, e só entra
          com a suíte de testes verde no CI (backend, Vitest, Cypress e guardrails).
        </p>
      </footer>
    </div>
  )
}
