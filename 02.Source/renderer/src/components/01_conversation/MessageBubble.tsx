/**
 * MessageBubble.tsx — 채팅 메시지 버블(user/assistant) 단독 모듈 (FB1 P06 추출).
 *
 * 원래 Conversation.tsx 안에 정의돼 있었으나, SubAgentFullscreen(05_agent)이 "본 채팅
 * 컴포넌트 재사용" 목적으로 이 컴포넌트를 가져다 쓰려 하면서 Conversation.tsx를 직접
 * import하면 순환참조(Conversation → SubAgentFullscreen → Conversation)가 생긴다.
 * 그래서 이 파일로 분리하고, Conversation.tsx는 재-export만 한다(기존 import 경로
 * `'../../01_conversation/Conversation'`도 그대로 동작 — 회귀 0).
 *
 * 스타일(.msg/.ava/.meta/.content 등)은 Conversation.css 소유 — 이 파일은 CSS를
 * import하지 않는다(Conversation.tsx가 이미 앱 어디선가 로드되며 함께 로드됨).
 *
 * CRITICAL: 부수효과(window.api 호출) 0 — 순수 표시 컴포넌트.
 */
import { memo } from 'react'
import { MarkdownView } from './MarkdownView'
import { SmoothMarkdown } from './SmoothMarkdown'
import { IconSpark } from '../common/icons'

export interface MessageBubbleProps {
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
  /** 메시지 시각 타임스탬프 (F14-02) */
  time?: string
  /** 첨부 이미지 data URL 목록 (22c — user 버블에만 표시) */
  images?: string[]
  /**
   * cron-turn 발원 마킹 (Phase 5b — 배지 표시용 휘발).
   * 'cron'이면 "자율 발동" 배지 표시. 미지정/undefined = 배지 미표시.
   */
  origin?: 'user' | 'cron'
  /**
   * 표시 이름 override — 기본 '나'(user)/'Claude'(assistant).
   * FB1 P06: SubAgentFullscreen이 이 버블을 재사용할 때 위임 프롬프트는 '작업'(짧은
   * 라벨 — user 아바타에도 그대로 들어가므로 짧게), 서브에이전트 응답은 agent.name으로
   * 대체한다. 미지정 시 기존 동작 그대로(회귀 0).
   */
  name?: string
}

export const MessageBubble = memo(function MessageBubble({ role, content, streaming, time, images, origin, name }: MessageBubbleProps) {
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
  return (
    <div className={`msg ai-msg${origin === 'cron' ? ' cron-turn' : ''}`}>
      <span className="ava ai" aria-hidden="true">
        <IconSpark size={16} stroke={1.8} />
      </span>
      <div className="msg-main">
        <div className="meta">
          <span className="name">{name ?? 'Claude'}</span>
          {time && <span className="time">{time}</span>}
          {/* Phase 5b/연출: cron-turn 배지 (MessageBubble도 origin prop으로 표시 — 멀티 패널 공유) */}
          {origin === 'cron' && (
            <span className="cron-badge" aria-label="자율 발동 turn"><span className="cron-badge-ico" aria-hidden="true">🔁</span>자율 발동</span>
          )}
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
