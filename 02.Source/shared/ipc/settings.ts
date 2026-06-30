/**
 * ipc/settings.ts — 설정(커맨드·MCP·스킬) 도메인 채널·타입 계약
 *
 * 채널: COMMAND_LIST · MCP_LIST · MCP_SET_ENABLED · SKILL_LIST · SKILL_SET_ENABLED
 * 구현 위치: main-process 담당 (이 파일은 *정의*만 — 핸들러 로직 없음).
 */

// ── 채널명 상수 ──────────────────────────────────────────────────────────────

export const SETTINGS_CHANNELS = {
  /**
   * 슬래시 커맨드 목록 조회 (invoke).
   * 인자 없음. 응답 SlashCommandInfo[].
   *
   * 유래: SDK supportedCommands/init.slash_commands(빌트인) +
   *       커스텀 .claude/commands/*.md 스캔(사용자·프로젝트).
   * 용도: Composer에서 '/' 입력 시 슬래시 자동완성 팔레트가 이 채널로 목록을 조회한다.
   *
   * CRITICAL(신뢰경계): 응답 SlashCommandInfo 는 name/description/argHint/scope 만 포함.
   *   - .md 본문(커맨드 실행 프롬프트)·파일 경로·환경변수·시크릿은 절대 미포함.
   *   - name 은 슬래시 제외 식별자(예: 'compact', 'deploy') — 경로 탈출 불가.
   *   - main이 검증 후 표시 정보만 추출하여 반환한다.
   *
   * 구현: main-process `settings/commands.ts` (SDK 빌트인 목록 + .claude/commands 디렉토리 스캔).
   * 소비: renderer Composer 슬래시 팔레트 — '/' 입력 후 이 채널 invoke, 결과로 팔레트 필터링.
   */
  COMMAND_LIST: 'command.list',
  /**
   * MCP 서버 목록 조회 (invoke).
   * 인자 없음. 응답 McpServerInfo[].
   *
   * 유래: 원본 AgentCodeGUI protocol.ts L379 McpServerInfo 미러.
   * 용도: Settings MCP 탭에서 실데이터를 렌더링하고 활성/비활성 상태를 반영한다.
   *
   * CRITICAL(신뢰경계): 응답 McpServerInfo 는 name/scope/origin/transport/detail/enabled 만 포함.
   *   - detail 은 main(settings/mcp.ts)이 화이트리스트 마스킹한 안전 문자열만 전달 —
   *     stdio 서버: command basename 만(예: 'npx', 'node') · args/env 절대 미포함.
   *     http/sse 서버: host 만(예: 'api.example.com') · URL 토큰·Authorization 헤더 미포함.
   *   - env/args/url/command/headers 같은 시크릿 운반 필드는 이 타입에 절대 추가 금지.
   * 구현: main-process `settings/mcp.ts`.
   * 소비: renderer SettingsModal McpView.
   */
  MCP_LIST: 'mcp.list',
  /**
   * MCP 서버 활성화/비활성화 토글 (invoke).
   * 요청 McpSetEnabledReq. 응답 { ok: boolean }.
   *
   * 유래: 원본 AgentCodeGUI protocol.ts L379 McpServerInfo 미러(toggle 조작 파생).
   * 용도: Settings MCP 탭 토글 스위치가 조작될 때 renderer가 이 채널로 main에 전달한다.
   *
   * CRITICAL(신뢰경계): 요청에는 name(서버 식별자)과 enabled(boolean)만 포함.
   *   - env/args/url/command/headers 같은 시크릿 운반 필드 0 — boolean-only 토글.
   *   - name 은 서버 식별자(mcpServers map 키)만 — 경로 문자 포함 금지(main이 검증).
   * 구현: main-process `settings/mcp.ts`.
   * 소비: renderer SettingsModal McpView 토글 핸들러.
   */
  MCP_SET_ENABLED: 'mcp.setEnabled',
  /**
   * 스킬 목록 조회 (invoke).
   * 인자 없음. 응답 SkillInfo[].
   *
   * 유래: 원본 AgentCodeGUI protocol.ts L392 SkillInfo 미러.
   * 용도: Settings Skill 탭에서 실데이터를 렌더링하고 토글 상태를 반영한다.
   *
   * CRITICAL(신뢰경계): 응답 SkillInfo 는 name/description/scope/enabled만 포함.
   * path·시크릿·API 키 필드 없음 — 스킬 식별자(name)와 표시 정보(description/scope)
   * + 활성화 불리언(enabled)만 전달한다.
   * 구현: main-process `settings/skills.ts`.
   * 소비: renderer SettingsModal SkillView.
   */
  SKILL_LIST: 'skill.list',
  /**
   * 스킬 활성화/비활성화 토글 (invoke).
   * 요청 SkillSetEnabledReq. 응답 { ok: boolean }.
   *
   * 유래: 원본 AgentCodeGUI protocol.ts L392 SkillInfo 미러.
   * 용도: Settings Skill 탭의 토글 스위치가 사용자 조작 후 이 채널을 통해 main에 전달한다.
   *
   * CRITICAL(신뢰경계): 요청에는 name(스킬 식별자)과 enabled(boolean)만 포함.
   * path·시크릿·인증 정보 없음. boolean-only 토글 — 문자열 값 전달 불가.
   * 구현: main-process `settings/skills.ts`.
   * 소비: renderer SettingsModal SkillView 토글 핸들러.
   */
  SKILL_SET_ENABLED: 'skill.setEnabled',
} as const

