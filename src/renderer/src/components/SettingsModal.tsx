/**
 * SettingsModal.tsx — 설정 모달 5탭 (F7).
 *
 * nav: Claude Code · MCP · Skill · Code · 테마
 * 데이터:
 *   - VersionView: window.api.getEngineState() IPC 실데이터 (P5c).
 *   - McpView: window.api.listMcpServers() IPC 실데이터 (P5b).
 *   - SkillView: window.api.listSkills() IPC 실데이터 (P5a).
 *   - LspView: LSP_SERVERS 정적 정보(번들/비번들 정보만) + 비번들 버튼 비활성(P5c).
 *
 * 회귀 가드:
 *  - Theme 탭 nav 라벨 = '테마' (기존 settings-theme.test.tsx / modal.test.tsx 계약)
 *  - .set-nav / .set-nav-item 클래스 유지
 *  - set-theme-opt aria-pressed 동작 유지
 *
 * 신뢰경계(CRITICAL):
 *  - renderer untrusted — fs/Node 직접 호출 0.
 *  - IPC 채널 접근은 window.api.getEngineState / window.api.listMcpServers /
 *    window.api.setMcpEnabled / window.api.listSkills / window.api.setSkillEnabled 만.
 *  - getEngineState 응답: available/authed(boolean) + version(string|null) — 토큰/키 값 미취급.
 *  - 채널명 문자열 하드코딩 0 (preload가 IPC_CHANNELS 참조하여 노출).
 *  - detail은 main에서 마스킹된 안전 문자열 — renderer는 추가 가공 없이 표시만.
 *
 * 인라인 색상 0. 벡터 아이콘. 이모지 금지.
 */
import { useState, useEffect, useCallback, type JSX } from 'react'
import { Modal } from './Modal'
import { FileBadge } from './FileBadge'
import {
  IconClaude,
  IconServer,
  IconBook,
  IconCode,
  IconContrast,
  IconRefresh,
  IconCheck,
  type IconProps,
} from './icons'
import { getTheme, setTheme, type Theme } from '../lib/theme'
import {
  LSP_SERVERS,
  LSP_BADGE,
} from '../lib/settingsSampleData'
import type { SkillInfo, McpServerInfo, EngineState } from '../../../shared/ipc-contract'
import { ProviderStatusPanel } from './ProviderStatusPanel'
import './SettingsModal.css'

// ------------------------------------------------------------------ 타입
type NavId = 'version' | 'mcp' | 'skill' | 'lsp' | 'appearance'

const NAV: { id: NavId; label: string; Icon: (p: IconProps) => JSX.Element }[] = [
  { id: 'version', label: 'Claude Code', Icon: IconClaude },
  { id: 'mcp', label: 'MCP', Icon: IconServer },
  { id: 'skill', label: 'Skill', Icon: IconBook },
  { id: 'lsp', label: 'Code', Icon: IconCode },
  { id: 'appearance', label: '테마', Icon: IconContrast },
]

// ------------------------------------------------------------------ VersionView (P5c — IPC 실배선)
/**
 * VersionView — window.api.getEngineState() IPC로 실 SDK 상태 로드.
 *
 * 단방향 데이터 흐름:
 *   IPC 이벤트(getEngineState 응답) → engineState state → 컴포넌트 리렌더.
 *
 * 신뢰경계(CRITICAL):
 *   window.api.getEngineState 만 사용. fs/Node 직접 0.
 *   응답: available(boolean) + authed(boolean) + version(string|null) — 토큰/키 값 미취급.
 *   채널명 문자열 하드코딩 0.
 *
 * 제거된 가짜 UI:
 *   - 버전 드롭다운 picker(vpick) — 멀티 CLI 버전 선택은 SDK 모델에 무의미.
 *   - ENGINE_VERSIONS 목록 — 하드코딩 가짜 버전 목록 제거.
 *   - 설치/삭제/사용 버튼 — SDK는 앱 내장이므로 불요.
 *   - 가짜 경로 문구(~/.agentdeck/engines/<버전>) — 사실이 아님.
 */
