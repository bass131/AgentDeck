// agent 기능 캡슐 — 공개 표면 배럴.
// 캡슐 밖 앱 소비처(Conversation.tsx, PanelView.tsx, SettingsModal.tsx,
// Shell.tsx)는 이 파일을 통해서만 import한다. 캡슐 내부 파일을 직접
// 가리키는 import는 캡슐 경계를 우회하므로 지양한다.
// 예외 1건 — 배럴로 덮을 수 없는 소비 형태:
//   테스트는 모듈 파일을 직접 import한다 — 동적 import로 vi.mock 타이밍을
//   제어하는 파일이 다수라 배럴 경유로 바꾸면 mock 격리가 깨지고, e2e는
//   SubAgentSplitView·SubAgentChatStream의 default export를 모듈 파일에서
//   직접 소비한다.
// 공개 표면은 앱 소비처가 실제 소비하는 6종(전부 값, Props 타입 실소비 0)으로
// 최소화한다. 각 파일의 default export는 e2e·테스트가 모듈 파일에서 직접
// 소비하므로 파일에 보존하되, 배럴 소비처는 전부 named로 전환해 재수출하지
// 않는다 — Shell.tsx의 SubAgentSplitView default import도 배럴 named로 전환했다.
// 미등재 근거: AgentPanel 본체·SubAgentCell·SubAgentChatStream·SubAgentModal·
// SubAgentModelBadge는 캡슐 밖 앱 소비가 없다(테스트·캡슐 내부 전용).
// TodosSection은 AgentPanel.tsx가 선언하는 부속 export로 PanelView가 소비한다.
export { OrchestrationCard } from './OrchestrationCard'
export { SubAgentInline } from './SubAgentInline'
export { SubAgentFullscreen } from './SubAgentFullscreen'
export { TodosSection } from './AgentPanel'
export { ProviderStatusPanel } from './ProviderStatusPanel'
export { SubAgentSplitView } from './SubAgentSplitView'
