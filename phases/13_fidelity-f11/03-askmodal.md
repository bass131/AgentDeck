# Phase 03: askmodal

## 목표
**AskModal**(/ask 분리 대화) 시각 1:1 — orb 헤더·휘발성 pill·최소화 알약·컴포저. 컴포저 슬래시 /ask 트리거(하위호환).

## 담당 도메인 / 에이전트
renderer (src/renderer). 등급: 보통.

## 의존 Phase
F11-02.

## 위험 깃발
없음 (renderer. 새 IPC 0. ask 엔진=M4. 빈상태 기본 + 로컬).

## 변경 대상 (이 경계 밖 금지)
- `src/renderer/src/components/AskModal.tsx`+CSS(신규) — orb 헤더("빠른 질문" + "/ask" 배지 + 휘발성 pill + 최소화 ⌄ + 닫기 ✕) + 본문(**빈상태 기본** "무엇이든 편하게 물어보세요"; 샘플 스레드는 옵션 — MessageView 무거운 재사용 대신 간단 버블 또는 빈상태) + 컴포저(textarea + 전송[시각]) + 풋노트("창을 닫으면 …사라집니다"). 최소화→우하단 q-mini 알약(펼치기/닫기). Esc 최소화→Esc 닫기. 전송=로컬(시각, 실 엔진=M4).
- `src/renderer/src/components/Composer.tsx` — **optional `onSlashAsk?` prop** 추가. pickSlash에서 name==='ask' && onSlashAsk → onSlashAsk()(모달 open), **미주입 시 기존 onChange 그대로**(하위호환 — composer-trays.test 무파손). 다른 슬래시(init/clear 등) 동작 불변.
- `src/renderer/src/components/Conversation.tsx` — Composer에 `onSlashAsk` 전달(Shell open state 경유). 이 전달 외 로직 변경 금지.
- `src/renderer/src/layout/Shell.tsx` — askOpen state + AskModal 렌더 + Conversation에 onSlashAsk 콜백. 배치 최소.

## 작업 단계
1. AskModal(orb·휘발성·최소화 알약·컴포저, 빈상태 기본).
2. Composer onSlashAsk optional + pickSlash /ask 분기(하위호환). Conversation→Shell 배선.
3. CSS. 인라인 색 0.
4. 단위 테스트(+composer-trays.test: onSlashAsk 주입 시 /ask→콜백, 미주입 시 onChange 유지 확인).

## 완료조건 (AC — 측정 가능)
- [ ] `npm run typecheck` green.
- [ ] 테스트: onSlashAsk 미주입 → /ask 선택 시 기존 onChange(하위호환 보존) · onSlashAsk 주입 → /ask 선택 시 콜백(모달 open) · AskModal 빈상태 "무엇이든 편하게" · 최소화 알약 토글 · Esc 최소화→닫기. PASS.
- [ ] scope grep: AskModal window.api ask 실 호출 0(시각/로컬).
- [ ] `npm run test`(composer-trays 포함 회귀 0)·`test:e2e` 회귀 0.

## 참조
원본 AskModal.tsx · Composer pickSlash(F9) · REPLICA_GAP F11.
