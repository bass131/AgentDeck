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
 * P14a 추가:
 *   - WORKING_PHRASES: 한국어 번안 phrase 배열(랜덤 순환).
 *   - nextPhraseIndex: 결정적 non-repeating 인덱스 선택(순수 함수, 테스트 가능).
 *   - WorkingIndicator: isRunning 중 thinkingText 우선 / 없으면 WORKING_PHRASES 5~20s 순환.
 *   - ThinkingItem: WorkingIndicator 래핑 → phrase 순환 적용.
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
  selectThread,
  selectIsRunning,
  selectErrorMessage,
  selectLastUsage,
  selectLastContextWindow,
  selectSelectedModel,
  selectProjectFiles,
  selectAttachedImages,
  selectQueue,
  selectThinkingText,
  selectPendingPermission,
  selectPendingQuestion,
  selectUsage,
  selectProfile,
  selectWorkspaceRoot,
  selectFileDiffs,
  selectSubagents,
  selectActiveLoop,
  selectReplMode,
  selectActiveLoops,
} from '../store/appStore'
import type { AttachedImage } from '../store/appStore'
import type { PickerValues } from './Composer'
import { isLoopCommand, parseLoopCommand, decideLoopTick } from '../lib/loopCommand'
import { LoopIndicator } from './LoopIndicator'
import { LoopRunningIndicator } from './LoopRunningIndicator'
import { MarkdownView } from './MarkdownView'
import { SmoothMarkdown } from './SmoothMarkdown'
import { Composer } from './Composer'
import { PermissionModal } from './PermissionModal'
import { QuestionModal } from './QuestionModal'
import { ToolGroup } from './ToolGroup'
import { extractMentions } from '../lib/mentions'
import { buildEnginePrompt } from '../lib/composerNotes'
import { IconEye, IconSearch, IconBolt, IconPencil, IconSpark, IconAlert, IconClaude } from './icons'
import type { IconProps } from './icons'
import { useZoom, ZoomBadge } from '../lib/zoom'
import { SelectionToolbar } from './SelectionToolbar'
import { CmdResultCard } from './CmdResultCard'
import { OrchestrationCard } from './OrchestrationCard'
import { SubAgentInline } from './SubAgentInline'
import { SubAgentFullscreen } from './SubAgentFullscreen'
// SAMPLE_USER: P2에서 실 profile store로 대체됨 (Welcome 인사말 닉네임 실연결)
import './Conversation.css'

// ── 빈 채팅: 추천 칩 ───────────────────────────────────────────────────────────

const SUGGESTIONS: { Icon: (p: IconProps) => JSX.Element; label: string }[] = [
  { Icon: IconEye, label: '이 프로젝트의 구조를 설명해줘' },
  { Icon: IconSearch, label: '버그를 찾아서 고쳐줘' },
  { Icon: IconBolt, label: '성능을 개선할 부분을 찾아줘' },
  { Icon: IconPencil, label: '테스트 코드를 작성해줘' },
]

