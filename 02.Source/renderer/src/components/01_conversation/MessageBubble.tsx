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
 *
 * TG1 P06(표면 전파): assistant 아바타를 Conversation.tsx turnAvatar(:806-814)와 동일한
 * 공식 로고(Claude Spark)로 교체한다 — 이 파일이 멀티패널(PanelView)·서브에이전트
 * (SubAgentChatStream/SubAgentFullscreen) 두 표면의 화자 아바타 단일 소유지라, 여기 한 곳을
 * 바꾸면 두 표면 모두 자동 전파된다(census 01-scout-report.md §1.5 — "공유 리프에 넣으면
 * 표면이 공짜로 는다"). 엔진 분기 신호는 isClaudeEngineAvatar() 참조.
 */
import { memo } from 'react'
import { MarkdownView } from './MarkdownView'
import { SmoothMarkdown } from './SmoothMarkdown'
import { IconClaude } from '../common/icons'
import { HookBadge } from './HookBadge'
import claudeSpark from '../../assets/brand/claude-spark-clay.svg'

/**
 * isClaudeEngineAvatar — MessageBubble은 store 비접근 순수 리프 원칙을 유지한다(프롭으로만
 * 신호를 받는 기존 컴포넌트 관례 — bare/continuous/hookBadge와 동일 패턴). Conversation.tsx의
 * isClaudeEngine 판정(backendLabel==='Claude Code', 현재 store가 항상 고정 반환 — Codex 동적
 * 전환 미구현)과 동일한 사실 관계를 이 파일 로컬에도 못박는다 — 호출부(PanelView·
 * SubAgentChatStream) 3곳이 매번 같은 신호를 계산해 prop으로 넘기는 중복을 피하기 위한
 * 설계 선택이다(브리프 두 갈래 중 "② 기본값 Claude Spark + IconClaude 폴백 분기 보존" 채택
 * — 이유는 MessageBubble.tsx 파일 상단 주석·PR 보고 참조). 상수를 조건식에 직접 쓰면
 * ESLint no-constant-condition 오탐 소지가 있어 함수로 감싼다. Codex 등 실제 동적 백엔드가
 * 붙으면 이 함수 내부만 교체하면 된다(호출부 변경 0, IconClaude 폴백 분기는 이미 코드로
 * 보존돼 있다).
 */
function isClaudeEngineAvatar(): boolean {
  return true
}

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
  /**
   * GAP1 P16(c): 이 턴에 훅 차단/경고가 있었음을 알리는 빨간 배지 — assistant 역할에만
   * 적용(role==='user'면 무시). deriveHookTurnBadges(store/hookBadge.ts) 파생 Set을
   * 호출부가 badges.has(msg.id)로 판정해 전달. 미지정/false = 배지 없음(하위호환).
   */
  hookBadge?: boolean
  /**
   * GAP1 P16(b): 직전 thinking 아이템과 시각적으로 연속됨(gap 축소 연출) — assistant
   * 역할에만 적용. isThinkingContinuous(store/continuity.ts) 판정을 호출부가 전달.
   * 미지정/false = 기존 간격 그대로(하위호환).
   * TG1 P03·P06 이후: 이 판정을 넘기던 두 호출부(Conversation.tsx·PanelView.tsx)가 모두
   * 턴 블록 구조로 전환되며 라이브 caller가 사라졌다 — prop·.msg-continuation CSS는
   * 의도적 보존(백로그), 삭제는 별건 위임 대상.
   */
  continuation?: boolean
  /**
   * TG1 P06(멀티패널 아바타 이중노출 해소): true면 assistant 아바타 span(.ava.ai)을
   * 생략한다 — ThinkingItem의 bare prop 선례(TG1 P03)와 동일 패턴. 턴 블록 헤더(turnAvatar)가
   * 이미 아바타 1개를 그리는 컨테이너(PanelView 턴 블록 turn-body) 안에서 개별 버블
   * 아바타가 중복되는 것을 막는다. role==='user'면 무시(user는 항상 자기 블록 — 턴 블록
   * 헤더와 겹칠 일이 없다). 기본 false = 기존 외관 그대로(하위호환 — SubAgentChatStream/
   * SubAgentFullscreen의 assistant 버블은 이 prop을 넘기지 않아 자기 아바타 유지).
   */
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
  return (
    <div className={`msg ai-msg${origin === 'cron' ? ' cron-turn' : ''}${continuation ? ' msg-continuation' : ''}`}>
      {/* GAP1 P16(b): 아바타 전역 통일 — 원본 AgentCodeGUI Chat.tsx는 thinking(:442)·
          assistant(:461)·working(:592) 전부 같은 아바타를 쓴다(무구분 확정). 사고→답변
          전환이 "같은 화자"로 읽히게 한다. TG1 P06: 공식 로고(Claude Spark)로 교체 —
          isClaudeEngineAvatar() 폴백 시 기존 IconClaude 그대로(상표 게이트). bare=true면
          아바타 자체를 생략(턴 블록 헤더가 이미 그림 — 이중노출 방지). */}
      {!bare && (
        isClaudeEngineAvatar() ? (
          <span className="ava ai ava-spark" aria-hidden="true">
            <img src={claudeSpark} alt="" width={16} height={16} />
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
          {/* Phase 5b/연출: cron-turn 배지 (MessageBubble도 origin prop으로 표시 — 멀티 패널 공유) */}
          {origin === 'cron' && (
            <span className="cron-badge" aria-label="자율 발동 turn"><span className="cron-badge-ico" aria-hidden="true">🔁</span>자율 발동</span>
          )}
          {/* GAP1 P16(c): 훅 차단 빨간 배지 — 멀티 패널/서브 응답도 이 공유 리프를 통해
              자동 전파(호출부가 hookBadge=true를 넘길 때만 렌더). */}
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
