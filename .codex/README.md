# AgentDeck Codex Harness

기존 Claude Code Harness를 정본으로 유지하면서 Codex가 같은 프로젝트 계약을 따르도록 연결하는 호환 레이어입니다.

## 구성

| 경로 | 역할 | 정본 여부 |
|---|---|---|
| `AGENTS.md` | Codex가 세션 시작 시 자동으로 읽는 진입점 | Codex 호환 규칙 |
| `.codex/config.toml` | 프로젝트 hooks, multi-agent 한도, permission profiles | Codex 전용 |
| `.codex/hooks.json` | Codex lifecycle hook 등록 | Codex 전용 |
| `.codex/hooks/agentdeck-hook.mjs` | Codex payload를 해석하는 guardrail | Codex 전용 어댑터 |
| `.codex/agents/*.toml` | Claude 역할 정의를 가리키는 custom agents | Codex 전용 래퍼 |
| `.codex/rules/agentdeck.rules` | 비가역 명령 prompt와 임의 다운로드 forbidden | Codex 전용 execpolicy |
| `.codex/harness-doctor.mjs` | 정적 계약과 새 세션 live acceptance 분리 검사 | Codex 전용 검증기 |
| `.agents/skills/**` | Claude 스킬·명령을 호출하는 Codex skills | Codex 전용 래퍼 |
| `CLAUDE.md`, `.claude/**` | 헌법, 정책, 역할, 워크플로, Claude hooks | 공용 의미 규칙의 정본 |

## 처음 활성화할 때

1. Codex에서 이 Worktree를 프로젝트로 열고 신뢰(trust)합니다. 신뢰하지 않은 프로젝트의 `.codex/**` 설정과 hooks는 로드되지 않습니다.
2. 새 세션을 시작합니다. `AGENTS.md` instruction chain은 세션 시작 시 구성됩니다.
3. `/hooks`를 열어 `.codex/hooks.json`의 명령을 검토하고 신뢰합니다. 각 명령은 `agentdeck-hook.mjs`의 SHA-256 digest를 인자로 포함하므로 script 본문이 바뀌면 `hooks.json` 정의도 함께 바뀌어 재검토 대상이 됩니다.
4. `/skills`에서 `work-plan`, `work-run`, `session-start` 등의 repo skill이 보이는지 확인합니다.
5. custom agent 목록에서 `main-process`, `agent-backend`, `renderer`, `shared-ipc`, `qa`, `secretary`, `coordinator`, `reviewer`, `plan-auditor`가 보이는지 확인합니다.
6. `node .codex/harness-doctor.mjs --live`를 실행해 `STATIC: PASS`와 `LIVE-CANARY: PASS`를 확인하고, 출력된 `LIVE: PENDING` UI 항목을 새 세션에서 확인합니다.

Codex는 공식적으로 프로젝트 루트부터 현재 디렉터리까지 `AGENTS.md`와 `.codex/config.toml`을 탐색합니다. 프로젝트 skills는 `.agents/skills`에서, custom agents는 `.codex/agents`에서 탐색합니다.

## 역할별 모델 비용 계층

| 용도 | 역할 | Codex 기본값 | 이유 |
|---|---|---|---|
| 복잡한 판단·통합 | `coordinator`, `reviewer`, `plan-auditor` | Sol high | 모호성·다중 트레이드오프가 큼 |
| 일반 구현·테스트 | `main-process`, `agent-backend`, `renderer`, `shared-ipc`, `qa` | Terra medium/high | 능력과 비용의 균형 |
| 명확한 운영 | `secretary` | Luna low | 반복 가능하고 완료 조건이 명확함 |

정확한 model slug는 `.codex/agents/*.toml`에 둡니다. 위험한 구현은 Sol 상향을 우선하지만, 현재 host의 호출 표면이 custom profile을 실제 적용하는지는 model label을 새 세션에서 확인하기 전까지 `LIVE: PENDING`입니다. 정적 TOML 검사를 실제 적용 증거로 가장하지 않습니다.

