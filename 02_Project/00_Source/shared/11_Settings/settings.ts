export const SETTINGS_CHANNELS = {
  // M05 G10 재분류: command.*·mcp.*·skill.* → settings.*
  COMMAND_LIST: 'settings.listCommands',
  MCP_LIST: 'settings.listMcp',
  MCP_SET_ENABLED: 'settings.setMcpEnabled',
  SKILL_LIST: 'settings.listSkills',
  SKILL_SET_ENABLED: 'settings.setSkillEnabled',
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
