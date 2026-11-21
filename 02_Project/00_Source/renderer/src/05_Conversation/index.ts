// 캡슐 밖 앱 소비처는 이 파일로만 import한다. CSS side-effect import와, vi.mock 타이밍을 제어하는 시험은
// 모듈 파일을 직접 가리킨다. Conversation.tsx의 default export는 e2e만 쓰므로 재수출하지 않는다.
export { Conversation } from './Conversation'
export type { InjectedInput, ConversationProps } from './Conversation'

export { NoticeItem, ThinkingItem } from './ThreadView'
export type { NoticeItemProps, ThinkingItemProps, NoticeTone } from './ThreadView'
export {
  informationalTone,
  informationalDisplayText,
  permissionDeniedDisplayText,
} from './ThreadView'

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
