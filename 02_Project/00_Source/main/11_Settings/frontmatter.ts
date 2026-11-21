// 맵은 일반 객체와 `in` 검사 그대로다 — 프로토타입에 있는 키 이름(constructor 등)은 저장되지 않는다.
const BOM = 0xfeff

export function parseFrontmatter(text: string): Partial<Record<string, string>> {
  // 맨 앞 BOM 한 글자만 벗긴다
  const body = text.charCodeAt(0) === BOM ? text.slice(1) : text

  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(body)
  if (!m) return {}

  const out: Record<string, string> = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line)
    if (!kv) continue
    let v = kv[2].trim()
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1)
    }
    if (!(kv[1] in out)) out[kv[1]] = v
  }

  return out
}
