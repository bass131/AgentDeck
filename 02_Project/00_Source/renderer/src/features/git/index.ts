// git 기능 캡슐 — 공개 표면 배럴.
// 캡슐 밖 소비처(Shell.tsx, 테스트)는 이 파일을 통해서만 import한다.
// 캡슐 내부 파일을 직접 가리키는 import는 캡슐 경계를 우회하므로 지양한다.
// GitModal의 default는 named 함수의 단순 별칭(동일 객체)이라 named 재노출에 선택 갈등이 없다
// — 기존 소비처의 default import(Shell.tsx)는 배럴 경유 named import로 정규화한다.
export { GitModal } from './GitModal'
export type { GitModalProps } from './GitModal'
