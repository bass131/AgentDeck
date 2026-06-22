# Phase 02: attach-queue-placeholder

## 목표
컴포저 **이미지 첨부 트레이** + **드롭 힌트** + **예약 큐 스트립(sched)** + **busy 상태별 placeholder**. 정적 샘플.

## 담당 도메인 / 에이전트
renderer (src/renderer). 등급: 보통.

## 의존 Phase
F9-01.

## 위험 깃발
없음 (renderer. 새 IPC 0. 실 저장/큐 드레인=M4. 로컬 state).

## 변경 대상 (이 경계 밖 금지)
- `src/renderer/src/components/Composer.tsx`:
  - **첨부 트레이**: attach 버튼 onClick → 로컬 샘플 썸네일 추가(data URL placeholder, 실 파일피커=M4). img-tray(img-thumb: img-thumb-open img + img-thumb-x 제거). 제거 동작(로컬).
  - **드롭 힌트**: onDragEnter/Over/Leave/Drop(dragDepth) → dragOver state → composer .drag + drop-hint(IconImage + "이미지를 여기에 놓으세요"). 실 파일 처리=M4(드롭 시 샘플 썸네일 추가 또는 no-op).
  - **큐 스트립**: optional prop `queued`(기본 [], {id,text,images?}) → queued.length>0 시 sched(sched-head IconClock "예약된 메시지 N" + sched-hint + sched-list: sched-item sched-num/sched-text/sched-img/sched-x 취소). 실 큐=M4(라이브 빈 배열; 단위테스트서 샘플 주입).
  - **placeholder 상태별**: busy "다음 메시지를 예약하세요… (작업 후 자동 전송)"·started "메세지를 입력하세요."·신규 "오늘 어떤 도움을 드릴까요?". **3-상태 결정 prop `hasStarted` 신규 추가**(busy=isRunning, started=hasStarted, 신규=둘 다 false). busy 시 send→예약(IconClock)/중지(IconClose) 분기는 기존 유지/정합.
- `src/renderer/src/components/Conversation.tsx` — Composer에 `hasStarted={messages.length > 0}` 주입(현재 isRunning만 내려줌). **이 prop 주입 외 Conversation 로직 변경 금지.**
- `tests/renderer/composer.test.tsx` — attach 버튼이 no-op→썸네일 추가로 바뀌면 기존 title/aria 단언 동반 갱신(현재 placeholder 비결합이라 회귀 표면 작음).
- `src/renderer/src/components/Composer.css` — img-tray/img-thumb/img-thumb-open/img-thumb-x · drop-hint · composer.drag · sched/sched-head/sched-title/sched-hint/sched-list/sched-item/sched-num/sched-text/sched-img/sched-x. 색 토큰.

## 작업 단계
1. 첨부: 로컬 images state. attach 버튼 → 샘플 썸네일 push. img-tray 렌더 + 제거.
2. 드롭: dragDepth ref + dragOver state + drop-hint 오버레이.
3. 큐: queued prop + sched 스트립.
4. placeholder 상태별 + send/예약/중지 분기 정합.
5. CSS. 인라인 색 0.
6. 단위 테스트.

## 완료조건 (AC — 측정 가능)
- [ ] `npm run typecheck` green.
- [ ] 테스트: attach 클릭 → img-tray 썸네일 추가, x 제거 · dragEnter → drop-hint 표시 · queued 샘플 주입 → sched "예약된 메시지 N" + 항목, sched-x 취소 · placeholder 3-상태(isRunning/hasStarted/신규별 텍스트). **큐/드롭/busy placeholder = 단위테스트 전담**(e2e 비대상). PASS.
- [ ] scope grep: Composer window.api 첨부/큐 호출 0(로컬).
- [ ] `npm run test`·`test:e2e` 회귀 0.

## 참조
원본 Chat.tsx img-tray L1867 · drop-hint L1753 · sched L1700 · placeholder L1890 · REPLICA_GAP F9.
