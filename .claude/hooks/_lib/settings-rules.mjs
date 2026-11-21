// 설정 권한 규칙의 최소 판정기 (M11 goal 8) — `.claude/settings.json`의 Bash 규칙이 명령 하나에 내는 판정을 문서 규칙대로 셈한다.
// 근거는 공식 permissions 문서(code.claude.com/docs/en/permissions)의 네 규칙이다.
//   순서: 「Rules are evaluated in order: deny, then ask, then allow. The first match in that order determines the outcome」
//   `*`: 그 자리의 아무 글이고, 끝의 ` *`가 유일한 `*`면 맨 명령도 맞는다. `:*` 끝은 ` *`와 같다.
//   복합 명령: `&&`·`||`·`;`·`|`·`|&`·`&`·개행으로 나눈 하위 명령마다 본다. deny·ask는 하나라도 맞으면, allow는 전부 맞아야 한다.
//   래퍼: `timeout`·`time`·`nice`·`nohup`·`stdbuf`·`command`·`builtin`·`noglob`을 벗긴다. 머리 할당은 deny·ask만 건너뛴다.
// 읽기 전용 명령 집합과 명령 치환 안쪽은 셈하지 않는다 — 정형 절차 명령처럼 단순한 꼴의 판정을 묶는 데만 쓴다.
const SEPARATORS = ['&&', '||', '|&', ';', '|', '&', '\n']
const WRAPPERS = new Set(['timeout', 'time', 'nice', 'nohup', 'stdbuf', 'command', 'builtin', 'noglob'])
const ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*=\S*\s+/

export function subcommands(command) {
  const out = []
  let cur = ''
  let quote = null
  for (let i = 0; i < command.length; i++) {
    const ch = command[i]
    if (quote) { cur += ch; if (ch === '\\' && quote === '"') cur += command[++i] ?? ''; else if (ch === quote) quote = null; continue }
    if (ch === '\\') { cur += ch + (command[++i] ?? ''); continue }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue }
    const sep = SEPARATORS.find((s) => command.startsWith(s, i))
    if (sep) { out.push(cur); cur = ''; i += sep.length - 1; continue }
    cur += ch
  }
  out.push(cur)
  return out.map((s) => s.trim()).filter(Boolean)
}

function stripWrappers(text) {
  let s = text
  for (;;) {
    const m = /^(\S+)\s+/.exec(s)
    if (!m || !WRAPPERS.has(m[1])) return s
    s = s.slice(m[0].length)
    while (/^-\S*\s+/.test(s)) s = s.replace(/^-\S*\s+/, '')
    if (m[1] === 'timeout') s = s.replace(/^\S+\s+/, '')
  }
}

function patternMatches(pattern, text) {
  const p = pattern.endsWith(':*') ? `${pattern.slice(0, -2)} *` : pattern
  const body = p.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[\\s\\S]*')
  if (new RegExp(`^${body}$`).test(text)) return true
  const stars = p.split('*').length - 1
  return stars === 1 && p.endsWith(' *') && text === p.slice(0, -2)
}

function ruleMatches(rule, text) {
  if (rule === 'Bash' || rule === 'Bash(*)') return true
  const m = /^Bash\(([\s\S]*)\)$/.exec(rule)
  return m !== null && patternMatches(m[1], text)
}

// 하위 명령 하나의 판정 글 — allow는 래퍼만, deny·ask는 머리 할당까지 벗긴다.
function forms(sub) {
  const allowText = stripWrappers(sub)
  let strict = sub
  while (ASSIGN.test(strict)) strict = strict.replace(ASSIGN, '')
  return { allowText, strictText: stripWrappers(strict) }
}

// 판정 — 'deny' · 'ask' · 'allow' · 'prompt'(아무 규칙도 열지 않아 모드가 정한다)
export function settingsVerdict(permissions, command) {
  const subs = subcommands(command).map(forms)
  const hit = (list, key) => (list ?? []).some((rule) => subs.some((s) => ruleMatches(String(rule), s[key])))
  if (hit(permissions.deny, 'strictText')) return 'deny'
  if (hit(permissions.ask, 'strictText')) return 'ask'
  const allow = (permissions.allow ?? []).map(String)
  return subs.length > 0 && subs.every((s) => allow.some((rule) => ruleMatches(rule, s.allowText))) ? 'allow' : 'prompt'
}