## 권한 계층

- root Supervisor: `:danger-full-access` — 오케스트레이션과 Harness 유지보수의 Windows sandbox 마찰 제거
- coordinator, reviewer, plan-auditor: `agentdeck-readonly`
- 구현 Worker: 역할별 `agentdeck-main-process`, `agentdeck-agent-backend`, `agentdeck-renderer`, `agentdeck-shared-ipc`, `agentdeck-qa`
- secretary: `agentdeck-operations` — Phase·보고서·CHANGELOG 중심 최소 쓰기
- SubAgent 공통: `.env*`, `secrets/**` deny-read
- execpolicy: push/PR/merge/release/package/publish는 `prompt`, curl/wget/Invoke-WebRequest는 `forbidden`

permission profile과 project rules는 trusted project의 새 세션에서 적용됩니다. Full Access root는 sandbox deny-read를 상속하지 않으므로 비밀 파일 금지를 `AGENTS.md`, Hook, execpolicy와 사람 게이트로 지킵니다. Hook은 SubAgent의 권한 계층을 대신하지 않습니다.

Codex가 보호하는 `.codex/**` 아래의 runtime state는 sandboxed secretary에 write로 승격하면 Windows sandbox setup이 실패합니다. secretary는 pin 갱신안을 반환하고 Full Access root가 `.codex/state/current-pin.txt`를 반영합니다.

`harness-doctor --live`는 실제 역할에 배정된 permission profile 7개의 Windows 초기화, 격리 canary workspace root의 역할별 허용·차단 경계 16개, 네 Hook launcher, Sol·Terra·Luna model catalog를 실제 자식 프로세스로 검사합니다. canary는 저장소와 `:tmpdir` 밖의 검증된 형제 경로에 만들고 생성한 디렉터리만 제거합니다. Secretary는 build의 `out/`과 E2E의 `artifacts/`·`test-results/`만 추가로 쓸 수 있습니다. 정적 TOML이 맞아도 sandbox setup이나 경로 경계가 실패하는 경우를 이 단계에서 잡습니다.

## 상태 분리

Codex 세션은 `.codex/state/current-pin.txt`와 `.codex/state/circuit-breaker.json`을 사용합니다. 이 디렉터리는 Git에서 제외됩니다. Claude의 `.claude/state/**`를 그대로 쓰지 않는 이유는 두 엔진 또는 두 Worktree가 동시에 실행될 때 런타임 좌표가 서로 덮어써지는 것을 막기 위해서입니다.

work-pin이 없으면 빈 Codex 세션으로 시작합니다. `.claude/state/**`를 호환 fallback으로 읽지 않으며, 새 Codex 작업은 `.codex/state/current-pin.txt`에만 기록합니다.

## Hook 격리 계약

- Claude: `.claude/settings.json` → `.claude/hooks/**` → `.claude/state/**`
- Codex: `.codex/hooks.json` → `.codex/hooks/**` → `.codex/state/**`
- 한쪽 Hook은 다른 쪽 Hook 파일을 import·source·실행하지 않고, 다른 쪽 runtime state를 읽거나 쓰지 않습니다.
- `CLAUDE.md`, `.claude/policies/**`, `.claude/agents/**`는 제품 규칙과 역할 의미의 정본으로 계속 공유합니다. 공유 문서를 읽는 것은 Hook/runtime 결합이 아닙니다.

## 적용되는 gate

