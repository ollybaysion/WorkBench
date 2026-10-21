const VAR_RE = /\{\{\s*([\w.-]+)\s*\}\}/g

/** 템플릿 문자열에서 {{var}} 이름을 순서대로 중복 없이 추출 */
export function extractVars(template: string): string[] {
  const out: string[] = []
  for (const m of template.matchAll(VAR_RE)) {
    const name = m[1]
    if (!out.includes(name)) out.push(name)
  }
  return out
}

/** {{var}}를 값으로 치환. 값이 없으면 원문을 유지 */
export function render(template: string, vars: Record<string, string | undefined>): string {
  return template.replace(VAR_RE, (whole, name: string) => {
    const v = vars[name]
    return v === undefined || v === '' ? whole : v
  })
}

export function missingVars(template: string, vars: Record<string, string | undefined>): string[] {
  return extractVars(template).filter((n) => !vars[n])
}
