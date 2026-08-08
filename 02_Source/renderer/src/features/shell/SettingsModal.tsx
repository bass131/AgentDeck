import { useState, useEffect, useCallback, type JSX } from 'react'
import { Modal } from '../../components/common/Modal'
import { FileBadge } from '../../features/file'
import {
  IconServer,
  IconBook,
  IconCode,
  IconContrast,
  IconRefresh,
  IconCheck,
  type IconProps,
} from '../../components/common/icons'
import { ProviderBrandIcon } from '../../components/common/ProviderBrandIcon'
import { getTheme, setTheme, type Theme } from '../../lib/theme'
import { useZoomFactorPct } from '../../lib/useGlobalZoom'
import {
  LSP_SERVERS,
  LSP_BADGE,
} from '../../lib/settingsSampleData'
import type { SkillInfo, McpServerInfo, EngineState } from '../../../../shared/ipcContract'
import { ProviderStatusPanel } from '../../features/agent'
import './SettingsModal.css'

type NavId = 'version' | 'mcp' | 'skill' | 'lsp' | 'appearance'

const NAV: { id: NavId; label: string; Icon: (p: IconProps) => JSX.Element }[] = [
  { id: 'version', label: 'Claude Code', Icon: ProviderBrandIcon },
  { id: 'mcp', label: 'MCP', Icon: IconServer },
  { id: 'skill', label: 'Skill', Icon: IconBook },
  { id: 'lsp', label: 'Code', Icon: IconCode },
  { id: 'appearance', label: '테마', Icon: IconContrast },
]

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
        if (!cancelled) {
          setLoadError(true)
        }
      }
    })()
    return () => { cancelled = true }
  }, [])

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
              <ProviderBrandIcon size={20} />
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

      <div className="sec">
        <div className="set-h2">프로바이더</div>
        <ProviderStatusPanel />
      </div>
    </>
  )
}

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

function McpView(): JSX.Element {
  const [servers, setServers] = useState<McpServerInfo[]>([])
  const [scope, setScope] = useState<Scope>('all')

  const loadMcpServers = useCallback(async (): Promise<void> => {
    try {
      const list = await window.api.listMcpServers()
      setServers(list)
    } catch {
      setServers([])
    }
  }, [])

  useEffect(() => {
    void loadMcpServers()
  }, [loadMcpServers])

  const counts: Record<Scope, number> = {
    all: servers.length,
    global: servers.filter((s) => s.scope === 'global').length,
    local: servers.filter((s) => s.scope === 'local').length,
  }
  const rows = servers.filter((s) => scope === 'all' || s.scope === scope)

  const toggle = useCallback(
    async (name: string, currentEnabled: boolean): Promise<void> => {
      const nextEnabled = !currentEnabled
      setServers((cur) =>
        cur.map((s) => (s.name === name ? { ...s, enabled: nextEnabled } : s)),
      )
      try {
        await window.api.setMcpEnabled({ name, enabled: nextEnabled })
      } catch {
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

function SkillView(): JSX.Element {
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [scope, setScope] = useState<Scope>('all')

  const loadSkills = useCallback(async (): Promise<void> => {
    try {
      const list = await window.api.listSkills()
      setSkills(list)
    } catch {
      setSkills([])
    }
  }, [])

  useEffect(() => {
    void loadSkills()
  }, [loadSkills])

  const counts: Record<Scope, number> = {
    all: skills.length,
    global: skills.filter((s) => s.scope === 'global').length,
    local: skills.filter((s) => s.scope === 'local').length,
  }
  const rows = skills.filter((s) => scope === 'all' || s.scope === scope)

  const toggle = useCallback(
    async (name: string, currentEnabled: boolean): Promise<void> => {
      const nextEnabled = !currentEnabled
      setSkills((cur) =>
        cur.map((s) => (s.name === name ? { ...s, enabled: nextEnabled } : s)),
      )
      try {
        await window.api.setSkillEnabled({ name, enabled: nextEnabled })
      } catch {
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

const THEME_OPTS: { id: Theme; label: string; sub: string }[] = [
  { id: 'dark', label: '다크', sub: '뉴트럴 그래파이트' },
  { id: 'light', label: '라이트', sub: '따뜻한 코랄' },
]

function AppearanceView(): JSX.Element {
  const [theme, setThemeState] = useState<Theme>(() => getTheme())
  const zoomPct = useZoomFactorPct()

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

        <div className="set-note">
          현재 화면 확대: {zoomPct}% · Ctrl+= / Ctrl+− / Ctrl+0(초기화)로 조절합니다.
        </div>
      </div>
    </>
  )
}

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
