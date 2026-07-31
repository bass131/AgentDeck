import type { TodoItem, SubAgentTool, SubAgentInfo, SubAgentTranscriptItem } from '../../../shared/agentEvents'

export type Todo = TodoItem

export type { TodoItem }

export type { SubAgentTool }

export type { SubAgentInfo }

export type { SubAgentTranscriptItem }

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
