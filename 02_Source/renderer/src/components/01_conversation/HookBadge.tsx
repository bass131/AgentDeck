/**
 * HookBadge.tsx — 훅 차단/경고 빨간 배지 공용 조각 (GAP1 P16 계열① 렌더 소비).
 *
 * 영호 육안 피드백(2026-07-15 ②): 컴포저 위 HookTimeline(전역 요약)은 유지하되, 훅이
 * 도구를 차단했거나 진행을 막은 턴의 assistant 메시지에도 빨간 배지를 병행 표시한다.
 * 판정은 store/hookBadge.ts deriveHookTurnBadges(순수 파생) — 이 컴포넌트는 표시만.
 *
 * 삽입점: 단일챗 인라인 assistant .meta(Conversation.tsx, .msg-interrupted 옆) +
 * MessageBubble.tsx assistant .meta(멀티 패널·서브 응답 자동 전파 — 단 SubAgentChatStream은
 * 계약 데이터 부재로 미배선, 해당 파일 주석 참조).
 *
 * 독립 파일로 분리한 이유는 MessageBubble.tsx와 동일 — MessageBubble이 Conversation.tsx를
 * import하면 순환참조가 생기므로, 두 소비처가 공통으로 import할 수 있는 위치에 둔다.
 * 스타일(.hook-badge)은 Conversation.css 소유(.msg-interrupted/.cron-badge와 동일 관례) —
 * 이 파일은 CSS를 import하지 않는다.
 *
 * 빨강 톤 = 기존 NoticeItem tone='error'가 쓰는 --red/--red-soft 토큰 재사용(UI.md
 * 안티슬롭 — 새 HEX 발명 금지).
 *
 * CRITICAL: 부수효과(window.api 호출) 0 — 순수 표시 컴포넌트.
 */
import { memo } from 'react'
import { IconAlert } from '../common/icons'

export interface HookBadgeProps {
  /**
   * 배지 호버/클릭 시 보여줄 사유(선택 — 가산 요구사항). 미지정 시 일반 설명 문구로
   * 대체한다(deriveHookTurnBadges는 Set<string>만 반환해 사유 원문을 안 실어 나르므로,
   * 사유를 아는 소비처만 넘기면 된다 — 없어도 배지 자체는 항상 의미가 통한다).
   */
  reason?: string
}

export const HookBadge = memo(function HookBadge({ reason }: HookBadgeProps) {
  const title = reason ?? '이 턴에서 훅이 도구 호출을 막았거나 진행을 중단시켰어요'
  return (
    <span className="hook-badge" title={title} aria-label={`훅 개입: ${title}`}>
      <IconAlert size={11} />
      훅 차단
    </span>
  )
})

export default HookBadge
