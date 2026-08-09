import { memo } from 'react'
import { MarkdownView } from './MarkdownView'
import { SmoothMarkdown } from './SmoothMarkdown'
import { IconClaude } from '../../components/common/icons'
import { HookBadge } from './HookBadge'
import { getProviderBrand } from '../../lib/providerBrand'
import { getTheme } from '../../lib/theme'

function currentProviderId(): string {
  return 'claude-code'
}

export interface MessageBubbleProps {
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
  time?: string
  images?: string[]
  origin?: 'user' | 'cron'
  name?: string
  hookBadge?: boolean
  continuation?: boolean
  bare?: boolean
}

export const MessageBubble = memo(function MessageBubble({ role, content, streaming, time, images, origin, name, hookBadge, continuation, bare = false }: MessageBubbleProps) {
  if (role === 'user') {
    const label = name ?? '나'
    return (
      <div className="msg user">
        <span className="ava user" aria-hidden="true">{label}</span>
        <div className="msg-main">
          <div className="meta">
            <span className="name">{label}</span>
            {time && <span className="time">{time}</span>}
          </div>
          <div className="content">{content}</div>
          {images && images.length > 0 && (
            <div className="msg-images">
              {images.map((src, i) => (
                <img
                  key={src + i}
                  src={src}
                  alt={`첨부 이미지 ${i + 1}`}
                  className="msg-img-thumb"
                  draggable={false}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }
  const brand = getProviderBrand(currentProviderId(), getTheme())
  return (
    <div className={`msg ai-msg${origin === 'cron' ? ' cron-turn' : ''}${continuation ? ' msg-continuation' : ''}`}>
      {!bare && (
        brand.kind === 'logo' ? (
          <span className="ava ai ava-spark" aria-hidden="true">
            <img src={brand.src} alt={brand.alt} width={16} height={16} />
          </span>
        ) : (
          <span className="ava ai" aria-hidden="true">
            <IconClaude size={16} />
          </span>
        )
      )}
      <div className="msg-main">
        <div className="meta">
          <span className="name">{name ?? 'Claude'}</span>
          {time && <span className="time">{time}</span>}
          {origin === 'cron' && (
            <span className="cron-badge" aria-label="자율 발동 turn"><span className="cron-badge-ico" aria-hidden="true">🔁</span>자율 발동</span>
          )}
          {hookBadge && <HookBadge />}
        </div>
        <div className="content">
          {streaming
            ? <SmoothMarkdown text={content} running={true} />
            : <MarkdownView source={content} />}
        </div>
      </div>
    </div>
  )
})

export default MessageBubble
