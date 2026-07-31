import { memo } from 'react'
import { IconAlert } from '../common/icons'

export interface HookBadgeProps {
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
