// notice 기능 캡슐 — 공개 표면 배럴.
// 캡슐 밖 소비처(Shell.tsx, PanelView.tsx, Conversation.tsx, AppGate.tsx, 테스트)는 이 파일을 통해서만 import한다.
// 캡슐 내부 파일을 직접 가리키는 import는 캡슐 경계를 우회하므로 지양한다.
export { AppUpdateGate } from './AppUpdateGate'
export type { AppUpdateGateProps, AppUpdatePhase } from './AppUpdateGate'

export { EngineGate } from './EngineGate'
export type { EngineGateProps } from './EngineGate'

export { EngineUpdateNotice } from './EngineUpdateNotice'
export type { EngineUpdateNoticeProps } from './EngineUpdateNotice'

export { HookTimeline } from './HookTimeline'
export type { HookTimelineProps, HookRunView } from './HookTimeline'

export { LoopStatusBanner } from './LoopStatusBanner'
export type { LoopStatusBannerProps } from './LoopStatusBanner'

export { PermissionCard } from './PermissionCard'
export type { PermissionCardProps, PermissionChoice } from './PermissionCard'

export { UpdateNotes } from './UpdateNotes'
export type { UpdateNotesProps } from './UpdateNotes'
