# M01 Phase 1 — 착륙지·계획 등재

## Phase 1 — 착륙지·계획 등재 · 태그: `structure` · 의존: 없음

**목표**: AgentDeck 안에 이 마일스톤의 계획 문서와 규격 문서, 헌법, 게이트 좌표 파일이 실물로 존재한다. Moodie의 원본 훅을 이 저장소의 문서에 겨눠 구동해도 통과 판정이 나오는 상태가 된다.

Steps

1. `01_Milestones/M01_Bootstrap/`을 만들고 `_MilestonePreview.md`와 Phase 파일 여섯 개, `01_Work_Pin.md`를 작성한다. Phase 머리줄에는 도메인 태그와 의존을 반드시 표기한다.
2. `98_Management/01_GateState/gate-config.json`만 단독으로 만든다. 상태 파일과 로그 파일은 미리 만들지 않는다 — 훅이 처음 발화할 때 스스로 만들게 두어야 실제 발화와 사전 조작을 구분할 수 있다.
3. `98_Management/00_ADR/ADR-001-부트스트랩-이식-결정.md`에 이번 이식에서 내린 되돌리기 어려운 결정을 박제한다.
4. `00_Documents/`를 다섯 갈래(00_Architecture·01_PRD·02_Rules·03_Reports·04_Design)로 만들고, Moodie의 규칙 문서 세 종을 `02_Rules`에 복사한다.
5. 루트에 `CLAUDE.md`와 `AGENTS.md`를 만들어 헌법 조항을 적는다. `.agents/skills` 두 종이 참조하던 없는 파일 목록을 실존 파일로 고친다.
6. 남아 있던 오래된 상태 파일을 `99_Others/98_V1_Archive/` 아래로 옮기고, `.gitignore`에서 사라진 경로를 지우고 새 게이트 상태 경로를 더한다.
7. 스크래치 폴더에 계획 문서와 gate-config만 담은 미러를 만들고, `CLAUDE_PROJECT_DIR`를 그 미러로 지정해 Moodie 원본 훅 두 종을 stdin으로 구동한다.

DoD

- 미러에서 `20_plan-gate.cjs`를 `{"session_id":"probe","tool_name":"Task","tool_input":{}}` 입력으로 구동하면 출력이 없고 종료 코드가 0이다. 반려 JSON이 나오면 불통과다.
- 미러에서 `10_start-brief.cjs`를 구동하면 생존 문서 네 종(Phase-Steps·결정 대장·검증 기록·work-pin)이 모두 실존으로 판정된 브리프가 나온다. 결손 경고 줄이 있으면 불통과다.
- `98_Management/01_GateState/`에는 `gate-config.json` 한 파일만 있다. 상태 json이나 hook-log가 미리 있으면 불통과다.
- 이 저장소 루트에 `CLAUDE.md`와 `AGENTS.md`가 있고, 둘 다 검증 기록 조항과 `--resume` 금지 조항을 담고 있다.
- `.claude/state/`의 고아 로그 세 개와 `.codex/state/` 전체가 `99_Others/98_V1_Archive/` 아래에 있고, 원래 위치에는 남아 있지 않다. 어느 파일도 삭제되지 않았다.

검증 기록

- PASS 2026-08-09T19:01:28+09:00 — 미러에서 Moodie 원본 `20_plan-gate.cjs`를 `{"session_id":"probe","tool_name":"Task","tool_input":{}}` 입력으로 구동해 무출력 종료 코드 0을 확인했다. 미러의 hook-log에 판정 4종 통과가 기록됐고, 사람용 개요 검사는 true, 결정 대장 집계는 사용자 6건에 에이전트 0건, Phase 파일 6개 병합이 잡혔다.
- PASS 2026-08-09T19:01:37+09:00 — 미러에서 Moodie 원본 `10_start-brief.cjs`를 구동해 생존 문서 네 종이 모두 실존으로 판정된 브리프를 확인했다. 결손 경고 줄은 없고 work-pin 전문이 재부착됐으며, source는 startup이라 resume이 아니다.
- PASS 2026-08-09T19:05+09:00 — 파일 상태 DoD 세 건을 확인했다. `98_Management/01_GateState/`는 `gate-config.json` 단독이고, 루트에 `CLAUDE.md`와 `AGENTS.md`가 검증 기록 조항과 `--resume` 금지 조항을 담고 있으며, 고아 상태 파일 다섯 개가 삭제 없이 `99_Others/98_V1_Archive/` 아래로 옮겨졌다.
