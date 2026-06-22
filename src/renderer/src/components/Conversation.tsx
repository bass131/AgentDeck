/**
 * Conversation.tsx — 중앙 대화 패널 (F14-02 폴리시 적용).
 *
 * F14-02 추가:
 *   - MessageBubble: time prop(타임스탬프 .meta .time).
 *   - ThinkingItem: .msg.ai-msg > .thinking + .dots(점3 애니). export.
 *   - NoticeItem: .notice-row(.notice-ic + .notice-text + .notice-time). export.
 *   - useZoom + ZoomBadge: chat-scroll에 Ctrl+휠 줌(localStorage). position:relative 추가.
 *   - SelectionToolbar: 스레드 텍스트 드래그 시 표시.
 *
 * CRITICAL: 부수효과(window.api 호출)는 store 액션에서만. 컴포넌트 직접 호출 X.
 * 스트리밍 append에 전역 리렌더 유발 X — 셀렉터로 필요 상태만 구독.
 * 새 IPC 0. 줌=localStorage. 복사=navigator.clipboard.
 */
import {
  useRef,
  useEffect,
  useState,
  useCallback,
  memo,
  type JSX,
} from 'react'
import {
  useAppStore,
  selectMessages,
  selectStreamingText,
  selectToolCards,
  selectIsRunning,
  selectErrorMessage,
} from '../store/appStore'
import { ToolCallCard } from './ToolCallCard'
import { MarkdownView } from './MarkdownView'
import { Composer } from './Composer'
import { IconEye, IconSearch, IconBolt, IconPencil, IconSpark, IconAlert, IconClaude } from './icons'
import type { IconProps } from './icons'
import { useZoom, ZoomBadge } from '../lib/zoom'
import { SelectionToolbar } from './SelectionToolbar'
import './Conversation.css'

// ── 빈 채팅: 추천 칩 ───────────────────────────────────────────────────────────

const SUGGESTIONS: { Icon: (p: IconProps) => JSX.Element; label: string }[] = [
  { Icon: IconEye, label: '이 프로젝트의 구조를 설명해줘' },
  { Icon: IconSearch, label: '버그를 찾아서 고쳐줘' },
  { Icon: IconBolt, label: '성능을 개선할 부분을 찾아줘' },
  { Icon: IconPencil, label: '테스트 코드를 작성해줘' },
]

const Welcome = memo(function Welcome({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="welcome">
      <span className="wc-mark" aria-hidden="true">
        <IconSpark size={26} stroke={1.7} />
      </span>
      <h2 className="wc-title">무엇을 도와드릴까요?</h2>
      <p className="wc-sub">코드 작성·리뷰부터 버그 수정, 리팩터링까지 — 아래에 입력하거나 추천으로 시작하세요.</p>
      <div className="wc-grid">
        {SUGGESTIONS.map(({ Icon, label }) => (
          <button key={label} type="button" className="wc-card" onClick={() => onPick(label)}>
            <span className="wc-ic" aria-hidden="true">
              <Icon size={16} />
            </span>
            <span className="wc-lbl">{label}</span>
          </button>
        ))}
      </div>
    </div>
  )
})

// ── 메시지 버블 ────────────────────────────────────────────────────────────────

export interface MessageBubbleProps {
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
  /** 메시지 시각 타임스탬프 (F14-02) */
  time?: string
}

export const MessageBubble = memo(function MessageBubble({ role, content, streaming, time }: MessageBubbleProps) {
  if (role === 'user') {
    return (
      <div className="msg user">
        <span className="ava user" aria-hidden="true">나</span>
        <div className="msg-main">
          <div className="meta">
            <span className="name">나</span>
            {time && <span className="time">{time}</span>}
          </div>
          <div className="content">{content}</div>
        </div>
      </div>
    )
  }
  return (
    <div className="msg ai-msg">
      <span className="ava ai" aria-hidden="true">
        <IconSpark size={16} stroke={1.8} />
      </span>
      <div className="msg-main">
        <div className="meta">
          <span className="name">Claude</span>
          {time && <span className="time">{time}</span>}
        </div>
        <div className="content">
          <MarkdownView source={content} />
          {streaming && <span className="stream-cursor" aria-hidden="true" />}
        </div>
      </div>
    </div>
  )
})

// ── thinking 아이템 (F14-02) ───────────────────────────────────────────────────

export interface ThinkingItemProps {
  text: string
}

export const ThinkingItem = memo(function ThinkingItem({ text }: ThinkingItemProps): JSX.Element {
  return (
    <div className="msg ai-msg">
      <span className="ava ai" aria-hidden="true">
        <IconClaude size={16} />
      </span>
      <div className="msg-main">
        <div className="thinking">
          <span>{text}</span>
          <span className="dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </div>
      </div>
    </div>
  )
})

// ── notice 아이템 (F14-02) ────────────────────────────────────────────────────

export interface NoticeItemProps {
  text: string
  time?: string
}

