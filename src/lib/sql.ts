const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*/

/** SQL 에서 `:이름` 바인드를 순서대로 중복 없이 추출. `::` 와 '문자열 리터럴' 안은 제외 */
export function extractBinds(sql: string): string[] {
  const out: string[] = []
  let i = 0
  while (i < sql.length) {
    const ch = sql[i]
    if (ch === "'") {
      // 리터럴 건너뛰기. '' 는 따옴표 하나로 본다
      i++
      while (i < sql.length) {
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            i += 2
            continue
          }
          i++
          break
        }
        i++
      }
      continue
    }
    if (ch === ':') {
      if (sql[i + 1] === ':') {
        i += 2
        continue
      }
      const m = NAME_RE.exec(sql.slice(i + 1))
      if (m) {
        if (!out.includes(m[0])) out.push(m[0])
        i += 1 + m[0].length
        continue
      }
    }
    i++
  }
  return out
}

/** 바인드 이름 → 값. 없는 값은 '' */
export function pickBinds(sql: string, vars: Record<string, string>): Record<string, string> {
  return Object.fromEntries(extractBinds(sql).map((b) => [b, vars[b] ?? '']))
}
