import { useState, useCallback, useRef, type ChangeEvent, type JSX } from 'react'
import {
  IconBolt,
  IconBook,
  IconFolder,
  IconSearch,
  IconChevRight,
  IconSend,
  IconSquare,
} from '../../common/icons'
import { FileBadge } from '../../../features/file'
import { useInputPalettes } from '../../../hooks/useInputPalettes'
import type { AttachedImage } from '../../../store/appStore'
import { filesToAttachedImages } from '../../../lib/imageAttach'
import '../../01_conversation/Composer.css'

export interface PanelComposerProps {
  onSend: (text: string, images?: AttachedImage[]) => void
  onAbort?: () => void
  isRunning?: boolean
  disabled?: boolean
  mentionFiles?: string[]
  workspaceRoot?: string | null
  history?: string[]
}

export function PanelComposer({
  onSend,
  onAbort,
  isRunning = false,
  disabled = false,
  mentionFiles = [],
  workspaceRoot,
  history = [],
}: PanelComposerProps): JSX.Element {
  const [value, setValue] = useState('')
  const [caret, setCaret] = useState(0)
  const [images, setImages] = useState<AttachedImage[]>([])
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleChange = useCallback((v: string) => {
    setValue(v)
  }, [])

  const palettes = useInputPalettes({
    value,
    caret,
    mentionFiles,
    workspaceRoot,
    history,
    isRunning,
    onChange: handleChange,
  })

  const handleFileInputChange = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    e.target.value = ''
    const added = await filesToAttachedImages(files)
    if (added.length > 0) {
      setImages((prev) => [...prev, ...added])
    }
  }, [])

  const handlePaste = useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items ?? [])
    const imageFiles = items
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((f): f is File => f !== null)
    if (imageFiles.length > 0) {
      e.preventDefault()
      const added = await filesToAttachedImages(imageFiles)
      if (added.length > 0) {
        setImages((prev) => [...prev, ...added])
      }
    }
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files ?? [])
    if (files.length === 0) return
    const added = await filesToAttachedImages(files)
    if (added.length > 0) {
      setImages((prev) => [...prev, ...added])
    }
  }, [])

  const handleSend = useCallback(() => {
    if (disabled) return
    const text = value.trim()
    if (!text && images.length === 0) return
    onSend(text, images.length > 0 ? images : undefined)
    setValue('')
    setCaret(0)
    setImages([])
    palettes.history.resetHistIdx()
  }, [disabled, value, images, onSend, palettes.history])

  return (
    <div className="ma-p-composer">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
        aria-hidden="true"
        tabIndex={-1}
      />

      {palettes.slash.open && (
        <div className="slash-menu scroll" role="listbox">
          {palettes.slash.cmdHits.length > 0 && <div className="slash-sec">명령어</div>}
          {palettes.slash.cmdHits.map((c, i) => (
            <button
              key={'cmd:' + c.scope + ':' + c.name}
              type="button"
              role="option"
              aria-selected={i === palettes.slash.safeSlashIdx}
              className={'slash-opt' + (i === palettes.slash.safeSlashIdx ? ' on' : '')}
              onMouseEnter={() => palettes.slash.setSlashIdx(i)}
              onMouseDown={(e) => {
                e.preventDefault()
                palettes.slash.pick(c.name)
              }}
            >
              <span className="slash-ic">
                <IconBolt size={15} />
              </span>
              <span className="slash-name">{c.name}</span>
              {c.argHint && <span className="slash-arg-hint">{c.argHint}</span>}
              {(c.scope === 'user' || c.scope === 'project') && (
                <span className="slash-scope-badge">{c.scope}</span>
              )}
              <span className="slash-desc">{c.description}</span>
            </button>
          ))}
          {palettes.slash.skillHits.length > 0 && <div className="slash-sec">스킬</div>}
          {palettes.slash.skillHits.map((s, i) => {
            const gi = palettes.slash.cmdHits.length + i
            return (
              <button
                key={'skill:' + s.scope + ':' + s.name}
                type="button"
                role="option"
                aria-selected={gi === palettes.slash.safeSlashIdx}
                className={'slash-opt' + (gi === palettes.slash.safeSlashIdx ? ' on' : '')}
                onMouseEnter={() => palettes.slash.setSlashIdx(gi)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  palettes.slash.pick(s.name)
                }}
              >
                <span className="slash-ic skill">
                  <IconBook size={15} />
                </span>
                <span className="slash-name">{s.name}</span>
                <span className="slash-desc">{s.description ?? '설명이 없습니다.'}</span>
              </button>
            )
          })}
        </div>
      )}

      {palettes.mention.open && (
        <div className="slash-menu scroll" role="listbox">
          <div className="slash-sec mention-loc">
            {palettes.mention.mode === 'browse' ? (
              <>
                <IconFolder size={11} />
                <span>{palettes.mention.locText || '루트'}</span>
              </>
            ) : (
              <>
                <IconSearch size={11} />
                <span>{palettes.mention.locText || '루트'}</span>
              </>
            )}
          </div>
          {palettes.mention.mentionHits.map((e, i) => (
            <button
              key={e.kind + ':' + e.full}
              type="button"
              role="option"
              aria-selected={i === palettes.mention.safeMentionIdx}
              className={'slash-opt' + (i === palettes.mention.safeMentionIdx ? ' on' : '')}
              onMouseEnter={() => palettes.mention.setMentionIdx(i)}
              onMouseDown={(ev) => {
                ev.preventDefault()
                palettes.mention.pick(e)
              }}
            >
              {e.kind === 'dir' ? (
                <>
                  <span className="slash-ic folder">
                    <IconFolder size={16} />
                  </span>
                  <span className="slash-name">{e.name}</span>
                  <span className="slash-desc into">
                    <IconChevRight size={15} />
                  </span>
                </>
              ) : (
                <>
                  <span className="slash-ic ft">
                    <FileBadge path={e.full} size={22} />
                  </span>
                  <span className="slash-name path">{e.name}</span>
                  {e.dir !== undefined && (
                    <span className="slash-desc">{e.dir ? e.dir.replace(/\/$/, '') : '루트'}</span>
                  )}
                </>
              )}
            </button>
          ))}
        </div>
      )}

      {images.length > 0 && (
        <div className="img-tray">
          {images.map((img, i) => (
            <div className="img-thumb" key={img.dataUrl + i}>
              <button
                type="button"
                className="img-thumb-open"
                aria-label={`첨부 이미지 ${i + 1}`}
                title={`첨부 이미지 ${i + 1}`}
              >
                <img src={img.dataUrl} alt={`첨부 이미지 ${i + 1}`} draggable={false} />
              </button>
              <button
                type="button"
                className="img-thumb-x"
                aria-label="제거"
                onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
              >
                <span className="img-thumb-x-ic" aria-hidden="true">×</span>
              </button>
            </div>
          ))}
        </div>
      )}

      <div
        className="ma-p-composer-row"
        onDragOver={(e) => {
          if (!Array.from(e.dataTransfer.items ?? []).some((it) => it.kind === 'file')) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
        }}
        onDrop={(e) => {
          if (!Array.from(e.dataTransfer.items ?? []).some((it) => it.kind === 'file')) return
          void handleDrop(e)
        }}
      >
        <button
          type="button"
          className="ma-attach"
          aria-label="이미지 첨부"
          onClick={() => fileInputRef.current?.click()}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>
        <textarea
          ref={inputRef}
          className="ma-composer-ta"
          placeholder="메시지를 입력하세요"
          rows={1}
          value={value}
          disabled={disabled}
          onChange={(e) => {
            const sel = e.target.selectionStart ?? e.target.value.length
            setCaret(sel)
            palettes.onValueChange(e.target.value, sel)
          }}
          onSelect={(e) => {
            setCaret(e.currentTarget.selectionStart ?? 0)
          }}
          onKeyDown={(e) => {
            const handled = palettes.handlePaletteKey(e, inputRef)
            if (handled) return
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              if (isRunning) {
                onAbort?.()
              } else {
                handleSend()
              }
            }
          }}
          onPaste={handlePaste}
          onFocus={palettes.onFocus}
          onBlur={palettes.onBlur}
          aria-label="메시지 입력"
        />
        {isRunning ? (
          <button
            type="button"
            className="ma-send ma-stop"
            aria-label="중단"
            onClick={() => onAbort?.()}
          >
            <IconSquare size={14} />
          </button>
        ) : (
          <button
            type="button"
            className="ma-send"
            aria-label="전송"
            disabled={disabled || (!value.trim() && images.length === 0)}
            onClick={handleSend}
          >
            <IconSend size={14} />
          </button>
        )}
      </div>
      {disabled && (
        <div className="ma-composer-disabled-hint">
          워크스페이스를 열어야 에이전트를 실행할 수 있습니다
        </div>
      )}
    </div>
  )
}
