---
description: docs/를 읽고 마일스톤을 Phase로 분해 → phases/에 정의 생성 → (옵션) execute.py 순차 실행. 원스톱 하네스 실행.
---

# /harness — 원스톱 하네스 실행

AgentDeck 개발의 진입점. 인자로 마일스톤 slug(예: `01_mvp`)를 받는다. 없으면 물어본다.

## 실행 흐름

### 1. docs/ 전부 읽기 (필수 선행)
- `docs/PRD.md` (특히 **MVP 제외 사항**), `docs/ARCHITECTURE.md`, `docs/ADR.md`, `docs/UI_GUIDE.md`, `docs/FEATURE_MAP.md`
- `CLAUDE.md`(헌법 CRITICAL), `.claude/agents/_routing.md`(도메인 매핑)

### 2. 사용자와 논의 — 구체화
- 대상 마일스톤의 범위/제외를 사용자와 확인. 모호하면 되물어본다(scope creep 차단이 우선).

### 3. Phase로 분해 (5~7개 권장)
- **도메인 경계 기준**으로 쪼갠다(shared-ipc / main-process / agent-backend / renderer / qa).
- 의존성 순서: 계약(shared) → 구현(main)·UI(renderer) → 테스트(qa).
- 각 Phase에 **측정 가능한 완료조건** + 위험 깃발(trust-boundary/backend-contract/irreversible) 표기.
- ⚠️ Phase 정의 작성은 `plan-auditor` 자동 호출(Tier 2-B) 대상 — 분해안을 검증받는다.

### 4. phases/<milestone>/ 에 Phase 파일 생성
- `phases/01_mvp/NN-<slug>.md` 형식. 템플릿은 `phases/_TEMPLATE.md`.
- 각 파일: 목표 / 담당 도메인 / 변경 대상 / 작업 단계 / 완료조건(AC) / 위험 깃발 / 의존 Phase.

### 5. 실행 (택1)
- **수동 권장(초기)**: 등급별로 coordinator/Worker를 호출하며 Phase를 진행. 복잡/대규모는 coordinator 분해 위임.
- **자동**: `python scripts/execute.py <milestone>` — 헤드리스 순차 실행(각 Phase 새 세션 + 자동 커밋 + 상태 추적).

## 규칙
- **MVP 제외 사항 침범 금지** — PRD의 제외 목록은 헌법. Phase가 이를 건드리면 중단 + 사용자 확인.
- **비가역 작업은 사람 게이트** — push/PR/배포/`package`는 자동 진행 X(settings.json `ask`).
- **하네스 자체 변경 금지** — `.claude/`, `docs/ADR.md`, `CLAUDE.md`는 에이전트가 못 고친다(사용자 단독).

## 출력
분해 완료 시:
```
🐴 /harness — <milestone>
📋 Phase 분해 (N개):
  NN-<slug>  [도메인]  깃발:<flag/없음>  의존:<선행 Phase>
🔍 plan-auditor: 승인 / 수정필요(N)
➡️ 다음: 수동 진행(coordinator) 또는 `python scripts/execute.py <milestone>`
```