// ── 스킬 타입 (P5a — Settings Skill 탭 실데이터·토글) ────────────────────────

/**
 * 스킬 레코드 — Settings Skill 탭 표시 단위.
 *
 * 유래: 원본 AgentCodeGUI `protocol.ts L392 SkillInfo` 미러.
 * 용도: Settings Skill 탭에서 스킬 목록 실데이터를 렌더링(SkillView)하고
 *       토글 스위치로 활성화/비활성화를 제어하는 데 사용한다.
 *
 * CRITICAL(신뢰경계):
 *   - name/description/scope/enabled **4개 필드만** — path·시크릿·API 키·토큰 없음.
 *   - name: 스킬 식별자(ASCII 안전 문자열) — 경로 구분자/..  포함 금지(main이 검증).
 *   - description: 표시용 설명 문자열 — 자격증명 절대 미포함, 호출부 책임.
 *   - scope: 'global'(모든 프로젝트) | 'local'(현재 워크스페이스 전용).
 *   - enabled: 활성화 여부 boolean — 문자열·숫자 아님.
 *
 * 구현 위치: main-process `src/main/05_settings/skills.ts` (IPC 핸들러 + 스킬 저장).
 * 소비처: renderer `SettingsModal SkillView` — skill.list 응답 SkillInfo[]를 렌더링.
 */
export interface SkillInfo {
  /** 스킬 식별자 — main이 토큰/경로 문자 검증. */
  name: string
  /** 스킬 표시 설명 — 자격증명 미포함, 표시 전용. */
  description: string
  /** 스킬 적용 범위: 'global'=모든 프로젝트 | 'local'=현재 워크스페이스 전용. */
  scope: 'global' | 'local'
  /** 활성화 여부 boolean — 문자열 아님, 토글 스위치 상태와 1:1 대응. */
  enabled: boolean
}

/**
 * `skill.setEnabled` 요청 — 스킬 활성화/비활성화 토글.
 *
 * 유래: 원본 AgentCodeGUI protocol.ts SkillInfo 미러(toggle 조작 파생).
 * 용도: Settings Skill 탭 토글 스위치가 조작될 때 renderer가 이 요청을 main으로 전송한다.
 *
 * CRITICAL(신뢰경계):
 *   - name·enabled **2개 필드만** — path·시크릿·토큰 없음.
 *   - enabled는 **boolean만** — 'true'/'false' 문자열 전달 불가, main이 타입 검증.
 *   - name은 스킬 식별자(ASCII) — 경로 탈출('..'/절대경로) main이 차단.
 *
 * 구현 위치: main-process `src/main/05_settings/skills.ts`.
 * 소비처: renderer SettingsModal SkillView 토글 onChange 핸들러.
 */
export interface SkillSetEnabledReq {
  /** 대상 스킬 식별자 — SkillInfo.name 과 대응. */
  name: string
  /** 활성화(true) / 비활성화(false) — boolean-only 토글. */
  enabled: boolean
}

