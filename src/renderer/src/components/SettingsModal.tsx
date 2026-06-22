/**
 * SettingsModal.tsx — 설정 모달 (F5-01, 최소 소비자).
 *
 * Modal 크롬에 좌 nav(정보/테마) + 콘텐츠. ⚠️ 엔진버전·MCP·Skill 등 *기능 콘텐츠 = M5*.
 * 테마 *토글* = F6(여기선 자리만). F5는 모달 크롬 시연.
 *
 * 인라인 색상 0. 벡터 아이콘.
 */
import { useState, type JSX } from 'react'
import { Modal } from './Modal'
import { IconEye, IconSpark, IconCheck } from './icons'
import { getTheme, setTheme, type Theme } from '../lib/theme'
import './SettingsModal.css'

type NavId = 'info' | 'theme'

const THEME_OPTS: { id: Theme; label: string; sub: string }[] = [
  { id: 'dark', label: '다크', sub: '뉴트럴 그래파이트' },
  { id: 'light', label: '라이트', sub: '따뜻한 코랄' },
]

export function SettingsModal({ onClose }: { onClose: () => void }): JSX.Element {
  const [nav, setNav] = useState<NavId>('info')
  const [theme, setThemeState] = useState<Theme>(() => getTheme())

  function chooseTheme(t: Theme): void {
    setTheme(t) // lib/theme.ts: <html data-theme> + localStorage 영속
    setThemeState(t)
  }

  return (
    <Modal title="설정" onClose={onClose}>
      <div className="set-layout">
        <nav className="set-nav" aria-label="설정 메뉴">
          <button
            type="button"
            className={`set-nav-item${nav === 'info' ? ' on' : ''}`}
            onClick={() => setNav('info')}
          >
            <IconSpark size={15} />
            <span>정보</span>
          </button>
          <button
            type="button"
            className={`set-nav-item${nav === 'theme' ? ' on' : ''}`}
            onClick={() => setNav('theme')}
          >
            <IconEye size={15} />
            <span>테마</span>
          </button>
        </nav>

        <div className="set-body">
          {nav === 'info' ? (
            <div className="set-pane">
              <h3 className="set-h">AgentDeck</h3>
              <p className="set-p">Claude Code · Codex 듀얼 백엔드 데스크톱 IDE</p>
              <div className="set-row">
                <span className="set-row-k">버전</span>
                <span className="set-row-v">0.1.0</span>
              </div>
              <div className="set-row">
                <span className="set-row-k">엔진</span>
                <span className="set-row-v">Claude Code</span>
              </div>
            </div>
          ) : (
            <div className="set-pane">
              <h3 className="set-h">테마</h3>
              <p className="set-p">앱 전체 색을 즉시 전환합니다. 선택은 자동 저장됩니다.</p>
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
          )}
        </div>
      </div>
    </Modal>
  )
}

export default SettingsModal
