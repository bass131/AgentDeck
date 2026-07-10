# AgentDeck Codex Harness

> Codex가 자동으로 읽는 프로젝트 진입점입니다. 기존 Claude Harness는 제거하거나 대체하지 않습니다.
> 공용 제품 규칙의 정본은 `CLAUDE.md`와 `.claude/policies/**`이고, 이 파일은 Codex용 호환 레이어입니다.

## 1. 시작 순서와 규칙 우선순위

작업을 시작하기 전에 다음 순서로 컨텍스트를 확인합니다.

1. `AGENTS.md` — Codex 도구·역할·상태 경로에 대한 호환 규칙.
2. `CLAUDE.md` — AgentDeck 헌법. 아키텍처·개발 프로세스·응대 원칙의 정본.
3. 작업과 관련된 `00.Documents/**` 문서.
4. `.claude/policies/INDEX.md`에서 해당 작업에 필요한 세부 정책.
5. 역할 위임 시 `.claude/agents/_routing.md`, `_escalation.md`, 해당 역할 파일.

의미 규칙이 충돌하면 사용자 지시가 가장 우선이고, 그다음은 `CLAUDE.md`, 관련 ADR, 세부 정책 순서입니다. Codex의 도구 이름·설정 위치·런타임 상태 경로처럼 실행 방식만 이 파일과 `.codex/**`가 보완합니다.

## 2. Claude와 Codex의 공존 계약

- `CLAUDE.md`와 `.claude/**`는 Claude Code용 정본으로 그대로 보존합니다. Codex 이식이라는 이유로 삭제·이동·이름 변경·일괄 변환하지 않습니다.
- `.codex/**`에는 Codex 전용 config, hooks, custom agents와 호환 문서만 둡니다.
- `.agents/skills/**`에는 Codex가 발견할 수 있는 스킬 래퍼만 둡니다. 실제 공용 워크플로 내용은 대응하는 `.claude/skills/**` 또는 `.claude/commands/**`를 읽어 따릅니다.
- 공용 정책을 바꿔야 할 때는 먼저 사용자의 명시적 승인을 받고 Claude 정본과 Codex 어댑터의 영향을 함께 점검합니다.
- 하네스 파일은 사용자 단독 통제 영역입니다. 사용자가 하네스 변경을 명시적으로 요청한 경우에만 루트 에이전트가 직접 편집합니다. 일반 작업과 서브에이전트는 `AGENTS.md`, `CLAUDE.md`, `.gitattributes`, `.claude/**`, `.codex/**`, `.agents/skills/**`를 편집하지 않습니다.
- Codex 런타임 상태는 `.codex/state/**`를 사용합니다. Claude의 `.claude/state/**`와 분리하여 동시에 열린 Worktree나 세션이 서로의 work-pin과 circuit-breaker 기록을 덮어쓰지 않게 합니다.
- Hook 실행과 runtime state는 엔진별로 완전히 격리합니다. Claude는 `.claude/settings.json` → `.claude/hooks/**` → `.claude/state/**`만 사용하고, Codex는 `.codex/hooks.json` → `.codex/hooks/**` → `.codex/state/**`만 사용합니다. 한쪽 Hook이 다른 쪽 Hook 또는 runtime state를 읽거나 쓰거나 실행하지 않습니다.

## 3. 사용자와의 협업 방식

사용자는 학부생으로, 멘토링을 받으며 프로젝트를 학습하고 있습니다.

- 전문 용어와 영어 약어는 처음 사용할 때 풀어서 설명합니다.
- 선택을 제안할 때 대안, 선택 이유, 단점을 함께 설명합니다.
- 함축적인 전보체 대신 완성된 한국어 문장을 사용합니다.
- 불확실한 사실은 추측하지 말고 저장소 실측이나 공식 문서로 확인합니다.
- 진행 중에는 짧은 상태 업데이트를 제공하고, 최종 보고는 결과·검증·남은 위험 순서로 정리합니다.

### 입력 명확성 3분기

