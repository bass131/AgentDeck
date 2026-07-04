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
 *
 * CP1 P05: 서브에이전트 영속 데이터 계층(빌더 앵커 계산 + 복원 재구성 헬퍼 2종).
 * 설계 근거: 01.Phases/CP1-cwd-persist-sweep/04-design-note.md(P04 shared-ipc 확정).
 * 알고리즘은 coordinator 확정본을 그대로 구현(재유도 금지) — 아래 각 함수 docblock 참조.
 */
import type { ThreadItem } from '../threadTypes'
import type { TokenUsage, PersistedSubAgent } from '../../../../shared/ipc-contract'
import type { SubAgentInfo } from '../../../../shared/agent-events'

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
  /** CP1: 현재 서브에이전트 스냅샷(state.subagents 단일출처) — 앵커 계산 원본. */
  subagents?: SubAgentInfo[]
}

/**
 * computeSubagentAnchors — thread 1회 순회로 서브에이전트 위치 앵커(afterMessageIndex) 계산.
 *
 * 확정 알고리즘(재유도 금지): msgCount 카운터를 0에서 시작해 thread를 순서대로 훑는다.
 *   - `kind==='msg'` 항목을 만나면 msgCount를 증가시킨다(marker 자신은 증가시키지 않음).
 *   - `{kind:'subagent', id}` 마커를 만나면 subagents에서 id로 조인해 정보를 찾고,
 *     찾으면 `{...info, afterMessageIndex: msgCount}`를 emit한다(marker "직전까지" 지나온
 *     msg 개수 = msgCount 현재값, 0-based·맨앞=0).
 * 마커는 있는데 조인될 데이터가 없으면(데이터 없는 마커) 그 마커는 skip한다.
 * subagents에는 있지만 thread에 마커가 없는 항목(마커 없는 데이터)은 애초에 순회 대상이
 * 아니므로 자연히 미포함된다.
 */
function computeSubagentAnchors(
  thread: ThreadItem[],
  subagents: SubAgentInfo[] | undefined
): PersistedSubAgent[] {
  if (!subagents || subagents.length === 0) return []
  let msgCount = 0
  const result: PersistedSubAgent[] = []
  for (const item of thread) {
    if (item.kind === 'msg') {
      msgCount++
      continue
    }
    if (item.kind === 'subagent') {
      const info = subagents.find((s) => s.id === item.id)
      if (info) {
        result.push({ ...info, afterMessageIndex: msgCount })
      }
    }
  }
  return result
}

/**
 * rebuildThreadWithSubagents — 영속된 서브에이전트 앵커로 thread를 재구성(복원 경로 공유 헬퍼).
 *
 * 두 복원 지점(conversation.ts loadConversation · sessions.ts selectConversation 디스크 경로)이
 * 공유한다(drift 방지 — 로직이 하나라도 어긋나면 위치 복원이 지점마다 달라진다).
 *
 * 확정 알고리즘(재유도 금지): k를 0부터 messages.length까지(양끝 포함) 순회한다.
 *   - 매 k마다 먼저 `afterMessageIndex === k`인 persisted 항목을 순서대로
 *     `{kind:'subagent', id}` 마커로 삽입한다.
 *   - 그 다음 k < messages.length이면 messages[k](msg 항목)를 push한다.
 * 이 순서 덕에 맨앞(k=0에서 msg 이전 삽입)·중간·맨끝(k=length에서 msg 이후 삽입) 배치가
 * 모두 정확히 복원된다. persisted 미지정/빈 배열이면 messages를 그대로 반환(회귀 0).
 */
export function rebuildThreadWithSubagents(
  messages: Extract<ThreadItem, { kind: 'msg' }>[],
  persisted: PersistedSubAgent[] | undefined
): ThreadItem[] {
  if (!persisted || persisted.length === 0) return messages
  const result: ThreadItem[] = []
  for (let k = 0; k <= messages.length; k++) {
    for (const p of persisted) {
      if (p.afterMessageIndex === k) {
        result.push({ kind: 'subagent', id: p.id })
      }
    }
    if (k < messages.length) {
      result.push(messages[k])
    }
  }
  return result
}

/**
 * freezePersistedSubagents — 영속된 서브에이전트를 상태 done으로 동결해 SubAgentInfo[]로 변환.
 *
 * 확정 알고리즘(재유도 금지): 복원은 "표시용"이라 running/queued 상태가 새 세션에서 다시
 * 진행되는 일이 없다(고착 방지, 원본 AgentCodeGUI 동일 철학) — 그래서 top-level
 * `status:'done'`, 각 `tools[].status:'done'`, transcript 중 `kind==='tool'`인 항목도
 * `status:'done'`으로 동결한다. `afterMessageIndex`는 위치 앵커일 뿐 SubAgentInfo 필드가
 * 아니므로 strip한다(state.subagents는 SubAgentInfo[] — PersistedSubAgent가 아님).
 */
export function freezePersistedSubagents(persisted: PersistedSubAgent[] | undefined): SubAgentInfo[] {
  if (!persisted || persisted.length === 0) return []
  return persisted.map((p) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { afterMessageIndex, ...info } = p
    return {
      ...info,
      status: 'done',
      tools: info.tools.map((t) => ({ ...t, status: 'done' as const })),
      transcript: info.transcript?.map((t) =>
        t.kind === 'tool' ? { ...t, status: 'done' as const } : t
      ),
    }
  })
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
  // CP1 P05: source.thread 1회 순회로 서브에이전트 위치 앵커 계산. 결과 비면 필드 omit
  // (마커 없는 데이터=미포함, 데이터 없는 마커=skip — computeSubagentAnchors 내부 처리).
  const subagentAnchors = computeSubagentAnchors(source.thread, source.subagents)
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
    // CP1 P05: 서브에이전트 사이드카(ADR-024 — messages와 분리, 모델 컨텍스트 무개입).
    ...(subagentAnchors.length > 0 ? { subagents: subagentAnchors } : {}),
  }
}
