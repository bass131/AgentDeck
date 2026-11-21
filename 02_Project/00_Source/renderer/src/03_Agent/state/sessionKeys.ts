// 레지스트리 키는 REPL 세션키(IPC로 나가는 값)와 다르다. 대화의 REPL 세션키는 대화 id·currentSessionKey
// 그대로이고, 패널은 패널 키가 곧 REPL 세션키다.
// 패널 키의 접두 `multi:`는 REPL 세션키 값을 바꾸지 않으려고 그대로 둔다.

export type SessionKind = 'conv' | 'panel'

const CONV_PREFIX = 'conv:'
const DRAFT_ID = 'draft'
const PANEL_SCOPE_PREFIX = 'multi:'

export function convKey(conversationId: string | null): string {
  return `${CONV_PREFIX}${conversationId ?? DRAFT_ID}`
}

// 초안이면 null, 대화 키가 아니면 undefined.
export function conversationIdOfKey(key: string): string | null | undefined {
  if (!key.startsWith(CONV_PREFIX)) return undefined
  const id = key.slice(CONV_PREFIX.length)
  return id === DRAFT_ID ? null : id
}

// 패널 키와 그 밖의 범위 키를 모두 덮는 접두.
export function multiPrefix(scopeId: string): string {
  return `${PANEL_SCOPE_PREFIX}${scopeId}:`
}

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