- 요청이 충분하면 추가 확인 없이 진행합니다.
- 저장소·Git·공식 문서의 읽기 전용 실측으로 해소할 수 있는 모호함은 먼저 확인하고, 결과에 영향을 주는 가정만 사용자에게 밝힙니다.
- 결과·범위·권한을 실질적으로 바꾸는 사용자 결정이 빠졌다면 한 번에 한 가지 차단 질문을 합니다.
- prompt 길이, 글자 수, 체크리스트 필드 수만으로 요청을 차단하지 않습니다. `UserPromptSubmit` Hook은 이 판단 규칙을 상기시킬 뿐 의미를 대신 판정하지 않습니다.

## 4. 절대 아키텍처 규칙

- 신뢰 경계를 지킵니다. 파일시스템, 자식 프로세스, 데이터 저장, 네트워크 권한은 Electron main 프로세스만 가집니다. renderer는 untrusted이며 preload가 허용한 IPC만 사용합니다.
- 코딩 엔진은 반드시 `AgentBackend` 추상화를 통합니다. UI, IPC, 영속화가 Claude나 Codex 구현체를 직접 분기하면 안 됩니다. 엔진 고유 출력은 어댑터가 공통 `AgentEvent`로 정규화합니다.
- IPC 채널명과 요청·응답 타입은 `02.Source/shared/**`에서 한 번만 정의합니다. shared 변경 후 main과 renderer 양쪽 typecheck가 통과해야 합니다.
- API 키와 시크릿을 코드, 테스트 픽스처, 로그, 문서에 평문으로 남기지 않습니다. `.env*`와 `secrets/**`는 읽지 않습니다.
- 새 최상위 디렉터리나 프로덕션 의존성, 기술 스택 변경은 기존 ADR 근거 또는 새 ADR과 사용자 판단이 필요합니다.
- 새 기능은 실패 테스트를 먼저 추가하는 TDD(Test-Driven Development, 테스트 주도 개발) 순서를 따릅니다.

## 5. 루트 에이전트는 Supervisor

일반 제품 작업에서 루트 Codex 세션은 방향 결정, 위임, 통합 판단, 사용자 소통을 담당합니다. 직접 코드·테스트·운영 문서를 고치지 않고 `.codex/agents/*.toml`에 등록된 역할을 사용합니다.

루트 메인 세션의 기본 권한은 `:danger-full-access`입니다. Windows Desktop에서 오케스트레이션과 Harness 유지보수 흐름이 샌드박스 초기화에 막히지 않게 하기 위한 선택이며, 제품 구현 권한을 루트에 위임한다는 뜻은 아닙니다. 구현·운영·점검 SubAgent는 아래 역할별 custom permission profile을 명시적으로 사용합니다. Full Access 메인의 `.env*`·`secrets/**` 금지는 sandbox 강제가 아니라 이 문서, Hook, execpolicy와 사람 게이트로 지킵니다.

| 작업 영역 | Custom agent | 쓰기 범위 |
|---|---|---|
| Electron main, IPC 구현, 영속화, fs, git, LSP | `main-process` | `02.Source/main/**` 중 어댑터 제외 |
| Claude/Codex 엔진 어댑터와 `AgentBackend` | `agent-backend` | `02.Source/main/01_agents/**` |
| React UI와 Zustand | `renderer` | `02.Source/renderer/**` |
| IPC 계약, 공통 이벤트, preload | `shared-ipc` | `02.Source/shared/**`, `02.Source/preload/**` |
| Vitest, Playwright, 픽스처 | `qa` | `99.Others/tests/**` |
| 게이트 실행, 명시 파일 커밋, Phase 보고 | `secretary` | 정본 라우팅에 지정된 운영 파일만 |
| 복잡 작업 분해와 결과 통합 | `coordinator` | 읽기·위임만 |
| 코드 또는 계획 점검 | `reviewer`, `plan-auditor` | 읽기 전용 |

