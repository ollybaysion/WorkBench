import { isValidElement } from 'react'
import type { ReactNode } from 'react'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { copyText } from '../lib/util'

const WIKI_PREFIX = '#wiki:'

/** [[제목]] → [제목](#wiki:제목) (코드 블록 내부는 건드리지 않음) */
function convertWikiLinks(src: string): string {
  const parts = src.split(/(```[\s\S]*?```|`[^`\n]*`)/g)
  return parts
    .map((p, i) => (i % 2 === 1 ? p : p.replace(/\[\[([^\]\n]+)\]\]/g, (_w, t: string) => `[${t}](${WIKI_PREFIX}${encodeURIComponent(t.trim())})`)))
    .join('')
}

function textOf(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children)
  return ''
}

export function CodeBox({ text, children }: { text: string; children?: ReactNode }) {
  const showToast = useStore((s) => s.showToast)
  return (
    <div className="codebox">
      <pre className="code">{children ?? text}</pre>
      <div className="copy">
        <button
          type="button"
          className="btn small"
          onClick={async () => showToast((await copyText(text)) ? '복사했습니다' : '복사에 실패했습니다')}
        >
          복사
        </button>
      </div>
    </div>
  )
}

export default function Markdown({ content }: { content: string }) {
  const navigate = useNavigate()
  const notes = useStore((s) => s.notes)
  const runbooks = useStore((s) => s.runbooks)

  const components: Components = {
    pre: ({ children }) => {
      const text = textOf(children).replace(/\n$/, '')
      return <CodeBox text={text}>{children}</CodeBox>
    },
    a: ({ href, children }) => {
      if (href?.startsWith(WIKI_PREFIX)) {
        const title = decodeURIComponent(href.slice(WIKI_PREFIX.length))
        return (
          <a
            className="wiki"
            href="#"
            onClick={(e) => {
              e.preventDefault()
              const note = notes.find((n) => n.title === title)
              if (note) return navigate(`/notes/${note.id}`)
              const rb = runbooks.find((r) => r.title === title)
              if (rb) return navigate(`/runbooks/${rb.id}`)
              navigate('/notes')
            }}
          >
            {children}
          </a>
        )
      }
      return (
        <a href={href} target="_blank" rel="noreferrer">
          {children}
        </a>
      )
    },
  }

  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} urlTransform={(url) => (url.startsWith(WIKI_PREFIX) ? url : defaultUrlTransform(url))}>
        {convertWikiLinks(content)}
      </ReactMarkdown>
    </div>
  )
}
