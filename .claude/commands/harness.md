---
description: 00.Documents/를 읽고 마일스톤을 Phase로 분해 → 01.Phases/M{N}-{slug}/에 정의 생성 (work:plan 시스템). 마일스톤 원스톱 진입.
---

# /harness — 마일스톤 원스톱 진입

마일스톤 목표를 받아 docs 읽고 Phase로 분해. 코어 분해 = [`/work:plan`](work/plan.md)(work-pin 시드 + plan-auditor). 인자 없으면 물어본다.

## 실행 흐름

### 1. 00.Documents/ 읽기 (필수 선행)
- `00.Documents/PRD.md` (특히 **MVP 제외 사항**), `00.Documents/ARCHITECTURE.md`, `00.Documents/ADR.md`, `00.Documents/UI.md`, `00.Documents/FEATURE_MAP.md`
- `CLAUDE.md`(헌법 CRITICAL + 응대 원칙), `.claude/agents/_routing.md`(도메인 매핑), `.claude/policies/`(등급·라우팅·리뷰)
- ⚠️ **UI/충실도 작업**: `00.Documents/UI.md`가 디자인 스펙(현 `02.Source/renderer` 실측 — Clay 에디토리얼 HEX 듀얼테마·radius 11px). 원본 클론 `C:/Dev/AgentCodeGUI`(읽기전용 레퍼런스, ADR-014) 소스 대조. 의도적 divergence는 사용자 승인.

### 2. 마일스톤 범위 확인
- 대상 마일스톤(예: M5 배포)의 범위/제외를 사용자와 확인. 모호하면 되묻는다 (scope creep 차단 우선).

### 3. Phase 5~7개 분해 → `/work:plan` 시스템
- **도메인 경계 기준**(shared-ipc / main-process / agent-backend / renderer / qa)으로 분해.
- 의존성 순서: 계약(shared) → 구현(main)·UI(renderer) → 테스트(qa).
- 각 Phase에 **측정 가능 완료조건**(typecheck/test/lint green) + 위험 깃발(trust-boundary/backend-contract/shared-contract/irreversible) 표기.
- `01.Phases/M{N}-{slug}/` 생성 (`.claude/templates/phase-template.md`). **plan-auditor 자동 호출(Tier 2-B)** + **work-pin 시드**. 상세 절차 = [`/work:plan`](work/plan.md).

### 4. 진행
- 등급별 coordinator/Worker **수동** 진행. 복잡/대규모는 coordinator 분해 위임 ([`.claude/policies/subagent-routing.md`](../policies/subagent-routing.md)).
- 세션 흐름은 [`/session:start`](session/start.md) → 작업 → [`/session:end`](session/end.md).
- ※ 옛 `execute.py` 자동 순차 실행은 폐기 — work:plan(Phase 구성) + 세션/루프(진행)로 대체.

## 규칙
- **MVP 제외 사항 침범 금지** — PRD 제외 목록은 헌법. Phase가 건드리면 중단 + 사용자 확인.
- **비가역 작업은 사람 게이트** — push/PR/배포/`package`는 자동 진행 X (settings.json `ask`).
- **하네스 자체 변경 사용자 단독** — `.claude/`, `00.Documents/ADR.md`, `CLAUDE.md`는 에이전트가 못 고친다.

## 출력
```
🐴 /harness — <milestone>
📋 Phase 분해 (N개):
  NN-<slug>  [도메인]  깃발:<flag/없음>  의존:<선행 Phase>
🔍 plan-auditor: 승인 / 수정필요(N)
📌 work-pin 시드: m{N}-{slug}
➡️ 다음: "01.Phases/M{N}-{slug}/01-<slug>.md 부터 시작하자" (coordinator/수동 진행)
```
