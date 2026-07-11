---
name: work-plan
description: 큰 목표를 학습 가능한 Phase들로 쪼개서 01.Phases/M{N}-{slug}/ 폴더에 생성한다 (work-pin 시드 + plan-auditor 검증). 사용자가 새 마일스톤이나 큰 목표를 Phase로 분해해 달라고 요청할 때 사용. /work-run(실행)의 분해 짝.
argument-hint: <마일스톤 또는 목표 설명>
---

> **Skill 노트 (`/work:plan` 슬래시 → `/work-plan` Skill 승격)**: 원래 `.claude/commands/work/plan.md` 슬래시 커맨드(`/work:plan`)였다. work 시리즈를 Skill로 통일하며 `/work-plan`으로 승격(영호 결정 — `/work-xxx` 하이픈 네이밍, 콜론 네임스페이스는 새 Skill에서 불가). 자동발화 허용(description이 "새 마일스톤·큰 목표 분해 요청"으로 좁아 일상 대화엔 안 걸림). `/work-run`(실행)의 분해 짝.

사용자가 다음 목표에 대한 Phase 계획을 요청했습니다:
**$ARGUMENTS**

다음 절차를 따르세요:

### 1. 컨텍스트 수집

다음 문서들을 읽어서 큰 그림을 잡으세요:
- `CLAUDE.md` (헌법) — 특히 "작업 등급" 섹션
- `00.Documents/PRD.md` (무엇을 만들지 — 특히 MVP 제외 사항)
- `00.Documents/ARCHITECTURE.md` (어떻게 만들지)
- `00.Documents/ADR.md` (왜 이렇게 결정했는지)
- `.claude/policies/grade-and-risk.md` (4등급 분류 정책)
- `.claude/policies/subagent-routing.md` (SubAgent 9역할)
- 이미 있는 `01.Phases/` 폴더 (중복 방지)

비어있거나 채워지지 않은 게 있으면 STOP하고 사용자에게 "이 문서를 먼저 채우는 게 좋겠어요"라고 안내.

### 2. 목표 검증

사용자의 목표가:
- 너무 추상적인가? (예: "앱 만들기") → 마일스톤으로 잡고 그 안에 Phase 5~7개로 쪼갬
- 너무 작은가? (예: "버튼 색 바꾸기") → 단순/보통 등급 = Phase 분해 X. 직접 진행 권유
- 적절한가? → Phase **5~7개** 사이로 쪼개기 (8+ = plan-auditor 결함 가능성 ↑)

목표가 모호하면 사용자에게 1~2개 명확화 질문 후 진행.

### 3. Phase 분해

- **한 Phase = 1~3시간 작업**. 더 크면 다시 쪼갬
- **앞 Phase 끝나면 뭔가 데모할 수 있어야 함**
- **의존성 순서대로 정렬** — Phase N은 N-1, N-2가 끝나야 가능
- **각 Phase는 한 SubAgent 영역에 가급적 들어맞게** — 한 Phase가 main-process + renderer + qa 모두 건드리면 등급 *대규모*로 상향
- **첫 Phase는 매우 작게** — 환경 검증용
- **병렬 가능한 Phase 식별** — 의존성 없으면 명시 (plan-auditor 점검 기준)

### 4. Phase 파일 생성 (frontmatter 필수)

`01.Phases/M{N}-{milestone-slug}/` 폴더와 각 Phase 파일은 메인이 내용을 확정한 뒤 **secretary에 위임해 생성**한다 (메인 직접 Write는 supervisor-guard가 차단 — A안, 2026-07-04). 4.5의 work-pin 시드도 동일하게 secretary 몫.

각 파일은 [`.claude/templates/phase-template.md`](../../templates/phase-template.md)를 베이스로 채우되, **frontmatter 필수**:

```yaml
---
owner: <본인>
milestone: M{N}
phase: NN
title: <Phase 제목>
status: pending
grade: 단순 | 보통 | 복잡 | 대규모
risk: (옵션) trust-boundary | backend-contract | irreversible | ui-visual
loop_track: auto-gate | human-visual | human-gate   # 루프 버킷 (work-judge.md)
domain: main-process | agent-backend | renderer | shared-ipc | qa | cross
summary: <한 줄 요약>
---
```

