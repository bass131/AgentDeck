/**
 * loopDisplayRegistry.ts — loops/goal 배너 표시 상태의 앱수명 in-memory 레지스트리 팩토리
 * (BF3 Phase 07, 배너 연속성).
 *
 * 배경(01.Phases/BF3-backlog-sweep/07-banner-continuity.md): bgRuns(단일챗, sessions.ts
 * BG_RUNS_CAP=8)·panelManagerStates(멀티, panelSession.ts PANEL_MANAGER_CAP=32)는 축출
 * 가능한 캐시이고, 디스크 스냅샷(ConversationRecord/PanelThreadSnapshot)은 애초에 loops를
 * 담지 않는다(불변조건 — 앱 재시작 후 main 프로세스가 죽으면 루프도 죽으므로, 영속하면 죽은
 * 루프의 stale 배너가 재림한다, LR2-03 재발 방지). 세 경계(bgRuns 축출·패널슬롯 축출·디스크
 * 재로드) 전부에서 "표시"만 살아남게 하려면, 표시 트리오(activeLoops/loopsStoppedNotice/
 * pendingCommand)만 떼어내 캐시 축출·디스크 재로드와 무관한 앱수명 스코프에 두면 된다 — 이
 * 모듈이 그 스코프(키→값 in-memory 레지스트리)다.
 *
 * 정리 대칭(누수 방지): sync()에 빈 값(activeLoops:[] && !loopsStoppedNotice && !pendingCommand)이
 * 들어오면 엔트리를 스스로 지운다(자기 가지치기) — 루프 종료/abort·정지확인 닫기·새 전송이
 * 이 3필드를 자연스럽게 비우므로, 별도 evict 타이밍 로직 없이 "살아있는 표시가 있는 키만"
 * 유계로 유지된다. 대화/세션 영구 삭제 같은 명시적 정리는 clear(key)/clearByPrefix(prefix)로.
 *
 * 두 소비처(sessions.ts=단일챗 conversationId 키 / panelSession.ts=패널슬롯 "sessionId::slot"
 * 키)가 서로 다른 키 스킴을 쓰지만, 혹시 모를 충돌을 원천 차단하려 각자 독립 인스턴스를
 * 생성한다(팩토리 패턴 — createLoopDisplayRegistry() 호출마다 새 Map).
 *
 * CRITICAL: 순수 in-memory Map — window.api/Node/fs 0. 디스크 영속 절대 금지(불변조건).
 */
import type { LoopInfo } from '../../../shared/agent-events'

/**
 * pendingCommand 필드 형상 — reducer/types.ts AppState.pendingCommand와 동형
 * (중복 정의 — 순환 import 회피).
 *
 * CP1 P06 ⑤(주석 정직화): 이 주석은 원래도 "동형"이라 주장했지만 FB2 P08에서
 * AppState.pendingCommand에 `detail`(goal 목표 텍스트, LoopStatusBanner 3단
 * 정보위계의 "작업 주제")이 추가된 뒤 여기 반영되지 않아 실제로는 "동형"이 아니었다
 * (sync()가 참조를 그대로 저장해 런타임엔 detail이 새지 않았지만, 타입 선언 자체가
 * 실제 계약보다 좁아 이 인터페이스로 직접 타입 지정한 리터럴에서 detail을 쓸 수
 * 없었다). detail을 추가해 "동형" 주장을 다시 참으로 만든다 — reducer/types.ts의
 * pendingCommand 필드가 갱신되면 이 인터페이스도 함께 갱신해야 주석이 계속 정직하다.
 */
export interface LoopDisplayPendingCommand {
  name: string
  cardId: string
  beforeMsgs: number
  turns?: number
  detail?: string | null
}

/** 표시 트리오 스냅샷 — loops/goal 배너가 읽는 필드만. */
export interface LoopDisplaySnapshot {
  activeLoops: LoopInfo[]
  loopsStoppedNotice: boolean
  pendingCommand?: LoopDisplayPendingCommand | null
}

export interface LoopDisplayRegistry {
  /** 표시 트리오를 key에 write-through. 전부 빈 값이면 엔트리를 스스로 지운다(자기 가지치기). */
  sync: (key: string, snapshot: LoopDisplaySnapshot) => void
  /** key의 마지막으로 알려진 표시 트리오 — 없으면 undefined(빈 상태로 취급). */
  read: (key: string) => LoopDisplaySnapshot | undefined
  /** key 엔트리 명시 삭제(영구 삭제 시 정리 대칭). */
  clear: (key: string) => void
  /** prefix로 시작하는 모든 key 삭제(세션 통째 삭제 시). */
  clearByPrefix: (prefix: string) => void
  /** 테스트 전용 전체 리셋. */
  __resetForTests: () => void
  /** 테스트 전용 크기 관측(누수 회귀 가드). */
  __sizeForTests: () => number
}

/**
 * isEmptyLoopDisplaySnapshot — 표시 트리오 3필드가 전부 빈 값인지 판정.
 * export: 소비처(loopDisplay.ts)가 내구 라우팅(runId→conversationId) 등록 여부를
 * 같은 기준으로 판단하기 위해 공개(reviewer 🔴 봉합 — 라우팅도 "살아있는 표시가 있을 때만"
 * 유지해야 빈 트리오를 남기는 leave마다 라우팅이 무의미하게 누적되는 것을 막는다).
 */
export function isEmptyLoopDisplaySnapshot(v: LoopDisplaySnapshot): boolean {
  return v.activeLoops.length === 0 && !v.loopsStoppedNotice && !v.pendingCommand
}

/** createLoopDisplayRegistry — 독립된 Map 인스턴스를 가진 레지스트리 생성(소비처별 키 공간 분리). */
export function createLoopDisplayRegistry(): LoopDisplayRegistry {
  const map = new Map<string, LoopDisplaySnapshot>()
  return {
    sync(key, snapshot) {
      if (isEmptyLoopDisplaySnapshot(snapshot)) {
        map.delete(key)
        return
      }
      map.set(key, {
        activeLoops: snapshot.activeLoops,
        loopsStoppedNotice: snapshot.loopsStoppedNotice,
        pendingCommand: snapshot.pendingCommand ?? null,
      })
    },
    read(key) {
      return map.get(key)
    },
    clear(key) {
      map.delete(key)
    },
    clearByPrefix(prefix) {
      for (const k of Array.from(map.keys())) {
        if (k.startsWith(prefix)) map.delete(k)
      }
    },
    __resetForTests() {
      map.clear()
    },
    __sizeForTests() {
      return map.size
    },
  }
}