function VersionView(): JSX.Element {
  const [engineState, setEngineState] = useState<EngineState | null>(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const state = await window.api.getEngineState()
        if (!cancelled) {
          setEngineState(state)
          setLoadError(false)
        }
      } catch {
        // 실패 시 graceful — SDK 로드 실패 표시
        if (!cancelled) {
          setLoadError(true)
        }
      }
    })()
    return () => { cancelled = true }
  }, [])

  // available=false이거나 IPC 실패 시
  const failed = loadError || (engineState !== null && !engineState.available)
  const authed = engineState?.authed ?? false
  const version = engineState?.version

  return (
    <>
      <div className="set-h1">Claude Code</div>
      <div className="set-h1-sub">
        Agent SDK 기반 코딩 엔진의 인증 및 상태를 확인합니다.
      </div>

      <div className="sec">
        <div className="card">
          <div className="ver-row">
            <div className="ver-ic engine">
              <IconClaude size={20} />
            </div>
            <div className="ver-main">
              <div className="ver-name">현재 엔진</div>
              <div className="ver-meta">
                {engineState === null && !loadError
                  ? '로딩 중...'
                  : failed
                    ? '사용 불가'
                    : 'Agent SDK'}
              </div>
              {!failed && engineState !== null && (
                <div className="ver-meta">
                  {version != null ? `v${version}` : '버전 확인 불가'}
                </div>
              )}
            </div>

            <div className="ver-badges">
              {failed ? (
                <span className="vtag err">SDK 로드 실패</span>
              ) : engineState === null ? null : authed ? (
                <span className="vtag cur">인증됨</span>
              ) : (
                <span className="vtag muted">미인증</span>
              )}
            </div>
          </div>
        </div>

        <div className="set-note">
          Agent SDK는 앱에 내장되어 있습니다. 인증은 OAuth 구독 또는 ANTHROPIC_API_KEY를 사용합니다.
        </div>
      </div>

      {/* ── 프로바이더 섹션 (B1) ─────────────────────────────────── */}
      <div className="sec">
        <div className="set-h2">프로바이더</div>
        <ProviderStatusPanel />
      </div>
    </>
  )
}

// ------------------------------------------------------------------ ScopeTabs (공통)
type Scope = 'all' | 'global' | 'local'

const SCOPE_TABS: { id: Scope; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'global', label: '전역' },
  { id: 'local', label: '로컬' },
]

interface ScopeTabsProps {
  scope: Scope
  counts: Record<Scope, number>
  onScope: (s: Scope) => void
  onRefresh: () => void
}

function ScopeTabs({ scope, counts, onScope, onRefresh }: ScopeTabsProps): JSX.Element {
  return (
    <div className="skill-tabs">
      {SCOPE_TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={'skill-tab' + (scope === t.id ? ' active' : '')}
          onClick={() => onScope(t.id)}
        >
          {t.label}
          <span className="skill-tab-n">{counts[t.id]}</span>
        </button>
      ))}
      <button type="button" className="skill-refresh" onClick={onRefresh} aria-label="새로고침">
        <IconRefresh size={14} />
      </button>
    </div>
  )
}

// ------------------------------------------------------------------ ToggleSwitch (공통)
interface ToggleSwitchProps {
  checked: boolean
  label: string
  onChange: (next: boolean) => void
}

function ToggleSwitch({ checked, label, onChange }: ToggleSwitchProps): JSX.Element {
  return (
    <button
      type="button"
      className={'skill-toggle' + (checked ? ' on' : '')}
      role="switch"
      aria-checked={checked}
      aria-label={label + (checked ? ' 끄기' : ' 켜기')}
      onClick={() => onChange(!checked)}
    >
      <span className="skill-knob" />
    </button>
  )
}

// ------------------------------------------------------------------ McpView (P5b — IPC 실배선)
/**
 * McpView — window.api.listMcpServers IPC로 실데이터 로드.
 *
 * 단방향 데이터 흐름:
 *   IPC 이벤트(listMcpServers 응답) → servers state → 컴포넌트 리렌더.
 *   토글 조작: ToggleSwitch onChange → setMcpEnabled IPC → (성공) 로컬 state 갱신.
 *
 * 신뢰경계(CRITICAL):
 *   window.api.listMcpServers / setMcpEnabled 만 사용. fs/Node 직접 0.
 *   채널명 문자열 하드코딩 0 (preload IPC_CHANNELS 참조).
 *   detail은 main에서 마스킹된 안전 문자열 — renderer는 추가 가공 없이 표시만.
 *
 * key: s.origin+':'+s.name — 동명 서버가 다른 origin에 있어도 key 충돌 방지.
 */
