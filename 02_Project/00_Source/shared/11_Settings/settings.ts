import type { EngineSealStatus } from '../10_Engine/engine'

export const SETTINGS_CHANNELS = {
  COMMAND_LIST: 'settings.listCommands',
  MCP_LIST: 'settings.listMcp',
  MCP_SET_ENABLED: 'settings.setMcpEnabled',
  SKILL_LIST: 'settings.listSkills',
  SKILL_SET_ENABLED: 'settings.setSkillEnabled',
  CONTROLS_STATE: 'settings.controlsState',
  CONTROLS_SET_ENABLED: 'settings.setControlEnabled',
  CONTROLS_CONFIRM: 'settings.confirmControls',
} as const

// controls.json 봉인 상태 — none: 파일·봉인 모두 없음(첫 실행, 전부 켬) · ok: 앱이 저장한 그대로
// missing: 파일은 있고 봉인이 없음 · mismatch: 내용이 봉인과 다르거나, 봉인은 있는데 파일이 지워졌거나, 봉인을 읽지 못함.
// none·ok가 아니면 앱은 Claude 실행을 열지 않고 패널의 확인을 기다린다.
export type ControlsSealStatus = 'none' | 'ok' | 'missing' | 'mismatch'

// main controlNodes.ts의 ControlNodeInfo에 켜짐을 더한 화면 모양이다.
export interface ControlNodeView {
  id: string
  name: string
  point: 'canUseTool' | 'permissionRules' | 'preToolUse'
  judge: 'rule' | 'model' | 'human'
  results: ('allow' | 'ask' | 'deny' | 'notify' | 'transition')[]
  protection: 'L0' | 'L1' | 'L2' | 'L3'
  locked: boolean
  onFailure: 'block'
  timeoutMs: number | null
  enabled: boolean
  // 이 앱 실행 동안 메모리에 남은 그 노드의 최근 판정 수(상한 있는 고리). null은 앱이 판정을 보지 못하는 노드다
  recentVerdicts?: number | null
}

export interface ControlsState {
  // error: 파일을 읽다 오류가 났다(권한·잠금·같은 이름의 폴더) — 실행은 닫히고, 사유는 error 칸이다.
  status: ControlsSealStatus | 'error'
  error?: string
  // 거짓이면 확인이 기본값(전부 켬)으로 다시 쓴다 — 패널 경고 문구가 이걸로 갈린다.
  fileReadable: boolean
  nodes: ControlNodeView[]
  // 엔진 봉인의 바뀜 경고 몫(seal은 EngineSealStatus). 엔진 상태를 읽지 못하면 null이고 컨트롤 쪽은 그대로 보인다.
  engine: { seal: EngineSealStatus; active: string | null } | null
}

// 사람이 패널에서 본 「꺼진 노드」 목록. 지금 파일과 같을 때만 봉인한다.
export interface ControlConfirmReq {
  disabled: string[]
}

export interface ControlSetEnabledReq {
  id: string
  enabled: boolean
}

export interface SkillListRequest {
  root?: string
}

export interface SkillInfo {
  name: string
  description: string
  scope: 'global' | 'local'
  enabled: boolean
}

export interface SkillSetEnabledReq {
  name: string
  enabled: boolean
}

export interface McpServerInfo {
  name: string
  scope: 'global' | 'local'
  origin: 'user' | 'project' | 'local'
  transport: 'stdio' | 'http' | 'sse' | 'unknown'
  detail: string
  enabled: boolean
}

export interface McpSetEnabledReq {
  name: string
  enabled: boolean
}

export interface CommandListRequest {
  root?: string
}

export interface SlashCommandInfo {
  name: string
  description: string
  argHint?: string
  scope: 'builtin' | 'user' | 'project'
}
