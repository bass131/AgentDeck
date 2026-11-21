// 캡슐 밖 소비처는 이 파일로만 import한다.
export { FileBadge } from './FileBadge'

// FileExplorer·FileModal은 앱 소비처가 써 온 memo 래핑 default를 내보낸다 — 렌더 최적화를 잃지 않게.
export { default as FileExplorer } from './FileExplorer'
export type { ExplorerSource, FileExplorerProps } from './FileExplorer'

export { default as FileModal } from './FileModal'
export type { FileModalProps } from './FileModal'

export { RecentFiles } from './RecentFiles'