function McpView(): JSX.Element {
  const [servers, setServers] = useState<McpServerInfo[]>([])
  const [scope, setScope] = useState<Scope>('all')

  // IPC 로드 함수 — useCallback으로 안정화(refresh 버튼 재사용)
  const loadMcpServers = useCallback(async (): Promise<void> => {
    try {
      const list = await window.api.listMcpServers()
      setServers(list)
    } catch {
      // 실패 시 graceful — 빈 배열 유지(기존 상태 보존)
      setServers([])
    }
  }, [])

  // 마운트 시 1회 로드
  useEffect(() => {
    void loadMcpServers()
  }, [loadMcpServers])

  const counts: Record<Scope, number> = {
    all: servers.length,
    global: servers.filter((s) => s.scope === 'global').length,
    local: servers.filter((s) => s.scope === 'local').length,
  }
  const rows = servers.filter((s) => scope === 'all' || s.scope === scope)

  /**
   * 토글 핸들러 — 낙관적 갱신 후 IPC 호출.
   * 실패 시 이전 상태로 롤백(graceful).
   *
   * key는 s.origin+':'+s.name 패턴이지만 setMcpEnabled 호출은 name 기반(원본 동일).
   */
  const toggle = useCallback(
    async (name: string, currentEnabled: boolean): Promise<void> => {
      const nextEnabled = !currentEnabled
      // 낙관적 갱신
      setServers((cur) =>
        cur.map((s) => (s.name === name ? { ...s, enabled: nextEnabled } : s)),
      )
      try {
        await window.api.setMcpEnabled({ name, enabled: nextEnabled })
      } catch {
        // 실패 시 롤백
        setServers((cur) =>
          cur.map((s) => (s.name === name ? { ...s, enabled: currentEnabled } : s)),
        )
      }
    },
    [],
  )

  return (
    <>
      <div className="set-h1">MCP</div>
      <div className="set-h1-sub">
        에이전트가 쓸 수 있는 MCP 서버를 범위별로 보고, 여기서 바로 켜고 끌 수 있습니다.
      </div>

      <div className="sec">
        <ScopeTabs scope={scope} counts={counts} onScope={setScope} onRefresh={() => void loadMcpServers()} />

        {rows.length === 0 ? (
          <div className="set-empty">
            {scope === 'local'
              ? '이 프로젝트(.mcp.json·로컬)에 등록된 MCP 서버가 없습니다.'
              : scope === 'global'
                ? '~/.claude.json 에 등록된 전역 MCP 서버가 없습니다.'
                : '등록된 MCP 서버가 없습니다.'}
          </div>
        ) : (
          <div className="ext-list">
            {rows.map((s) => (
              <div
                className={'ext-item skill' + (s.enabled ? '' : ' off')}
                key={s.origin + ':' + s.name}
              >
                <div className="ext-main">
                  <div className="ext-top">
                    <span className="ext-name">{s.name}</span>
                    <span className={'scope-badge ' + s.scope}>
                      {s.scope === 'global' ? '전역' : '로컬'}
                    </span>
                    <span className="ver-chip">{s.transport}</span>
                  </div>
                  <div className="ext-desc ext-cmd">{s.detail}</div>
                </div>
                <ToggleSwitch
                  checked={s.enabled}
                  label={s.name}
                  onChange={() => void toggle(s.name, s.enabled)}
                />
              </div>
            ))}
          </div>
        )}

        <div className="set-note">
          전역: <code>~/.claude.json</code> · 프로젝트: <code>&lt;프로젝트&gt;/.mcp.json</code> · 끄면 이후 실행부터 에이전트가 그 서버를 사용하지 않습니다.
        </div>
      </div>
    </>
  )
}

