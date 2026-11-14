// 세션 레지스트리 키 — 대화는 `conv:<대화 id|draft>`, 멀티 패널은 `multi:<멀티 세션 id>:slot:<n>`.
// 레지스트리 키는 REPL 세션키(IPC로 나가는 값)와 다른 값이다. 대화의 REPL 세션키는 대화 id·currentSessionKey
// 그대로이고, 패널은 패널 키가 곧 REPL 세션키다. 이 파일은 키 문자열만 다루고 상태를 갖지 않는다.

export type SessionKind = 'conv' | 'panel'

const CONV_PREFIX = 'conv:'
const DRAFT_ID = 'draft'
const MULTI_PREFIX = 'multi:'

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

// 멀티 세션 하나에 딸린 모든 키의 접두(패널 키와 그 밖의 세션 범위 키).
export function multiPrefix(multiSessionId: string): string {
  return `${MULTI_PREFIX}${multiSessionId}:`
}

// 멀티 세션 하나의 패널 키 접두.
export function panelPrefix(multiSessionId: string): string {
  return `${multiPrefix(multiSessionId)}slot:`
}

export function panelKey(multiSessionId: string, slot: number): string {
  return `${panelPrefix(multiSessionId)}${slot}`
}

export function keyKind(key: string): SessionKind | null {
  if (key.startsWith(CONV_PREFIX)) return 'conv'
  if (key.startsWith(MULTI_PREFIX)) return 'panel'
  return null
}

// 패널 키가 속한 멀티 세션 id. 패널 키가 아니면 null.
export function multiSessionIdOfKey(key: string): string | null {
  if (!key.startsWith(MULTI_PREFIX)) return null
  const rest = key.slice(MULTI_PREFIX.length)
  const at = rest.lastIndexOf(':slot:')
  return at < 0 ? null : rest.slice(0, at)
}
