/**
 * ultracodeToggle.ts — UltraCode 오케스트레이션 토글 상태 (LR4 P06, 오복원 버그 수정).
 *
 * 배경(01.Phases/13_LR4-session-stability/06-ultracode-persist.md): Composer.tsx/
 * PanelView.tsx 로컬 useState(orchestration)는 컴포넌트 언마운트에 소멸한다 — 단일↔멀티
 * 왕복(Shell.tsx:350 언마운트) / 멀티세션 재마운트(Shell.tsx:375 key={activeMultiSessionId})
 * 마다 사용자가 끈 OFF가 기본값 ON으로 되살아났다(스코프 과소, 상태 리프팅 필요).
 *
 * 스코프(확정, P07 REPL 토글 원칙과 통일 = "전역 과대 → 세션별 분리"):
 *   - 단일챗 = 대화별(conversationId 키, 미확정 대화는 SINGLE_CHAT_DEFAULT_SCOPE 폴백)
 *   - 멀티   = 패널별(multi:{activeMultiSessionId}:slot:{slot} — PanelView가 REPL
 *     sessionKey로 이미 보유한 panelSessionKey를 그대로 재사용, 신규 키 스킴 0)
 *
 * 비영속(CRITICAL, UC1-P07/ADR-032 v2 불변): 순수 in-memory Map — window.api/Node/fs 0,
 * 디스크 영속 payload(multiCmdUpsert 등)에 절대 포함되지 않는다. 앱 재시작 시 소멸(의도된
 * 휘발 — "지속"은 세션 생명주기 내 유지를 의미할 뿐 디스크 영속과는 별개, 기존
 * multi-ultracode.test.tsx 'I: 비영속' 계약과 동일 정책).
 *
 * 기본값 ON(UC1-P07/ADR-032 v2 불변) — 키 부재 = ON. OFF만 명시 기록하고 ON 복귀 시
 * 엔트리를 지운다(loopDisplayRegistry.ts 자기 가지치기 관례와 동형 — Map이 "현재 OFF인
 * 스코프 수"만큼만 자란다, 무제한 누적 방지).
 *
 * useUltracodeToggle의 반환 타입을 useState와 동일한 [value, Dispatch<SetStateAction>]로
 * 맞춰 호출부(Composer.tsx/PanelView.tsx) diff를 최소화한다 — 함수형 업데이터(setOrchestration
 * (v => !v), ComposerBar.tsx)와 단순 값 setter(setOrchestration(!x), PanelPicker.tsx) 양쪽
 * 호출 관례를 모두 그대로 지원.
 */
import { useCallback, type Dispatch, type SetStateAction } from 'react'
import { create } from 'zustand'

/** 단일챗에서 conversationId가 아직 없는(새 미저장 대화) 경우의 폴백 스코프 키. */
export const SINGLE_CHAT_DEFAULT_SCOPE = 'single:default'

interface UltracodeToggleState {
  /** OFF로 명시된 스코프 키의 집합 — 부재 = ON(기본값). */
  offKeys: Set<string>
}

const useUltracodeToggleStore = create<UltracodeToggleState>(() => ({
  offKeys: new Set(),
}))

/**
 * useUltracodeToggle — 스코프 키의 [on, setOn] 쌍을 반환하는 훅.
 * 컴포넌트 로컬 useState(orchestration) 대체 — 동일한 [value, setter] 형태를 유지해
 * 호출부는 useState → useUltracodeToggle(key) 교체 한 줄로 끝난다.
 */
export function useUltracodeToggle(key: string): [boolean, Dispatch<SetStateAction<boolean>>] {
  const on = useUltracodeToggleStore((s) => !s.offKeys.has(key))

  const setOn = useCallback<Dispatch<SetStateAction<boolean>>>(
    (next) => {
      useUltracodeToggleStore.setState((s) => {
        const prevOn = !s.offKeys.has(key)
        const resolved = typeof next === 'function' ? (next as (prev: boolean) => boolean)(prevOn) : next
        if (resolved === prevOn) return s // 변화 없음 — 참조 유지(불필요 리렌더 방지)
        const nextOffKeys = new Set(s.offKeys)
        if (resolved) nextOffKeys.delete(key) // ON 복귀 — 자기 가지치기
        else nextOffKeys.add(key)
        return { offKeys: nextOffKeys }
      })
    },
    [key]
  )

  return [on, setOn]
}

/**
 * __resetUltracodeToggleForTests — 테스트 전용 리셋.
 * CRITICAL: 프로덕션 코드에서 호출 금지. panelSession.ts의
 * __resetPanelSessionManagerForTests와 동일 관례(모듈 싱글턴 격리).
 */
export function __resetUltracodeToggleForTests(): void {
  useUltracodeToggleStore.setState({ offKeys: new Set() })
}

