/**
 * FolderSwitchDialog.tsx — 작업 폴더 변경 확인 다이얼로그 (F11-02).
 *
 * 원본 AgentCodeGUI FolderSwitchDialog.tsx 1:1 시각 이식.
 * - set-dialog 패턴 재사용 (Sidebar의 rename/delete 다이얼로그 동일 구조)
 * - 폴더 아이콘 + "작업 폴더를 변경할까요?" + 메시지 + 취소/변경(danger)
 * - 백드롭·Esc 취소
 *
 * 라이브 트리거 없음 — 컴포넌트 + 단위 전용 검증.
 * 실 폴더전환 확인 = M4. window.api 호출 0.
 *
 * CRITICAL: 인라인 색상 0 — CSS 토큰. window.api 호출 0.
 */
import { useEffect, type JSX } from 'react'
import { IconFolder } from '../common/icons'

function basename(p: string): string {
  const parts = p.split(/[\\/]+/).filter(Boolean)
  return parts.length ? parts[parts.length - 1] : p
}

export function FolderSwitchDialog({
  from,
  to,
  multi = false,
  onCancel,
  onConfirm,
}: {
  /** 현재 폴더 경로 */
  from: string
  /** 대상 폴더 경로 */
  to: string
  /** 멀티 패널 일괄 변경 문구 */
  multi?: boolean
  onCancel: () => void
  onConfirm: () => void
}): JSX.Element {
  // Esc 취소 — 원본과 동일 패턴
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="set-dialog-overlay" onMouseDown={onCancel}>
      <div className="set-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="sd-ic">
          <IconFolder size={22} />
        </div>
        <div className="sd-title">작업 폴더를 변경할까요?</div>
        <div className="sd-msg">
          {multi ? (
            <>
              모든 패널의 작업 폴더가 <b>{basename(to)}</b>(으)로 바뀝니다. 대화가 진행 중인 패널은 내용이
              지워지고 새 대화로 시작됩니다.
            </>
          ) : (
            <>
              대화는 폴더 단위로 이어지기 때문에 <b>{basename(from)}</b> → <b>{basename(to)}</b>(으)로 바꾸면
              현재 대화 내용이 지워지고 새 대화로 시작됩니다.
            </>
          )}
        </div>
        <div className="sd-btns">
          <button className="sd-cancel" onClick={onCancel}>
            취소
          </button>
          <button className="sd-go danger" onClick={onConfirm}>
            변경
          </button>
        </div>
      </div>
    </div>
  )
}

export default FolderSwitchDialog