export const Welcome = memo(function Welcome({ onPick }: { onPick: (text: string) => void }) {
  // P2: profile.nickname 실연결 — store 구독(셀렉터). placeholder SAMPLE_USER 제거.
  // 단방향: AppGate getProfile IPC → store.profile → Welcome 리렌더.
  const profile = useAppStore(selectProfile)
  const nickname = profile?.nickname ?? ''

  return (
    <div className="welcome">
      <span className="wc-mark" aria-hidden="true">
        <IconSpark size={26} stroke={1.7} />
      </span>
      <h2 className="wc-title">{nickname ? `무엇을 도와드릴까요, ${nickname}님?` : '무엇을 도와드릴까요?'}</h2>
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
  /**
   * cron-turn 발원 마킹 (Phase 5b — 배지 표시용 휘발).
   * 'cron'이면 "자율 발동" 배지 표시. 미지정/undefined = 배지 미표시.
   */
  origin?: 'user' | 'cron'
}

export const MessageBubble = memo(function MessageBubble({ role, content, streaming, time, images, origin }: MessageBubbleProps) {
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
    <div className={`msg ai-msg${origin === 'cron' ? ' cron-turn' : ''}`}>
      <span className="ava ai" aria-hidden="true">
        <IconSpark size={16} stroke={1.8} />
      </span>
      <div className="msg-main">
        <div className="meta">
          <span className="name">Claude</span>
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

// ── P14a: WORKING_PHRASES + WorkingIndicator ──────────────────────────────────

/**
 * 에이전트 실행 중 표시할 한국어 phrase 목록.
 * thinkingText가 없을 때 5~20초 간격으로 무작위 순환 표시.
 * 원본 WORKING_PHRASES 톤 유지 — 과하지 않게, 자연스러운 한국어.
 */
export const WORKING_PHRASES: string[] = [
  '골똘히 생각하는 중',
  '코드를 살펴보는 중',
  '차근차근 정리하는 중',
  '실마리를 찾는 중',
  '이리저리 탐색하는 중',
  '퍼즐을 맞추는 중',
  '가능성을 저울질하는 중',
  '단서를 모으는 중',
  '논리를 다듬는 중',
  '맥락을 읽는 중',
  '흐름을 따라가는 중',
  '빈칸을 채우는 중',
  '큰 그림을 그리는 중',
  '차곡차곡 쌓는 중',
  '두뇌 풀가동 중',
]

/**
 * 결정적 non-repeating 인덱스 선택.
 * 테스트 가능하도록 Math.random 대신 (cur + 1) % len 기반 순환.
 * len < 2이면 항상 0 반환.
 */
export function nextPhraseIndex(cur: number, len: number): number {
  if (len < 2) return 0
  return (cur + 1) % len
}

/**
 * WorkingIndicator — 에이전트 실행 중 표시하는 "생각 중" 인디케이터.
 *
 * - text(thinkingText)가 있으면 그 텍스트를 우선 표시.
 * - null이면 WORKING_PHRASES를 5~20초 랜덤 간격으로 순환 표시.
 * - 언마운트 시 타이머 정리(누수 0).
 */
export function WorkingIndicator({ text }: { text: string | null }): JSX.Element {
  const [i, setI] = useState(0)

  useEffect(() => {
    let id: ReturnType<typeof setTimeout>
    function schedule(): void {
      // 5~20초 랜덤 간격 — 원본 5000 + Math.random() * 15000 미러
      const delay = 5000 + Math.random() * 15000
      id = setTimeout(() => {
        setI((n) => nextPhraseIndex(n, WORKING_PHRASES.length))
        schedule()
      }, delay)
    }
    schedule()
    return () => clearTimeout(id)
  }, [])

  const label = text ?? WORKING_PHRASES[i]

  return (
    <div className="msg ai-msg">
      <span className="ava ai" aria-hidden="true">
        <IconClaude size={16} />
      </span>
      <div className="msg-main">
        <div className="thinking">
          <span key={label} style={{ animation: 'fade .35s ease' }}>
            {label}
          </span>
          <span className="dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </div>
      </div>
    </div>
  )
}

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
  // Phase A-2: thread가 진실 소스 (단일 인터리브 스트림)
  const thread = useAppStore(selectThread)
  // F-G/F-E: 인라인 서브에이전트 데이터(단일출처) + 상세(라이브 id 조회)
  const subagents = useAppStore(selectSubagents)
  const [openedSubId, setOpenedSubId] = useState<string | null>(null)
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
  // Phase 5b: 현재 turn만 중단 — 세션 유지(REPL 지속세션 정지). replMode ON 시 정지 버튼에 사용.
  const interruptRun = useAppStore((s) => s.interruptRun)
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

  // 앱 레벨 /loop: 활성 루프 상태 + 액션 (드라이버 docs/LOOP_SUPPORT.md)
  const activeLoop = useAppStore(selectActiveLoop)
  const startLoop = useAppStore((s) => s.startLoop)
  const tickLoop = useAppStore((s) => s.tickLoop)
  const stopLoop = useAppStore((s) => s.stopLoop)
  const dismissLoop = useAppStore((s) => s.dismissLoop)

  // Phase 5a: REPL 지속세션 모드(ADR-024) — /loop 통과 가드용.
  // replMode ON이면 /loop를 앱 레벨에서 인터셉트하지 않고 SDK로 흘려보냄(Claude 자기제어).
  const replMode = useAppStore(selectReplMode)

  // 5c: 활성 루프(내장 /loop·/schedule 크론) — loop 진행중 표시기 + gloss.
  // loops 이벤트 → reducer → activeLoops. 빈 배열=표시 제거.
  const activeLoops = useAppStore(selectActiveLoops)

  // Phase B: 파일 diff 요약+라인 Record (ToolCallCard → DiffViewer 표시용)
  const fileDiffs = useAppStore(selectFileDiffs)

  // 24c: 권한 요청 모달 상태 + 액션
  const pendingPermission = useAppStore(selectPendingPermission)
  const respondPermission = useAppStore((s) => s.respondPermission)

  // 24d: 질문 요청 모달 상태 + 액션
  const pendingQuestion = useAppStore(selectPendingQuestion)
  const respondQuestion = useAppStore((s) => s.respondQuestion)

  // B8: usage 게이지 상태 + loadUsage 액션
  const usage = useAppStore(selectUsage)
  const loadUsage = useAppStore((s) => s.loadUsage)

  // P10 🟡-A: workspaceRoot → Composer에 전달해 슬래시 커맨드 재로드 캐시 키로 사용
  const workspaceRoot = useAppStore(selectWorkspaceRoot)

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

  // 마운트: 이벤트 구독 + 파일 목록 로드 (M4-2: @멘션 팔레트 배선)
  // B8: 마운트 시 usage 초기 로드 (catch-and-ignore — loadUsage 내부 처리)
  // 사용자 요청: 단일 모드 진입 시 직전 대화를 자동 로드하지 않는다(빈 대화로 시작).
  //   이전 대화는 사이드바에서 명시적으로 선택(selectConversation)해야 표시됨.
  useEffect(() => {
    void loadProjectFiles()
    void loadUsage()
    const unsubscribe = subscribeAgentEvents()
    return unsubscribe
  }, [loadProjectFiles, loadUsage, subscribeAgentEvents])

  // 자동 스크롤 (사용자 스크롤업 중엔 정지) — thread 변경 시
  // Phase A-2: [thread]로 deps 교체 (streamingText/toolCards/messages 제거)
  useEffect(() => {
    if (userScrolledUp.current) return
    const el = scrollRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [thread])

  // P11: SmoothMarkdown 점진 reveal로 콘텐츠 높이가 프레임마다 증가할 때도 스크롤 추적.
  // ResizeObserver로 chat-scroll 내부 thread 높이 변화를 감지 → 사용자가 위로 스크롤하지 않은
  // 경우에만 bottom으로 따라감. (단방향 흐름 준수: effect에서만 scrollTop 변경)
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    if (typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(() => {
      if (!userScrolledUp.current) {
        container.scrollTop = container.scrollHeight
      }
    })

    // chat-scroll의 직접 자식(thread)을 관찰
    const thread = container.querySelector('.thread')
    if (thread) observer.observe(thread)

    return () => observer.disconnect()
  // Phase A-2: isRunning 기준으로 observer 재연결 (streamingText 제거)
  }, [isRunning])

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

  // ── sendNow: 슬래시(/clear·/ask) 인터셉트 + 노트 합성 + sendMessage 호출 (22d 추출) ──
  // 큐 드레인 effect·직접 전송·루프 틱 모두에서 재사용. /loop은 이 단계 전에 dispatchSend가 가로챔.
  const sendNow = useCallback((text: string, images: AttachedImage[], picker?: PickerValues) => {
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
      // Phase 37: orchestration boolean — PickerValues에서 꺼내 별도 전달
      picker?.orchestration,
    )
  }, [clearConversation, onSlashAsk, setSelectedModel, sendMessage])

  // ── dispatchSend: /loop 최상단 인터셉트(🔴#1 SDK 누수 차단) → 그 외 sendNow ──
  // /loop은 우리 앱 개념 — SDK로 보내지 않고 renderer가 직접 반복(드라이버 docs/LOOP_SUPPORT.md).
  // commandOf/sendMessage 진입 전에 이 게이트로 막아 평문 슬래시가 엔진에 새지 않게 한다.
  //
  // Phase 5a(ADR-024): replMode ON이면 /loop 인터셉트를 건너뜀.
  //   → `/loop ...`가 일반 메시지로 SDK 전송(Claude가 내장 /loop 처리).
  //   replMode OFF면 기존 앱 레벨 인터셉트 유지(단발 모드에선 SDK 세션이 닫혀 크론 소멸하므로
  //   앱 레벨 반복이 필요 — 드라이버 docs/LOOP_SUPPORT.md 배경 참고).
  const dispatchSend = useCallback((text: string, images: AttachedImage[], picker?: PickerValues) => {
    if (isLoopCommand(text) && !replMode) {
      // replMode OFF일 때만 앱 레벨 인터셉트 수행
      const cmd = parseLoopCommand(text)
      if (cmd.kind === 'stop') {
        // 정지 3경로 중 하나(/loop stop·off). 단일 stopLoop로 수렴.
        stopLoop('user')
        return
      }
      if (cmd.kind === 'invalid') {
        // 프롬프트 없음 — 아무 것도 전송하지 않음(SDK 누수 0). 입력은 호출부에서 비워짐.
        return
      }
      // start: 루프 등록 + 첫 틱 즉시 발사(틱 카운트 1). 이후 틱은 드레인·틱 통합 effect가 스케줄.
      const loopPicker = picker ? { model: picker.model, effort: picker.effort, mode: picker.mode } : undefined
      startLoop({ prompt: cmd.prompt, intervalMs: cmd.intervalMs, picker: loopPicker })
      tickLoop()
      sendNow(cmd.prompt, images, picker)
      return
    }
    // replMode ON 또는 /loop 아닌 일반 메시지: sendNow로 직통.
    sendNow(text, images, picker)
  }, [sendNow, startLoop, tickLoop, stopLoop, replMode])

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

  // ── 드레인·루프 틱 통합 effect (🔴#2 경합 차단): busy→idle 전이에서 ─────────
  //   ① 사용자 큐 우선 → 첫 항목 pop → dispatchSend (기존 22d 동작)
  //   ② 큐 비면 → 활성 루프 틱 스케줄(decideLoopTick 가드 → setTimeout → sendNow)
  // 같은 isRunning true→false 전이를 둘이 다투지 않도록 단일 effect·단일 우선순위로 통합.
  // 원본 App.tsx:660-668 미러 — `was` 가드로 중복전송 방지.
  // 전제: Conversation은 Shell에 상시 마운트. 재마운트 시 prevRunningRef 재초기화로 직전 전이를
  //   놓칠 수 있다(멀티워크스페이스는 PanelView 로컬 루프로 분리 — 이 effect 무관).
  const prevRunningRef = useRef(isRunning)
  const loopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const was = prevRunningRef.current
    prevRunningRef.current = isRunning
    if (isRunning || !was) return // busy→idle 전이일 때만
    // ① 사용자 큐 우선 (루프보다 사람 입력 먼저)
    if (queue.length > 0) {
      const next = dequeueMessage()
      if (next) dispatchSend(next.text, next.images, next.picker)
      return
    }
    // ② 큐 비면 루프 틱 — 안전 가드(decideLoopTick) 통과 시 interval 후 다음 틱
    const decision = decideLoopTick(activeLoop, Date.now())
    if (decision.action === 'halt') {
      stopLoop(decision.reason) // 상한 도달 — stopped + 사유(인디케이터 알림)
      return
    }
    if (decision.action === 'schedule' && activeLoop) {
      const { prompt, picker } = activeLoop
      loopTimerRef.current = setTimeout(() => {
        tickLoop()
        sendNow(prompt, [], picker)
      }, decision.intervalMs)
    }
  }, [isRunning, queue, activeLoop, dequeueMessage, dispatchSend, sendNow, stopLoop, tickLoop])

  // ── 루프 타이머 정리 (🔴#3): activeLoop가 사라지거나 stopped면 대기 중 setTimeout 취소 ─
  // abort/`/loop stop`/인디케이터 정지 모두 activeLoop를 null/stopped로 만들므로 여기서 일괄 취소.
  // 언마운트 시에도 정리(메모리·좀비 틱 방지).
  useEffect(() => {
    if (!activeLoop || activeLoop.status !== 'running') {
      if (loopTimerRef.current) {
        clearTimeout(loopTimerRef.current)
        loopTimerRef.current = null
      }
    }
    return () => {
      if (loopTimerRef.current) {
        clearTimeout(loopTimerRef.current)
        loopTimerRef.current = null
      }
    }
  }, [activeLoop])

  // ── B8: run done/error 전이 시 usage 갱신 ──────────────────────────────────
  // 원본 App.tsx L233~238: status === 'done' || 'error' 전이 시 getUsage 재호출.
  // isRunning(true→false)을 done/error 완료 신호로 사용. loadUsage는 catch-and-ignore.
  const prevRunningForUsageRef = useRef(isRunning)
  useEffect(() => {
    const was = prevRunningForUsageRef.current
    prevRunningForUsageRef.current = isRunning
    if (!isRunning && was) {
      void loadUsage()
    }
  }, [isRunning, loadUsage])

  // SelectionToolbar: 더 자세히 콜백 (M4 — 실 인용 미연결)
  const handleElaborate = useCallback((_text: string) => {
    // M4: 실 인용 연결. 현재 no-op.
  }, [])

  // Phase A-2: thread.length로 isEmpty 판단
  const isEmpty = thread.length === 0 && !isRunning

  // 5c: loop-active gloss 클래스 — activeLoops>0일 때만 부착
  const hasActiveLoops = activeLoops.length > 0

  return (
    <div className={`conversation${hasActiveLoops ? ' loop-active' : ''}`}>
      {/* 24c: 권한 요청 모달 — pendingPermission 있을 때만 open. choice=behavior 그대로 전달. */}
      <PermissionModal
        open={!!pendingPermission}
        toolName={pendingPermission?.toolName}
        summary={pendingPermission?.summary}
        onRespond={(choice) => void respondPermission(choice as 'allow' | 'allow_always' | 'deny')}
      />

      {/* 24d: 질문 요청 모달 — pendingQuestion 있을 때만 open. 24c 권한 패턴 미러. */}
      <QuestionModal
        open={!!pendingQuestion}
        questions={pendingQuestion?.questions ?? []}
        onAnswer={(answers) => void respondQuestion(answers)}
        onDismiss={() => void respondQuestion(null)}
      />

      {/* F-E: 인라인 서브에이전트 클릭 → 라이브 상세(대화 세션 뷰). id로 store 라이브 조회 —
          서브에이전트 transcript가 도는 동안 실시간 갱신된다(스냅샷 아님). */}
      <SubAgentFullscreen
        agent={openedSubId ? (subagents.find((sa) => sa.id === openedSubId) ?? null) : null}
        onClose={() => setOpenedSubId(null)}
      />

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

        {/* 5c: loop 진행중 표시기 — activeLoops>0일 때만 렌더(우측 상단 absolute) */}
        <LoopRunningIndicator loops={activeLoops} />

        {isEmpty ? (
          <Welcome onPick={setInputText} />
        ) : (
          <div className="thread" style={{ zoom }}>
            {/* Phase A-2: 단일 thread.map 렌더 루프 (원본 App.tsx:982-1006 미러) */}
            {thread.map((item, idx) => {
              const prev = thread[idx - 1]
              // 직전 항목이 AI 블록(assistant msg 또는 toolgroup)인지 판단 — lead 아바타 결정
              const prevIsAiBlock = prev !== undefined && (
                prev.kind === 'toolgroup' ||
                (prev.kind === 'msg' && prev.role === 'assistant')
              )

              if (item.kind === 'msg') {
                // 마지막 assistant msg + 실행 중이면 streaming prop=true (live 버블)
                const isLastItem = idx === thread.length - 1
                const isLiveAssistant = isLastItem && item.role === 'assistant' && isRunning && !item.error

                if (item.role === 'user') {
                  return (
                    <MessageBubble
                      key={item.id}
                      role="user"
                      content={item.text}
                      images={item.images}
                      time={item.time}
                    />
                  )
                }
                // assistant — W7: time 전달(있으면 .meta .time 렌더)
                return (
                  <div key={item.id} className={`msg ai-msg${item.origin === 'cron' ? ' cron-turn' : ''}`}>
                    <span className="ava ai" aria-hidden="true">
                      <IconSpark size={16} stroke={1.8} />
                    </span>
                    <div className="msg-main">
                      <div className="meta">
                        <span className="name">Claude</span>
                        {item.time && <span className="time">{item.time}</span>}
                        {/* Phase 5b/연출: cron-turn 배지 + 프레임 — origin=cron인 turn만 강조(브랜드 액센트). */}
                        {item.origin === 'cron' && (
                          <span className="cron-badge" aria-label="자율 발동 turn"><span className="cron-badge-ico" aria-hidden="true">🔁</span>자율 발동</span>
                        )}
                      </div>
                      <div className="content">
                        {isLiveAssistant ? (
                          // SmoothMarkdown이 자체 inline 커서 제공(텍스트 끝). 별도 커서 금지(중복 방지).
                          <SmoothMarkdown text={item.text} running={isRunning} />
                        ) : (
                          <MarkdownView source={item.text} />
                        )}
                      </div>
                    </div>
                  </div>
                )
              }

              if (item.kind === 'toolgroup') {
                return (
                  <ToolGroup
                    key={item.id}
                    group={item}
                    lead={!prevIsAiBlock}
                    fileDiffs={fileDiffs}
                  />
                )
              }

              if (item.kind === 'thinking') {
                return <ThinkingItem key={item.id} text={item.text} />
              }

              if (item.kind === 'notice') {
                // W7: notice time 전달
                return <NoticeItem key={item.id} text={item.text} time={item.time} />
              }

              if (item.kind === 'cmdresult') {
                return (
                  <CmdResultCard
                    key={item.id}
                    id={item.id}
                    name={item.name}
                    title={item.title}
                    sub={item.sub}
                    running={item.running}
                    failed={item.failed}
                    time={item.time}
                  />
                )
              }

              if (item.kind === 'orchestration') {
                return (
                  <OrchestrationCard
                    key={item.id}
                    id={item.id}
                    name={item.name}
                    description={item.description}
                    phases={item.phases}
                    running={item.running}
                    failed={item.failed}
                    result={item.result}
                    script={item.script}
                    time={item.time}
                    livePhases={item.livePhases}
                    agents={item.agents}
                    liveSummary={item.liveSummary}
                  />
                )
              }

              if (item.kind === 'subagent') {
                // F-G: 채팅 인라인 서브에이전트 — 데이터는 state.subagents에서 id로 라이브 조회.
                return (
                  <SubAgentInline
                    key={item.id}
                    agent={subagents.find((sa) => sa.id === item.id)}
                    onOpen={setOpenedSubId}
                  />
                )
              }

              return null
            })}

            {/* P14a: WorkingIndicator — isRunning 중이고 thread가 비어 있거나
                 마지막 항목이 live assistant msg가 아닌 경우 표시.
                 질문 모달 대기 중에는 억제(원본 showWorking: !pendingQuestion·!pendingCommand 미러).
                 권한 모달은 thinking과 동시 표시(원본 App.tsx L820 — pendingPermission 억제조건 미포함).
                 thinkingText 있으면 그 텍스트 우선, 없으면 WORKING_PHRASES 순환. */}
            {isRunning && !pendingQuestion && (() => {
              const lastItem = thread[thread.length - 1]
              const lastIsLiveAssistant = lastItem &&
                lastItem.kind === 'msg' &&
                lastItem.role === 'assistant' &&
                !lastItem.error
              return !lastIsLiveAssistant
            })() && (
              <WorkingIndicator text={thinkingText} />
            )}

            {/* 에러 메시지 배너 (errorMessage 필드 유지 — MVP) */}
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

      {/* 앱 레벨 /loop 활성 루프 배너 (드라이버 docs/LOOP_SUPPORT.md) */}
      {activeLoop && (
        <LoopIndicator
          loop={activeLoop}
          onStop={() => stopLoop('user')}
          onDismiss={dismissLoop}
        />
      )}

      {/* 리치 컴포저 (F9) */}
      <Composer
        value={inputText}
        onChange={setInputText}
        onSend={(opts) => handleSend(opts)}
        onAbort={
          // Phase 5b: 정지 의미 분리 — replMode ON이면 turn만 중단(세션 유지), OFF면 세션 종료.
          // 단방향: store.replMode → 콜백 결정 → Composer stop 버튼 클릭 시 호출.
          replMode
            ? () => void interruptRun()
            : () => void abortRun()
        }
        isRunning={isRunning}
        hasStarted={thread.length > 0}
        onSlashAsk={onSlashAsk}
        onOpenImage={onOpenImage}
        lastUsage={lastUsage}
        selectedModel={selectedModel}
        lastContextWindow={lastContextWindow}
        usage={usage}
        mentionFiles={projectFiles}
        attachedImages={attachedImages.map((i) => i.dataUrl)}
        onAttachFiles={(files) => void attachImagesFromFiles(files)}
        onRemoveImage={removeAttachedImage}
        queued={queue.map((q) => ({ id: q.id, text: q.text, images: q.images.map((i) => i.dataUrl) }))}
        onRemoveQueued={removeQueued}
        history={thread
          .flatMap((item) => (item.kind === 'msg' && item.role === 'user' ? [item.text] : []))
          .filter((t) => t.trim().length > 0)}
        workspaceRoot={workspaceRoot}
        disabled={!workspaceRoot}
      />
    </div>
  )
}

export default memo(Conversation)
