import { useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ENTRIES, GROUPS } from './sections'
import { FACTS, FLOW, MEASUREMENT, MEMBERS, PRACTICES } from './team'

const REPO_URL = 'https://github.com/GT4Bez/MesaFacil/blob/main'

// Spec 024: um tópico por vez, escolhido pela âncora (#equipe, #solid, #solid/d).
export const TOPICS = [
  { id: 'visao', title: 'Visão geral' },
  { id: 'equipe', title: 'Equipe' },
  { id: 'processo', title: 'Como trabalhamos' },
  ...GROUPS.map((group) => ({ id: group.id, title: group.short })),
]

export function parseHash(hash) {
  const [topic, entry] = decodeURIComponent(hash.replace(/^#/, '')).split('/')
  if (!TOPICS.some((item) => item.id === topic)) return { topic: TOPICS[0].id, entry: null }
  return { topic, entry: entry || null }
}

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
          <a
            href={`${REPO_URL}/${entry.file}#L${entry.line}-L${end}`}
            target="_blank"
            rel="noreferrer"
          >
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

function Overview() {
  const groupTitle = Object.fromEntries(GROUPS.map((group) => [group.id, group.short]))
  return (
    <>
      <div className="pres-facts">
        {FACTS.map(([label, value]) => (
          <div key={label} className="pres-fact">
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <section className="panel pres-panel" aria-labelledby="sistema">
        <h3 id="sistema">O sistema</h3>
        <p>
          Gestão de restaurante de ponta a ponta: salão e comandas, cozinha (KDS), caixa com
          pagamentos parciais e conferência cega, turno, estoque com ficha técnica e CMV,
          administração de usuários e trilha de auditoria. Cada perfil (garçom, cozinha, caixa,
          gerente e superadmin) vê só as telas e ações do seu papel.
        </p>
        <p className="pres-stack">
          Bun · Express 5 · PostgreSQL 16 · React + Vite · Vitest · Cypress · Docker
        </p>
      </section>
      <section className="panel pres-summary" aria-labelledby="resumo">
        <h3 id="resumo">Resumo: princípio → onde usamos</h3>
        <div className="pres-table-wrap">
          <table className="report-table">
            <thead>
              <tr>
                <th>Princípio ou padrão</th>
                <th>Tópico</th>
                <th>Onde</th>
              </tr>
            </thead>
            <tbody>
              {ENTRIES.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <Link to={`#${entry.group}/${entry.id}`}>{entry.title}</Link>
                  </td>
                  <td>{groupTitle[entry.group]}</td>
                  <td>
                    <code>{entry.file.split('/').pop()}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

function Team() {
  return (
    <>
      <div className="pres-team">
        {MEMBERS.map((member) => (
          <article key={member.id} className="pres-member" aria-labelledby={`membro-${member.id}`}>
            <header>
              <h3 id={`membro-${member.id}`}>{member.name}</h3>
              <a href={`https://github.com/${member.github}`} target="_blank" rel="noreferrer">
                @{member.github}
              </a>
              <p className="pres-role">{member.role}</p>
            </header>
            <p>{member.summary}</p>
            <dl className="pres-numbers">
              {member.numbers.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            {member.areas.map((area) => (
              <div key={area.title} className="pres-area">
                <h4>{area.title}</h4>
                <ul>
                  {area.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
            {member.note && <p className="pres-note">{member.note}</p>}
          </article>
        ))}
      </div>
      <section className="panel pres-panel" aria-labelledby="medicao">
        <h3 id="medicao">Como a participação foi medida</h3>
        <ul>
          {MEASUREMENT.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </>
  )
}

function Process() {
  return (
    <>
      <ol className="pres-flow" aria-label="Fluxo de cada funcionalidade">
        {FLOW.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      {PRACTICES.map((practice) => (
        <section key={practice.title} className="pres-entry" aria-label={practice.title}>
          <h3>{practice.title}</h3>
          <p>{practice.text}</p>
        </section>
      ))}
    </>
  )
}

function Group({ group }) {
  return (
    <>
      <p className="pres-intro">{group.intro}</p>
      {ENTRIES.filter((entry) => entry.group === group.id).map((entry) => (
        <Entry key={entry.id} entry={entry} />
      ))}
    </>
  )
}

const TOPIC_TITLES = {
  visao: 'Visão geral',
  equipe: 'Equipe: papel e participação',
  processo: 'Como trabalhamos',
}

function TopicContent({ topic }) {
  if (topic === 'visao') return <Overview />
  if (topic === 'equipe') return <Team />
  if (topic === 'processo') return <Process />
  return <Group group={GROUPS.find((group) => group.id === topic)} />
}

// Specs 023 e 024: o projeto, a equipe, o processo e onde o MesaFácil usa POO, SOLID e padrões, com o código real.
export default function Presentation() {
  const { hash } = useLocation()
  const { topic, entry } = parseHash(hash)
  const navRef = useRef(null)
  const firstRender = useRef(true)

  useEffect(() => {
    const previous = document.title
    document.title = 'MesaFácil · Apresentação'
    return () => {
      document.title = previous
    }
  }, [])

  // Ao trocar de tópico com a página rolada, volta para o início dele; com #tópico/entrada, rola até a entrada.
  useEffect(() => {
    const isFirst = firstRender.current
    firstRender.current = false
    if (entry) {
      document.getElementById(entry)?.scrollIntoView?.({ block: 'start' })
    } else if (!isFirst && navRef.current && navRef.current.getBoundingClientRect().top <= 0) {
      navRef.current.scrollIntoView?.({ block: 'start' })
    }
  }, [topic, entry])

  const index = TOPICS.findIndex((item) => item.id === topic)
  const previousTopic = TOPICS[index - 1]
  const nextTopic = TOPICS[index + 1]
  const group = GROUPS.find((item) => item.id === topic)

  return (
    <div className="pres-page">
      <header className="pres-hero">
        <span className="eyebrow">APRESENTAÇÃO</span>
        <h1>Como o MesaFácil é construído</h1>
        <p>
          Quem fez o quê, como a equipe trabalhou e onde aplicamos Programação Orientada a Objetos,
          SOLID, KISS, YAGNI, DRY e padrões de projeto. Os trechos de código indicam arquivo e
          linha, e um teste automatizado garante que continuam iguais ao código.
        </p>
        <Link className="outline-btn" to="/login">
          Entrar no sistema →
        </Link>
      </header>

      <nav className="pres-index" aria-label="Tópicos" ref={navRef}>
        {TOPICS.map((item) => (
          <Link
            key={item.id}
            to={`#${item.id}`}
            aria-current={item.id === topic ? 'page' : undefined}
          >
            {item.title}
          </Link>
        ))}
      </nav>

      <section className="pres-group" aria-labelledby="topico-titulo">
        <h2 id="topico-titulo">{group ? group.title : TOPIC_TITLES[topic]}</h2>
        <TopicContent topic={topic} />
      </section>

      <nav className="pres-pager" aria-label="Navegação entre tópicos">
        {previousTopic ? (
          <Link className="outline-btn" to={`#${previousTopic.id}`}>
            ← {previousTopic.title}
          </Link>
        ) : (
          <span />
        )}
        {nextTopic && (
          <Link className="primary-btn" to={`#${nextTopic.id}`}>
            {nextTopic.title} →
          </Link>
        )}
      </nav>
    </div>
  )
}
