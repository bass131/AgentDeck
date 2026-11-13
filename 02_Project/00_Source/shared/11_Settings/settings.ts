export const SETTINGS_CHANNELS = {
  COMMAND_LIST: 'command.list',
  MCP_LIST: 'mcp.list',
  MCP_SET_ENABLED: 'mcp.setEnabled',
  SKILL_LIST: 'skill.list',
  SKILL_SET_ENABLED: 'skill.setEnabled',
} as const

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
