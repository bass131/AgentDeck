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
      /**
       * 인터럽트/abort로 스트리밍이 잘린 assistant msg 마킹 (GAP1 P15-R1 S3, additive).
       * abortRun 로컬 정리·interruptRun accepted:true 시점에 openMsgId가 가리키던 msg에
       * 부여 — "문장이 뚝 끊긴 미완성 답변"인지 원래 그렇게 끝난 답변인지 대화 기록만으로
       * 구분 가능하게 한다(렌더: Conversation.tsx `.msg-interrupted` '중단됨' 배지).
       * 미지정(undefined) = 정상 완료/진행 msg → 마커 미렌더(하위호환).
       */
      interrupted?: boolean
    }
  | {
      /**
       * thinking — 확장 사고(extended thinking) 전문 보존 아이템 (GAP1 P06, I-01/S-09).
       * 이전엔 handleThinking이 휘발 thinkingText(WorkingIndicator 스피너 문구)만 세팅하고
       * thread에는 전혀 반영하지 않았다 — 사고가 끝나면 90자 요약조차 사라졌다. 이제
       * thinking(전문) + thinking_delta(라이브 증분) 둘 다 이 아이템을 생성/갱신해
       * 접이식 전문 블록(Conversation.tsx ThinkingItem)으로 남는다.
       * "열린" 아이템 판별은 별도 포인터 없이 "thread의 마지막 항목이 kind:'thinking'인가"로
       * 충분하다 — SDK 스트림 상 사고 구간은 text/thinking_clear 전까지 다른 이벤트로
       * 끊기지 않는다(reducer/text.ts handleThinking/handleThinkingDelta 참조).
       * estimatedTokens: redacted-thinking 구간(원문 텍스트 없이 토큰 추정치만 오는 경우,
       * sdk.d.ts:4265) 진행 표시 fallback — additive(P03 thread-item shape 계약,
       * gap1-p06-thinking-reducer.test.ts가 이 필드명을 고정).
       */
      kind: 'thinking'
      id: string
      text: string
      estimatedTokens?: number
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
      /**
       * orchestration_denied 통지 dedup 판별용 마킹 (UC1 P10).
       * G4 즉시 deny 이벤트의 reason 원값을 그대로 저장 — 연속 동일 reason 스킵에 사용.
       * model-fallback 등 다른 notice는 미지정(undefined) — 하위호환, dedup 대상 아님.
       */
      denyReason?: string
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
  | {
      /**
       * compact-boundary — 컨텍스트 컴팩션 경계 인라인 마커 (GAP1 P04, S-01).
       * `compact`(kind:'boundary') 이벤트(SDKCompactBoundaryMessage) 수신 시 1개 삽입 —
       * NoticeItem(model-fallback/orchestration_denied와 동일 문법, Conversation.tsx)으로
       * 렌더한다(신규 시각 컴포넌트 미발명). trigger/preTokens/postTokens는 표시용 참고
       * 정보(SDK 선언도 optional — 없으면 undefined 그대로 통과).
       * kind 이름 고정(store-shape 계약, gap1-p04-reliability-signals-reducer.test.ts가
       * 'compact-boundary' 문자열을 그대로 단정) — 임의 변경 금지.
       * CRITICAL: snapshotForPersist 제외(휘발) — kind==='msg'만 영속.
       */
      kind: 'compact-boundary'
      id: string
      trigger?: 'manual' | 'auto'
      preTokens?: number
      postTokens?: number
      /** W7 관례: 구독 레이어가 stamp — 이 kind 생성 시점에만 부여. */
      time?: string
    }
  | {
      /**
       * informational — SDK 정보성 배너 인라인 표시 (GAP1 P05, S-03).
       * `informational` 이벤트(SDKInformationalMessage, agent-events.ts:720) 수신 시
       * 1개 삽입 — NoticeItem(model-fallback/compact-boundary와 동일 문법,
       * Conversation.tsx)으로 렌더한다(신규 시각 컴포넌트 0). dedup 없음(reducer/cockpit.ts).
       * id 접두 'inf'(다른 notice류 'fb'/'dn'/'cb'와 충돌 0).
       * CRITICAL: snapshotForPersist 제외(휘발) — kind==='msg'만 영속.
       */
      kind: 'informational'
      id: string
      content: string
      level: 'info' | 'notice' | 'suggestion' | 'warning'
      /** true면 이 메시지 이후 실행이 중단된다(예: Stop 훅이 continuation을 거부). */
      preventContinuation?: boolean
      /** 동일 도구 호출에 대한 진행 메시지 중복 제거 키(있으면, 표시용 참고). */
      toolUseId?: string
      /** W7 관례: 구독 레이어가 stamp. */
      time?: string
    }
  | {
      /**
       * permission-denied — 대화형 프롬프트 없이 자동 거부된 도구 호출 인라인 표시
       * (GAP1 P05, S-04). `permission_denied` 이벤트(SDKPermissionDeniedMessage,
       * agent-events.ts:744) 수신 시 1개 삽입 — NoticeItem 재사용(신규 시각 컴포넌트 0).
       * dedup 없음(deny 정확성 우선 — 소음억제는 HookTimeline 접힘 UI 담당).
       * id 접두 'pd'(다른 notice류와 충돌 0).
       * CRITICAL: snapshotForPersist 제외(휘발) — kind==='msg'만 영속.
       */
      kind: 'permission-denied'
      id: string
      toolName: string
      decisionReasonType?: string
      decisionReason?: string
      /** W7 관례: 구독 레이어가 stamp. */
      time?: string
    }
