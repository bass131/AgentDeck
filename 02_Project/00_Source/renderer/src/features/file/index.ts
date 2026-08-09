// file 기능 캡슐 — 공개 표면 배럴.
// 캡슐 밖 소비처(Shell.tsx, PanelComposer 등, 테스트)는 이 파일을 통해서만 import한다.
// 캡슐 내부 파일을 직접 가리키는 import는 캡슐 경계를 우회하므로 지양한다.
export { FileBadge } from './FileBadge'

// FileExplorer·FileModal은 원본이 named(비메모)와 default(memo 래핑) export를 分리해 두고
// 기존 앱 소비처(Shell.tsx)가 memo 버전을 써 왔다 — 배럴에서도 memo 버전을 유지해
// 재편이 렌더 최적화를 조용히 없애지 않도록 한다.
export { default as FileExplorer } from './FileExplorer'
export type { FileExplorerProps } from './FileExplorer'

export { default as FileModal } from './FileModal'
export type { FileModalProps } from './FileModal'

export { FolderSwitchDialog } from './FolderSwitchDialog'

export { RecentFiles } from './RecentFiles'
