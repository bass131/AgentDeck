# AgentDeck Codex Harness — 전담 보조

Claude Code Harness를 정본으로 유지하면서, Codex(Sol)를 **전담 보조**(코드 리뷰 · 문제 진단 · rescue · 세컨드 오피니언)로 연결하는 경량 어댑터입니다. 안전 규칙의 의미 정본은 `00.Documents/harness/CORE.md`(CORE-01~13, ADR-034 3층 구조)이고, 이 폴더는 "Codex에서 어떻게 강제하는가"만 소유합니다. 옛 풀 드라이버 조직(워커 9종·운영 루프 브리지 8종)은 ADR-033 개정 1(2026-07-12)로 폐기됐습니다.

## 구성

| 경로 | 역할 |
|---|---|
| `AGENTS.md` | Codex가 세션 시작 시 자동으로 읽는 진입점 — 전담 보조 계약 |
| `.codex/config.toml` | 권한 프로필 3종(`agentdeck-assistant`·`agentdeck-rescue`·`agentdeck-readonly`), root 기본 = assistant |
| `.codex/hooks.json` + `hooks/agentdeck-hook.mjs` | 4이벤트 guardrail — pin 주입 / **시크릿 직접 참조 차단**·파괴 명령·하네스 봉인·TDD / 완료 게이트·알림 |
| `.codex/agents/*.toml` | 점검 subagent 2종 — `reviewer` · `plan-auditor` (읽기 전용, gpt-5.6-sol) |
| `.codex/rules/agentdeck.rules` | execpolicy — push/PR/merge/release/package/publish = prompt, curl/wget = forbidden |
| `.codex/harness-doctor.mjs` | 정합 검사 — STATIC + LIVE 3축(HOOK-GUARD / OS-READ-BOUNDARY / WRITE-BOUNDARY) + baseline 튜플 |
| `.agents/skills/**` | 스킬 브리지 2종 — `agentdeck-review` · `harness-review` (정본 참조 래퍼만) |

## 권한 모델

- **root 기본 `agentdeck-assistant`**: 읽기 전용 + `:tmpdir` 쓰기. 리뷰·진단은 읽기로 충분하고, 개별 쓰기는 승인 승격을 거칩니다.
- **rescue**: `codex -c default_permissions="agentdeck-rescue"` 로 기동 — `02.Source/**`·`99.Others/tests/**`만 쓰기(full-access 아님, 영호 결정 2026-07-12).
- **유지보수**: 사용자 승인 세션만 `AGENTDECK_HARNESS_MAINTENANCE=1` + full-access 명시 기동. 환경 변수는 훅 봉인만 해제할 뿐 쓰기 권한을 주지 않으므로 권한 전환이 별도로 필요합니다.
- **실측 한계(2026-07-12, codex-cli 0.144.0 / native Windows 11)**: sandbox는 쓰기 경계만 강제하고 **읽기 deny는 강제하지 못합니다**. 시크릿 읽기 차단은 훅(pre-tool)이 담당하며, "기계적 예방 가드레일 — 부분 보장"으로만 선언합니다(ADR-033 개정 1 — 변수 조립·인코딩·간접 참조·비신뢰 훅 no-op·non-shell 호스트 도구는 탐지 범위 밖).

## 처음 활성화할 때

1. Codex에서 이 저장소를 신뢰(trust)합니다 — 신뢰 전에는 `.codex/**` 설정과 hooks가 로드되지 않습니다.
2. 새 세션에서 `/hooks`를 열어 `.codex/hooks.json` 정의를 검토·신뢰합니다. 각 명령은 `agentdeck-hook.mjs`의 SHA-256 digest를 인자로 포함하므로 script 본문이 바뀌면 정의도 바뀌어 재검토 대상이 됩니다.
3. `/permissions`에서 root 기본이 `agentdeck-assistant`인지, `/skills`에서 브리지 2개, custom agents 2개(model label = gpt-5.6-sol)를 확인합니다.
4. `node .codex/harness-doctor.mjs --live` — `STATIC: PASS` + `HOOK-GUARD: PASS` + `OS-READ-BOUNDARY: UNENFORCED_EXPECTED` + `LIVE-CONFORMANCE: ACCEPTED_WITH_LIMITATION` 확인. exit 3(`REVALIDATION_REQUIRED`)이면 CLI 버전이 baseline 기록(`00.Documents/harness/codex-baseline.json`)과 달라진 것 — 격리 canary로 읽기 deny 실태를 재실측한 뒤 baseline 기록과 ADR-033 재실측 이력을 갱신합니다(기록 파일은 봉인 밖이라 봉인 해제 불필요).
5. 시크릿 차단 라이브 프로브: `type .env` 요청이 훅에 거부되는지 확인합니다.