/**
 * migrateSingleChatDefaultScope — 신규 미저장 대화(conversationId=null, 키
 * SINGLE_CHAT_DEFAULT_SCOPE)가 첫 발급으로 실제 id를 얻는 전이(null→id) 전용 마이그레이션
 * (reviewer 🟡#1 봉합, P06 후속).
 *
 * SINGLE_CHAT_DEFAULT_SCOPE에 기록돼 있던 OFF를 newKey로 옮기고 SINGLE_CHAT_DEFAULT_SCOPE
 * 엔트리를 지운다 — 그래야 이 대화는 발급 후에도 OFF를 유지하고(D), 다음에 또 새 대화를
 * 시작해 SINGLE_CHAT_DEFAULT_SCOPE 키를 재사용할 때는 이전 대화의 OFF를 상속하지 않는다(E).
 * OFF가 없었으면(이미 ON) 아무 것도 옮길 게 없으므로 no-op.
 *
 * CRITICAL(과일반화 금지): 이 함수 자체는 "어떤 전이든" 마이그레이션하지 않는다 — 호출부가
 * 정확히 "직전 conversationId===null && 새 conversationId!==null"인 최초 발급 순간에만
 * 호출해야 의미가 있다(호출 지점 = Composer.tsx 전이 추적 effect). 대화 A↔B(둘 다 non-null)
 * 전환이나 id→null 복귀, 멀티 패널 세션 키 전환은 이 함수를 호출하지 않는다 — 각각 대화별
 * 독립(B)·패널별 격리(C) 계약을 그대로 보존한다. newKey===SINGLE_CHAT_DEFAULT_SCOPE로 호출된
 * 경우도 자기 자신으로의 이관이라 의미가 없어 가드로 막는다.
 */
export function migrateSingleChatDefaultScope(newKey: string): void {
  if (newKey === SINGLE_CHAT_DEFAULT_SCOPE) return
  useUltracodeToggleStore.setState((s) => {
    if (!s.offKeys.has(SINGLE_CHAT_DEFAULT_SCOPE)) return s // 옮길 OFF 없음(이미 ON)
    const next = new Set(s.offKeys)
    next.delete(SINGLE_CHAT_DEFAULT_SCOPE)
    next.add(newKey)
    return { offKeys: next }
  })
}

/**
 * pruneConversationScope — 단일챗 대화 삭제 시 그 대화의 OFF 키를 offKeys에서 제거한다
 * (BL1 P01, LR4-DONE.md 잔여 5번 — 삭제된 스코프의 offKeys 잔존 누수 0).
 *
 * migrateSingleChatDefaultScope와 동형의 가지치기 패턴: 키가 없으면(이미 ON) no-op으로
 * 참조를 유지해 불필요한 리렌더를 막는다. 단일챗 키 스킴은 대화당 정확히 1개(conversationId
 * 또는 SINGLE_CHAT_DEFAULT_SCOPE)라 prefix 없이 정확 일치 삭제로 충분하다(멀티세션과
 * 대칭되는 pruneMultiSessionScope는 여러 슬롯 prefix 전수 제거가 필요 — 아래 참조).
 *
 * CRITICAL(호출 규율): 삭제 **성공**(ok:true) 경로에서만 호출할 것 — 삭제 실패 시 대화가
 * 여전히 존재하므로 그 OFF 상태를 지우면 안 된다(호출부 slices/sessions.ts deleteConversation의
 * res.ok 가드 뒤에서만 호출, Codex P2 반영).
 */
export function pruneConversationScope(id: string): void {
  useUltracodeToggleStore.setState((s) => {
    if (!s.offKeys.has(id)) return s
    const next = new Set(s.offKeys)
    next.delete(id)
    return { offKeys: next }
  })
}

/**
 * pruneMultiSessionScope — 멀티세션 삭제 시 그 세션의 모든 슬롯 OFF 키를 offKeys에서
 * 제거한다(BL1 P01, pruneConversationScope와 대칭).
 *
 * 멀티 키 스킴은 세션 하나가 여러 슬롯 키(`multi:{sessionId}:slot:{slot}`, PanelView.tsx의
 * panelSessionKey 조합 — 파일 상단 주석 참조)를 갖는다 — 정확 일치 삭제 1개로는 부족하고
 * `multi:{sessionId}:` prefix에 해당하는 모든 슬롯 키를 전수 제거해야 한다(Codex P2 반영).
 * 다른 세션의 prefix와는 끝에 붙는 콜론(:)으로 구분되어 접두 충돌(예: s1 vs s10)이 없다.
 *
 * CRITICAL(호출 규율): pruneConversationScope와 동일 — 삭제 성공(ok:true) 경로에서만 호출.
 */
export function pruneMultiSessionScope(sessionId: string): void {
  const prefix = `multi:${sessionId}:`
  useUltracodeToggleStore.setState((s) => {
    let changed = false
    const next = new Set(s.offKeys)
    for (const k of s.offKeys) {
      if (k.startsWith(prefix)) {
        next.delete(k)
        changed = true
      }
    }
    return changed ? { offKeys: next } : s
  })
}
