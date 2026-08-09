// viewer 기능 캡슐 — 공개 표면 배럴.
// 캡슐 밖 소비처(Shell.tsx, ToolCallCard.tsx, FileModal.tsx 등, 테스트)는 이 파일을 통해서만 import한다.
// 캡슐 내부 파일을 직접 가리키는 import는 캡슐 경계를 우회하므로 지양한다.
export { CodeViewer, semClass, decodeSemanticTokens } from './CodeViewer'
export type { CodeViewerProps } from './CodeViewer'

export { DiffViewer } from './DiffViewer'
export type { DiffViewerProps } from './DiffViewer'

// ImagePreview는 원본이 named(비메모)와 default(memo 래핑) export를 분리해 두었으나
// 기존 앱 소비처(CodeViewerPane.tsx, FileModal.tsx)가 전부 named(비메모) 버전을 써 왔다
// — 배럴도 named 버전을 그대로 재노출해 현재 소비 동작을 보존한다.
export { ImagePreview } from './ImagePreview'
export type { ImagePreviewProps } from './ImagePreview'

export { ImageViewer } from './ImageViewer'
export type { ImageViewerProps } from './ImageViewer'

export { SelectionAskBar, buildAskPayload } from './SelectionAskBar'
export type { SelectionAskBarProps, AskSelectionArgs } from './SelectionAskBar'
