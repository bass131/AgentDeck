// shell 기능 캡슐 — 공개 표면 배럴.
// 캡슐 밖 앱 소비처(Shell.tsx, AppGate.tsx, SubAgentSplitView.tsx)는
// 이 파일을 통해서만 import한다. 캡슐 내부 파일을 직접 가리키는 import는
// 캡슐 경계를 우회하므로 지양한다.
// 예외 2건 — 배럴로 덮을 수 없는 소비 형태:
//   ① CSS side-effect import(MultiWorkspace.css → SubAgentCell·
//      SubAgentChatStream·SubAgentFullscreen)는 모듈 경로를 직접 가리킨다.
//   ② 테스트는 모듈 파일을 직접 import한다 — 동적 import로 vi.mock 타이밍을
//      제어하는 파일이 다수라 배럴 경유로 바꾸면 mock 격리가 깨진다.
// 공개 표면은 앱 소비처가 실제 소비하는 9종(값 8 + 타입 1)으로 최소화한다.
// 각 파일의 default export는 테스트가 모듈 파일에서 직접 소비하므로 파일에
// 보존하되, 배럴 소비처는 전부 named로 전환해 재수출하지 않는다.
// panel/ 하위 3종(PanelView·PanelComposer·PanelPicker)은 캡슐 내부 소비만
// 있어 등재하지 않는다 — PanelView는 MultiWorkspace.tsx의 재수출을 테스트가
// 경유 소비하므로 그 재수출을 유지한다.
export { MultiWorkspace } from './MultiWorkspace'
export { Sidebar } from './Sidebar'
export { SettingsModal } from './SettingsModal'
export { Profile } from './Profile'
export type { UserProfile } from './Profile'
export { TitleBar } from './TitleBar'
export { ResizeHandles } from './ResizeHandles'
export { PaneSplitter } from './PaneSplitter'
export { ZoomControl } from './ZoomControl'
