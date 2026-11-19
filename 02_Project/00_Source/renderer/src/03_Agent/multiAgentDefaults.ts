import { DEFAULT_MODEL, DEFAULT_EFFORT, DEFAULT_MODE_PANEL } from '@renderer/03_Agent/pickerOptions'

export type AgentStatus = 'idle' | 'analyzing' | 'working' | 'done' | 'error'

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
  mode: DEFAULT_MODE_PANEL,
}

export interface SamplePanel {
  title: string
  status: AgentStatus
  cwd: string
  ctxPct: number
  sysPrompt?: string
}