// ------------------------------------------------------------------ SkillView (P5a — IPC 실배선)
/**
 * SkillView — window.api.listSkills IPC로 실데이터 로드.
 *
 * 단방향 데이터 흐름:
 *   IPC 이벤트(listSkills 응답) → skills state → 컴포넌트 리렌더.
 *   토글 조작: ToggleSwitch onChange → setSkillEnabled IPC → (성공) 로컬 state 갱신.
 *
 * 신뢰경계(CRITICAL):
 *   window.api.listSkills / setSkillEnabled 만 사용. fs/Node 직접 0.
 *   채널명 문자열 하드코딩 0 (preload IPC_CHANNELS 참조).
 */
function SkillView(): JSX.Element {
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [scope, setScope] = useState<Scope>('all')

  // IPC 로드 함수 — useCallback으로 안정화(refresh 버튼 재사용)
  const loadSkills = useCallback(async (): Promise<void> => {
    try {
      const list = await window.api.listSkills()
      setSkills(list)
    } catch {
      // 실패 시 graceful — 빈 배열 유지(기존 상태 보존)
      setSkills([])
    }
  }, [])

  // 마운트 시 1회 로드
  useEffect(() => {
    void loadSkills()
  }, [loadSkills])

  const counts: Record<Scope, number> = {
    all: skills.length,
    global: skills.filter((s) => s.scope === 'global').length,
    local: skills.filter((s) => s.scope === 'local').length,
  }
  const rows = skills.filter((s) => scope === 'all' || s.scope === scope)

  /**
   * 토글 핸들러 — 낙관적 갱신 후 IPC 호출.
   * 실패 시 이전 상태로 롤백(graceful).
   *
   * 토글 키는 s.scope+':'+s.name 패턴으로 고유 식별.
   * setSkillEnabled 호출은 name 기반(원본 denylist 동일).
   */
  const toggle = useCallback(
    async (name: string, currentEnabled: boolean): Promise<void> => {
      const nextEnabled = !currentEnabled
      // 낙관적 갱신
      setSkills((cur) =>
        cur.map((s) => (s.name === name ? { ...s, enabled: nextEnabled } : s)),
      )
      try {
        await window.api.setSkillEnabled({ name, enabled: nextEnabled })
      } catch {
        // 실패 시 롤백
        setSkills((cur) =>
          cur.map((s) => (s.name === name ? { ...s, enabled: currentEnabled } : s)),
        )
      }
    },
    [],
  )

  return (
    <>
      <div className="set-h1">Skill</div>
      <div className="set-h1-sub">
        에이전트가 쓸 수 있는 Skill을 범위별로 보고, 여기서 바로 켜고 끌 수 있습니다.
      </div>

      <div className="sec">
        <ScopeTabs scope={scope} counts={counts} onScope={setScope} onRefresh={() => void loadSkills()} />

        {rows.length === 0 ? (
          <div className="set-empty">
            {scope === 'local'
              ? '이 프로젝트의 .claude/skills 에 Skill이 없습니다.'
              : scope === 'global'
                ? '~/.claude/skills 에 Skill이 없습니다.'
                : '설치된 Skill이 없습니다.'}
          </div>
        ) : (
          <div className="ext-list">
            {rows.map((s) => (
              <div className={'ext-item skill' + (s.enabled ? '' : ' off')} key={s.scope + ':' + s.name}>
                <div className="ext-main">
                  <div className="ext-top">
                    <span className="ext-name">{s.name}</span>
                    <span className={'scope-badge ' + s.scope}>
                      {s.scope === 'global' ? '전역' : '로컬'}
                    </span>
                  </div>
                  <div className="ext-desc">{s.description}</div>
                </div>
                <ToggleSwitch
                  checked={s.enabled}
                  label={s.name}
                  onChange={() => void toggle(s.name, s.enabled)}
                />
              </div>
            ))}
          </div>
        )}

        <div className="set-note">
          전역: <code>~/.claude/skills</code> · 로컬: <code>&lt;프로젝트&gt;/.claude/skills</code> · 끄면 이후 실행부터 에이전트가 그 Skill을 사용하지 않습니다.
        </div>
      </div>
    </>
  )
}

