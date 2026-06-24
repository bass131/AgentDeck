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
