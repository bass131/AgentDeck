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
import './Conversation.css'

// ── 메시지 버블 ────────────────────────────────────────────────────────────────

interface MessageBubbleProps {
  role: 'user' | 'assistant'
  content: string
}

const MessageBubble = memo(function MessageBubble({ role, content }: MessageBubbleProps) {
  return (
    <div className={`msg msg--${role}`}>
      <span className="msg-role">{role === 'user' ? '나' : 'Claude'}</span>
      <div className="msg-content">{content}</div>
    </div>
  )
})

// ── 스트리밍 커서 ──────────────────────────────────────────────────────────────

const StreamingBubble = memo(function StreamingBubble({ text }: { text: string }) {
  if (!text) return null
  return (
    <div className="msg msg--assistant">
      <span className="msg-role">Claude</span>
      <div className="msg-content">
        {text}
        <span className="stream-cursor" aria-hidden="true" />
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
  return (
    <div className="conversation">
      {/* 메시지 영역 */}
      <div
        className="conv-messages"
        ref={scrollRef}
        onScroll={handleScroll}
        role="log"
        aria-live="polite"
        aria-label="대화 내용"
      >
        {messages.length === 0 && !streamingText && !isRunning && (
          <div className="conv-empty">에이전트에게 작업을 지시하세요</div>
        )}

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

        {/* 스트리밍 중 텍스트 */}
        <StreamingBubble text={streamingText} />

        {/* 에러 메시지 */}
        {errorMessage && !isRunning && (
          <div className="conv-error" role="alert">
            오류: {errorMessage}
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
