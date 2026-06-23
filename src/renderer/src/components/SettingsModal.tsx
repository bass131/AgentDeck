/**
 * SettingsModal.tsx — 설정 모달 5탭 (F7).
 *
 * nav: Claude Code · MCP · Skill · Code · 테마
 * 데이터:
 *   - McpView: window.api.listMcpServers() IPC 실데이터 (P5b).
 *   - SkillView: window.api.listSkills() IPC 실데이터 (P5a).
 *   - 나머지 탭: 정적 샘플(settingsSampleData.ts). P5c에서 순차 배선 예정.
 *
 * 회귀 가드:
 *  - Theme 탭 nav 라벨 = '테마' (기존 settings-theme.test.tsx / modal.test.tsx 계약)
 *  - .set-nav / .set-nav-item 클래스 유지
 *  - set-theme-opt aria-pressed 동작 유지
 *
 * 신뢰경계(CRITICAL):
 *  - renderer untrusted — fs/Node 직접 호출 0.
 *  - IPC 채널 접근은 window.api.listMcpServers / window.api.setMcpEnabled /
 *    window.api.listSkills / window.api.setSkillEnabled 만.
 *  - 채널명 문자열 하드코딩 0 (preload가 IPC_CHANNELS 참조하여 노출).
 *  - detail은 main에서 마스킹된 안전 문자열 — renderer는 추가 가공 없이 표시만.
 *
 * 인라인 색상 0. 벡터 아이콘. 이모지 금지.
 */
import { useState, useRef, useEffect, useCallback, type JSX } from 'react'
import { Modal } from './Modal'
import { FileBadge } from './FileBadge'
import {
  IconClaude,
  IconServer,
  IconBook,
  IconCode,
  IconContrast,
  IconChevDown,
  IconRefresh,
  IconTrash,
  IconCheck,
  type IconProps,
} from './icons'
import { getTheme, setTheme, type Theme } from '../lib/theme'
import {
  ENGINE_CURRENT,
  ENGINE_VERSIONS,
  LSP_SERVERS,
  LSP_BADGE,
  type LspServerEntry,
} from '../lib/settingsSampleData'
import type { SkillInfo, McpServerInfo } from '../../../shared/ipc-contract'
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

// ------------------------------------------------------------------ VersionView
function VersionView(): JSX.Element {
  const [current, setCurrent] = useState(ENGINE_CURRENT)
  const [open, setOpen] = useState(false)
  const pickRef = useRef<HTMLDivElement>(null)

  // click-outside / Esc — capture phase로 Modal stopPropagation 우회
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (pickRef.current && !pickRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const onPick = (version: string): void => {
    setCurrent(version)
    setOpen(false)
  }

  return (
    <>
      <div className="set-h1">Claude Code</div>
      <div className="set-h1-sub">
        Claude Code 엔진 버전을 선택하면 전용 폴더에 설치되고, 해당 버전으로 실행됩니다.
      </div>

      <div className="sec">
        <div className="card">
          <div className="ver-row">
            <div className="ver-ic engine">
              <IconClaude size={20} />
            </div>
            <div className="ver-main">
              <div className="ver-name">현재 엔진</div>
              <div className="ver-meta">내 컴퓨터에 설치된 버전</div>
            </div>

            <div className="vpick" ref={pickRef}>
              <button
                className={'vpick-btn' + (open ? ' open' : '')}
                onClick={() => setOpen((o) => !o)}
                type="button"
              >
                <span className="vpick-cur">{current}</span>
                <IconChevDown className="vpick-chev" size={15} />
              </button>

              {open && (
                <div className="vpick-menu">
                  <div className="vpick-head">
                    <span>버전 선택</span>
                    <button className="vpick-refresh" type="button" aria-label="새로고침">
                      <IconRefresh size={13} />
                    </button>
                  </div>
                  <div className="vpick-list">
                    {ENGINE_VERSIONS.map((v) => {
                      const isCur = v.version === current
                      const isInstalled = v.installed || isCur
                      return (
                        <button
                          key={v.version}
                          className={'vpick-opt' + (isCur ? ' on' : '')}
                          type="button"
                          onClick={() => onPick(v.version)}
                        >
                          <span className="vpo-v">{v.version}</span>
                          {v.latest && <span className="vtag latest">최신</span>}
                          {isCur && <span className="vtag cur">현재</span>}
                          {isInstalled && !isCur && <span className="vtag inst">설치됨</span>}
                          <span className="vpo-right">
                            <span className="vpo-act">{isCur ? '사용 중' : isInstalled ? '사용' : '설치'}</span>
                            {isInstalled && !isCur && (
                              <span
                                className="vpo-del"
                                role="button"
                                tabIndex={-1}
                                aria-label="삭제"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <IconTrash size={13} />
                              </span>
                            )}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="set-note">
          설치 위치: <code>~/.agentdeck/engines/&lt;버전&gt;</code> · 시스템에 설치된 Claude는 건드리지 않습니다.
        </div>
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

// ------------------------------------------------------------------ LspView
function LspView(): JSX.Element {
  const [servers, setServers] = useState<LspServerEntry[]>(LSP_SERVERS)

  const toggleInstall = (id: LspServerEntry['id']): void => {
    setServers((cur) =>
      cur.map((s) =>
        s.id === id
          ? { ...s, state: s.state === 'installed' ? 'download' : 'installed' }
          : s,
      ),
    )
  }

  return (
    <>
      <div className="set-h1">Code</div>
      <div className="set-h1-sub">
        파일 뷰어의 심볼 탐색(호버 타입 정보 · Ctrl+클릭 정의 이동)을 언어별 분석 서버가 제공합니다.
      </div>

      <div className="sec">
        <div className="ext-list">
          {servers.map((s) => (
            <div className="ext-item" key={s.id}>
              <FileBadge path={LSP_BADGE[s.id]} size={30} />
              <div className="ext-main">
                <div className="ext-top">
                  <span className="ext-name">{s.langs}</span>
                  {s.state === 'bundled' && <span className="ver-chip latest">앱 내장</span>}
                  {s.state === 'installed' && <span className="ver-chip latest">설치됨</span>}
                  {s.requires && <span className="ver-chip">{s.requires}</span>}
                </div>
                <div className="ext-desc ext-cmd">{s.exts}</div>
              </div>
              {s.kind === 'download' &&
                (s.state === 'installed' ? (
                  <button
                    type="button"
                    className="inst-btn ghost"
                    onClick={() => toggleInstall(s.id)}
                  >
                    <IconTrash size={13} /> 삭제
                  </button>
                ) : (
                  <button
                    type="button"
                    className="inst-btn"
                    onClick={() => toggleInstall(s.id)}
                  >
                    설치
                  </button>
                ))}
            </div>
          ))}
        </div>

        <div className="set-note">
          내장 서버는 바로 사용할 수 있고, C#·C++ 서버는 최초 1회 내려받아{' '}
          <code>~/.agentdeck/lsp</code> 에 설치됩니다.
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
