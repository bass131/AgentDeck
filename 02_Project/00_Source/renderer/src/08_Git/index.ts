// 캡슐 밖 소비처는 이 파일로만 import한다. GitModal의 default는 named 함수의 별칭이라 named만 다시 내보낸다.
export { GitModal } from './GitModal'
export type { GitModalProps } from './GitModal'
// PR 카드 — Git 창과 대화(05_Conversation)가 함께 쓴다
export { PrCard } from './PrCard'
export type { PrCardProps } from './PrCard'
export { prUrlFromToolCall } from './prCardModel'