## 상태 분리와 Hook 격리 (CORE-12)

- Codex 세션은 `.codex/state/current-pin.txt`·`.codex/state/circuit-breaker.json`만 사용합니다(Git 제외 대상). work-pin이 없으면 빈 세션으로 시작하며 `.claude/state/**`를 폴백으로 읽지 않습니다.
- Claude: `.claude/settings.json` → `.claude/hooks/**` → `.claude/state/**` / Codex: `.codex/hooks.json` → `.codex/hooks/**` → `.codex/state/**`. 한쪽 Hook은 다른 쪽 Hook 파일을 import·source·실행하지 않고, 다른 쪽 runtime state를 읽거나 쓰지 않습니다.
- `CLAUDE.md`·`.claude/policies/**`·`.claude/agents/**`는 정책·역할 의미의 정본으로 계속 *읽기* 공유합니다 — 공유 문서를 읽는 것은 Hook/runtime 결합이 아닙니다.

## 적용되는 gate

- 사용자 prompt마다 work-pin과 미커밋 `-DONE.md` 경고 주입.
- 서브에이전트 시작 시 대응하는 `.claude/agents/<role>.md` 정본 경로 주입.
- **`.env*`·`secrets/` 직접 참조(읽기·쓰기·편집) 차단 — 유지보수 모드에서도 미해제 (CORE-03).**
- 강제 삭제, 강제 push, hard reset, 디스크 포맷 등 파괴 명령 차단 (CORE-07).
- `AGENTS.md`, `CLAUDE.md`, `.claude/**`, `.codex/**`, `.agents/skills/**` 하네스 편집 차단 — 사용자 승인 유지보수 세션만 해제 (CORE-11).
- 구현 파일을 테스트보다 먼저 편집하면 TDD 차단 (CORE-05).
- trust-boundary·backend-contract·shared-contract 위험 깃발 알림, reviewer 권고.
- `gate_version: 1` 완료 보고 strict 검사, 800줄 초과 경고, circuit-breaker 경고.

## Claude hooks를 직접 재사용하지 않은 이유

Claude의 Edit/Write hook payload는 `tool_input.file_path`를 제공하지만, Codex의 파일 편집은 `apply_patch`와 `tool_input.command`를 사용합니다. 기존 shell hook을 그대로 연결하면 경로 기반 gate가 실행되지 않으므로, Codex 어댑터는 patch의 Add/Update/Delete/Move 경로를 추출해 같은 *의미*의 규칙을 독립 구현합니다 (CORE-12).

## 한계

Codex의 `PreToolUse`는 모든 실행 경로를 가로채는 보안 경계가 아닙니다. hooks는 실수 방지 장치이고, 실제 안전성은 permission profile(쓰기 경계 실강제) + approval 승격 + execpolicy + `AGENTS.md` + 사람 게이트가 겹으로 유지합니다. 시크릿 *읽기*의 OS 수준 차단은 현 버전 Windows에서 불가능함이 실측됐고, 그 공백은 훅 차단(부분 보장)과 attended 운영으로 보상합니다 — 이 한계를 성공으로 가장하지 않습니다.

공식 참고 문서:

- <https://learn.chatgpt.com/docs/agent-configuration/agents-md>
- <https://learn.chatgpt.com/docs/config-file/config-advanced#project-config-files-codexconfigtoml>
- <https://learn.chatgpt.com/docs/hooks>
- <https://learn.chatgpt.com/docs/build-skills>
