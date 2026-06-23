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
  selectLastUsage,
  selectLastContextWindow,
  selectSelectedModel,
  selectProjectFiles,
  selectAttachedImages,
  selectQueue,
  selectThinkingText,
} from '../store/appStore'
import type { AttachedImage } from '../store/appStore'
import type { PickerValues } from './Composer'
import { ToolCallCard } from './ToolCallCard'
import { MarkdownView } from './MarkdownView'
import { Composer } from './Composer'
import { extractMentions } from '../lib/mentions'
import { buildEnginePrompt } from '../lib/composerNotes'
import { IconEye, IconSearch, IconBolt, IconPencil, IconSpark, IconAlert, IconClaude } from './icons'
import type { IconProps } from './icons'
import { useZoom, ZoomBadge } from '../lib/zoom'
import { SelectionToolbar } from './SelectionToolbar'
import { SAMPLE_USER } from '../lib/sidebarSampleData'
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
      <h2 className="wc-title">{SAMPLE_USER.name ? `무엇을 도와드릴까요, ${SAMPLE_USER.name}님?` : '무엇을 도와드릴까요?'}</h2>
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
  /** 첨부 이미지 data URL 목록 (22c — user 버블에만 표시) */
  images?: string[]
}

export const MessageBubble = memo(function MessageBubble({ role, content, streaming, time, images }: MessageBubbleProps) {
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

/**
 * 외부 주입 입력 — nonce 키 방식.
 * nonce가 증가할 때마다 text를 컴포저에 반영한다. 같은 text를 다시 주입해도
 * nonce가 달라지므로 트리거된다(이전 setTimeout(0) 리셋 핵 불필요).
 */
export interface InjectedInput {
  /** 주입할 텍스트 */
  text: string
  /** 단조 증가 시퀀스 — 주입 요청마다 +1 */
  nonce: number
}

export interface ConversationProps {
  /** /ask 슬래시 콜백 — Shell에서 AskModal open state 경유. optional(미전달 시 기존 동작). */
  onSlashAsk?: () => void
  /** 이미지 썸네일 클릭 콜백 — Shell에서 ImageViewer open state 경유. optional(하위호환). */
  onOpenImage?: (images: string[], index: number) => void
  /**
   * 외부에서 컴포저에 주입할 입력 (M3 3c: GitModal AI커밋 버튼 → onAskClaude).
   * nonce가 바뀔 때마다 text를 inputText에 반영. Shell의 리셋 불필요.
   */
  injectedInput?: InjectedInput
}

export function Conversation({ onSlashAsk, onOpenImage, injectedInput }: ConversationProps = {}): JSX.Element {
  const messages = useAppStore(selectMessages)
  const streamingText = useAppStore(selectStreamingText)
  const toolCards = useAppStore(selectToolCards)
  const isRunning = useAppStore(selectIsRunning)
  const errorMessage = useAppStore(selectErrorMessage)
  // 24a: 사고 과정 텍스트 (null=비표시)
  const thinkingText = useAppStore(selectThinkingText)
  // M4-1: 토큰 게이지 실데이터
  const lastUsage = useAppStore(selectLastUsage)
  // Phase 21c: SDK 실 컨텍스트 윈도우 — 게이지 분모 우선값
  const lastContextWindow = useAppStore(selectLastContextWindow)
  const selectedModel = useAppStore(selectSelectedModel)

  const sendMessage = useAppStore((s) => s.sendMessage)
  const abortRun = useAppStore((s) => s.abortRun)
  const loadConversation = useAppStore((s) => s.loadConversation)
  const subscribeAgentEvents = useAppStore((s) => s.subscribeAgentEvents)
  const setSelectedModel = useAppStore((s) => s.setSelectedModel)
  const clearConversation = useAppStore((s) => s.clearConversation)
  const loadProjectFiles = useAppStore((s) => s.loadProjectFiles)
  const projectFiles = useAppStore(selectProjectFiles)

  // 22c: 이미지 첨부 상태 + 액션
  const attachedImages = useAppStore(selectAttachedImages)
  const attachImagesFromFiles = useAppStore((s) => s.attachImagesFromFiles)
  const removeAttachedImage = useAppStore((s) => s.removeAttachedImage)
  const clearAttachedImages = useAppStore((s) => s.clearAttachedImages)

  // 22d: 예약 큐 상태 + 액션
  const queue = useAppStore(selectQueue)
  const enqueueMessage = useAppStore((s) => s.enqueueMessage)
  const dequeueMessage = useAppStore((s) => s.dequeueMessage)
  const removeQueued = useAppStore((s) => s.removeQueued)

  const [inputText, setInputText] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const userScrolledUp = useRef(false)

  // 외부 prompt 주입 — nonce 키로 트리거 (M3 3c: GitModal AI커밋 버튼 → onAskClaude).
  // nonce가 증가할 때마다 반영 → 같은 text 재주입도 잡힘(리셋 핵 제거).
  const injectNonce = injectedInput?.nonce ?? 0
  const injectText = injectedInput?.text ?? ''
  useEffect(() => {
    if (injectText.trim()) {
      setInputText(injectText)
    }
  }, [injectNonce, injectText])

  // F14-02: Ctrl+휠 줌 (localStorage 영속)
  const { ref: zoomRef, zoom, pct, flash } = useZoom('chat')

  // 마운트: 대화 로드 + 이벤트 구독 + 파일 목록 로드 (M4-2: @멘션 팔레트 배선)
  useEffect(() => {
    void loadConversation()
    void loadProjectFiles()
    const unsubscribe = subscribeAgentEvents()
    return unsubscribe
  }, [loadConversation, loadProjectFiles, subscribeAgentEvents])

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

  // ── dispatchSend: 슬래시 인터셉트 + 노트 합성 + sendMessage 호출 (22d 추출) ──
  // 큐 드레인 effect와 직접 전송 경로 양쪽에서 재사용.
  const dispatchSend = useCallback((text: string, images: AttachedImage[], picker?: PickerValues) => {
    // 22a: /clear 인터셉트
    if (text === '/clear' || text.startsWith('/clear ')) {
      clearConversation()
      return
    }
    // 22a: /ask 인터셉트
    if (text === '/ask' || text.startsWith('/ask ')) {
      onSlashAsk?.()
      return
    }
    // model이 전달됐으면 store에 동기화 (게이지 분모 갱신)
    if (picker?.model) {
      setSelectedModel(picker.model)
    }
    userScrolledUp.current = false
    // 22c: 이미지 경로/표시 준비
    const imagePaths = images.map((i) => i.path)
    const displayImages = images.map((i) => i.dataUrl)
    // M4-2: 노트 합성 — 표시 메시지(text)는 원문 유지, 엔진에만 멘션 노트 포함.
    // 슬래시 커맨드(/compact·/review 등)는 노트 미합성.
    // 이미지 단독 전송(text 없음)은 isCommand=false.
    const isCommand = text.startsWith('/')
    const mentions = isCommand ? [] : extractMentions(text)
    const promptForEngine = isCommand ? text : buildEnginePrompt(text, { mentions, images: imagePaths.length > 0 ? imagePaths : undefined })
    void sendMessage(
      text,
      picker,
      promptForEngine !== text ? promptForEngine : undefined,
      displayImages.length > 0 ? displayImages : undefined,
    )
  }, [clearConversation, onSlashAsk, setSelectedModel, sendMessage])

  // ── handleSend: 실행 중이면 enqueue, 아니면 dispatch (22d 재작성) ─────────
  // M4-1: pickerValues를 store의 sendMessage에 전달 (→ agentRun req.model/effort/mode)
  // 22a: /clear·/ask 클라이언트 인터셉트는 dispatchSend 내부에서 처리.
  const handleSend = useCallback((pickerValues?: PickerValues) => {
    const text = inputText.trim()
    const imgs = attachedImages
    // 22c: 이미지 단독 전송 허용 — text 없어도 이미지 있으면 통과
    if (!text && imgs.length === 0) return

    if (isRunning) {
      // 실행 중 → 예약 (원본 scheduleMessage 미러). text + 이미지 + picker 캡처.
      const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `q-${queue.length}-${text.slice(0, 8)}`
      enqueueMessage({ id, text, images: imgs, picker: pickerValues })
      setInputText('')
      clearAttachedImages()
      return
    }

    setInputText('')
    clearAttachedImages()
    dispatchSend(text, imgs, pickerValues)
  }, [inputText, attachedImages, isRunning, queue.length, enqueueMessage, clearAttachedImages, dispatchSend])

  // ── 드레인 effect: busy→idle 전이 + queue>0 → 첫 항목 pop → dispatchSend ─
  // 원본 App.tsx:660-668 미러 — `was` 가드로 중복전송 방지.
  // dequeueMessage가 queue를 변경해도 이 effect가 재발화하면 `was`=false이므로 skip.
  // 전제: Conversation은 Shell에 상시 마운트(언마운트 없음). 큐는 store에 잔존하므로
  //   재마운트 시 prevRunningRef가 isRunning으로 재초기화돼 직전 전이를 놓칠 수 있다 —
  //   멀티워크스페이스(F13)로 Conversation이 마운트/언마운트되면 이 전제 재검토 필요.
  const prevRunningRef = useRef(isRunning)
  useEffect(() => {
    const was = prevRunningRef.current
    prevRunningRef.current = isRunning
    if (isRunning || !was || queue.length === 0) return // busy→idle 전이 + 큐>0 일 때만
    const next = dequeueMessage()
    if (next) dispatchSend(next.text, next.images, next.picker)
  }, [isRunning, queue, dequeueMessage, dispatchSend])

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
              <MessageBubble key={msg.id} role={msg.role} content={msg.content} images={msg.images} />
            ))}

            {/* 도구 카드 목록 */}
            {toolCards.length > 0 && (
              <div className="conv-tool-cards">
                {toolCards.map((card) => (
                  <ToolCallCard key={card.id} card={card} />
                ))}
              </div>
            )}

            {/* 24a: thinking 인디케이터 — isRunning 중이고 thinkingText 있을 때만 표시.
                 text 스트림 시작 시 reducer가 thinkingText=null로 정리하므로 자동 사라짐. */}
            {isRunning && thinkingText && (
              <ThinkingItem text={thinkingText} />
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
        onSend={(opts) => handleSend(opts)}
        onAbort={() => void abortRun()}
        isRunning={isRunning}
        hasStarted={messages.length > 0}
        onSlashAsk={onSlashAsk}
        onOpenImage={onOpenImage}
        lastUsage={lastUsage}
        selectedModel={selectedModel}
        lastContextWindow={lastContextWindow}
        mentionFiles={projectFiles}
        attachedImages={attachedImages.map((i) => i.dataUrl)}
        onAttachFiles={(files) => void attachImagesFromFiles(files)}
        onRemoveImage={removeAttachedImage}
        queued={queue.map((q) => ({ id: q.id, text: q.text, images: q.images.map((i) => i.dataUrl) }))}
        onRemoveQueued={removeQueued}
      />
    </div>
  )
}

export default memo(Conversation)
