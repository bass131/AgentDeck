import { DEFAULT_MODEL, DEFAULT_EFFORT, DEFAULT_MODE_MULTI } from './pickerOptions'

export type AgentStatus = 'idle' | 'analyzing' | 'working' | 'done' | 'error'

export const COLS: Record<number, number> = { 2: 2, 3: 3, 4: 2, 5: 3, 6: 3 }

export const COUNT_OPTIONS = [2, 3, 4, 5, 6] as const

export const STATUS_META: Record<AgentStatus, { label: string; cls: string }> = {
  idle:      { label: '대기',    cls: 'idle' },
  analyzing: { label: '분석 중', cls: 'analyzing' },
  working:   { label: '작업 중', cls: 'working' },
  done:      { label: '완료',    cls: 'done' },
  error:     { label: '오류',    cls: 'error' },
}

export interface PickerState {
  model: string
  effort: string
  mode: string
}

export const DEFAULT_PICKER: PickerState = {
  model: DEFAULT_MODEL,
  effort: DEFAULT_EFFORT,
  mode: DEFAULT_MODE_MULTI,
}

export interface SamplePanel {
  title: string
  status: AgentStatus
  cwd: string
  ctxPct: number
  sysPrompt?: string
}

export const SAMPLE_PANELS: SamplePanel[] = [
  {
    title: '프론트엔드 리팩토링',
    status: 'working',
    cwd: 'C:/Dev/AgentDeck/src/renderer',
    ctxPct: 42,
    sysPrompt: '코드 수정 전에 항상 계획부터 설명할 것.',
  },
  {
    title: '백엔드 API 구현',
    status: 'done',
    cwd: 'C:/Dev/AgentDeck/src/main',
    ctxPct: 78,
  },
  {
    title: '테스트 작성',
    status: 'idle',
    cwd: 'C:/Dev/AgentDeck/tests',
    ctxPct: 5,
  },
  {
    title: '문서화',
    status: 'analyzing',
    cwd: 'C:/Dev/AgentDeck/docs',
    ctxPct: 18,
    sysPrompt: '마크다운으로 작성. 예시 코드 포함.',
  },
  {
    title: '성능 최적화',
    status: 'error',
    cwd: 'C:/Dev/AgentDeck/src/renderer',
    ctxPct: 91,
  },
  {
    title: '새 작업',
    status: 'idle',
    cwd: '',
    ctxPct: 0,
  },
]

export const SAMPLE_BATCH_TO = 'C:/Dev/AgentDeck/src'

export { MODELS as MODEL_OPTIONS, EFFORTS as EFFORT_OPTIONS, MODES as MODE_OPTIONS } from './pickerOptions'
