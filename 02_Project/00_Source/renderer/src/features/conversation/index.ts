// conversation 기능 캡슐 — 공개 표면 배럴.
// 캡슐 밖 앱 소비처(Shell.tsx, PanelView.tsx, SubAgentChatStream.tsx,
// CodeViewerPane.tsx, PermissionCard.tsx, FileModal.tsx)는 이 파일을 통해서만 import한다.
// 캡슐 내부 파일을 직접 가리키는 import는 캡슐 경계를 우회하므로 지양한다.
// 예외 2건 — 배럴로 덮을 수 없는 소비 형태:
//   ① CSS side-effect import(Composer.css → PanelComposer, ToolGroup.css →
//      SubAgentChatStream)는 모듈 경로를 직접 가리킨다.
//   ② 테스트는 모듈 파일을 직접 import한다 — 동적 import로 vi.mock 타이밍을
//      제어하는 파일이 다수라 배럴 경유로 바꾸면 mock 격리가 깨진다.
//      공개 표면은 앱 소비처가 실제 소비하는 13종으로 최소화한다.
// Conversation.tsx의 default export(memo 래핑)는 e2e가 모듈 파일에서 직접
// 소비하므로 파일에 보존하되, 배럴 소비처는 전부 named라 재수출하지 않는다.
export { Conversation } from './Conversation'
export type { InjectedInput, ConversationProps } from './Conversation'

export { NoticeItem, ThinkingItem } from './Conversation'
export type { NoticeItemProps, ThinkingItemProps, NoticeTone } from './Conversation'
export {
  informationalTone,
  informationalDisplayText,
  permissionDeniedDisplayText,
} from './Conversation'

export { MessageBubble } from './MessageBubble'
export type { MessageBubbleProps } from './MessageBubble'

export { StatusLine } from './StatusLine'
export type { StatusLineProps } from './StatusLine'

export { ScrollToBottomButton } from './ScrollToBottomButton'
export type { ScrollToBottomButtonProps } from './ScrollToBottomButton'

export { CmdResultCard } from './CmdResultCard'
export type { CmdResultCardProps } from './CmdResultCard'

export { ToolCallCard } from './ToolCallCard'

export { MarkdownView } from './MarkdownView'
export type { MarkdownViewProps } from './MarkdownView'