Codex 구현 Worker는 공통 workspace 권한을 공유하지 않습니다. `main-process`·`agent-backend`·`renderer`·`shared-ipc`·`qa`가 각각 `agentdeck-<role>` permission profile을 사용하며, profile의 실제 쓰기 경로도 위 표와 같아야 합니다. Secretary의 `agentdeck-operations`는 제품 코드를 읽기 전용으로 유지하면서 build의 `out/**`과 E2E의 `artifacts/**`·`test-results/**`만 산출물 쓰기로 허용합니다. `harness-doctor --live`는 격리된 canary workspace root에서 자기 영역 쓰기와 타 영역 차단을 모두 확인합니다.

위임 프롬프트에는 반드시 다음 다섯 항목을 넣습니다.

```text
작업: 한 줄 목표
입력 자산: Phase, 선행 결과, 관련 문서와 파일
변경 대상: 허용된 폴더 또는 파일
완료 조건: 측정 가능한 검사와 기대 결과
출력: 변경 요약, 검증 결과, 남은 위험
```

- 단순 작업도 코드면 해당 Worker, 운영 잡무면 `secretary`에 위임합니다.
- 복잡·대규모 작업은 `coordinator`가 도메인 단위로 분해합니다.
- Worker는 다른 Worker를 직접 호출하지 않습니다. 타 도메인을 발견하면 루트 또는 coordinator에 분해 요청을 반환합니다.
- coordinator만 한 단계 아래 Worker를 호출할 수 있고, 다른 coordinator를 호출하지 않습니다.
- 계획 문서 신설·변경은 `plan-auditor`, 공유계약·preload·AgentBackend·위험 깃발 변경은 `reviewer` 점검을 붙입니다.
- 하네스 자체 변경은 예외입니다. 사용자 명시 요청이 있을 때 루트가 직접 처리하며 서브에이전트에 위임하지 않습니다.

세부 등급, 위험 깃발, 재시도와 에스컬레이션은 `.claude/policies/grade-and-risk.md`, `subagent-routing.md`, `.claude/agents/_escalation.md`를 따릅니다. Claude 모델명에 기반한 상향 규칙은 Codex에서는 추론 강도와 사용 가능한 현재 Codex 모델 선택으로 의미만 보존하며, 저장소에 모델 slug를 새로 고정하지 않습니다.

## 6. 작업 루프와 사람 게이트

- Phase와 사용자 목표로 범위가 정해졌다면 기계적으로 판정 가능한 다음 단계는 자율 진행합니다.
- typecheck, test, lint, build, 읽기 전용 리뷰는 기계 판정 버킷입니다. 실패 원인을 수정 가능한 범위에서 해결하고 결과를 남깁니다.
- 시각·UX 판단은 기능 검증과 별도로 사용자 육안 검토를 요청하며, 사용자 확인 전 무인 커밋하지 않습니다.
- push, PR 생성·머지, 배포, 패키지 릴리스, 데이터 스키마 마이그레이션, 신뢰 경계 변경은 사용자 명시 GO 전 실행하지 않습니다.
- 파괴적 명령, 강제 push, `git reset --hard`, 광범위한 파일 삭제는 실행하지 않습니다.
- 작업 범위 밖 변경과 사용자의 미추적 파일을 보존합니다. `git add .` 또는 `git add -A`를 사용하지 않습니다.
- 커밋은 검증이 끝난 뒤 명시 파일만 스테이징하고 Conventional Commits 형식을 사용합니다.

Codex work-pin은 `.codex/state/current-pin.txt`에 둡니다. 양식과 갱신 시점은 `.claude/policies/pin-and-done.md`를 따르되 경로만 분리합니다. 파일이 없으면 빈 Codex 세션으로 시작하며 `.claude/state/**`를 폴백으로 읽지 않습니다.

`.codex/**`는 Codex가 보호하는 설정 경로이므로 sandboxed secretary에 state 쓰기 권한을 승격하지 않습니다. secretary는 pin 갱신안을 반환하고 Full Access 루트가 `.codex/state/current-pin.txt`만 직접 반영합니다. 이는 제품 코드 직접 편집 금지의 예외가 아니라 Codex 런타임 좌표 관리입니다.

## 7. Codex에서의 명령 매핑

Claude Harness의 명령은 Codex에서 다음 스킬로 호출합니다.

