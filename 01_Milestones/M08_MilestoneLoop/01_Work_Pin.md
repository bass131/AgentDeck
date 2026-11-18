# work-pin — 작업 좌표 (M08)

세션 재개의 단일 인수인계 표면입니다.
좌표와 마감 요약은 현재 상태만 덮어쓰기로 유지하고, 이력은 git이 보유합니다.
결정과 검증의 정본은 `gate-config.json`의 `planPath`가 가리키는 goal 문서와 그 출발점인 마일스톤 스펙입니다(헌법 2조).

## 좌표

- 로드맵: `01_Milestones/00_Roadmap.md` — M07 사용자 컨트롤(종결) → **M08 마일스톤 루프 장치** → M09 v1 줄기 → M10 설치본과 업데이트(후보).
- 마일스톤 스펙: `01_Milestones/M08_MilestoneLoop/00_마일스톤-스펙.md` — 2026-11-18 합의. goal은 셋(병합 길 장치, 병합 경계 ADR과 안내 글, 마일스톤 회귀 검증과 마일스톤 PR)이고 합의 문답 없이 이어진다(헌법 11조).
- 지난 goal: G1 병합 길 장치 — 종결 (PR 88, `525c57ce`, 사용자 병합). 이 병합이 헌법 10조 효력 날(2026-11-18)이다.
- 지난 goal: G2 병합 경계 ADR과 안내 글 — 종결. PR 89는 검수 반영 전에 사용자가 병합했고(`cfb70214`), 반영분 PR 90은 에이전트가 정형 절차로 병합했다(`5d2ded6e`).
- 현재 goal: **G3 마일스톤 회귀와 PR (실행 중)** — `30_Goal-G3-마일스톤-회귀와-PR.md`, 브랜치 `feat/m08-g3-milestone-close`, 기준 `milestone/m08-milestone-loop`.
- 효력 날 뒤: `master`에서 `milestone/m08-milestone-loop`를 갈랐고(`525c57ce`), G2부터는 goal 브랜치를 그 위에서 갈라 에이전트가 로컬 `git merge --no-ff`로 병합하고 push한다. 병합 조건은 goal PR의 `hard-gates` 통과, 검증 기록 마지막 줄 `PASS`, 강 등급이면 독립 검수 반영이다.
- goal 병합의 정형 절차(G1 독립 검수 중요 5·6): ① goal 브랜치의 마지막 커밋까지 push한다. ② `gh pr view <N> --json headRefOid,statusCheckRollup`으로 `hard-gates` 통과와 머리 SHA를 읽는다(`gh pr checks`·`gh run watch`는 allow 밖이라 무인 루프가 멈춘다). ③ `git fetch origin` 뒤 `git switch milestone/m08-milestone-loop`, `git merge --no-ff -m "<메시지>" origin/<goal 브랜치>` — `--no-ff`를 맨 앞에 두고 전략 옵션(`-s`·`-X`)은 쓰지 않는다. ④ 병합한 `origin/<goal 브랜치>`의 SHA가 ②의 머리 SHA와 같은지 확인한 뒤 `git push -u origin milestone/m08-milestone-loop`.
- push는 항상 `-u origin <브랜치>`로 원격 브랜치를 명시합니다. `master`로 가는 병합은 사용자가 직접 합니다 — 에이전트는 PR 번호와 `gh pr merge <번호> --merge --match-head-commit <SHA>` 한 줄을 알립니다.
- 멈추는 곳: 마일스톤의 완료조건이나 범위를 바꿔야 할 때, FAIL 세 번, 승인 항목(`master` 병합·직접 push, 릴리스, 패키지 배포, 강제 push, 브랜치 삭제).
- 규율: 판정 장치는 마일스톤 스펙 「건드릴 곳」에 이름이 있고 goal 진척 단계에 적힌 것만 고칩니다. 범위 밖 발견은 `M08_MilestoneLoop/99_Backlog.md`에 한 줄로 남깁니다.
- SDK·CLI 동작은 공개 타입·공식 문서·요청이 돌려준 값으로만 검증합니다. 번들 내부를 열람하지 않습니다(사용자 지시). 모델 라우팅 정본은 `00_Documents/02_Rules/02_모델-라우팅-정책.md`입니다.

## 마감 요약 (최신 1건 — 3줄: 바뀐 것 / 내린 결정 / 봐야 할 것)

- 스탬프: 2026-11-18T21:12:32+09:00
- 바뀐 것: 사용자가 G1 PR 88을 병합해(`525c57ce`) 헌법 10조 효력 날이 됐고, `milestone/m08-milestone-loop`를 갈랐습니다. G2(ADR-005, 거부 안내 글 둘, 감시 줄 시험)를 PR 89로 마일스톤 브랜치에 올렸고 `hard-gates`가 통과했습니다.
- 내린 결정: 가드 시험 파일과 SessionStart 훅은 스펙 「건드릴 곳」에 없어 고치지 않고, SessionStart 몫은 M08 Backlog 4로 넘겼습니다.
- 봐야 할 것: G2 독립 검수(중요 5·사소 6)를 반영했고, 새 머리의 `hard-gates`를 확인한 뒤 pin의 정형 절차로 PR 89를 에이전트가 병합합니다. 그다음은 G3 회귀 검증과 마일스톤 PR입니다.
