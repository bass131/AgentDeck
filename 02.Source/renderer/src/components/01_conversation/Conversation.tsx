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
  useMemo,
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
  selectReplMode,
  selectActiveLoops,
  selectPendingCommand,
  selectLoopsStoppedNotice,
  selectGoalRun,
  selectBannerStale,
  selectStaleDismissed,
  selectRestoredSession,
  selectApiRetry,
  selectCompacting,
  selectSdkSessionState,
} from '../../store/appStore'
import type { AttachedImage } from '../../store/appStore'
import type { PickerValues } from './Composer'
import { LoopStatusBanner } from '../07_notice/LoopStatusBanner'
import { resolveLoopStatus } from '../../lib/loopStatus'
import { decideStopAction } from '../../lib/stopAction'
import { MarkdownView } from './MarkdownView'
import { SmoothMarkdown } from './SmoothMarkdown'
import { MessageBubble, type MessageBubbleProps } from './MessageBubble'
import { Composer } from './Composer'
import { PermissionCard } from '../07_notice/PermissionCard'
import { QuestionModal } from '../06_prompt/QuestionModal'
import { ToolGroup } from './ToolGroup'
import { extractMentions } from '../../lib/mentions'
import { buildEnginePrompt } from '../../lib/composerNotes'
import { IconEye, IconSearch, IconBolt, IconPencil, IconSpark, IconAlert, IconClaude, IconClock } from '../common/icons'
import type { IconProps } from '../common/icons'
import { useZoom, ZoomBadge } from '../../lib/zoom'
import { SelectionToolbar } from './SelectionToolbar'
import { CmdResultCard } from './CmdResultCard'
import { OrchestrationCard } from '../05_agent/OrchestrationCard'
import { SubAgentInline } from '../05_agent/SubAgentInline'
import { SubAgentFullscreen } from '../05_agent/SubAgentFullscreen'
import { ScrollToBottomButton } from './ScrollToBottomButton'
import { isScrolledUp } from '../../lib/scrollHelpers'
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
// FB1 P06: MessageBubble.tsx로 추출됨(순환참조 회피 — SubAgentFullscreen 재사용).
// 기존 import 경로(`'../../01_conversation/Conversation'`에서 MessageBubble) 하위호환
// 유지를 위해 재-export하면서, 이 파일 내부(아래 thread.map user 버블)에서도 그대로 사용.
export { MessageBubble, type MessageBubbleProps }

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

// ── LR1: 맥락 복원 배지 ────────────────────────────────────────────────────────

/**
 * RestoredContextBadge — 활성 대화가 디스크에서 복원되어 sessionId(resume)로
 * 이전 맥락이 이어지고 있음을 알리는 은은한 pill.
 *
 * 모델이 가끔 "이전 대화를 기억 못 한다"고 말해도, 앱 상태(sessionId 보유)를
 * 신뢰할 근거를 시각적으로 제공한다(LR1). 표시조건은 store(restoredSession)가
 * 이미 파생해둔 값을 그대로 반영 — 컴포넌트는 조건 재계산 0(단방향 흐름).
 */
