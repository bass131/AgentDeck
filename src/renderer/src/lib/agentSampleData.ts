/**
 * agentSampleData.ts — 단위테스트/시각 데모용 정적 샘플 데이터 (F10-02).
 *
 * 실 런타임 데이터(에이전트 실행 결과)는 M4에서 연결.
 * window.api 0 — renderer state 전용.
 *
 * Phase 24a: Todo를 shared TodoItem과 정렬 — TodoItem 재export + Todo=TodoItem alias.
 * 기존 import { Todo } 코드는 그대로 동작(비파괴).
 */
import type { TodoItem } from '../../../shared/agent-events'

// ── 타입 정의 ──────────────────────────────────────────────────────────────────

/**
 * Todo — Phase 24a: shared TodoItem의 alias(동형).
 * 기존 import 하위호환 유지. 신규 코드는 TodoItem 직접 사용 권장.
 */
export type Todo = TodoItem

// TodoItem을 renderer 하위 모듈에서 편하게 re-export (선택적 사용)
export type { TodoItem }

export interface SubAgentTool {
  id: string
  verb: string
  target: string
  status: 'running' | 'done' | 'queued'
}

export interface SubAgentInfo {
  id: string
  name: string
  role: string
  status: 'queued' | 'running' | 'done'
  activity?: string
  tools: SubAgentTool[]
}

// ── 샘플 데이터 ────────────────────────────────────────────────────────────────

export const SAMPLE_TODOS: Todo[] = [
  { id: 'todo-1', label: '요구사항 분석', status: 'done' },
  { id: 'todo-2', label: '아키텍처 설계', status: 'done' },
  { id: 'todo-3', label: '컴포넌트 구현', status: 'running' },
  { id: 'todo-4', label: '단위 테스트 작성', status: 'planned' },
  { id: 'todo-5', label: '통합 테스트', status: 'planned' },
]

export const SAMPLE_SUBAGENTS: SubAgentInfo[] = [
  {
    id: 'sa-1',
    name: '탐색 에이전트',
    role: 'explorer',
    status: 'done',
    activity: '프로젝트 구조를 분석하고 관련 파일을 탐색했습니다.\n\n핵심 파일: `src/renderer`, `src/main`.',
    tools: [
      { id: 'tool-1', verb: 'read', target: 'src/renderer/src/store/appStore.ts', status: 'done' },
      { id: 'tool-2', verb: 'glob', target: '**/*.tsx', status: 'done' },
    ],
  },
  {
    id: 'sa-2',
    name: '구현 에이전트',
    role: 'builder',
    status: 'running',
    activity: '컴포넌트를 구현 중입니다…',
    tools: [
      { id: 'tool-3', verb: 'write', target: 'src/renderer/src/components/RecentFiles.tsx', status: 'running' },
    ],
  },
  {
    id: 'sa-3',
    name: '검증 에이전트',
    role: 'verifier',
    status: 'queued',
    tools: [],
  },
]
