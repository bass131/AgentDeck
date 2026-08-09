import { useEffect, type JSX } from 'react'
import { IconFolder } from '../../components/common/icons'

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
  from: string
  to: string
  multi?: boolean
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
