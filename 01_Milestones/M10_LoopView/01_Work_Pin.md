# work-pin — 작업 좌표 (M10)

세션 재개의 단일 인수인계 표면입니다.
좌표와 마감 요약은 현재 상태만 덮어쓰기로 유지하고, 이력은 git이 보유합니다.
결정과 검증의 정본은 `gate-config.json`의 `planPath`가 가리키는 goal 문서와 그 출발점인 마일스톤 스펙입니다(헌법 2조).

## 좌표

- 로드맵: `01_Milestones/00_Roadmap.md` — M09 앱 안 마일스톤 루프 엔진(종결) → **M10 보이는 루프(실행 중)** → M11 헌장·Taste 문답과 사용량 한도 → M12 설치본과 업데이트(후보).
- 마일스톤 스펙: `01_Milestones/M10_LoopView/00_마일스톤-스펙.md` — 2026-11-19 합의. goal 일곱(모드 정리와 로드맵, 메인 대화 엔진, 메인 대화 화면, 작업 모드 화면, 그래프 캔버스와 알림, 연습 저장소 실주행과 재개, 회귀와 마일스톤 PR — 옛 후보 2를 G2·G3로 나눔). 화면 시안 `10_화면-시안.html`.
- 마일스톤 브랜치: `milestone/m10-loop-view`(`b202b3be`에서 가름 — `master` `1e8347d6`과 M09 종결 기록).
- 종결 goal: G1 모드 정리와 로드맵 — PR 100, 로컬 병합 `c0e89709`. G2 메인 대화 엔진 — PR 101, 로컬 병합 `5e765317`. G3 메인 대화 화면 — PR 102, 로컬 병합 `e36fc335`(모두 2026-11-19). G4 작업 모드 화면 — PR 103, 로컬 병합 `b47fbfb4`. G5 그래프 캔버스와 알림 — PR 104, 로컬 병합 `6b0db900`(모두 2026-11-20).
- 현재 goal: **G6 연습 저장소 실주행과 재개** — `01_Milestones/M10_LoopView/60_Goal-G6-연습-저장소-실주행과-재개.md`, 작업 브랜치 `feat/m10-g6-practice-run`. 연습 저장소 clone `C:\Dev\AgentDeck_Test`(지금 `milestone/M01`, 로컬 `.agentdeck/`에 M01 끝난 실행 상태).
- 연습 저장소: `bass131/AgentDeck_Test`(공개, 기본 브랜치 `main`, 룰셋 `main-protect`). G6 실주행의 사람 몫은 메인이 e2e로 대행한다(5회차 [USER·위임]).
- goal 병합의 정형 절차: ① goal 브랜치를 push하고 독립 검수를 PR 전에 반영한다. ② `gh pr view <N> --json headRefOid,statusCheckRollup`으로 `hard-gates`와 머리 SHA를 읽는다. ③ `git fetch origin` 뒤 로컬 마일스톤 브랜치가 원격과 같은지 확인하고 `git switch milestone/m10-loop-view`, `git merge --no-ff -m "<메시지>" origin/<goal 브랜치>`. ④ 병합한 SHA가 머리 SHA와 같은지 확인한 뒤 `git push -u origin milestone/m10-loop-view`. 작업 트리는 병합 전에 깨끗해야 한다(PASS 줄과 pin 스탬프를 함께 커밋).
- push는 항상 `-u origin <브랜치>`로 원격 브랜치를 명시합니다. `master`로 가는 병합은 사용자가 직접 합니다.
- 멈추는 곳: 마일스톤의 완료조건이나 범위를 바꿔야 할 때, FAIL 세 번, 승인 항목(`master` 병합·직접 push, 릴리스, 패키지 배포, 강제 push, 브랜치 삭제, 저장소 만들기·설정 변경).
- 규율: 판정 장치는 마일스톤 스펙 「건드릴 곳」에 이름이 있는 것(`gate-config.json`, 편집 계획 게이트 `plan-verdict.cjs` 판정 ③과 그 시험)만 고칩니다. 범위 밖 발견은 `M10_LoopView/99_Backlog.md`에 한 줄로 남깁니다. 파일 편집은 Edit·Write로만 합니다(헌법 8조).
- SDK·CLI 동작은 공개 타입·공식 문서·요청이 돌려준 값으로만 검증합니다. 번들 내부를 열람하지 않습니다(사용자 지시).

## 마감 요약 (최신 1건 — 3줄: 바뀐 것 / 내린 결정 / 봐야 할 것)

- 스탬프: 2026-11-20T13:54:52+09:00
- 바뀐 것: G6 독립 검수(중요 0, 사소 6·경계선 1)를 반영해 게이트 다섯 종·`npm test` 9117 실패 0으로 `037f13a7`을 push하고 PR 105를 마일스톤 브랜치로 열었습니다.
- 내린 결정: 보관 도중 꺼짐이 위조 래치로 뜨는 것은 풀면 수렴하므로 남겼고, 범위 밖 관찰은 Backlog 17·21~24로 보냈습니다.
- 봐야 할 것: PR 105의 `hard-gates` 통과를 확인하면 정형 절차로 병합하고 G7(회귀와 마일스톤 PR)로 갑니다.
