# Phase 03: f9-visual

## 목표
컴포저 슬래시 메뉴·멘션 팔레트·첨부 트레이·드롭/큐 e2e + 스크린샷으로 F9 시각 1:1 검증.

## 담당 도메인 / 에이전트
qa (tests/). 등급: 보통.

## 의존 Phase
F9-02.

## 위험 깃발
없음 (테스트만).

## 변경 대상 (이 경계 밖 금지)
- `tests/e2e/visual-viewer.e2e.ts`(또는 shell.e2e.ts) — 컴포저 검증: textarea에 '/' 입력 → slash-menu 표시(ask/init 등) + 스샷 · '@' 입력 → mention 팔레트 + 스샷 · attach 버튼 클릭 → img-tray 썸네일 + 스샷. 입력 정리(전송 안 함 — 빈 채팅 유지).

## 작업 단계
1. 컴포저 textarea fill('/') → `.slash-menu` 표시 + slash-opt(ask) 단언 + 스샷(composer-slash.png).
2. textarea fill('@') → `.slash-menu`(mention) 표시 + 스샷(composer-mention.png).
3. attach 버튼 클릭 → `.img-tray .img-thumb` 표시 + 스샷(composer-attach.png).
4. textarea clear → 빈 상태 복원(후속 e2e 비오염).

## 완료조건 (AC — 측정 가능)
- [ ] `npm run test:e2e` 전체 PASS(회귀 0 + F9 슬래시/멘션/첨부 e2e).
- [ ] 슬래시/멘션/첨부 스크린샷 생성 — 원본 대조(slash-menu·mention-loc·img-tray 정합).
- [ ] **큐(sched)/드롭 힌트/busy placeholder = 단위테스트(F9-02) 전담, e2e 비대상**(라이브 queued 빈 배열·busy 없음 → 결정론 위해). 약속-구현 간극 없음.
- [ ] 전체 게이트 green: typecheck·test·test:e2e·lint.

## 참조
원본 c-chat.png · REPLICA_GAP F9 · 기존 visual-viewer F3 컴포저 패턴.