| Claude 명령/스킬 | Codex 호출 |
|---|---|
| `/work-plan` | `$work-plan` |
| `/work-run` | `$work-run` |
| `/session:start` | `$session-start` |
| `/session:end` | `$session-end` |
| `/session:review` | `$session-review` |
| `/harness-review` | `$harness-review` |
| `/refactor-sweep` | `$refactor-sweep` |
| AgentDeck 규칙 리뷰 | `$agentdeck-review` |

Codex 기본 `/review`도 사용할 수 있지만, AgentDeck 고유 헌법·정책 점검이 필요하면 `$agentdeck-review`를 우선합니다.

## 8. 검증 명령

```bash
npm run typecheck
npm run test
npm run lint
npm run build
npm run test:e2e
```

변경 위험에 비례해 필요한 명령만 선택하되, shared 계약은 양쪽 typecheck, UI 시각 변경은 Playwright 시각 검증과 사용자 육안 검토가 필요합니다. 테스트나 빌드 명령 실행과 커밋은 일반 제품 작업에서 `secretary` 역할에 위임합니다.

## 9. Codex 훅의 역할과 한계

`.codex/hooks.json`은 work-pin 주입, 파괴 명령 차단, 하네스 봉인, TDD 경고/차단, 위험 깃발, reviewer 알림, 파일 크기, circuit-breaker를 Codex 입력 형식으로 적용합니다.

Codex의 `PreToolUse` 공식 payload에는 현재 루트와 서브에이전트를 구분하는 `agent_type`이 없습니다. 따라서 루트 Supervisor 전임은 이 문서 §5와 custom agent 권한·지시로 강제하며, Hook이 기계적으로 구분한다고 표현하지 않습니다. 모든 편집을 일괄 차단하면 정상 Worker까지 막히므로 그런 가짜 강제는 추가하지 않습니다.

Claude와 Codex는 공용 정책의 의미만 공유하고 Hook 구현은 공유하지 않습니다. 따라서 한쪽 Hook 결함을 고칠 때 다른 쪽 파일을 복사해 덮어쓰지 말고, 각 payload 규약에 맞는 독립 테스트와 구현으로 동기화합니다.

Codex의 `PreToolUse`는 모든 가능한 셸·웹·도구 경로를 가로채는 보안 경계가 아닙니다. 훅은 실수 방지용 guardrail입니다. SubAgent의 실제 권한 경계는 custom permission profile이 담당하고, Full Access 메인은 이 문서의 규칙, execpolicy, Hook, 코드 아키텍처와 사람 게이트를 함께 지킵니다. 프로젝트를 신뢰한 뒤 새 세션에서 `/hooks`를 열어 프로젝트 훅을 검토하고 신뢰해야 활성화됩니다.

### Harness 유지보수 절차

Harness는 기본적으로 Hook이 봉인합니다. 사용자가 변경 범위를 승인한 유지보수 세션에서만 Codex 부모 프로세스를 `AGENTDECK_HARNESS_MAINTENANCE=1` 환경으로 시작합니다. 루트 기본값이 Full Access이므로 별도 workspace 권한 전환은 필요하지 않습니다. 이 값은 이미 실행 중인 에이전트가 자식 shell에서 설정해도 부모 Hook 환경을 바꾸지 못합니다.

Bootstrap처럼 유지보수 모드 자체를 고치는 경우에는 `/hooks`에서 프로젝트 `PreToolUse`를 잠시 비활성화합니다. Hook 실행기 자체가 전 이벤트에서 실패하면 네 이벤트를 모두 끄고 독립 launcher test를 먼저 통과시킵니다. 수리 후 Hook 정의의 SHA-256 cachebuster를 갱신하고 `/hooks`에서 새 정의를 검토·신뢰한 뒤 이벤트를 하나씩 다시 활성화합니다. 누락되거나 오래된 digest의 Hook은 주 작업에 실패 소음을 만들지 않고 조용히 no-op하며, doctor가 재신뢰 필요를 판정합니다. 유지보수 모드에서도 파괴 명령, 비가역 사람 게이트, 비밀 파일 금지는 해제되지 않습니다.