- 사용자 prompt마다 work-pin과 미커밋 `-DONE.md` 경고 주입.
- 서브에이전트 시작 시 대응하는 `.claude/agents/<role>.md` 정본 경로 주입.
- 강제 삭제, 강제 push, hard reset, 디스크 포맷 등 파괴 명령 차단.
- `AGENTS.md`, `CLAUDE.md`, `.claude/**`, `.codex/**`, `.agents/skills/**` 하네스 편집 차단. 사용자 승인 유지보수 세션만 아래 절차로 제한 해제.
- 구현 파일을 테스트보다 먼저 편집하면 TDD 차단.
- trust-boundary, backend-contract, shared-contract 위험 깃발 알림.
- 공유계약·preload·AgentBackend 변경 뒤 reviewer 권고.
- 새 문서 또는 `gate_version: 1` 완료 보고는 frontmatter·필수 H2·AC 명령/결과·HTML 5단계 페어를 엄격 검사(`exit 2`). 기존 추적 문서 중 버전 필드가 없는 파일은 유예 경고.
- 800줄 초과 파일 경고.
- 짧은 시간에 편집을 반복하면 circuit-breaker 경고.

## Harness 유지보수

일반 세션에서는 Harness 편집이 봉인됩니다. 사용자가 범위를 승인한 유지보수는 부모 Codex 프로세스를 다음 환경으로 시작합니다. 루트는 기본 Full Access라 별도 workspace 권한 전환이 필요하지 않습니다.

```powershell
$env:AGENTDECK_HARNESS_MAINTENANCE='1'
codex
```

이 환경 변수는 부모 프로세스 시작 시점에만 유효합니다. 에이전트가 자식 shell에서 값을 설정해도 이미 실행 중인 Hook 권한은 바뀌지 않습니다. 유지보수 모드도 파괴 명령과 비가역 사람 게이트를 해제하지 않습니다.

유지보수 모드 자체를 처음 도입하거나 고치는 Bootstrap에서는 `/hooks`에서 project `PreToolUse`를 잠시 Disable할 수 있습니다. Hook 실행기 자체가 전 이벤트에서 실패하면 네 이벤트를 모두 끄고 독립 launcher test를 통과시킨 뒤 하나씩 다시 켭니다. script 변경 중 누락되거나 오래된 SHA-256 명령은 exit 0 no-op하므로 주 작업에 실패 배너를 만들지 않습니다. `harness-doctor`가 digest 불일치를 잡고, 작업 완료 후 `/hooks`에서 변경된 정의를 재신뢰합니다.

## Claude hooks를 직접 재사용하지 않은 이유

Claude의 Edit/Write hook payload는 `tool_input.file_path`를 제공하지만, Codex의 파일 편집은 `apply_patch`와 `tool_input.command`를 사용합니다. 기존 shell hook을 그대로 연결하면 파일 경로 기반 TDD·위험·reviewer gate가 실행되지 않습니다. Codex 어댑터는 patch의 Add/Update/Delete/Move 경로를 추출한 뒤 같은 의미의 규칙을 적용합니다.

## 한계

Codex의 `PreToolUse` hook은 모든 shell 실행 경로와 WebSearch를 가로채는 완전한 보안 경계가 아닙니다. 따라서 hooks는 실수 방지 장치이며, 실제 안전성은 permission profile, sandbox/approval, execpolicy rules, `AGENTS.md`, Electron 신뢰 경계, 사람 게이트와 함께 유지합니다.

또한 현재 공식 `PreToolUse` payload에는 루트와 서브에이전트를 구분하는 `agent_type`이 없습니다. Claude `supervisor-guard`의 루트 전용 차단을 Codex Hook이 그대로 구현한다고 주장하지 않으며, Codex의 Supervisor 전임은 `AGENTS.md`와 custom agent 지시·권한으로 유지합니다.

공식 참고 문서:

- <https://learn.chatgpt.com/docs/agent-configuration/agents-md>
- <https://learn.chatgpt.com/docs/config-file/config-advanced#project-config-files-codexconfigtoml>
- <https://learn.chatgpt.com/docs/hooks>
- <https://learn.chatgpt.com/docs/build-skills>
- <https://learn.chatgpt.com/docs/agent-configuration/subagents>
