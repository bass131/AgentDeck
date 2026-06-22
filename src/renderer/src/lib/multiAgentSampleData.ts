/**
 * multiAgentSampleData.ts — F13 멀티에이전트 워크스페이스 정적 샘플 데이터.
 *
 * window.api 호출 0. 순수 정적 데이터.
 * COLS/COUNT_OPTIONS/STATUS_META/DEFAULT_PICKER = 원본 MultiAgent.tsx L60~77 1:1.
 */

// ── 상태 타입 ─────────────────────────────────────────────────────────────
export type AgentStatus = 'idle' | 'analyzing' | 'working' | 'done' | 'error'

// ── 그리드 열 수 (원본 COLS 1:1) ─────────────────────────────────────────
export const COLS: Record<number, number> = { 2: 2, 3: 3, 4: 2, 5: 3, 6: 3 }

// ── 패널 수 옵션 ──────────────────────────────────────────────────────────
export const COUNT_OPTIONS = [2, 3, 4, 5, 6] as const

// ── 상태 메타 (원본 STATUS_META 1:1) ─────────────────────────────────────
export const STATUS_META: Record<AgentStatus, { label: string; cls: string }> = {
  idle:      { label: '대기',    cls: 'idle' },
  analyzing: { label: '분석 중', cls: 'analyzing' },
  working:   { label: '작업 중', cls: 'working' },
  done:      { label: '완료',    cls: 'done' },
  error:     { label: '오류',    cls: 'error' },
}

// ── 기본 피커 (원본 DEFAULT_PICKER 1:1) ──────────────────────────────────
export interface PickerState {
  model: string
  effort: string
  mode: string
}

export const DEFAULT_PICKER: PickerState = {
  model: 'opus',
  effort: 'xhigh',
  mode: 'bypass',
}

// ── 샘플 패널 (6개 슬롯) ──────────────────────────────────────────────────
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

// ── 일괄 폴더 대상 (F13-02 FolderSwitchDialog to= 더미) ──────────────────
export const SAMPLE_BATCH_TO = 'C:/Dev/AgentDeck/src'

// ── 피커 옵션 (PanelView RunPickers용) ───────────────────────────────────
export const MODEL_OPTIONS = [
  { id: 'opus',    label: 'Opus',    desc: '최고 성능' },
  { id: 'sonnet',  label: 'Sonnet',  desc: '균형' },
  { id: 'haiku',   label: 'Haiku',   desc: '빠름' },
]

export const EFFORT_OPTIONS = [
  { id: 'xhigh', label: '최대',   desc: '최고 품질' },
  { id: 'high',  label: '높음',   desc: '고품질' },
  { id: 'med',   label: '보통',   desc: '기본' },
  { id: 'low',   label: '낮음',   desc: '빠름' },
]

export const MODE_OPTIONS = [
  { id: 'bypass',  label: '자율',   desc: '모든 도구 자동 허용' },
  { id: 'approve', label: '승인',   desc: '도구 사용 시 승인 요청' },
  { id: 'safe',    label: '안전',   desc: '읽기 전용' },
]
