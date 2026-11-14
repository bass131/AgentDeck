import { useEffect, type JSX, type ReactNode } from 'react'
import { IconFolder } from '@renderer/02_Common/icons'

function basename(p: string): string {
  const parts = p.split(/[\\/]+/).filter(Boolean)
  return parts.length ? parts[parts.length - 1] : p
}

// 본문 문구 — 폴더 이름(basename)을 받아 그린다. 호출부가 넘기지 않으면 대화의 폴더 변경 문구다.
// 단일·멀티 분기(multi prop)를 지우고 패널 문구는 MultiWorkspace가 넘긴다(G9c).
export type FolderSwitchMessage = (names: { from: string; to: string }) => ReactNode

const conversationMessage: FolderSwitchMessage = ({ from, to }) => (
  <>
    대화는 폴더 단위로 이어지기 때문에 <b>{from}</b> → <b>{to}</b>(으)로 바꾸면
    현재 대화 내용이 지워지고 새 대화로 시작됩니다.
  </>
)

export function FolderSwitchDialog({
  from,
  to,
  message = conversationMessage,
  onCancel,
  onConfirm,
}: {
  from: string
  to: string
  message?: FolderSwitchMessage
  onCancel: () => void
  onConfirm: () => void
}): JSX.Element {
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
        <div className="sd-msg">{message({ from: basename(from), to: basename(to) })}</div>
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
