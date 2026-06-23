/**
 * settingsSampleData.ts — F7 설정 모달 정적 샘플 데이터.
 *
 * 새 IPC 0. window.api 호출 절대 금지. 순수 상수.
 *
 * P5a(Skill 탭): SkillEntry/SKILLS 제거 → SkillView가 window.api.listSkills() IPC 실데이터 사용.
 * P5b(MCP 탭): McpServerEntry/MCP_SERVERS 제거 → McpView가 window.api.listMcpServers() IPC 실데이터 사용.
 * P5c(엔진 탭): ENGINE_CURRENT/ENGINE_VERSIONS/EngineVersionEntry 제거 → VersionView가
 *   window.api.getEngineState() IPC 실데이터 사용(available/authed/version boolean+string만).
 * P5c(LSP 탭): LSP_SERVERS 정보성 정적 데이터 유지(번들/비번들 정보) — 가짜 설치 토글만 제거.
 */

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