// ------------------------------------------------------------------ LspView (P5c — 정직화)
/**
 * LspView — LSP 서버 정보 표시. P5c 정직화.
 *
 * TS/Py(bundled): "앱 내장" 배지 + 즉시 사용 가능(실 LSP manager 보유).
 * C#/C++(download): 가짜 toggleInstall 제거. 버튼 disabled + "M5 예정" 라벨로 정직화.
 *   클릭해도 상태 변경 0 — 비활성 버튼이므로 이벤트 자체 차단.
 *
 * 신뢰경계: IPC 불요(정적 정보). window.api 호출 0.
 */
function LspView(): JSX.Element {
  return (
    <>
      <div className="set-h1">Code</div>
      <div className="set-h1-sub">
        파일 뷰어의 심볼 탐색(호버 타입 정보 · Ctrl+클릭 정의 이동)을 언어별 분석 서버가 제공합니다.
      </div>

      <div className="sec">
        <div className="ext-list">
          {LSP_SERVERS.map((s) => (
            <div className="ext-item" key={s.id}>
              <FileBadge path={LSP_BADGE[s.id]} size={30} />
              <div className="ext-main">
                <div className="ext-top">
                  <span className="ext-name">{s.langs}</span>
                  {s.state === 'bundled' && <span className="ver-chip latest">앱 내장</span>}
                  {s.requires && <span className="ver-chip">{s.requires}</span>}
                </div>
                <div className="ext-desc ext-cmd">{s.exts}</div>
              </div>
              {s.kind === 'download' && (
                <button
                  type="button"
                  className="inst-btn"
                  disabled
                  aria-label={`${s.langs} 설치 — M5 예정`}
                >
                  M5 예정
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="set-note">
          내장 서버(TS/JS·Python)는 바로 사용할 수 있습니다. C#·C++ 지원은 향후 업데이트(M5) 예정입니다.
        </div>
      </div>
    </>
  )
}

// ------------------------------------------------------------------ AppearanceView
const THEME_OPTS: { id: Theme; label: string; sub: string }[] = [
  { id: 'dark', label: '다크', sub: '뉴트럴 그래파이트' },
  { id: 'light', label: '라이트', sub: '따뜻한 코랄' },
]

function AppearanceView(): JSX.Element {
  const [theme, setThemeState] = useState<Theme>(() => getTheme())

  function chooseTheme(t: Theme): void {
    setTheme(t)
    setThemeState(t)
  }

  return (
    <>
      <div className="set-h1">테마</div>
      <div className="set-h1-sub">앱 테마를 선택하세요. 변경하면 곧바로 적용됩니다.</div>

      <div className="sec">
        <div className="set-theme-grid" role="group" aria-label="테마 선택">
          {THEME_OPTS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`set-theme-opt theme-${opt.id}${theme === opt.id ? ' on' : ''}`}
              aria-pressed={theme === opt.id}
              onClick={() => chooseTheme(opt.id)}
            >
              <span className="set-theme-swatch" aria-hidden="true">
                <span className="set-theme-swatch-dot" />
              </span>
              <span className="set-theme-meta">
                <span className="set-theme-label">{opt.label}</span>
                <span className="set-theme-sub">{opt.sub}</span>
              </span>
              {theme === opt.id && <IconCheck size={16} className="set-theme-check" />}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

// ------------------------------------------------------------------ SettingsModal (shell)
export function SettingsModal({ onClose }: { onClose: () => void }): JSX.Element {
  const [nav, setNav] = useState<NavId>('version')

  return (
    <Modal title="설정" onClose={onClose}>
      <div className="set-layout">
        <nav className="set-nav" aria-label="설정 메뉴">
          {NAV.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              className={`set-nav-item${nav === id ? ' on' : ''}`}
              onClick={() => setNav(id)}
            >
              <Icon size={15} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="set-body">
          {nav === 'version' && <VersionView />}
          {nav === 'mcp' && <McpView />}
          {nav === 'skill' && <SkillView />}
          {nav === 'lsp' && <LspView />}
          {nav === 'appearance' && <AppearanceView />}
        </div>
      </div>
    </Modal>
  )
}

export default SettingsModal
