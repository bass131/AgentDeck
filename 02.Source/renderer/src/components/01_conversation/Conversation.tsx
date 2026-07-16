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
  selectHookRuns,
  selectBackendLabel,
} from '../../store/appStore'
import type { AttachedImage } from '../../store/appStore'
import type { ThreadItem } from '../../store/threadTypes'
import type { PickerValues } from './Composer'
import { LoopStatusBanner } from '../07_notice/LoopStatusBanner'
import { resolveLoopStatus } from '../../lib/loopStatus'
import { decideStopAction } from '../../lib/stopAction'
import { groupIntoTurnBlocks } from '../../lib/turnBlocks'
import { WORKING_PHRASES, nextPhraseIndex } from '../../lib/workingPhrases'
import { MarkdownView } from './MarkdownView'
import { SmoothMarkdown } from './SmoothMarkdown'
import { MessageBubble, type MessageBubbleProps } from './MessageBubble'
import { HookBadge } from './HookBadge'
import { deriveHookTurnBadges } from '../../store/hookBadge'
import { getProviderBrand } from '../../lib/providerBrand'
import { getTheme } from '../../lib/theme'
import { Composer } from './Composer'
import { PermissionCard } from '../07_notice/PermissionCard'
import { QuestionModal } from '../06_prompt/QuestionModal'
import { ToolGroup } from './ToolGroup'
import { extractMentions } from '../../lib/mentions'
import { buildEnginePrompt } from '../../lib/composerNotes'
import { IconEye, IconSearch, IconBolt, IconPencil, IconSpark, IconAlert, IconClaude, IconClock, IconInfo, IconChevDown } from '../common/icons'
import type { IconProps } from '../common/icons'
import { HookTimeline } from '../07_notice/HookTimeline'
import { useZoom, ZoomBadge } from '../../lib/zoom'
import { SelectionToolbar } from './SelectionToolbar'
import { CmdResultCard } from './CmdResultCard'
import { OrchestrationCard } from '../05_agent/OrchestrationCard'
import { SubAgentInline } from '../05_agent/SubAgentInline'
import { SubAgentFullscreen } from '../05_agent/SubAgentFullscreen'
import { ScrollToBottomButton } from './ScrollToBottomButton'
import { StatusLine } from './StatusLine'
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

  // TG1 P09: Welcome 히어로 provider 바인딩. provider 소스 실측 채택 근거 — 스토어에
  // "전역 기본 엔진" 필드는 존재하지 않는다(defaultEngine류 grep 0건, 2026-07-17).
  // selectBackendLabel(턴 블록 헤더 아바타와 동일 출처)이 "지금 어떤 엔진이 응답하는가"의
  // 유일한 실재 신호라 그대로 채택한다. Track 1은 backendLabel이 'Claude Code' 고정이라
  // 항상 공식 Claude Spark로 보인다(정상 — Codex 배선 전의 provider 바인딩 현재값).
  const backendLabel = useAppStore(selectBackendLabel)
  const welcomeBrand = getProviderBrand(backendLabel === 'Claude Code' ? 'claude-code' : 'unknown', getTheme())

  return (
    <div className="welcome">
      {/* reviewer 🟡-1 봉합(TG1 P09): 공식 로고(Clay 계열)는 accent 그라디언트 위에서
          저대비 — 턴 헤더(.turn-block-ava.ava-spark)·MessageBubble(.ava.ai.ava-spark)와
          동형 처방으로 중립 표면(--surface-2) modifier를 additive 클래스로 부착한다.
          `.wc-mark` 자체는 보존(census 영향 0) — 폴백(자체 아이콘, 흰 스트로크)은 기존
          accent 그라디언트 유지(정대비라 처방 불필요). */}
      <span className={`wc-mark${welcomeBrand.kind === 'logo' ? ' wc-mark-spark' : ''}`} aria-hidden="true">
        {welcomeBrand.kind === 'logo' ? (
          <img src={welcomeBrand.src} alt={welcomeBrand.alt} width={26} height={26} />
        ) : (
          <IconSpark size={26} stroke={1.7} />
        )}
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
// TG1 P04: WORKING_PHRASES/nextPhraseIndex 본체는 lib/workingPhrases.ts로 추출됨
// (StatusLine.tsx도 재사용해야 하는데 이 파일을 직접 import하면 순환참조가 생기기 때문 —
// lib/workingPhrases.ts 파일 주석 참조). 여기서는 import + re-export만 유지해 기존 소비처
// (이 파일 내부 WorkingIndicator + 기존 테스트의 Conversation.tsx 경로 import) 하위호환.
export { WORKING_PHRASES, nextPhraseIndex }

/**
 * WorkingIndicator — 에이전트 실행 중 표시하는 "생각 중" 인디케이터.
 *
 * - text(thinkingText)가 있으면 그 텍스트를 우선 표시.
 * - null이면 WORKING_PHRASES를 5~20초 랜덤 간격으로 순환 표시.
 * - 언마운트 시 타이머 정리(누수 0).
 *
 * TG1 P03: bare=true면 자신의 아바타 span을 생략한다(단일챗 턴 블록 안에서는 블록 헤더가
 * 아바타 1개를 이미 그리므로 개별 아바타가 중복된다). 기본 false — PanelView(패널 표면)는
 * bare 미지정으로 기존 외관 그대로(하위호환, 이 Phase는 PanelView 무접촉).
 */
export function WorkingIndicator({ text, bare = false }: { text: string | null; bare?: boolean }): JSX.Element {
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
      {!bare && (
        <span className="ava ai" aria-hidden="true">
          <IconClaude size={16} />
        </span>
      )}
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

// ── thinking 아이템 (F14-02, GAP1 P06 접이식 전문 확장) ─────────────────────────
//
// GAP1 P06(I-01/S-09): 이전엔 "생각 중" 상태 표시(다른 애니메이션 dots)에 불과했다 —
// 사고가 끝나면 흔적 없이 사라졌다(reducer가 휘발 thinkingText만 세팅). 이제
// reducer(reducer/text.ts handleThinking/handleThinkingDelta)가 thread에 전문을 영속화하므로
// 이 컴포넌트는 "현재 진행 중" 표시가 아니라 접이식 전문 뷰어(archival record)로 확장한다
// (라이브 "생각 중" 애니메이션은 WorkingIndicator/thinkingText가 계속 담당 — 역할 분리).
//
// (d) 성능: 접힘 기본 + 펼칠 때만 전문을 DOM에 렌더(HookTimeline.tsx 접이식 패턴과 동형 —
// 신규 시각 문법 최소화). 접힘 상태에서는 요약줄(라벨+글자수+토큰 추정치)만 그린다.
// redacted-thinking fallback: 텍스트가 아직 없고 estimatedTokens만 있으면(SDK가 원문 대신
// 토큰 추정치만 보낸 구간, sdk.d.ts:4261) 접이식 자체가 무의미하므로 진행 표시 문구로 대체.

export interface ThinkingItemProps {
  text: string
  /** redacted-thinking 구간 진행 표시용 토큰 추정치(P06 additive). */
  estimatedTokens?: number
  /**
   * GAP1 P16(b): 다음 assistant msg와 시각적으로 연속(인접)인지 — isThinkingContinuous
   * (store/continuity.ts) 판정을 호출부가 전달. true면 저위험 인접 연출(카드 프레임을
   * 낮추고 뒤따르는 답변과의 gap을 좁혀 "같은 흐름"으로 읽히게 함, 실제 gap 축소는
   * 대상 assistant 쪽 margin-top으로 적용 — CSS 소유는 Conversation.css 참조).
   * 미지정/false = 기존 외관 그대로(하위호환).
   * TG1 P03: 단일챗(Conversation.tsx)은 턴 블록 구조가 연속성을 대신 표현하므로 더 이상
   * 이 prop을 전달하지 않는다 — PanelView.tsx(:583-589)는 여전히 소비 중이라 계약 유지.
   */
  continuous?: boolean
  /**
   * TG1 P03(단일챗 턴 블록): true면 자신의 아바타 span(.ava.ai)을 생략한다 — 턴 블록
   * 헤더가 아바타 1개를 이미 그리므로 개별 아바타가 중복된다. 기본 false(=현행 외관,
   * PanelView는 bare 미지정으로 하위호환 — 이 Phase는 PanelView 무접촉). bare여도
   * .msg.ai-msg + .thinking/.thinking-block + data-testid 4종은 그대로 유지한다(계약 보존).
   */
  bare?: boolean
}

export const ThinkingItem = memo(function ThinkingItem({ text, estimatedTokens, continuous, bare = false }: ThinkingItemProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const hasText = text.length > 0
  const continuousCls = continuous ? ' msg-continues' : ''

  if (!hasText && estimatedTokens !== undefined) {
    // redacted 진행 표시 fallback — 펼칠 전문이 없으므로 토글 자체를 제공하지 않는다.
    return (
      <div className={`msg ai-msg${continuousCls}`}>
        {!bare && (
          <span className="ava ai" aria-hidden="true">
            <IconClaude size={16} />
          </span>
        )}
        <div className="msg-main">
          <div className="thinking" data-testid="thinking-progress">
            <span>사고 중… ~{estimatedTokens.toLocaleString('ko-KR')} 토큰</span>
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

  return (
    <div className={`msg ai-msg${continuousCls}`}>
      {!bare && (
        <span className="ava ai" aria-hidden="true">
          <IconClaude size={16} />
        </span>
      )}
      <div className="msg-main">
        <div className="thinking-block" data-testid="thinking-block">
          <button
            type="button"
            className="thinking-summary"
            data-testid="thinking-toggle"
            aria-expanded={open}
            aria-label={`사고 과정 ${open ? '접기' : '펼치기'}`}
            onClick={() => setOpen((v) => !v)}
          >
            <span className="thinking-summary-ic" aria-hidden="true">
              <IconSpark size={13} />
            </span>
            <span className="thinking-summary-label">사고 과정</span>
            <span className="thinking-summary-count">{text.length.toLocaleString('ko-KR')}자</span>
            {estimatedTokens !== undefined && (
              <span className="thinking-summary-tokens">~{estimatedTokens.toLocaleString('ko-KR')} 토큰</span>
            )}
            <span className={`thinking-summary-chev${open ? ' open' : ''}`} aria-hidden="true">
              <IconChevDown size={12} />
            </span>
          </button>
          {open && (
            <div className="thinking-detail" data-testid="thinking-detail">
              {text}
            </div>
          )}
        </div>
      </div>
    </div>
  )
})

// ── notice 아이템 (F14-02, GAP1 P05 tone 확장) ─────────────────────────────────

/**
 * NoticeTone — 표시 강조 변형 (GAP1 P05). 기본 'warn'은 기존 노란 톤 그대로(회귀 0 —
 * model-fallback/orchestration_denied/compact-boundary는 tone 미지정으로 기존 외관 유지).
 * 'error'=빨강(가장 두드러짐, permission-denied·informational level:'warning') ·
 * 'info'=파랑(차분, informational level:'notice') ·
 * 'muted'=가장 옅음(informational level:'info', 트랜스크립트 모드 전용 SDK 취지).
 */
export type NoticeTone = 'warn' | 'error' | 'info' | 'muted'

export interface NoticeItemProps {
  text: string
  time?: string
  tone?: NoticeTone
}

export const NoticeItem = memo(function NoticeItem({ text, time, tone = 'warn' }: NoticeItemProps): JSX.Element {
  const Icon = tone === 'info' || tone === 'muted' ? IconInfo : IconAlert
  return (
    <div className={`notice-row tone-${tone}`}>
      <span className="notice-ic">
        <Icon size={15} />
      </span>
      <div className="notice-text">{text}</div>
      {time && <span className="notice-time">{time}</span>}
    </div>
  )
})

// ── GAP1 P05: informational/permission-denied → NoticeItem 표시 카피 파생 ──────
//
// 계약(shared/agent-events.ts AgentEventInformational·AgentEventPermissionDenied)에는
// 기계값(level/decisionReasonType 등)만 있고 사용자 한국어 카피는 넣지 않는다(카피 수정이
// shared 계약 변경이 되지 않도록 분리 — lib/orchestrationDeniedCopy.ts와 동일 원칙).
// reducer(reducer/cockpit.ts)는 원시 필드만 thread item에 싣는다 — 표시 텍스트 합성은
// 이 렌더 레이어(단방향 흐름: 상태=원시값, 뷰=표시 텍스트 파생)의 책임. PanelView.tsx도
// 이 함수들을 그대로 import해 두 표면(단일·멀티)이 동일 카피를 쓴다(단일 진실원).

/**
 * informational level → NoticeItem 강조 톤. 브리프 명시 위계(warning > suggestion > notice
 * > info)를 시각 강도로 반영.
 */
export function informationalTone(level: 'info' | 'notice' | 'suggestion' | 'warning'): NoticeTone {
  switch (level) {
    case 'warning':
      return 'error'
    case 'suggestion':
      return 'warn'
    case 'notice':
      return 'info'
    case 'info':
    default:
      return 'muted'
  }
}

/**
 * informational 표시 텍스트 — content 그대로(훅/SDK가 이미 사람이 읽을 문장을 만들어
 * 보내므로 재작성하지 않는다) + preventContinuation이면 진행 중단 안내 접미.
 */
export function informationalDisplayText(item: { content: string; preventContinuation?: boolean }): string {
  return item.preventContinuation ? `${item.content} — 이후 진행이 중단됐어요` : item.content
}

/**
 * decisionReasonType(SDK 10-way 리터럴 + 미래 확장 대비 open string) → 한국어 라벨.
 * 미등록 값은 원문 그대로 폴백(정보 손실 없음 — 안전 폴백 원칙).
 */
const DECISION_REASON_TYPE_LABEL: Record<string, string> = {
  rule: '규칙',
  mode: '모드',
  subcommandResults: '하위 명령 결과',
  permissionPromptTool: '권한 프롬프트 도구',
  hook: '훅',
  asyncAgent: '비동기 에이전트',
  sandboxOverride: '샌드박스 오버라이드',
  workingDir: '작업 디렉터리',
  safetyCheck: '안전 점검',
  classifier: '분류기',
  other: '기타',
}

export function decisionReasonTypeLabel(type?: string): string | undefined {
  if (!type) return undefined
  return DECISION_REASON_TYPE_LABEL[type] ?? type
}

/**
 * permission-denied 표시 텍스트 — "차단: {toolName} ({주체 라벨})" + 사유(있으면).
 * 규칙 주체(decisionReasonType)를 뭉뚱그리지 않고 명시 — 사용자 규칙 튜닝 근거.
 */
export function permissionDeniedDisplayText(item: {
  toolName: string
  decisionReasonType?: string
  decisionReason?: string
}): string {
  const typeLabel = decisionReasonTypeLabel(item.decisionReasonType)
  const head = typeLabel ? `차단: ${item.toolName} (${typeLabel})` : `차단: ${item.toolName}`
  return item.decisionReason ? `${head} — ${item.decisionReason}` : head
}

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
  // GAP1 P09: 현재 runId — 백그라운드 태스크 정지 IPC(agentTaskStop) 대상.
  // ToolGroup → ToolCallCard → BackgroundTaskView로 prop 관통(단방향: store → prop → view).
  const currentRunId = useAppStore((s) => s.currentRunId)
  const errorMessage = useAppStore(selectErrorMessage)
  // 24a: 사고 과정 텍스트 (null=비표시)
  const thinkingText = useAppStore(selectThinkingText)
  // TG1 P04: 상태 라인 경과 초 원천 — named selector 없이 인라인 구독(P04 브리프 지시,
  // store 로직 무변경 준수). AppState.thinkingStartedAt 그대로 StatusLine에 prop 전달.
  const thinkingStartedAt = useAppStore((s) => s.thinkingStartedAt)
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

  // GAP1 P05(훅 콕핏): 훅 타임라인(HookTimeline, 컴포저 위 배너 슬롯 — LoopStatusBanner와
  // 같은 자리 관례) — 9종 훅의 시작/완료/실패를 접힘 요약 + 펼침 상세로 표시.
  const hookRuns = useAppStore(selectHookRuns)

  // TG1 P03: 턴 블록 헤더 아바타의 엔진 분기 판별 수단. 현재 store는 backendLabel을
  // 'Claude Code' 고정 문자열로만 관리(Codex 동적 전환 미구현, slices/conversation.ts:61)
  // — 그래도 이 셀렉터가 "지금 어떤 엔진이 응답하는가"의 유일한 참조점이라 그대로 소비한다.
  // Claude가 아니면(향후 Codex 등) 공식 로고 대신 기존 IconClaude로 폴백(상표 게이트 — 대화
  // 아바타는 실제로 답하는 엔진을 가리켜야 한다).
  const backendLabel = useAppStore(selectBackendLabel)

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

  // GAP1 P16(c): 훅 차단 턴 → assistant 배지 파생(순수 함수, store/hookBadge.ts) — thread가
  // 바뀔 때만 재계산(스트리밍 중 매 토큰 append로 인한 과다 재계산 방지, useMemo).
  const hookBadges = useMemo(() => deriveHookTurnBadges(thread), [thread])

  // TG1 P03: 턴 그룹핑(순수 함수, lib/turnBlocks.ts) — thread가 바뀔 때만 재계산(hookBadges와
  // 동일 근거: 스트리밍 중 매 토큰 append마다 재그룹핑하지 않는다). 렌더는 이 결과만 소비 —
  // 그룹핑 로직 자체를 컴포넌트가 갖지 않는다(단방향 흐름).
  const turnBlocks = useMemo(() => groupIntoTurnBlocks(thread), [thread])

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

  // ── TG1 P03/P09: 턴 블록 헤더 아바타(provider→브랜드 매핑 모듈 소비) ─────────────
  // Claude 엔진 한정 — Codex/기타 백엔드는 기존 IconClaude 폴백(상표 게이트: 대화 아바타는
  // 실제로 답하는 엔진을 가리켜야 한다). 폴백 경로는 지금 라이브로 타지 않는다(backendLabel이
  // 'Claude Code' 고정 — 위 selectBackendLabel 주석 참조) — 코드로만 존재. TG1 P09: 로고
  // 선택 자체는 getProviderBrand()(lib/providerBrand.ts SSOT)가 하고, 여기는 wrapper
  // className(.ava-spark 수식어 유무)만 분기한다(PanelView.tsx :268-281과 동일 판정 —
  // P06 reviewer 🟡 "엔진-아바타 이중 소스" 지적을 값 출처가 아니라 로고 매핑 층에서 해소).
  const isClaudeEngine = backendLabel === 'Claude Code'
  const turnAvatarBrand = getProviderBrand(isClaudeEngine ? 'claude-code' : 'unknown', getTheme())
  const turnAvatar = turnAvatarBrand.kind === 'logo' ? (
    <span className="ava ai turn-block-ava ava-spark" aria-hidden="true">
      <img src={turnAvatarBrand.src} alt={turnAvatarBrand.alt} width={16} height={16} />
    </span>
  ) : (
    <span className="ava ai turn-block-ava" aria-hidden="true">
      <IconClaude size={16} />
    </span>
  )

  // ── TG1 P03: WorkingIndicator 턴 블록 이전(구 :1036-1047 조건 그대로 이식) ────────
  // 질문/권한 대기 중엔 억제. thread 마지막이 이미 live assistant 버블이면 억제(카드/버블
  // 하나로 시선 집중, BF3 ADR-030 근거 유지).
  const showWorking = isRunning && !pendingQuestion && !pendingPermission && (() => {
    const lastItem = thread[thread.length - 1]
    const lastIsLiveAssistant = lastItem &&
      lastItem.kind === 'msg' &&
      lastItem.role === 'assistant' &&
      !lastItem.error
    return !lastIsLiveAssistant
  })()
  // GAP1 P04(S-05): sdkSessionState==='requires_action'이면 그 문구 최우선(옵트인 미설정
  // 세션은 항상 null이라 기존 thinkingText 우선순위 그대로 — 보강 전용, 회귀 0).
  const workingIndicatorText = sdkSessionState === 'requires_action' ? '작업 확인이 필요해요' : thinkingText
  // thread가 agent 블록으로 끝나면 그 블록의 turn-body에 StatusLine을 이어 붙이고,
  // 아니면(standalone/user로 끝나거나 thread가 비어있음) 새 agent 블록(아바타+거터)을 연다.
  const lastBlockIsAgent = turnBlocks.length > 0 && turnBlocks[turnBlocks.length - 1].kind === 'agent'
  // TG1 P04(④ 토큰 실시간): 열린(마지막) thinking thread 아이템의 estimatedTokens —
  // 런닝 토탈(누적 아님, replace) 그대로 파생. 새 집계 파이프라인 0 — O(1) 꼬리 조회라
  // useMemo 불필요(hookBadges/turnBlocks처럼 비용이 있는 파생만 메모이즈).
  const lastThreadItem = thread[thread.length - 1]
  const openThinkingEstimatedTokens =
    lastThreadItem?.kind === 'thinking' ? lastThreadItem.estimatedTokens : undefined

  // ── TG1 P03: standalone 블록 렌더 — 기존 렌더(NoticeItem/CmdResultCard/OrchestrationCard)
  // 그대로, 신규 시각 컴포넌트 0(census 밖 셀렉터 변경 0). ─────────────────────────────
  function renderStandaloneItem(item: ThreadItem): JSX.Element | null {
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

    if (item.kind === 'informational') {
      // GAP1 P05(S-03): 훅 피드백/슬래시커맨드 상태줄 등 비-에러 정보성 배너 —
      // NoticeItem 재사용(신규 시각 컴포넌트 0). level별 강조 톤은 informationalTone.
      return (
        <NoticeItem
          key={item.id}
          text={informationalDisplayText(item)}
          time={item.time}
          tone={informationalTone(item.level)}
        />
      )
    }

    if (item.kind === 'permission-denied') {
      // GAP1 P05(S-04): 대화형 프롬프트 없이 자동 거부된 도구 호출 — NoticeItem
      // 재사용(신규 시각 컴포넌트 0). tone='error'(빨강, 차단은 가장 두드러지게).
      return (
        <NoticeItem
          key={item.id}
          text={permissionDeniedDisplayText(item)}
          time={item.time}
          tone="error"
        />
      )
    }

    return null
  }

  // ── TG1 P03: agent 블록 내부 아이템 렌더 — bare(아바타 없이). idx는 flat thread 위치
  // (원본 thread.map의 idx와 동치 — ToolGroup lead 판정·마지막 항목 판정을 그대로 보존). ──
  function renderAgentItem(item: ThreadItem, idx: number): JSX.Element | null {
    // 직전 항목이 AI 블록(assistant msg 또는 toolgroup)인지 — ToolGroup lead 판정에 쓰던 값.
    // TG1 아바타 감사 봉합: renderAgentItem은 항상 turn-body(턴 블록 헤더가 이미 아바타를
    // 그린 컨테이너) 안에서만 호출되므로, ToolGroup 자신의 lead 아바타/이름 헤더는 이제
    // bare=true로 항상 억제한다(아래 ToolGroup 호출부). prevIsAiBlock 계산 자체는 보존
    // (다른 소비처 없음 확인됨 — grep: ToolGroup 컴포넌트 유일 소비처가 이 함수).
    const prev = thread[idx - 1]
    const prevIsAiBlock = prev !== undefined && (
      prev.kind === 'toolgroup' ||
      (prev.kind === 'msg' && prev.role === 'assistant')
    )

    if (item.kind === 'msg' && item.role === 'assistant') {
      // 마지막 assistant msg + 실행 중이면 streaming prop=true (live 버블)
      const isLastItem = idx === thread.length - 1
      const isLiveAssistant = isLastItem && isRunning && !item.error
      // GAP1 P16(c): 훅 차단 턴 빨간 배지 — deriveHookTurnBadges 파생 Set 판정.
      const hasHookBadge = hookBadges.has(item.id)
      // assistant — W7: time 전달(있으면 .meta .time 렌더). TG1 P03: 개별 아바타(.ava.ai)는
      // 턴 블록 헤더로 수렴해 제거 — msg-continuation 클래스/isThinkingContinuous 판정도
      // 함께 제거(P16 인접 연출은 TG1 P03(단일챗, 여기)·P06(멀티패널, PanelView.tsx:257-261)
      // 턴 블록 구조로 대체됨 — store/continuity.ts 자체는 무접촉이나 프로덕션 소비처는
      // 이제 없음. 순수 함수 단위테스트 gap1-p16-s2-thinking-continuity.test.ts가 독립적으로
      // 계속 잠근다).
      return (
        <div
          key={item.id}
          className={`msg ai-msg${item.origin === 'cron' ? ' cron-turn' : ''}`}
        >
          <div className="msg-main">
            <div className="meta">
              <span className="name">Claude</span>
              {item.time && <span className="time">{item.time}</span>}
              {/* Phase 5b/연출: cron-turn 배지 + 프레임 — origin=cron인 turn만 강조(브랜드 액센트). */}
              {item.origin === 'cron' && (
                <span className="cron-badge" aria-label="자율 발동 turn"><span className="cron-badge-ico" aria-hidden="true">🔁</span>자율 발동</span>
              )}
              {/* GAP1 P15-R1 S3: 인터럽트/abort로 잘린 msg 마커 — 조용한 muted 배지
                  (실패 아님·사용자 의도적 중단이라 danger 아닌 중립 토큰, 필드 없으면 미렌더). */}
              {item.interrupted && (
                <span className="msg-interrupted" data-interrupted aria-label="응답이 중단됨">중단됨</span>
              )}
              {/* GAP1 P16(c): 훅 차단 빨간 배지 — .msg-interrupted 옆(자연 삽입점). */}
              {hasHookBadge && <HookBadge />}
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
          // TG1 아바타 감사 봉합: turn-body 안(턴 블록 헤더가 아바타를 이미 그림)이라 항상
          // bare — ToolGroup 자신의 lead 아바타+"Claude" 이름 헤더는 그리지 않는다.
          bare
          fileDiffs={fileDiffs}
          runId={currentRunId ?? undefined}
        />
      )
    }

    if (item.kind === 'thinking') {
      // TG1 P03: bare — 개별 아바타 생략(턴 블록 헤더가 담당). continuous prop은 더 이상
      // 전달하지 않는다(단일챗 인접 연출은 턴 블록 구조로 대체 — msg-continues 클래스 소멸).
      return (
        <ThinkingItem
          key={item.id}
          text={item.text}
          estimatedTokens={item.estimatedTokens}
          bare
        />
      )
    }

    if (item.kind === 'subagent') {
      // F-G: 채팅 인라인 서브에이전트 — 데이터는 state.subagents에서 id로 라이브 조회.
      // SubAgentInline은 자체 아이콘 체계(sa-inline-ic)를 쓰고 .ava.ai를 쓰지 않으므로
      // 이 Phase의 아바타 배선 대상이 아니다(census 1.5 — 무접촉 그대로).
      return (
        <SubAgentInline
          key={item.id}
          agent={subagents.find((sa) => sa.id === item.id)}
          onOpen={setOpenedSubId}
        />
      )
    }

    return null
  }

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

            {/* TG1 P03: 턴 블록 렌더 루프 — 한 턴 = 한 블록 = 아바타 1개(구 Phase A-2 단일
                thread.map 루프를 groupIntoTurnBlocks 결과 기준으로 재구조). user/standalone은
                기존 렌더 그대로 직계 자식으로, agent는 아바타 헤더 1개 + 좌측 거터(.turn-body)
                안에 bare 렌더(사고→도구→답변이 한 화자로 이어짐 — P16 인접 연출 CSS가 대체됨). */}
            {(() => {
              // flatIdx: 원본 thread.map의 idx와 동치(순서 보존 그룹핑이라 누적 카운터로 복원
              // 가능) — ToolGroup lead 판정·마지막 assistant 판정에 그대로 재사용한다.
              let flatIdx = -1
              return turnBlocks.map((block, blockIdx) => {
                if (block.kind === 'user') {
                  flatIdx += 1
                  const item = block.items[0] as Extract<ThreadItem, { kind: 'msg' }>
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

                if (block.kind === 'standalone') {
                  flatIdx += 1
                  return renderStandaloneItem(block.items[0])
                }

                // agent
                const isLastBlock = blockIdx === turnBlocks.length - 1
                return (
                  <div key={`turn-${block.items[0].id}`} className="turn-block">
                    {turnAvatar}
                    <div className="turn-body">
                      {block.items.map((item) => {
                        flatIdx += 1
                        return renderAgentItem(item, flatIdx)
                      })}
                      {/* TG1 P04: 한 줄 상태 라인(구 WorkingIndicator 대체) — thread가 agent
                          블록으로 끝나면 그 블록의 turn-body에 이어 붙인다(하단 별개 소멸 →
                          상단 답변 별개 등장의 단절 해소, P16 학습 계승). 새 아바타를 열지
                          않는다 — 이미 이 블록 헤더가 있다. 답변 첫 토큰 도착 시
                          thinkingStartedAt=null 리셋 → lastIsLiveAssistant=true → showWorking
                          false로 이 자리에서 자연 소멸하고 같은 turn-body 안에서 답변으로
                          전이(별개 블록 교대 아님). */}
                      {isLastBlock && showWorking && (
                        <StatusLine
                          text={workingIndicatorText}
                          thinkingStartedAt={thinkingStartedAt}
                          estimatedTokens={openThinkingEstimatedTokens}
                        />
                      )}
                    </div>
                  </div>
                )
              })
            })()}

            {/* TG1 P04: thread가 agent 블록이 아닌 것으로 끝나거나(standalone/user) thread가
                비어있으면(Welcome 이후 첫 전송) 상태 라인을 위해 새 agent 블록(아바타 +
                거터)을 연다 — 구 P14a 조건(:1287-1298 스냅샷) 그대로, 마운트 위치만 이전. */}
            {showWorking && !lastBlockIsAgent && (
              <div className="turn-block">
                {turnAvatar}
                <div className="turn-body">
                  <StatusLine
                    text={workingIndicatorText}
                    thinkingStartedAt={thinkingStartedAt}
                    estimatedTokens={openThinkingEstimatedTokens}
                  />
                </div>
              </div>
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

      {/* GAP1 P05(훅 콕핏): 훅 타임라인 — LoopStatusBanner와 같은 "컴포저 위 배너 슬롯".
          hookRuns 비어있으면 자체 null 렌더(소음 억제 — 이벤트 없으면 표시 자체가 없다).
          접힘 기본(요약만 상시 표시) + 토글 펼침(9종 훅 시작/완료/실패 상세). */}
      <HookTimeline hookRuns={hookRuns} />

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