// ── MCP 타입 (P5b — Settings MCP 탭 실데이터·토글) ───────────────────────────

/**
 * MCP 서버 레코드 — Settings MCP 탭 표시 단위.
 *
 * 유래: 원본 AgentCodeGUI `protocol.ts L379 McpServerInfo` 1:1 미러.
 * 용도: Settings MCP 탭에서 MCP 서버 목록 실데이터를 렌더링(McpView)하고
 *       토글 스위치로 활성화/비활성화를 제어하는 데 사용한다.
 *
 * CRITICAL(신뢰경계 — 절대 규칙):
 *   - name/scope/origin/transport/detail/enabled **6개 필드만**.
 *   - env/args/url/command/headers 같은 시크릿 운반 필드를 이 타입에 추가하면
 *     **신뢰경계 붕괴** — 이 계약 밖 필드 추가는 reviewer 무조건 필수.
 *   - `detail` 은 main(settings/mcp.ts)이 화이트리스트 마스킹한 안전 문자열만:
 *       stdio → command basename 만(예: 'npx', 'node') — args/env 절대 미포함.
 *       http/sse → host 만(예: 'api.example.com') — URL 토큰·Authorization 미포함.
 *       unknown → 빈 문자열 또는 'unknown'.
 *   - server `name`·transport·scope·origin·enabled boolean만 renderer로 전달된다.
 *
 * 구현 위치: main-process `src/main/05_settings/mcp.ts` (IPC 핸들러 + MCP 서버 발견 + 마스킹).
 * 소비처: renderer `SettingsModal McpView` — mcp.list 응답 McpServerInfo[]를 렌더링.
 */
export interface McpServerInfo {
  /** 서버 이름 (mcpServers map 의 key — 동명 서버 구분자). */
  name: string
  /**
   * 서버 범위(탭 필터 기준).
   * 'global' = ~/.claude.json 사용자 서버 · 'local' = 프로젝트/로컬 서버.
   */
  scope: 'global' | 'local'
  /**
   * 설정 출처(행 배지 표시).
   * 'user'(~/.claude.json) · 'project'(.mcp.json) · 'local'(로컬 전용 설정).
   * 동명 서버가 여러 출처에 존재할 때 구분자로 사용.
   */
  origin: 'user' | 'project' | 'local'
  /**
   * 전송 프로토콜.
   * 'stdio'(command 기반) · 'http' · 'sse' · 'unknown'(파싱 불가 서버).
   */
  transport: 'stdio' | 'http' | 'sse' | 'unknown'
  /**
   * 서버 식별 정보 — main이 화이트리스트 마스킹한 안전 문자열만.
   *
   * CRITICAL(신뢰경계): 이 필드에는 시크릿·자격증명·전체 명령행·URL 전체가
   * 절대 포함되지 않는다. main(settings/mcp.ts)이 다음 규칙으로 마스킹 후 전달:
   *   - stdio: command 의 basename 만(예: 'npx', 'node', 'python') — args/env 제거.
   *   - http/sse: URL 의 host 만(예: 'api.example.com') — path·query·token 제거.
   *   - unknown: 빈 문자열 또는 'unknown'.
   * renderer 는 이 값을 표시 목적으로만 사용해야 한다.
   */
  detail: string
  /**
   * 활성화 여부.
   * false → 엔진에 deniedMcpServers 로 전달되어 해당 서버를 비활성화.
   * boolean-only — 문자열·숫자 아님.
   */
  enabled: boolean
}

/**
 * `mcp.setEnabled` 요청 — MCP 서버 활성화/비활성화 토글.
 *
 * 유래: 원본 AgentCodeGUI protocol.ts McpServerInfo 미러(toggle 조작 파생).
 * 용도: Settings MCP 탭 토글 스위치가 조작될 때 renderer가 이 요청을 main으로 전송한다.
 *
 * CRITICAL(신뢰경계):
 *   - name·enabled **2개 필드만** — env/args/url/command/headers·시크릿·토큰 없음.
 *   - enabled는 **boolean만** — 'true'/'false' 문자열 전달 불가, main이 타입 검증.
 *   - name 은 MCP 서버 식별자(mcpServers map 키) — 경로 탈출·임의 문자 main이 차단.
 *
 * 구현 위치: main-process `src/main/05_settings/mcp.ts`.
 * 소비처: renderer SettingsModal McpView 토글 onChange 핸들러.
 */
