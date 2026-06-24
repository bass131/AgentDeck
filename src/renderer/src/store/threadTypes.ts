/**
 * threadTypes.ts — ThreadItem union 타입 정의.
 *
 * Phase A-2: 시간순 단일 스트림 thread 모델.
 * 원본 AgentCodeGUI/src/renderer/src/store/session.ts L14-33 미러.
 *
 * CRITICAL: reducer.ts → threadTypes 의존 금지(순환 import 회피).
 * reducer.ts는 이 파일에서 re-export(기존 import 경로 호환).
 *
 * NOTE: cmdresult 타입은 의도적으로 제외 — 우리는 슬래시를 cmdresult 없이 처리(MVP).
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
    }
  | {
      kind: 'notice'
      id: string
      text: string
    }
