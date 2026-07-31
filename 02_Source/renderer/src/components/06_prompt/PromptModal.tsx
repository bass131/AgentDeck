import { useEffect, useRef, useState, type JSX } from 'react'
import { IconClose, IconInfo, IconSpark, IconTrash } from '../common/icons'
import './PromptModal.css'

const MAX_LEN = 4000

export function PromptModal({
  target,
  scope,
  noun,
  value,
  onSave,
  onClose,
}: {
  target: string
  scope: string
  noun: string
  value: string
  onSave: (text: string) => void
  onClose: () => void
}): JSX.Element {
  const [draft, setDraft] = useState(value)
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    const el = taRef.current
    if (!el) return
    el.focus()
    const n = el.value.length
    el.setSelectionRange(n, n)
  }, [])

  const save = (): void => {
    onSave(draft.trim())
    onClose()
  }

  return (
    <div className="pr-overlay" onMouseDown={onClose}>
      <div className="pr-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="pr-head">
          <div className="pr-ic">
            <IconSpark size={18} stroke={2} />
          </div>
          <div className="pr-titles">
            <div className="pr-title">프롬프트 설정</div>
            <div className="pr-sub">
              <b>{target}</b> · {scope}
            </div>
          </div>
          <button
            className="pr-close has-tip"
            data-tip="닫기 (Esc)"
            aria-label="닫기"
            onClick={onClose}
          >
            <IconClose size={15} />
          </button>
        </div>

        <div className="pr-body">
          <div className="pr-field">
            <textarea
              ref={taRef}
              className="pr-textarea"
              maxLength={MAX_LEN}
              placeholder={`이 ${noun}에서 Claude가 항상 따라야 할 지시를 적어주세요.\n예) 답변은 한국어로. 코드 수정 전에 항상 계획부터 설명할 것.`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  save()
                }
              }}
            />
            <span className="pr-count">
              {draft.length.toLocaleString()} / {MAX_LEN.toLocaleString()}
            </span>
          </div>
          <div className="pr-note">
            <IconInfo size={14} />
            <span>
              저장하면 이 {noun}의 모든 메시지에 시스템 프롬프트로 함께 전달돼요. 진행 중인 대화에는{' '}
              <b>다음 메시지부터</b> 적용됩니다.
            </span>
          </div>
        </div>

        <div className="pr-foot">
          {value.trim() !== '' && (
            <button
              className="pr-clear"
              onClick={() => {
                onSave('')
                onClose()
              }}
            >
              <IconTrash size={14} />
              비우기
            </button>
          )}
          <span className="pr-spacer" />
          <button className="pr-cancel" onClick={onClose}>
            취소
          </button>
          <button
            className="pr-save has-tip"
            data-tip="Enter (줄바꿈은 Shift+Enter)"
            onClick={save}
          >
            저장
          </button>
        </div>
      </div>
    </div>
  )
}

export default PromptModal
