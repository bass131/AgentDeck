# AgentDeck Codex Harness

기존 Claude Code Harness를 정본으로 유지하면서 Codex가 같은 프로젝트 계약을 따르도록 연결하는 호환 레이어입니다.

## 구성

| 경로 | 역할 | 정본 여부 |
|---|---|---|
| `AGENTS.md` | Codex가 세션 시작 시 자동으로 읽는 진입점 | Codex 호환 규칙 |
| `.codex/config.toml` | 프로젝트 hooks와 multi-agent 한도 | Codex 전용 |
| `.codex/hooks.json` | Codex lifecycle hook 등록 | Codex 전용 |
| `.codex/hooks/agentdeck-hook.mjs` | Codex payload를 해석하는 guardrail | Codex 전용 어댑터 |
| `.codex/agents/*.toml` | Claude 역할 정의를 가리키는 custom agents | Codex 전용 래퍼 |
| `.agents/skills/**` | Claude 스킬·명령을 호출하는 Codex skills | Codex 전용 래퍼 |
| `CLAUDE.md`, `.claude/**` | 헌법, 정책, 역할, 워크플로, Claude hooks | 공용 의미 규칙의 정본 |

## 처음 활성화할 때

1. Codex에서 이 Worktree를 프로젝트로 열고 신뢰(trust)합니다. 신뢰하지 않은 프로젝트의 `.codex/**` 설정과 hooks는 로드되지 않습니다.
2. 새 세션을 시작합니다. `AGENTS.md` instruction chain은 세션 시작 시 구성됩니다.
3. `/hooks`를 열어 `.codex/hooks.json`의 명령을 검토하고 신뢰합니다. 파일이 바뀌면 hash가 바뀌므로 다시 검토해야 합니다.
4. `/skills`에서 `work-plan`, `work-run`, `session-start` 등의 repo skill이 보이는지 확인합니다.
5. custom agent 목록에서 `main-process`, `agent-backend`, `renderer`, `shared-ipc`, `qa`, `secretary`, `coordinator`, `reviewer`, `plan-auditor`가 보이는지 확인합니다.

Codex는 공식적으로 프로젝트 루트부터 현재 디렉터리까지 `AGENTS.md`와 `.codex/config.toml`을 탐색합니다. 프로젝트 skills는 `.agents/skills`에서, custom agents는 `.codex/agents`에서 탐색합니다.

## 상태 분리

Codex 세션은 `.codex/state/current-pin.txt`와 `.codex/state/circuit-breaker.json`을 사용합니다. 이 디렉터리는 Git에서 제외됩니다. Claude의 `.claude/state/**`를 그대로 쓰지 않는 이유는 두 엔진 또는 두 Worktree가 동시에 실행될 때 런타임 좌표가 서로 덮어써지는 것을 막기 위해서입니다.

work-pin이 없으면 prompt hook은 이전 설치와의 호환을 위해 `.claude/state/current-pin.txt`를 읽습니다. 새 Codex 작업은 `.codex/state/current-pin.txt`에 기록합니다.

## 적용되는 gate

- 사용자 prompt마다 work-pin과 미커밋 `-DONE.md` 경고 주입.
- 서브에이전트 시작 시 대응하는 `.claude/agents/<role>.md` 정본 경로 주입.
- 강제 삭제, 강제 push, hard reset, 디스크 포맷 등 파괴 명령 차단.
- `AGENTS.md`, `CLAUDE.md`, `.claude/**`, `.codex/**`, `.agents/skills/**` 하네스 편집 차단.
- 구현 파일을 테스트보다 먼저 편집하면 TDD 차단.
- trust-boundary, backend-contract, shared-contract 위험 깃발 알림.
- 공유계약·preload·AgentBackend 변경 뒤 reviewer 권고.
- 완료 보고 5단계와 800줄 초과 파일 경고.
- 짧은 시간에 편집을 반복하면 circuit-breaker 경고.

## Claude hooks를 직접 재사용하지 않은 이유

Claude의 Edit/Write hook payload는 `tool_input.file_path`를 제공하지만, Codex의 파일 편집은 `apply_patch`와 `tool_input.command`를 사용합니다. 기존 shell hook을 그대로 연결하면 파일 경로 기반 TDD·위험·reviewer gate가 실행되지 않습니다. Codex 어댑터는 patch의 Add/Update/Delete/Move 경로를 추출한 뒤 같은 의미의 규칙을 적용합니다.

## 한계

Codex의 `PreToolUse` hook은 모든 shell 실행 경로와 WebSearch를 가로채는 완전한 보안 경계가 아닙니다. 따라서 hooks는 실수 방지 장치이며, 실제 안전성은 sandbox/approval, `AGENTS.md`, Electron 신뢰 경계, 사람 게이트와 함께 유지합니다.

공식 참고 문서:

- <https://learn.chatgpt.com/docs/agent-configuration/agents-md>
- <https://learn.chatgpt.com/docs/config-file/config-advanced#project-config-files-codexconfigtoml>
- <https://learn.chatgpt.com/docs/hooks>
- <https://learn.chatgpt.com/docs/build-skills>
- <https://learn.chatgpt.com/docs/agent-configuration/subagents>
