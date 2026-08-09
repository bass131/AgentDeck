# M01 Phase 4 — 훅 7종 이식·활성화

## Phase 4 — 훅 7종 이식·활성화 · 태그: `harness` · 의존: Phase 3

**목표**: Moodie의 코어 훅 일곱 종이 AgentDeck 좌표에 맞게 수정돼 `.claude/hooks/`에 있고, `settings.json`에 등록돼 실제로 발화한다. 훅의 회귀는 `npm run test:hooks`가 잡는다.

Steps

1. 훅 일곱 종을 아래 수정표대로 옮긴다. 무수정 항목도 파일을 그대로 복사했는지 대조한다.
2. fixtures(훅 검증용 합성 입력 묶음)를 선별 이식하고 러너를 개작한다.
3. 스모크 러너를 새로 만들어 `npm run test:hooks`에 편입한다. 이렇게 해야 커밋 전 하드 게이트가 하네스 회귀를 잡는다.
4. 미러에서 스모크를 전건 돌려 통과를 확인하고 먼저 커밋한다.
5. 마지막에 `settings.json`을 병합한다. 이 편집이 세션의 최후 파일 편집이다 — 병합 순간부터 훅이 살아나므로 그 뒤에 다른 편집을 하면 순서가 꼬인다.
6. 병합 커밋을 남기고 세션을 종료한다. 발화 실측은 다음 Phase의 새 세션이 한다.

훅 이식 수정표

| 훅 | 수정 |
|---|---|
| 10_start-brief | 무수정 |
| 20_plan-gate | 폴백 경로를 AgentDeck M01 좌표로 교체 |
| 30_role-gate | 무수정. 허용 디렉터리 목록의 `01_milestones`가 그대로 일치한다 |
| 33_tdd-guard | `AGENTDECK` 상수를 `ROOT`로 접고, 테스트 경로 접두사를 `02_project/01_testcode/`로 바꾼다. 미러에서 red와 green을 모두 확인한다 |
| 40_pass-watcher | 폴백을 교체하고, 리셋 상태 상수와 리셋 장전 세 줄, 머리 주석, 로그 문구를 일괄 소거한다. 수정 전에는 리셋 파일이 생기고 수정 후에는 생기지 않는 것을 미러에서 확인한다 |
| 41_line-limit | 무수정. 이 훅은 편집을 되돌리지 않고 사후 피드백만 준다 |
| 50_stop-gate | 무수정 |
| fixtures | 선별 이식하고 러너를 개작한다. 리셋 게이트 시나리오만 제거하고 33·40·50의 세션 격리 회귀는 유지한다. 절대 경로는 `CLAUDE_PROJECT_DIR` 파라미터로 바꾼다. `reset-probe.md`는 제외한다 |
| 스모크 러너 | 새로 만들어 이식 훅 일곱 종의 fixtures 구동을 `npm run test:hooks`에 편입한다 |
| spawn-probe.cjs | `98_Management/03_Tools/`로 이식한다 |

settings.json 병합 내용은 기존 permissions를 유지한 채 `"Agent"` allow를 더하고, hooks는 기존 Bash 가드를 유지하면서 Task와 Agent를 20에, 편집 전을 30 다음 33에, 편집 후를 41 다음 40 다음 33에, Bash 후를 33에, SessionStart를 10에, Stop을 50에 건다. SessionEnd는 등록하지 않는다.

DoD

- 미러 스모크가 전건 통과한다. 하나라도 실패하면 병합으로 진행하지 않는다.
- 스모크 통과 커밋이 `settings.json` 병합 커밋보다 앞선다. 커밋 순서가 뒤집히면 불통과다.
- 실제 `98_Management/01_GateState/`는 이 Phase가 끝난 시점에도 `gate-config.json` 단독이다. 상태 파일은 다음 Phase의 실발화가 만든다.
- `settings.json` 병합 이후 이 세션에서 추가 파일 편집이 없다.

검증 기록

- (기록 없음)
