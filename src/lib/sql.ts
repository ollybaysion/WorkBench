const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*/
const IDENT = /[A-Za-z0-9_$#]/
const Q_CLOSE: Record<string, string> = { '[': ']', '{': '}', '(': ')', '<': '>' }

/**
 * 주석(-- · /* *\/) · 문자열('…', '' 포함) · Oracle 대체 따옴표(q'[…]') · 따옴표 이름("…") 을
 * 같은 길이의 빈칸으로 가린 SQL. 줄바꿈은 남긴다. 바인드 자리는 가린 SQL 에서 찾는다.
 */
export function maskSql(sql: string): string {
  const out = sql.split('')
  const blank = (from: number, to: number) => {
    for (let k = from; k < to && k < out.length; k++) if (out[k] !== '\n') out[k] = ' '
  }
  let i = 0
  while (i < sql.length) {
    const ch = sql[i]
    const next = sql[i + 1]
    let stop = i + 1
    if (ch === '-' && next === '-') {
      const end = sql.indexOf('\n', i)
      stop = end < 0 ? sql.length : end
    } else if (ch === '/' && next === '*') {
      const end = sql.indexOf('*/', i + 2)
      stop = end < 0 ? sql.length : end + 2
    } else if ((ch === 'q' || ch === 'Q') && next === "'" && !IDENT.test(sql[i - 1] ?? '')) {
      const open = sql[i + 2] ?? ''
      const end = sql.indexOf((Q_CLOSE[open] ?? open) + "'", i + 3)
      stop = end < 0 ? sql.length : end + 2
    } else if (ch === "'") {
      let j = i + 1
      while (j < sql.length) {
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") {
            j += 2
            continue
          }
          j++
          break
        }
        j++
      }
      stop = j
    } else if (ch === '"') {
      const end = sql.indexOf('"', i + 1)
      stop = end < 0 ? sql.length : end + 1
    } else {
      i++
      continue
    }
    blank(i, stop)
    i = stop
  }
  return out.join('')
}

export interface BindSpan {
  start: number // ':' 자리
  end: number // 이름 끝 다음 자리
  name: string
}

/** SQL 안의 `:이름` 바인드 자리. `::` 와 주석 · 문자열 · 따옴표 이름 안은 뺀다 */
export function bindSpans(sql: string): BindSpan[] {
  const m = maskSql(sql)
  const out: BindSpan[] = []
  let i = 0
  while (i < m.length) {
    if (m[i] === ':') {
      if (m[i + 1] === ':') {
        i += 2
        continue
      }
      const r = NAME_RE.exec(m.slice(i + 1, i + 130))
      if (r) {
        out.push({ start: i, end: i + 1 + r[0].length, name: r[0] })
        i += 1 + r[0].length
        continue
      }
    }
    i++
  }
  return out
}

/** SQL 에서 `:이름` 바인드를 순서대로 중복 없이 추출 */
export function extractBinds(sql: string): string[] {
  const out: string[] = []
  for (const s of bindSpans(sql)) if (!out.includes(s.name)) out.push(s.name)
  return out
}

/** 바인드 이름 → 값. 없는 값은 '' */
export function pickBinds(sql: string, vars: Record<string, string>): Record<string, string> {
  return Object.fromEntries(extractBinds(sql).map((b) => [b, vars[b] ?? '']))
}

/**
 * 바인드 자리에 값을 글자 그대로 넣은 SQL(다른 도구에 붙여 돌려 보는 용도).
 * 값은 '…' 로 감싸고 안의 ' 는 '' 로 바꾼다. 빈 값은 NULL(Oracle 은 빈 글자를 NULL 로 본다).
 */
export function fillBinds(sql: string, vars: Record<string, string>): string {
  let out = ''
  let at = 0
  for (const s of bindSpans(sql)) {
    const v = vars[s.name] ?? ''
    out += sql.slice(at, s.start) + (v === '' ? 'NULL' : `'${v.replace(/'/g, "''")}'`)
    at = s.end
  }
  return out + sql.slice(at)
}