> **loop_track**: 루프 드라이버가 이 Phase를 *어떻게 다룰지* — `auto-gate`(버킷 a, 기계 게이트 통과 시 자율) / `human-visual`(버킷 b, renderer 시각·미감 = 사람 트랙) / `human-gate`(버킷 c, 비가역·설계 분기 = 사람 GO 정지). 매핑 = [`.claude/policies/work-judge.md`](../../policies/work-judge.md). → `/work-run`이 이 필드로 정지 게이트를 판정한다.

본문에 반드시 채울 것: 🎯 목표 / ⏪ 사전 조건 / 📝 작업 내용 / ✅ 완료 조건(정량 — typecheck/test/lint green 등) / 📚 학습 포인트 / ⚠️ 함정 / 담당 SubAgent.

### 4.5. work-pin 자동 시드

Phase 파일 생성 직후 `.claude/state/current-pin.txt`를 마일스톤의 **첫 Phase 좌표**로 시드 ([`.claude/templates/pin-template.txt`](../../templates/pin-template.txt) 양식, [`.claude/policies/pin-and-done.md`](../../policies/pin-and-done.md) §1):

```
MODE: loop-driven — Phase 정의 작업은 매 스텝 확인 없이 자율 진행. 멈춤 = work-judge 버킷 (c)/(b)뿐 (헌법 "운영 모드"). attended·무인배치 X.
WORK-ID: m{N}-{milestone-slug}
PHASE: 01/{전체} / 등급: <첫 Phase grade>
현재 작업: <첫 Phase 🎯 목표 한 줄>
다음 액션: <첫 Phase 📝 첫 체크리스트 항목>
마지막 갱신: {YYYY-MM-DD}
```

→ `pin-injector.sh` Hook이 다음 입력부터 자동 주입.

### 4.6. plan-auditor SubAgent 자동 호출 (Tier 2-B)

Phase 파일 생성 직후 **plan-auditor SubAgent 자동 호출** ([`.claude/agents/plan-auditor.md`](../../agents/plan-auditor.md)):

- 입력: `plan_files` (생성된 Phase `.md` 경로) + `milestone_context` + `prior_phases` (관련 -DONE.md)
- 6축 점검 (분해 적정성 / 의존성 그래프 / 완료 조건 정량성 / 등급 산정 / 헌법 위반 위험 / 시나리오 명세)
- 🔴 결함 발견 시 → 옵션 A(즉시 봉합) / 옵션 B(현 상태 진행 + 별 Phase 봉합)
- 🔴 0개 = GO

### 5. 사용자에게 보고

```
─────────────────────────────────────────
📋 Phase 계획 완료
─────────────────────────────────────────

🎯 목표: [사용자 입력]

📂 생성된 마일스톤: M{N}-{slug}
   총 N개 Phase (5~7 범위 권장)

순서 (등급 + 담당 SubAgent):
  1. [Phase 01 제목] (예상 1.5h, 등급: 보통, 담당: main-process)
     → 끝나면: 무엇을 데모할 수 있는지
  ...

병렬 가능: Phase NN ↔ Phase MM (의존성 없음)

📚 이번 마일스톤에서 배울 핵심 개념: ...

🔬 plan-auditor 결과: <✅ GO / 🔴 N개 결함 / 🟡 N개 제안>

📌 work-pin 시드 완료: WORK-ID=`m{N}-{slug}` 박힘.

➡️ 추천 시작점: `/work-run` (또는 "01.Phases/M{N}-{slug}/01-{first-phase}.md 부터 시작하자")
```

---

**중요 원칙**:

- **학습 모드** — 학부생이 따라갈 수 있게. 각 Phase에 "너무 빨리 가는 건 아닌가?" 자문
- **Phase 입자 5~7개/마일스톤 = 권장** — 8+ = plan-auditor 결함 가능성 ↑
- **plan-auditor 자동 호출 = 의무** — 우회 X. 사용자가 "스킵" 명시하면 work-pin에 사유 박음
- **frontmatter 필수** — 누락 시 phase-gate-validator.sh가 -DONE.md 박을 때 검사. `/work-run`도 이 frontmatter(status·risk·loop_track·domain)로 실행을 구동한다.
