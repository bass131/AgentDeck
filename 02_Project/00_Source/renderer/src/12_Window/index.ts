// 캡슐 밖 앱 소비처와 같은 폴더의 Shell.tsx는 이 파일로만 import한다. 시험은 vi.mock 타이밍을 제어하려고
// 모듈 파일을 직접 import한다 — 배럴을 거치면 mock 격리가 깨진다. 각 파일의 default export는 재수출하지 않는다.
export { Sidebar } from './Sidebar'
export { SettingsModal } from '@renderer/11_Settings/SettingsModal'
export { Profile } from '@renderer/11_Settings/Profile'
export type { UserProfile } from '@renderer/11_Settings/Profile'
export { TitleBar } from './TitleBar'
export { ResizeHandles } from './ResizeHandles'
export { PaneSplitter } from './PaneSplitter'
export { ZoomControl } from './ZoomControl'
