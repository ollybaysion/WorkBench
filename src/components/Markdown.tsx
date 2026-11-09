import { isValidElement } from 'react'
import type { ReactNode } from 'react'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Link } from 'react-router-dom'
import { useStore } from '../store'
import { copyText } from '../lib/util'

const WIKI_PREFIX = '#wiki:'

/** [[제목]] → [제목](#wiki:제목) (코드 블록 · 인라인 코드 내부는 건드리지 않음) */
function convertWikiLinks(src: string): string {
  const parts = src.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g)
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

interface Props {
  content: string
  /**
   * [[대상]] 을 앱 안 주소로 바꾼다. 주지 않으면 같은 제목의 런북으로 간다.
   * null 을 돌려주면 링크 없이 글자만 그린다.
   */
  wikiHref?: (target: string) => string | null
  /** 그림을 그리는 컴포넌트. 주면 그림 주소(src)를 거르지 않고 그대로 넘긴다. 주소 확인은 이 컴포넌트가 한다. */
  img?: Components['img']
}

export default function Markdown({ content, wikiHref, img }: Props) {
  const runbooks = useStore((s) => s.runbooks)
  const runbookHref = (title: string) => {
    const rb = runbooks.find((r) => r.title === title)
    return rb ? `/runbooks/${rb.id}` : null
  }
  const toHref = wikiHref ?? runbookHref

  const components: Components = {
    pre: ({ children }) => {
      const text = textOf(children).replace(/\n$/, '')
      return <CodeBox text={text}>{children}</CodeBox>
    },
    table: ({ children }) => (
      <div className="tbl">
        <table>{children}</table>
      </div>
    ),
    a: ({ href, children }) => {
      if (href?.startsWith(WIKI_PREFIX)) {
        const to = toHref(decodeURIComponent(href.slice(WIKI_PREFIX.length)))
        return to ? (
          <Link className="wiki" to={to}>
            {children}
          </Link>
        ) : (
          <>{children}</>
        )
      }
      return (
        <a href={href} target="_blank" rel="noreferrer">
          {children}
        </a>
      )
    },
    ...(img ? { img } : {}),
  }

  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} urlTransform={(url, key) => (url.startsWith(WIKI_PREFIX) || (img && key === 'src') ? url : defaultUrlTransform(url))}>
        {convertWikiLinks(content)}
      </ReactMarkdown>
    </div>
  )
}
