# 하네스 보강 드라이버 — ClaudeDev 참고 (compact 생존)

> 사용자 결정(2026-06-26): AgentDeck Agent Harness가 빈약 → `C:\Dev\ClaudeDev` 하네스 참고 보강.
> 적용 방식: **이 작업 한해 `.claude/**` 직접 적용 인가**(로컬 커밋, push 금지). 헌법(`CLAUDE.md`)·ADR
> 본문은 여전히 사용자 게이트(포인터 추가는 제안만). 이 문서가 단일 진실원.

## 0. 적응 원칙 (맹목 복사 금지)
ClaudeDev = 다인 팀(영호 팀장 + 팀원). AgentDeck = **솔로 + AI**. "팀원 매일 열람"·"슬랙 알림" 같은
팀 운영 기능은 **솔로 맥락으로 적응**(예: CHANGELOG = compact/세션 경계 생존 메모리, 알림 제거).

## 1. 실측 갭 (3 Explore 서베이 종합)

| 영역 | 현 AgentDeck | ClaudeDev | 갭 | ROI |
|---|---|---|---|---|
| 에이전트 | 8개(coordinator/reviewer/plan-auditor + 5 worker) | 9개 | 거의 동등 | — |
| 분해 카탈로그 | coordinator.md에 **이미 3종**(IPC/어댑터/3-pane) + 에스컬레이션 | 풍부 | 소폭 보강 | 낮음 |
| 훅 | 3종(dangerous-cmd·tdd-guard·circuit-breaker) | risk-detector·reviewer-auto-trigger·phase-gate 등 추가 | **자동 깃발/리뷰 트리거 없음** | **높음** |
| 변경 이력 | 없음 | **CHANGELOG.md**(박제+위험도) | **조직/세션 기억 부재** | **높음** |
| 완료 보고 | docs/ 드라이버 산발 | **5단계 -DONE + phase-gate 강제** | 표준 양식 없음 | 중간 |
| 자동 리팩토링 | 없음 | **/refactor-sweep**(7 안전가드) | 코드품질 자동화 0 | **높음**(정리/리팩터 트랙 직결) |
| 루프/판정 | 내장 /loop(GUI) | loop-driver + work-judge(3버킷) | 정책 부재 | 낮음(보류) |
| 지식 위생 | 없음 | knowledge-gc | 부재 | 낮음(보류) |

## 2. 보강 로드맵 (우선순위)

### Phase H1 — 기억·자동화 토대 (이번)
- **H1-a. `.claude/CHANGELOG.md`** — 헌법/ADR/하네스/공유계약 변경 박제. 형식 `YYYY-MM-DD — 요약 (영향/위험도[L/M/H])`.
  솔로 적응: "compact·세션 경계에서 옛 결정 기반 사고 방지" 목적. 최근 변경 시드.
- **H1-b. `scripts/hooks/risk-detector.sh`** (PreToolUse Edit|Write) — 변경 파일 경로로 4깃발
  (trust-boundary `src/preload`·`src/main/ipc`·`canUseTool` / backend-contract `src/shared/agent-events`·`AgentBackend` /
  shared-contract `src/shared/ipc-contract` / harness `.claude`) 자동 검출 → stderr 경고(advisory, exit 0).
- **H1-c. `scripts/hooks/reviewer-auto-trigger.sh`** (PostToolUse Edit|Write) — 경계 파일
  (`src/shared/**`·`src/preload/**`·`AgentBackend`·`canUseTool`) 변경 누적 시 "reviewer 호출 권장" 알림(advisory).

### Phase H2 — 자동 리팩토링 (정리/리팩터 트랙 직결)
- **H2-a. `.claude/commands/refactor-sweep.md`** — TypeScript 적응: ESLint+typecheck+Vitest 게이트.
  7 안전가드(회귀 green 전제·전용 브랜치 `refactor/auto-YYYYMMDD`·push/PR 금지·**신뢰경계/ADR-003 영구 제외**·
  동작보존 단정·atomic commit·사용자 선별). reviewer 병렬 진단 → Worker 직렬 수정 → reviewer 재검증.

### Phase H3 — 완료 보고 표준 (선택)
- **H3-a. 5단계 -DONE 양식** + `scripts/hooks/phase-gate-validator.sh`(복잡 이상 -DONE 의무).
  AgentDeck은 이미 docs/ 드라이버 패턴 → 경량 적용(과잉 금지).

### 보류 (가치 낮음/솔로 부적합)
- loop-driver·work-judge(내장 /loop GUI로 충분) · knowledge-gc(학습 누적 관찰 후) · session 라이프사이클.

## 3. 제안만 (사용자 게이트 — 직접 적용 안 함)
- `CLAUDE.md`(헌법)에 CHANGELOG 포인터 1줄(`## 문서 지도`에 `.claude/CHANGELOG.md` 추가) — 사용자 승인 후.
- ADR 신설(하네스 보강 결정 박제) — 초안 제공, 사용자 게이트.

## 4. 불변·제약
- **push/PR/merge/배포 = 인간 게이트**(무인 금지) · 신뢰경계·ADR-003 불가침(refactor-sweep 영구 제외) · TDD.
- 훅은 **advisory(exit 0) 우선** — 기존 tdd-guard/circuit-breaker처럼 차단은 신중. Git Bash + Python3(jq 미사용) 정합.
- 각 항목 독립 커밋. 훅은 smoke 검증(가짜 페이로드 stdin) 후 settings.json 등록.

## 5. 진행
- H1-a CHANGELOG ⏳ · H1-b/c 훅 ⏳ · H2 refactor-sweep ⏳ · H3 보류판정.
