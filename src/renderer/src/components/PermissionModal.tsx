/**
 * PermissionModal.tsx — 도구 사용 승인 요청 모달 (F14-01).
 *
 * 원본 AgentCodeGUI Chat.tsx PermissionModal L1026~1056 1:1 이식.
 * - q-overlay > perm-modal(perm-head + perm-sum + q-opts[3] + perm-foot)
 * - 숫자키 1·2·3 + Esc → onRespond
 * - PERM_CHOICES: 허용/항상 허용/거부
 *
 * CRITICAL: window.api 0. 인라인 색상 0 —
 *   예외: q-num 배경색만 PERM_CHOICES 상수 CSS 변수 인라인 허용 (F8/F12 avatarColor 예외와 동일
 *   근거: 고정 팔레트 상수, window.api 0, 주석 교차참조). 그 외 인라인 색 0.
 */
import { useEffect, type JSX } from 'react'
import { IconShieldChk } from './icons'
import './PermissionModal.css'

// 고정 팔레트 상수 — q-num 배경 인라인 허용 (F8 avatarColor 예외 동일 근거)
const PERM_CHOICES = [
  { key: 'allow',        label: '허용',        desc: '이번 한 번만 실행을 허용해요',            color: 'var(--green)'  },
  { key: 'allow_always', label: '항상 허용',   desc: '이번 세션 동안 이 도구를 자동 허용해요', color: 'var(--accent)' },
  { key: 'deny',         label: '거부',        desc: '이 작업을 실행하지 않아요',              color: 'var(--red)'    },
]

export interface PermissionModalProps {
  open: boolean
  toolName?: string
  summary?: string
  onRespond: (choice: string) => void
}

export function PermissionModal({ open, toolName, summary, onRespond }: PermissionModalProps): JSX.Element | null {
  // 키보드: 1·2·3 선택, Esc 거부
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      // 입력 필드 포커스 시 무시
      const ae = document.activeElement as HTMLElement | null
      if (ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT' || ae.isContentEditable)) return

      if (e.key === 'Escape') {
        // Esc → 거부. preventDefault 금지(모달 체인 Esc 회귀 방지 정책은 useGlobalShortcuts 참조)
        onRespond('deny')
        return
      }
      const n = parseInt(e.key, 10)
      if (Number.isInteger(n) && n >= 1 && n <= PERM_CHOICES.length) {
        e.preventDefault()
        onRespond(PERM_CHOICES[n - 1].key)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onRespond])

  if (!open) return null

  return (
    <div className="q-overlay">
      <div className="perm-modal" role="dialog" aria-modal="true">
        {/* 헤더 */}
        <div className="perm-head">
          <span className="perm-ic">
            <IconShieldChk size={28} />
          </span>
          <div className="perm-htext">
            <span className="perm-title">도구 사용 승인 요청</span>
            <span className="perm-sub">Claude가 다음 작업을 실행하려고 합니다</span>
          </div>
          {toolName && <span className="perm-tool">{toolName}</span>}
        </div>

        {/* 요약 */}
        {summary && <div className="perm-sum">{summary}</div>}

        {/* 선택지 */}
        <div className="q-opts">
          {PERM_CHOICES.map((c, i) => (
            <button key={c.key} className="q-opt" onClick={() => onRespond(c.key)}>
              {/* q-num 배경: 고정 팔레트 상수 인라인 — F8 avatarColor 예외와 동일 근거 */}
              <span className="q-num" style={{ background: c.color, color: 'var(--on-accent)' }}>
                {i + 1}
              </span>
              <span className="q-opt-text">
                <span className="q-opt-label">{c.label}</span>
                <span className="q-opt-desc">{c.desc}</span>
              </span>
            </button>
          ))}
        </div>

        {/* 풋터 힌트 */}
        <div className="perm-foot">숫자 키로 선택 · Esc 거부</div>
      </div>
    </div>
  )
}

export default PermissionModal
