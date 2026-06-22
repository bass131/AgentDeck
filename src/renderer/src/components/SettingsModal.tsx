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
import { IconEye, IconSpark } from './icons'
import './SettingsModal.css'

type NavId = 'info' | 'theme'

export function SettingsModal({ onClose }: { onClose: () => void }): JSX.Element {
  const [nav, setNav] = useState<NavId>('info')

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
              {/* F6: 라이트/다크 토글이 여기에 들어옵니다 */}
              <p className="set-p">테마 전환(라이트/다크)은 다음 업데이트에서 제공됩니다.</p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

export default SettingsModal
