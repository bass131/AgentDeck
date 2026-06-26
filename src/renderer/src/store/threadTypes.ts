/**
 * threadTypes.ts — ThreadItem union 타입 정의.
 *
 * Phase A-2: 시간순 단일 스트림 thread 모델.
 * 원본 AgentCodeGUI/src/renderer/src/store/session.ts L14-33 미러.
 *
 * CRITICAL: reducer.ts → threadTypes 의존 금지(순환 import 회피).
 * reducer.ts는 이 파일에서 re-export(기존 import 경로 호환).
 *
 * M6(Phase 34): cmdresult kind 추가 — 슬래시 커맨드 진행카드(running→done/failed).
 * 원본 session.ts L175: {kind:'cmdresult', id, name, title, sub, stats, time, running}.
 * stats OUT(per-turn context 파이프 부재, B1). sub는 compact done in-place에서 동적 생성.
 */

import type { ToolCard } from './reducer'
import type { OrchestrationAgentProgress } from '../../../shared/agent-events'

export type { ToolCard }

export type ThreadItem =
  | {
      kind: 'msg'
      id: string
      role: 'user' | 'assistant'
      text: string
      error?: boolean
      images?: string[]
      /**
       * 메시지 타임스탬프 (W7 — 표시용 휘발, 비영속).
       * user msg: 액션(ADD_USER_MESSAGE) 생성 시점에 구독/훅에서 stamp.
       * assistant: applyAgentEvent 호출 시 구독부가 time 인자로 전달.
       * CRITICAL: reducer/panelReducer는 받은 time만 사용(nowTime() 직접 호출 0).
       */
      time?: string
      /**
       * cron-turn 발원 마킹 (5b — 배지 표시용 휘발, 비영속).
       * done.origin='cron' 수신 시 해당 turn의 마지막 assistant msg에 부여.
       * 미지정(undefined) = 일반 user 기원 턴 → 배지 미표시 (하위호환).
       * snapshotForPersist 제외(휘발).
       */
      origin?: 'user' | 'cron'
    }
  | {
      kind: 'thinking'
      id: string
      text: string
    }
  | {
      kind: 'toolgroup'
      id: string
      tools: ToolCard[]
      /**
       * toolgroup 타임스탬프 (W7 — 표시용 휘발, 비영속).
       * 구독부가 tool_call 이벤트 수신 시 stamp → applyAgentEvent time 인자로 전달.
       * CRITICAL: reducer는 받은 time만 사용.
       */
      time?: string
    }
  | {
      kind: 'notice'
      id: string
      text: string
      /**
       * notice 타임스탬프 (W7 — 표시용 휘발, 비영속).
       * 구독부가 model-fallback 이벤트 수신 시 stamp → applyAgentEvent time 인자로 전달.
       * CRITICAL: reducer는 받은 time만 사용.
       */
      time?: string
    }
  | {
      /**
       * cmdresult — 슬래시 커맨드 진행카드 (M6).
       * 원본 session.ts L175 미러 (stats OUT — B1).
       * running=true: 스피너 표시. running=false: 완료/실패.
       * failed=true: 실패 카드. sub: 완료 설명(compact는 동적).
       * time: begin 시 설정 — done/error에서 갱신 0(순수성).
       */
      kind: 'cmdresult'
      id: string
      name: string
      title: string
      sub?: string | null
      running: boolean
      failed?: boolean
      time?: string
    }
  | {
      /**
       * orchestration — 멀티에이전트 오케스트레이션 진행카드 (Phase 37 #4b).
       * 엔진중립 kind — 엔진 고유 도구명(예: 'Workflow') 미사용.
       * running=true: Progress Circle 표시. running=false: 완료/실패.
       * failed=true: 실패 카드. result: 최종 출력(done 시 설정).
       * script: 풀스크린용 capped 스크립트(backend cap <= 4096자).
       * time: begin 시 설정 — done에서 갱신 0(순수성).
       * CRITICAL: snapshotForPersist 제외(휘발). thread에서 in-place 갱신.
       */
      kind: 'orchestration'
      id: string
      name: string
      description?: string
      phases?: string[]
      running: boolean
      failed?: boolean
      result?: string
      script?: string
      time?: string
      /**
       * F-C 라이브 진행 (orchestration_progress 이벤트로 in-place 갱신).
       * liveStatus: running|completed|failed. livePhases: 라이브 단계 제목.
       * agents: 개별 작업 진행(라벨/단계/상태/토큰/결과미리보기). liveSummary: 완료 요약.
       * CRITICAL: snapshotForPersist 제외(휘발) — 카드 전체가 휘발이라 동일.
       */
      liveStatus?: 'running' | 'completed' | 'failed'
      liveSummary?: string
      livePhases?: string[]
      agents?: OrchestrationAgentProgress[]
    }
  | {
      /**
       * subagent — 서브에이전트 채팅 인라인 위치 마커 (F-G).
       * Claude Code CLI처럼 thread 안에 서브에이전트 진행을 인라인 표시한다(단일·멀티 공통).
       * 데이터는 state.subagents 단일출처 — 이 마커는 위치(id)만. 렌더 컴포넌트가 id로 조회.
       * CRITICAL: snapshotForPersist 제외(휘발) — kind==='msg'만 영속.
       */
      kind: 'subagent'
      id: string
    }
