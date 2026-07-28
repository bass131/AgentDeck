---
owner: 유영호
milestone: RS1
phase: 04
title: renderer store 정리 — 죽은 이중 소스 제거 + 산탄 수정 구조 해소
status: pending
grade: 복잡
loop_track: auto-gate
estimated: 2~4h
domain: renderer
summary: 아무도 읽지 않는 messages 이중 소스 제거, 3곳에 복사된 터미널 리셋 필드 목록 단일화, 죽은 컴포넌트 삭제, 소형 중복(시각 포맷·goal 파싱·패널 필드 보존) 헬퍼화. 화면(JSX 시각)은 무변경.
---

# Phase 04: renderer store 정리 — 죽은 이중 소스 제거 + 산탄 수정 구조 해소

> **상태**: pending · **마일스톤**: RS1 · **등급**: 복잡(1도메인이나 변경 ~150줄) · **담당**: renderer + reviewer

## 🎯 목표

thread가 대화 데이터의 단일 소스가 되고(유령 `messages` 소멸), "필드 하나 추가하면 세 곳을 손으로 고쳐야 하는" 구조가 헬퍼 한 곳으로 수렴한다.

## ⏪ 사전 조건

- [ ] Phase 01 완료. Phase 03·06과 병렬 가능(파일 무중복).

## 📝 작업 내용

- [ ] **`messages` 이중 소스 제거** — 쓰기 4곳(`slices/conversation.ts:29`·`runtime.ts:218`·`sessions.ts:101`·`selector.ts:52`)과 done→messages 동기화 2곳(`runtime.ts:563-577`·`:640-650`), `selectMessages` 셀렉터 삭제. 읽기 소비처 0은 스윕에서 실측됐지만 **착수 시 재확인**(grep + codegraph). `ConversationRunState` 타입과 테스트 픽스처 동반 수정 — **픽스처 수정은 qa 몫**(plan-auditor 🔴2 봉합: `99_Others/tests/**` 쓰기는 qa 소유), 착수 브리프에서 대상 파일을 grep으로 전수 열거해 위임한다.
- [ ] **터미널 리셋 필드 단일화** — 동일 필드 ~15개 목록이 `runtime.ts:105-140`·`:361-391`·`panelSession.ts:511-539`에 복사돼 있음("안 하면 값이 샌다" 경고 주석 반복). `store/reducer/helpers.ts`에 `terminalResetFields()` 단일 정의, 세 곳은 그걸 쓰고 각자의 추가분만 로컬로.
- [ ] **죽은 코드 삭제** — `Conversation.tsx:175-215` `WorkingIndicator`(프로덕션 렌더 소비 0 실측) + `StatusLine.tsx:7`의 낡은 주석 정정 + `Conversation.tsx:155·162` 하위호환 re-export 잔재 정리(소비처 직결 후).
- [ ] **소형 중복 헬퍼화** — 한국어 시각 포맷 4곳 → `lib/time.ts` `nowTimeKo()` / goal 명령 파싱 정규식 3곳 → `lib/cmdCards.ts` `goalDetailOf()` / `panelSession.ts` 3곳의 패널-로컬 필드 수동 보존 → `preservePanelLocalFields()` / `PanelView.tsx:313-317` 파생값 useMemo 정렬.

## ✅ 완료 조건

- [ ] `npm run typecheck`(node+web) 0 / `npm run test` 5,359 기준 비감소·신규 fail 0(픽스처 수정분 반영) / `npm run lint` 0
- [ ] `messages` 참조가 저장소 전체에서 0 (grep 증적)
- [ ] 저장 파일(JSON) 형상 불변 — 판정 방법: 직렬화 payload 구성부(`sessions.ts` 저장 경로) grep 증적으로 `messages` 미포함 확인(스윕 실측상 원래 미포함 — 착수 시 재확인)
- [ ] reviewer 🔴 0

## 📚 학습 포인트

- **단일 진실 원천(single source of truth)** — 같은 데이터를 두 곳에 쓰면 동기화 코드가 늘고, 결국 한쪽은 아무도 안 읽게 된다(이번 실측이 그 사례).
- **산탄 수정(Shotgun Surgery)** 스멜 — 하나의 개념 변경이 여러 파일 수정을 강제하는 구조. 경고 주석이 반복되면 구조가 잘못됐다는 신호.

## ⚠️ 함정

- 이 Phase는 **로직만** 만진다 — JSX 레이아웃·CSS·애니메이션 변경 금지(그건 육안 트랙).
- `messages` 제거는 타입·픽스처가 같이 움직여서 diff가 넓다 — 커밋을 "제거 본체 / 픽스처 정리"로 쪼개 사후 선별이 가능하게.
- 터미널 리셋 통합 시 세 곳의 *차이*(각자 추가로 리셋하는 필드)를 뭉개면 안 된다 — 공통분만 추출.
- **Phase 02와 동시 실행 금지** — 같은 renderer 테스트 파일(switch-continuity·bf3-p07 계열)을 02(셋업 이관)와 04(픽스처 수정)가 함께 만질 수 있다.

## 담당 SubAgent

renderer (Worker) + qa (테스트 픽스처 동반 수정 — `99_Others/tests/**` 쓰기는 qa 소유) + reviewer(조건부 충족 — 변경 ≥10줄·등급 복잡)