export const RestoredContextBadge = memo(function RestoredContextBadge(): JSX.Element {
  return (
    <div className="ctx-restored-badge" role="status">
      <IconClock size={12} stroke={1.8} />
      <span>이전 맥락이 이어지는 대화예요</span>
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

  const sendMessage = useAppStore((s) => s.sendMessage)
  const abortRun = useAppStore((s) => s.abortRun)
  // Phase 5b: 현재 turn만 중단 — 세션 유지(REPL 지속세션 정지). replMode ON 시 정지 버튼에 사용.
  const interruptRun = useAppStore((s) => s.interruptRun)
  // Phase 07(LR3): subscribeAgentEvents 호출은 Shell.tsx로 승격됨(역방향 유령 수리) — 이
  // 컴포넌트에서는 더 이상 직접 구독하지 않는다(위 마운트 effect 주석 참조).
  // GAP1 P02(I-03): selectedModel은 Composer가 이제 store에서 직접 구독(mode와 동일 패턴,
  // 더블소스 제거) — 여기서 읽어 prop으로 내려줄 필요 없다. setSelectedModel은 sendNow의
  // 세이프티넷(피커 변경 즉시 store 반영이라 이미 같은 값 — 유지해도 부작용 0)으로 존속.
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

  // Phase 5a: REPL 지속세션 모드(ADR-024) — persistent 전송 여부 결정.
  // LR3-03: /loop 앱 레벨 인터셉트는 폐기됨(항상 SDK로 통과) — 이 값은 sendMessage의
  // persistent/sessionKey 포함 여부 + 정지 버튼(interrupt vs abort) 분기에만 쓰인다.
  const replMode = useAppStore(selectReplMode)

  // 5c: 활성 루프(내장 /loop·/schedule 크론) — loop 진행중 표시기 + gloss.
  // loops 이벤트 → reducer → activeLoops. 빈 배열=표시 제거.
  const activeLoops = useAppStore(selectActiveLoops)
  // LR3-06: goal(`/goal` 자기지속) 진행 신호 — resolveLoopStatus 두 번째 인자(단일 표시 불변식).
  const pendingCommand = useAppStore(selectPendingCommand)
  // LR3-06 정지 신뢰 피드백: abort로 루프를 끊은 직후 확인 배너(stopped) — 세 번째 인자.
  const loopsStoppedNotice = useAppStore(selectLoopsStoppedNotice)
  // goal 표시 수명 일원화(BL1 후속): 지속 goal 컨텍스트 — resolveLoopStatus 두 번째
  // 인자(가시성+내용 단일 소스, autonomyActive 게이트를 대체).
  const goalRun = useAppStore(selectGoalRun)
  // BL1 P03: stale-watchdog 판정 — resolveLoopStatus 4·5번째 인자(goal-stale 변형 게이트 +
  // 수동 해제 표시 숨김).
  const bannerStale = useAppStore(selectBannerStale)
  const staleDismissed = useAppStore(selectStaleDismissed)
  const dismissGoalStale = useAppStore((s) => s.dismissGoalStale)
  const dismissLoopsStopped = useAppStore((s) => s.dismissLoopsStopped)

  // GAP1 P04(턴 신뢰성 신호): api_retry/compact 인디케이터(LoopStatusBanner 재사용 변형) +
  // session_state 권위 신호(기존 WorkingIndicator 문법 보강, 신규 컴포넌트 0).
  const apiRetry = useAppStore(selectApiRetry)
  const compacting = useAppStore(selectCompacting)
  const sdkSessionState = useAppStore(selectSdkSessionState)

  // LR1: 현재 대화가 디스크에서 복원되어 sessionId(resume)로 이어지는 경우만 true.
  // store(loadConversation/selectConversation)가 이미 파생 — "맥락 복원됨" 배지 표시조건.
  const restoredSession = useAppStore(selectRestoredSession)

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
  // D: "맨 아래로" 버튼 표시 state — 바닥 기준 초과 스크롤 시 true
  const [showScrollToBottom, setShowScrollToBottom] = useState(false)

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

  // 마운트: 파일 목록 로드 (M4-2: @멘션 팔레트 배선)
  // B8: 마운트 시 usage 초기 로드 (catch-and-ignore — loadUsage 내부 처리)
  // 사용자 요청: 단일 모드 진입 시 직전 대화를 자동 로드하지 않는다(빈 대화로 시작).
  //   이전 대화는 사이드바에서 명시적으로 선택(selectConversation)해야 표시됨.
  //
  // Phase 07(LR3, 역방향 유령 수리): subscribeAgentEvents() 호출은 Shell.tsx로 승격됨 —
  // 이 컴포넌트가 workspaceMode==='multi'일 때 언마운트되므로(Shell.tsx), 여기서 구독하면
  // 단일챗 자신의 활성 run이 멀티 모드 체류 중 도착하는 done/session 이벤트를 영구히
  // 놓쳐 isRunning/currentRunId가 고착되는 유령이 생긴다(단일채팅판 스트림 증발 —
  // 01.Phases/switch-continuity/_diagnosis.md §멀티패널 "역방향 유령" 확정).
  // 구독을 항상 마운트돼 있는 Shell로 옮기면 이 경로 자체가 사라진다.
  useEffect(() => {
    void loadProjectFiles()
    void loadUsage()
  }, [loadProjectFiles, loadUsage])

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
    const scrolled = isScrolledUp({
      scrollHeight: el.scrollHeight,
      scrollTop: el.scrollTop,
      clientHeight: el.clientHeight,
    })
    userScrolledUp.current = scrolled
    // D: 버튼 표시 state 갱신 (단방향 흐름: 이벤트 → state → 버튼 리렌더)
    setShowScrollToBottom(scrolled)
  }, [])

  // zoomRef + scrollRef 합성 (chat-scroll이 zoom의 wheel 수신 타겟)
  const chatScrollRef = useCallback((node: HTMLDivElement | null) => {
    (scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = node
    zoomRef(node)
  }, [zoomRef])

  // ── sendNow: 슬래시(/clear·/ask) 인터셉트 + 노트 합성 + sendMessage 호출 (22d 추출) ──
  // 큐 드레인 effect·직접 전송 모두에서 재사용. LR3-03: /loop 인터셉트는 폐기 —
  // `/loop ...`도 여기를 그대로 통과해 SDK로 간다(Claude가 내장 크론으로 자기제어).
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

  // ── handleSend: 실행 중이면 enqueue, 아니면 sendNow (22d 재작성, LR3-03 단순화) ──
  // M4-1: pickerValues를 store의 sendMessage에 전달 (→ agentRun req.model/effort/mode)
  // 22a: /clear·/ask 클라이언트 인터셉트는 sendNow 내부에서 처리.
  // LR3-03: /loop 앱 레벨 인터셉트(구 dispatchSend) 폐기 — sendNow로 직통.
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
    sendNow(text, imgs, pickerValues)
  }, [inputText, attachedImages, isRunning, queue.length, enqueueMessage, clearAttachedImages, sendNow])

  // ── 큐 드레인 effect: busy→idle 전이에서 사용자 예약 메시지 우선 전송 ─────────
  // LR3-03: 루프 틱 절반(decideLoopTick 가드·setTimeout 재발사)은 삭제 — /loop이 항상
  // SDK로 통과하면서 앱 레벨 재발사 자체가 불필요해짐. 큐 드레인만 남는다.
  // 원본 App.tsx:660-668 미러 — `was` 가드로 중복전송 방지.
  // 전제: Conversation은 Shell에 상시 마운트. 재마운트 시 prevRunningRef 재초기화로 직전 전이를
  //   놓칠 수 있다(멀티워크스페이스는 PanelView 로컬 상태로 분리 — 이 effect 무관).
  const prevRunningRef = useRef(isRunning)
  useEffect(() => {
    const was = prevRunningRef.current
    prevRunningRef.current = isRunning
    if (isRunning || !was) return // busy→idle 전이일 때만
    if (queue.length === 0) return
    const next = dequeueMessage()
    if (next) sendNow(next.text, next.images, next.picker)
  }, [isRunning, queue, dequeueMessage, sendNow])

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

  // ── Composer props 메모화 (Composer = memo() → 참조 안정화로 불필요 리렌더 방지) ──
  // onAbort: replMode 전환마다 인라인 재생성 → useCallback으로 참조 안정화.
  // FB2 P02(P01 진단 반영): interrupt()는 "현재 턴"만 중단 — goal/loop의 self-re-arm
  // (세션 스코프 자기지속)은 세션을 끝내는 abort()만이 해제한다. decideStopAction이
  // activeLoops/pendingCommand를 함께 보고 goal/loop 활성 중엔 replMode 무관 abort로
  // 승격한다(PanelView.tsx handleAbort와 판정 로직 공유 — 중복 정의 금지).
  const handleAbort = useCallback(() => {
    const action = decideStopAction(replMode, activeLoops, pendingCommand)
    if (action === 'interrupt') void interruptRun()
    else void abortRun()
  }, [replMode, activeLoops, pendingCommand, interruptRun, abortRun])

  // onAttachFiles: 매 렌더 인라인 래퍼 → useCallback으로 참조 안정화.
  const handleAttachFiles = useCallback(
    (files: File[]) => { void attachImagesFromFiles(files) },
    [attachImagesFromFiles]
  )

  // attachedImages prop: 매 렌더 .map() → 배열 참조 불안정 → useMemo.
  const attachedImageUrls = useMemo(
    () => attachedImages.map((i) => i.dataUrl),
    [attachedImages]
  )

  // queued prop: 매 렌더 .map() → useMemo (domain QueuedMessage → view string[]).
  const queuedView = useMemo(
    () => queue.map((q) => ({ id: q.id, text: q.text, images: q.images.map((i) => i.dataUrl) })),
    [queue]
  )

  // history prop: 매 렌더 flatMap+filter → useMemo.
  const userHistory = useMemo(
    () =>
      thread
        .flatMap((item) => (item.kind === 'msg' && item.role === 'user' ? [item.text] : []))
        .filter((t) => t.trim().length > 0),
    [thread]
  )

  // Phase A-2: thread.length로 isEmpty 판단
  const isEmpty = thread.length === 0 && !isRunning

  // LR2-03/LR3-03/LR3-06: 통합 루프 상태 — SDK 크론(activeLoops) > goal(goalRun)
  // > stopped(정지 확인) > none 단일 판정(앱 타이머 소스는 폐기). 배너 1개(컴포저 위)만 렌더.
  // gloss 전용(REPL 표시등은 영호 조정 2026-07-03로 replMode 자체만 반영 — 판정 비공유).
  // goal 표시 수명 일원화(BL1 후속): 두 번째 인자가 pendingCommand→goalRun, 4번째 인자
  // autonomyActive는 시그니처에서 제거(가시성 게이트에서 완전히 빠짐).
  const loopStatus = resolveLoopStatus(activeLoops, goalRun, loopsStoppedNotice, bannerStale, staleDismissed)
  // gloss는 "루프가 살아있는" 신호에만 — stopped(정지 확인 통지)는 활성 아님.
  const hasActiveLoops = loopStatus.kind === 'sdk' || loopStatus.kind === 'goal'

  return (
    <div className={`conversation${hasActiveLoops ? ' loop-active' : ''}`}>
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

        {isEmpty ? (
          <Welcome onPick={setInputText} />
        ) : (
          <div className="thread" style={{ zoom }}>
            {/* LR1: 맥락 복원 배지 — 스레드 최상단(첫 메시지 위). 대화가 길어지면
                자연스럽게 스크롤되어 흘러가도 무방(비침투적, UI.md 안티슬롭 준수). */}
            {restoredSession && <RestoredContextBadge />}

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

              if (item.kind === 'compact-boundary') {
                // GAP1 P04(S-01): 컨텍스트 컴팩션 경계 인라인 마커 — NoticeItem 재사용
                // (model-fallback/orchestration_denied와 동일 문법, 신규 시각 컴포넌트 0).
                const tokensNote = item.preTokens !== undefined && item.postTokens !== undefined
                  ? ` (${item.preTokens.toLocaleString('ko-KR')} → ${item.postTokens.toLocaleString('ko-KR')} 토큰)`
                  : ''
                return (
                  <NoticeItem
                    key={item.id}
                    text={`대화가 길어져 컨텍스트를 압축했어요${tokensNote}`}
                    time={item.time}
                  />
                )
              }

              return null
            })}

            {/* P14a: WorkingIndicator — isRunning 중이고 thread가 비어 있거나
                 마지막 항목이 live assistant msg가 아닌 경우 표시.
                 질문 요청 대기 중에는 억제(원본 showWorking: !pendingQuestion·!pendingCommand 미러).
                 BF3 Phase 06(ADR-030): 권한 요청 대기 중에도 이제 억제 — 원본 App.tsx L820
                 (pendingPermission 억제조건 미포함) 대비 의도적 차이. 인라인 카드 도입으로
                 카드와 인디케이터가 세로 공존하게 됐는데, 시선을 카드 하나로 모으기 위한
                 결정(ADR-030 "모달의 강제 집중력 상실" 완화책 중 하나).
                 thinkingText 있으면 그 텍스트 우선, 없으면 WORKING_PHRASES 순환.
                 GAP1 P04(S-05): sdkSessionState==='requires_action'이면 그 문구를 최우선
                 표시 — SDK가 사용자 확인/개입이 필요하다고 확정 신호를 준 상태라 일반
                 "생각 중" 순환 문구보다 정확한 정보다(옵트인 미설정 세션은 항상 null이라
                 기존 thinkingText 우선순위 그대로 — 보강 전용, 회귀 0). */}
            {isRunning && !pendingQuestion && !pendingPermission && (() => {
              const lastItem = thread[thread.length - 1]
              const lastIsLiveAssistant = lastItem &&
                lastItem.kind === 'msg' &&
                lastItem.role === 'assistant' &&
                !lastItem.error
              return !lastIsLiveAssistant
            })() && (
              <WorkingIndicator
                text={sdkSessionState === 'requires_action' ? '작업 확인이 필요해요' : thinkingText}
              />
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

        {/* D: 맨 아래로 플로팅 버튼 — 위로 스크롤 시만 표시 */}
        <ScrollToBottomButton
          show={showScrollToBottom}
          onClick={() => {
            const el = scrollRef.current
            if (el) {
              el.scrollTop = el.scrollHeight
              userScrolledUp.current = false
              setShowScrollToBottom(false)
            }
          }}
        />
      </div>

      {/* LR2-03/LR3-03: 통합 루프 배너 — SDK 크론을 컴포저 위 한 자리에서 표시.
          none이면 자체 null 렌더. 정지=세션 abort(크론은 세션 스코프). */}
      <LoopStatusBanner
        status={loopStatus}
        onStopSdk={() => void abortRun()}
        onDismissStopped={dismissLoopsStopped}
        // BL1 P03: stale(신호 없음) 배너 수동 해제 — 표시만 숨김(autonomyActive 불변).
        onDismissStale={dismissGoalStale}
        // FB2 P08: 3단 위계의 "현재 작업내용" — 이미 구독 중인 thinkingText 재사용(신규 IPC 0).
        currentActivity={thinkingText}
        // GAP1 P04(S-02/S-01): api_retry/compact 진행 신호 — LoopStatusBanner 내부에서
        // 다른 모든 변형보다 우선 판정(신규 배너 컴포넌트 0, 기존 마크업 재사용 변형).
        apiRetry={apiRetry}
        compacting={compacting}
      />

      {/* BF3 Phase 06(ADR-030): 권한 요청 인라인 카드 — 컴포저 바로 위, LoopStatusBanner와
          같은 "컴포저 위 배너 슬롯". pendingPermission 없으면 자체 null 렌더. 종전
          PermissionModal(.q-overlay 풀오버레이)을 대체 — 권한 대기 중에도 ■(중단) 버튼이
          가려지지 않고 상시 클릭 가능하다. */}
      <PermissionCard
        pending={pendingPermission}
        onRespond={(choice) => void respondPermission(choice)}
      />

      {/* 리치 컴포저 (F9) */}
      <Composer
        value={inputText}
        onChange={setInputText}
        onSend={handleSend}
        onAbort={handleAbort}
        isRunning={isRunning}
        hasStarted={thread.length > 0}
        onSlashAsk={onSlashAsk}
        onOpenImage={onOpenImage}
        lastUsage={lastUsage}
        lastContextWindow={lastContextWindow}
        usage={usage}
        mentionFiles={projectFiles}
        attachedImages={attachedImageUrls}
        onAttachFiles={handleAttachFiles}
        onRemoveImage={removeAttachedImage}
        queued={queuedView}
        onRemoveQueued={removeQueued}
        history={userHistory}
        workspaceRoot={workspaceRoot}
        disabled={!workspaceRoot}
      />
    </div>
  )
}

export default memo(Conversation)
