// 세션 레지스트리 키 — 대화는 `conv:<대화 id|draft>`, 패널은 `multi:<범위 id>:slot:<n>`.
// 레지스트리 키는 REPL 세션키(IPC로 나가는 값)와 다른 값이다. 대화의 REPL 세션키는 대화 id·currentSessionKey
// 그대로이고, 패널은 패널 키가 곧 REPL 세션키다. 이 파일은 키 문자열만 다루고 상태를 갖지 않는다.
// M10 G1 — 멀티 에이전트 모드를 지웠지만 패널 키 형식(접두 `multi:` 포함)은 REPL 세션키 값을 바꾸지 않으려고 그대로 둔다.
// 패널 기계는 G3 세션 탭이 다시 쓴다.

export type SessionKind = 'conv' | 'panel'

const CONV_PREFIX = 'conv:'
const DRAFT_ID = 'draft'
const PANEL_SCOPE_PREFIX = 'multi:'

// 대화 키 — id가 아직 없는 새 대화(초안)는 `conv:draft` 하나다.
export function convKey(conversationId: string | null): string {
  return `${CONV_PREFIX}${conversationId ?? DRAFT_ID}`
}

// 대화 키의 대화 id. 초안이면 null, 대화 키가 아니면 undefined.
export function conversationIdOfKey(key: string): string | null | undefined {
  if (!key.startsWith(CONV_PREFIX)) return undefined
  const id = key.slice(CONV_PREFIX.length)
  return id === DRAFT_ID ? null : id
}

// 패널 범위 하나에 딸린 모든 키의 접두(패널 키와 그 밖의 범위 키).
export function multiPrefix(scopeId: string): string {
  return `${PANEL_SCOPE_PREFIX}${scopeId}:`
}

// 패널 범위 하나의 패널 키 접두.
export function panelPrefix(scopeId: string): string {
  return `${multiPrefix(scopeId)}slot:`
}

export function panelKey(scopeId: string, slot: number): string {
  return `${panelPrefix(scopeId)}${slot}`
}

export function keyKind(key: string): SessionKind | null {
  if (key.startsWith(CONV_PREFIX)) return 'conv'
  if (key.startsWith(PANEL_SCOPE_PREFIX)) return 'panel'
  return null
}
