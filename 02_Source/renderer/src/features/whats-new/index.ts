// WhatsNew 기능 캡슐 — 공개 표면 배럴.
// 캡슐 밖 소비처(Shell.tsx, 테스트)는 이 파일을 통해서만 import한다.
// 캡슐 내부 파일(WhatsNew.tsx / whatsNewTrigger.ts / whatsNewSampleData.ts)을
// 직접 가리키는 import는 캡슐 경계를 우회하므로 지양한다.
export { WhatsNew } from './WhatsNew'
export type { WhatsNewProps } from './WhatsNew'

export { WN_SLIDES } from './whatsNewSampleData'
export type { WnSlide } from './whatsNewSampleData'

export { SEEN_KEY, seriesOf, decideStartupModal } from './whatsNewTrigger'
