// shell 기능 캡슐 — 공개 표면 배럴.
// 캡슐 밖 앱 소비처(AppGate.tsx, SubAgentSplitView.tsx)와 같은 폴더의 Shell.tsx는
// 이 파일을 통해서만 import한다. 캡슐 내부 파일을 직접 가리키는 import는
// 캡슐 경계를 우회하므로 지양한다.
// 예외 — 배럴로 덮을 수 없는 소비 형태: 테스트는 모듈 파일을 직접 import한다 — 동적 import로
// vi.mock 타이밍을 제어하는 파일이 다수라 배럴 경유로 바꾸면 mock 격리가 깨진다.
// 공개 표면은 앱 소비처가 실제 소비하는 8종(값 7 + 타입 1)으로 최소화한다.
// 각 파일의 default export는 테스트가 모듈 파일에서 직접 소비하므로 파일에
// 보존하되, 배럴 소비처는 전부 named로 전환해 재수출하지 않는다.
// M10 G1에서 멀티 에이전트 화면을 지웠다 — 패널 카드 스타일(.ma-*)은 03_Agent/panelCard.css가 갖는다.
export { Sidebar } from './Sidebar'
export { SettingsModal } from '@renderer/11_Settings/SettingsModal'
export { Profile } from '@renderer/11_Settings/Profile'
export type { UserProfile } from '@renderer/11_Settings/Profile'
export { TitleBar } from './TitleBar'
export { ResizeHandles } from './ResizeHandles'
export { PaneSplitter } from './PaneSplitter'
export { ZoomControl } from './ZoomControl'