export interface McpSetEnabledReq {
  /** 대상 MCP 서버 식별자 — McpServerInfo.name 과 대응. */
  name: string
  /** 활성화(true) / 비활성화(false) — boolean-only 토글. */
  enabled: boolean
}

// ── 슬래시 커맨드 타입 (P10 — Composer 슬래시 자동완성 팔레트) ───────────────

/**
 * 슬래시 커맨드 레코드 — Composer 슬래시 팔레트 표시 단위.
 *
 * 유래: SDK supportedCommands / init.slash_commands(빌트인) +
 *       커스텀 .claude/commands/*.md 스캔(사용자 ~/ · 프로젝트 <ws>/.claude/commands).
 * 용도: Composer에서 '/' 입력 시 슬래시 자동완성 팔레트가 이 타입의 배열로 목록을 필터링한다.
 *       기존 SKILL_LIST 재사용 패턴 — Settings Skill 탭과 동일한 IPC 노출 최소화 방식.
 *
 * CRITICAL(신뢰경계 — 절대 규칙):
 *   - name/description/argHint/scope **4개 필드 최대** — 시크릿 0.
 *   - path(.md 파일 경로)·content(.md 본문)·body·env 같은 민감·실행 데이터를
 *     이 타입에 추가하면 **신뢰경계 붕괴** — 계약 밖 필드 추가는 reviewer 무조건 필수.
 *   - name: 슬래시 제외 순수 식별자(예: 'compact', 'deploy') — '/' 접두사 없음.
 *     경로 탈출('..'/절대경로/경로 구분자 포함 금지) — main이 검증 후 안전 문자열만 전달.
 *   - description: 표시용 설명 — frontmatter description 또는 빌트인 설명 문자열만.
 *     자격증명·시크릿 절대 미포함.
 *   - argHint: 선택 필드 — '[file] [format]' 등 인자 힌트 문자열. 없으면 생략(undefined).
 *   - scope: 출처 구분 리터럴 — 팔레트 UI의 배지/필터 기준.
 *
 * 구현 위치: main-process `src/main/05_settings/commands.ts`
 *   (SDK 빌트인 목록 + ~/.claude/commands 스캔 + <ws>/.claude/commands 스캔 → 병합 정렬).
 * 소비처: renderer Composer 슬래시 팔레트
 *   (command.list invoke → SlashCommandInfo[] 수신 → '/' 입력 후 name 기준 필터링).
 */
export interface SlashCommandInfo {
  /**
   * 슬래시 제외 커맨드 이름 (예: 'compact', 'deploy', 'review').
   * '/' 접두사 없음 — renderer가 표시 시 '/' + name 조합.
   * 경로 구분자·'..'·절대경로 포함 금지 — main이 검증 후 안전 문자열만 전달.
   */
  name: string
  /**
   * 커맨드 설명 문자열.
   * 빌트인: SDK가 제공하는 설명 문자열.
   * 커스텀: .claude/commands/*.md frontmatter description 필드 (없으면 파일명에서 파생).
   * 표시 전용 — 자격증명·시크릿 절대 미포함.
   */
  description: string
  /**
   * 인자 힌트 문자열 (선택).
   * 예: '[file] [format]', '[env]', '[template]'.
   * 없으면 생략(undefined) — 팔레트 UI가 조건부 표시.
   */
  argHint?: string
  /**
   * 커맨드 출처 구분.
   *
   * - 'builtin':  Claude Code SDK 내장 커맨드 (예: /compact, /init, /help, /clear).
   * - 'user':     사용자 커스텀 커맨드 (~/.claude/commands/*.md).
   * - 'project':  프로젝트 커스텀 커맨드 (<workspace>/.claude/commands/*.md).
   *
   * 팔레트 UI의 배지(scope 배지)·필터 기준으로 사용한다.
   */
  scope: 'builtin' | 'user' | 'project'
}
