/**
 * slices/conversationPayload.ts — conversationSave IPC 페이로드 빌더 (P3c: 전환-연속성).
 *
 * 활성 대화(conversation.ts saveConversation)와 백그라운드 대화(runtime.ts 경로2, P3c)가
 * 동일한 "thread → conversationSave payload" 변환을 공유한다. 각자 "무엇을 원본으로 삼는지"만
 * 다르다:
 *   - 활성 경로: get()의 flat 상태(thread/workspaceRoot/sessionId/...)
 *   - bg 경로: bgRuns[id] 스냅샷(ConversationRunState) — 활성 flat을 절대 읽지 않는다
 *     (읽으면 다른 대화 데이터로 이 대화를 덮어쓰는 교차오염이 된다).
 * 이 파일은 순수 함수만 제공한다(부수효과 0 — window.api 호출은 호출자 책임).
 */
import type { ThreadItem } from '../threadTypes'
import type { TokenUsage } from '../../../../shared/ipc-contract'

/** conversationSave 요청의 conversation 필드 타입(id optional) — window.api 시그니처에서 파생. */
export type ConversationSavePayload = Parameters<typeof window.api.conversationSave>[0]['conversation']

/**
 * buildConversationSavePayload가 필요로 하는 최소 원본 — AppState/ConversationRunState 양쪽에서
 * 구조분해로 만족(둘 다 이 필드들을 갖는다).
 */
export interface ConversationPayloadSource {
  thread: ThreadItem[]
  workspaceRoot: string | null
  sessionId?: string
  lastContextWindow?: number
  lastUsage?: TokenUsage
}

/**
 * thread(kind==='msg')에서 conversationSave payload를 파생한다.
 * threadMsgs가 비어있으면 null(빈 저장 방지 — 기존 saveConversation의 조기 return과 동형).
 * id 미지정(undefined)이면 신규 생성 의도(main이 id 발급) — 호출자가 결정.
 */
export function buildConversationSavePayload(
  source: ConversationPayloadSource,
  id: string | undefined
): ConversationSavePayload | null {
  const threadMsgs = source.thread
    .filter((item): item is Extract<ThreadItem, { kind: 'msg' }> => item.kind === 'msg')
  if (threadMsgs.length === 0) return null
  const messages = threadMsgs.map((m) => ({ role: m.role, content: m.text }))
  return {
    id: id ?? (undefined as unknown as string),
    title: (threadMsgs[0]?.text ?? '').slice(0, 40) || 'untitled',
    messages,
    backendId: 'claude-code',
    // ADR-020: 워크스페이스를 대화에 앵커. null이면 미포함(기존 대화 호환).
    ...(source.workspaceRoot != null ? { cwd: source.workspaceRoot } : {}),
    // Phase 1.5: 세션 ID 영속 → resume으로 맥락 복원. 빈/누락 미포함.
    ...(source.sessionId ? { sessionId: source.sessionId } : {}),
    // 표시 메타(게이지) 영속 → 재시작 후 컨텍스트 게이지 즉시 복원.
    ...(source.lastContextWindow !== undefined ? { lastContextWindow: source.lastContextWindow } : {}),
    ...(source.lastUsage !== undefined ? { lastUsage: source.lastUsage } : {}),
  }
}
