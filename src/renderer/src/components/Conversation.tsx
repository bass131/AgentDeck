/**
 * Conversation.tsx — 중앙 대화 패널.
 *
 * - 스트리밍 메시지 append (자동스크롤, 사용자 스크롤업 시 정지)
 * - 도구 호출 접이식 카드 (ToolCallCard)
 * - 하단 입력창 (Enter 전송, Shift+Enter 줄바꿈)
 * - 실행중 중단 버튼 → agentAbort
 * - 마운트 시 conversationLoad, 전송 시 conversationSave (store 액션 경유)
 *
 * CRITICAL: 부수효과(window.api 호출)는 store 액션에서만. 컴포넌트 직접 호출 X.
 * 스트리밍 append에 전역 리렌더 유발 X — 셀렉터로 필요 상태만 구독.
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
import { IconEye, IconSearch, IconBolt, IconPencil, IconSpark } from './icons'
import type { IconProps } from './icons'
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

interface MessageBubbleProps {
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}

const MessageBubble = memo(function MessageBubble({ role, content, streaming }: MessageBubbleProps) {
  if (role === 'user') {
    return (
      <div className="msg user">
        <span className="ava user" aria-hidden="true">나</span>
        <div className="msg-main">
          <div className="meta">
            <span className="name">나</span>
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
        </div>
        <div className="content">
          <MarkdownView source={content} />
          {streaming && <span className="stream-cursor" aria-hidden="true" />}
        </div>
      </div>
    </div>
  )
})

// ── 메인 컴포넌트 ──────────────────────────────────────────────────────────────

export function Conversation(): JSX.Element {
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

  const handleSend = useCallback(async () => {
    const text = inputText.trim()
    if (!text || isRunning) return
    setInputText('')
    userScrolledUp.current = false
    await sendMessage(text)
  }, [inputText, isRunning, sendMessage])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        void handleSend()
      }
    },
    [handleSend]
  )

  // 도구 카드를 메시지와 인터리브(같은 타임라인)
  // 단순 MVP: 메시지 → 스트리밍 → 도구카드 순으로 표시
  const isEmpty = messages.length === 0 && !streamingText && !isRunning

  return (
    <div className="conversation">
      {/* 메시지 영역 */}
      <div
        className="chat-scroll"
        ref={scrollRef}
        onScroll={handleScroll}
        role="log"
        aria-live="polite"
        aria-label="대화 내용"
      >
        {isEmpty ? (
          <Welcome onPick={setInputText} />
        ) : (
          <div className="thread">
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
      </div>

      {/* 입력 영역 */}
      <div className="conv-input-bar">
        <textarea
          className="conv-textarea"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="메시지를 입력하세요 (Enter 전송, Shift+Enter 줄바꿈)"
          rows={3}
          disabled={isRunning}
          aria-label="메시지 입력"
        />
        <div className="conv-actions">
          {isRunning ? (
            <button
              className="conv-btn conv-btn--abort"
              onClick={() => void abortRun()}
              type="button"
              aria-label="실행 중단"
            >
              중단
            </button>
          ) : (
            <button
              className="conv-btn conv-btn--send"
              onClick={() => void handleSend()}
              disabled={!inputText.trim()}
              type="button"
              aria-label="전송"
            >
              전송
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default memo(Conversation)
