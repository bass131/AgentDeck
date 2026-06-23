/**
 * settingsSampleData.ts — F7 설정 모달 정적 샘플 데이터.
 *
 * 새 IPC 0. window.api 호출 절대 금지. 순수 상수.
 *
 * P5a(Skill 탭): SkillEntry/SKILLS 제거 → SkillView가 window.api.listSkills() IPC 실데이터 사용.
 * P5b(MCP 탭): MCP_SERVERS 실IPC 교체 예정.
 * P5c(LSP 탭): LSP_SERVERS 실IPC 교체 예정.
 */

// ------------------------------------------------------------------ 엔진 버전
export interface EngineVersionEntry {
  version: string
  latest?: boolean
  installed?: boolean
}

/** 현재 사용 중인 엔진 버전 */
export const ENGINE_CURRENT = '1.0.120'

/** 버전 목록 (내림차순, 최신→구) */
export const ENGINE_VERSIONS: EngineVersionEntry[] = [
  { version: '1.0.124', latest: true },
  { version: '1.0.122' },
  { version: '1.0.120', installed: true }, // ENGINE_CURRENT와 일치 (현재+설치됨)
  { version: '1.0.118', installed: true },
  { version: '1.0.116' },
  { version: '1.0.114' },
  { version: '1.0.110' },
]

// ------------------------------------------------------------------ MCP 서버
export interface McpServerEntry {
  name: string
  scope: 'global' | 'local'
  transport: 'STDIO' | 'HTTP' | 'SSE'
  detail: string
  enabled: boolean
}

export const MCP_SERVERS: McpServerEntry[] = [
  {
    name: 'filesystem',
    scope: 'global',
    transport: 'STDIO',
    detail: 'npx @anthropic/mcp-server-filesystem ~/workspace',
    enabled: true,
  },
  {
    name: 'web-search',
    scope: 'global',
    transport: 'HTTP',
    detail: 'http://localhost:3001/mcp',
    enabled: false,
  },
  {
    name: 'project-tools',
    scope: 'local',
    transport: 'STDIO',
    detail: 'node .mcp/tools.js',
    enabled: true,
  },
]

// ------------------------------------------------------------------ LSP 서버
export interface LspServerEntry {
  id: 'ts' | 'py' | 'cs' | 'cpp'
  langs: string
  exts: string
  state: 'bundled' | 'installed' | 'download'
  requires?: string
  kind: 'bundled' | 'download'
}

export const LSP_SERVERS: LspServerEntry[] = [
  {
    id: 'ts',
    langs: 'TypeScript / JavaScript',
    exts: '.ts .tsx .js .jsx .mjs .cjs',
    state: 'bundled',
    kind: 'bundled',
  },
  {
    id: 'py',
    langs: 'Python',
    exts: '.py .pyi .ipynb',
    state: 'bundled',
    kind: 'bundled',
  },
  {
    id: 'cs',
    langs: 'C#',
    exts: '.cs .csproj .sln',
    state: 'download',
    requires: '.NET SDK 필요',
    kind: 'download',
  },
  {
    id: 'cpp',
    langs: 'C / C++',
    exts: '.c .cpp .cc .h .hpp',
    state: 'download',
    kind: 'download',
  },
]

/** LSP 배지 파일명 맵 */
export const LSP_BADGE: Record<LspServerEntry['id'], string> = {
  ts: 'a.ts',
  py: 'a.py',
  cs: 'a.cs',
  cpp: 'a.cpp',
}
