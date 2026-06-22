# Phase 03: tool-cards

## 목표
도구 호출 표시가 원본 구조로: `.t-row`(아이콘 + verb → target → result, 종류별 색) + Bash 접이식 출력. 기존 ToolCallCard 개편.

## 담당 도메인 / 에이전트
renderer (src/renderer). 등급: 보통~복잡.

## 의존 Phase
01 (chat-messages — 메시지 타임라인에 인터리브).

## 위험 깃발
없음 (renderer. 기존 store toolCards 사용, 새 IPC 0).

## 변경 대상 (이 경계 밖 금지)
- `src/renderer/src/components/ToolCallCard.tsx` — 접이식 카드 → `.t-row` 행 구조(verb/target/result). 종류 매핑(read/write/edit/bash/web/search → 색·verb·아이콘).
- `src/renderer/src/components/ToolCallCard.css` (또는 Conversation.css 통합) — `.t-row`·`.t-ic`·`.t-verb`·`.t-sep`·`.t-target`·`.t-res`·bash `.bo-*`.
- (선택) `src/renderer/src/lib/toolKind.ts` (신규, 순수) — 도구명→{kind,verb,color} 매핑.

## 작업 단계
1. 도구명 매핑: Read/Write/Edit/Bash/WebFetch/Grep 등 → kind(read/write/edit/bash/web/search) + verb + 색 토큰(read=blue, write=green, edit=accent-2, bash=violet, web=cyan, search=yellow, mcp=rose).
2. `.t-row`: `.t-ic`(kind 색) + `.t-verb` + `.t-sep`("·") + `.t-target`(mono, 파일/대상) + `.t-res`(우측, 결과/+N−M/오류/spin).
3. Bash: `.bo-ghost`(접힘 — 마지막줄+"N줄") ↔ `.bo-block`(펼침 — 로그 max-h 240 + 복사/접기). 에러 자동 전개.
4. 상태(running/done/error)는 기존 card 상태 사용(있는 만큼). 인라인 색상 0(kind 색=토큰).

## 완료조건 (AC — 측정 가능)
- [ ] `npm run typecheck` green.
- [ ] toolKind.test(순수 매핑) + ToolCallCard 컴포넌트 테스트(`.t-row` verb/target/result, bash 접이식 토글). PASS.
- [ ] `npm run test:e2e` 회귀 0(도구카드 e2e — 렌더 보존, 셀렉터 변경 시 동반 갱신).
- [ ] 시각검증: `.t-row` 도구 행(종류 색·verb·target·result) + bash 접이식 렌더(스크린샷 육안).

## 참조
docs/UI_FIDELITY.md §6(.t-row/.bo-*) · 원본 Chat.tsx(ToolGroup/ToolRow/BashOutput) · phases/05_fidelity-f3/01-chat-messages.md.