export const NoticeItem = memo(function NoticeItem({ text, time }: NoticeItemProps): JSX.Element {
  return (
    <div className="notice-row">
      <span className="notice-ic">
        <IconAlert size={15} />
      </span>
      <div className="notice-text">{text}</div>
      {time && <span className="notice-time">{time}</span>}
    </div>
  )
})

// ── 메인 컴포넌트 ──────────────────────────────────────────────────────────────

export interface ConversationProps {
  /** /ask 슬래시 콜백 — Shell에서 AskModal open state 경유. optional(미전달 시 기존 동작). */
  onSlashAsk?: () => void
  /** 이미지 썸네일 클릭 콜백 — Shell에서 ImageViewer open state 경유. optional(하위호환). */
  onOpenImage?: (images: string[], index: number) => void
}

export function Conversation({ onSlashAsk, onOpenImage }: ConversationProps = {}): JSX.Element {
  const messages = useAppStore(selectMessages)
  const streamingText = useAppStore(selectStreamingText)
  const toolCards = useAppStore(selectToolCards)
  const isRunning = useAppStore(selectIsRunning)
  const errorMessage = useAppStore(selectErrorMessage)

  const sendMessage = useAppStore((s) => s.sendMessage)
  const abortRun = useAppStore((s) => s.abortRun)
  const loadConversation = useAppStore((s) => s.loadConversation)
  const subscribeAgentEvents = useAppStore((s) => s.subscribeAgentEvents)

  const [inputText, setInputText] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const userScrolledUp = useRef(false)

  // F14-02: Ctrl+휠 줌 (localStorage 영속)
  const { ref: zoomRef, zoom, pct, flash } = useZoom('chat')

  // 마운트: 대화 로드 + 이벤트 구독
  useEffect(() => {
    void loadConversation()
    const unsubscribe = subscribeAgentEvents()
    return unsubscribe
  }, [loadConversation, subscribeAgentEvents])

  // 자동 스크롤 (사용자 스크롤업 중엔 정지)
  useEffect(() => {
    if (userScrolledUp.current) return
    const el = scrollRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages, streamingText, toolCards])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    userScrolledUp.current = !atBottom
  }, [])

  // zoomRef + scrollRef 합성 (chat-scroll이 zoom의 wheel 수신 타겟)
  const chatScrollRef = useCallback((node: HTMLDivElement | null) => {
    (scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = node
    zoomRef(node)
  }, [zoomRef])

  const handleSend = useCallback(async () => {
    const text = inputText.trim()
    if (!text || isRunning) return
    setInputText('')
    userScrolledUp.current = false
    await sendMessage(text)
  }, [inputText, isRunning, sendMessage])

  // SelectionToolbar: 더 자세히 콜백 (M4 — 실 인용 미연결)
  const handleElaborate = useCallback((_text: string) => {
    // M4: 실 인용 연결. 현재 no-op.
  }, [])

  const isEmpty = messages.length === 0 && !streamingText && !isRunning

  return (
    <div className="conversation">
      {/* 메시지 영역 — position:relative(zoom-badge 앵커) */}
      <div
        className="chat-scroll"
        ref={chatScrollRef}
        onScroll={handleScroll}
        role="log"
        aria-live="polite"
        aria-label="대화 내용"
        style={{ position: 'relative' }}
      >
        {/* F14-02: 줌 배지 */}
        <ZoomBadge pct={pct} show={flash} />

        {isEmpty ? (
          <Welcome onPick={setInputText} />
        ) : (
          <div className="thread" style={{ zoom }}>
            {messages.map((msg) => (
              <MessageBubble key={msg.id} role={msg.role} content={msg.content} />
            ))}

            {/* 도구 카드 목록 */}
            {toolCards.length > 0 && (
              <div className="conv-tool-cards">
                {toolCards.map((card) => (
                  <ToolCallCard key={card.id} card={card} />
                ))}
              </div>
            )}

            {/* 스트리밍 중 텍스트 (assistant 버블) */}
            {streamingText && (
              <MessageBubble role="assistant" content={streamingText} streaming />
            )}

            {/* 에러 메시지 */}
            {errorMessage && !isRunning && (
              <div className="conv-error" role="alert">
                오류: {errorMessage}
              </div>
            )}
          </div>
        )}

        {/* F14-02: SelectionToolbar (thread 텍스트 드래그 시 표시) */}
        <SelectionToolbar scrollRef={scrollRef} onElaborate={handleElaborate} />
      </div>

      {/* 리치 컴포저 (F9) */}
      <Composer
        value={inputText}
        onChange={setInputText}
        onSend={() => void handleSend()}
        onAbort={() => void abortRun()}
        isRunning={isRunning}
        hasStarted={messages.length > 0}
        onSlashAsk={onSlashAsk}
        onOpenImage={onOpenImage}
      />
    </div>
  )
}

export default memo(Conversation)
