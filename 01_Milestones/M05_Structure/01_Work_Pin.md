# work-pin — 작업 좌표 (M05)

세션 재개의 단일 인수인계 표면입니다.
좌표와 마감 요약은 현재 상태만 덮어쓰기로 유지하고, 이력은 git이 보유합니다.
결정과 검증의 정본은 `gate-config.json`의 `planPath`가 가리키는 goal 문서입니다.

## 좌표

- 로드맵: `01_Milestones/00_Roadmap.md` — M04 마감 → M05 구조 감사와 재편 → M06 자가 개발 → M07 실전 투입. 이 로드맵의 goal들은 헌법 11조의 일회 예외로 합의 문답 없이 이어집니다.
- 마일스톤: **M05 구조 감사와 도메인별 재편** — goal 파일은 `10_Goal-G1-…`, `20_Goal-G2-…` 순서로 이 폴더에 둡니다.
- 현재 goal: **H3 현황판 저장소 편입** (`98_Goal-H3-현황판-저장소-편입.md`, 약 등급) — 작업 브랜치는 `chore/dashboard-into-repo`이고 `origin/master`에서 시작했습니다. 본 줄기 G10(`chore/m05-g10-ipc-typemap`, 7단계 검수 대기)과 G9c(PR 49)는 이 goal 병합 뒤 master를 받아 이어 갑니다.
- Night Shift는 끝났습니다(2026-11-14 아침, 사용자가 PR 40~43 병합을 승인). goal마다 PR 뒤 병합 승인을 받고 다음 goal로 갑니다. 이 브랜치는 `origin/master`를 추적하므로 push는 항상 `-u origin <브랜치>`로 원격 브랜치를 명시합니다.
- 멈추는 곳: 범위나 완료조건을 바꿔야 할 때, FAIL 세 번, 승인 항목(PR 병합, `master` 직접 push, 릴리스, 패키지 빌드·배포, 강제 push, 브랜치 삭제)입니다.
- 규율: 판정 장치(`.claude/hooks/`, `.claude/settings.json`, `98_Management/01_GateState/`, 두 헌법)는 현재 goal의 진척 단계에 명시된 것만 고칩니다. 범위 밖 발견은 `99_Backlog.md`에 한 줄로 남깁니다.
- 모델 라우팅: 정본은 `00_Documents/02_Rules/02_모델-라우팅-정책.md`입니다.

## 마감 요약 (최신 1건 — 3줄: 바뀐 것 / 내린 결정 / 봐야 할 것)

- 스탬프: 2026-11-15T16:45:41+09:00
- 바뀐 것: 노트북 이전 준비로 원격이 없던 현황판 저장소를 `99_Others/Dashboard/`로 편입하는 H3를 시작했습니다. G10 브랜치는 push만 했고 PR은 검수 뒤입니다.
- 내린 결정: 현황판은 별도 원격 대신 AgentDeck 하위 폴더로, master에 바로 올립니다(결정 대장 [USER] 둘).
- 봐야 할 것: H3 병합 뒤 master를 G9c·G10 브랜치에 받고 G10 7단계 검수로 돌아갑니다. 옛 로컬 브랜치·`01_Phases/` PNG·미사용 claude.ai 아티팩트 정리는 사용자 몫입니다.
