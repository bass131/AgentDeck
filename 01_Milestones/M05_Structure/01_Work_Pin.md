# work-pin — 작업 좌표 (M05)

세션 재개의 단일 인수인계 표면입니다.
좌표와 마감 요약은 현재 상태만 덮어쓰기로 유지하고, 이력은 git이 보유합니다.
결정과 검증의 정본은 `gate-config.json`의 `planPath`가 가리키는 goal 문서입니다.

## 좌표

- 로드맵: `01_Milestones/00_Roadmap.md` — M04 마감 → M05 구조 감사와 재편 → M06 자가 개발 → M07 실전 투입. 이 로드맵의 goal들은 헌법 11조의 일회 예외로 합의 문답 없이 이어집니다.
- 마일스톤: **M05 구조 감사와 도메인별 재편** — goal 파일은 `10_Goal-G1-…`, `20_Goal-G2-…` 순서로 이 폴더에 둡니다.
- 현재 goal: **G11 main 중복과 조립 정리** (`99a_Goal-G11-main-중복과-조립-정리.md`, 강 등급) — 작업 브랜치는 `origin/master`(`558046ab`)에서 딴 `chore/m05-g11-main-dedupe`이고, H5 병합 뒤 master(`1b6e9b81`)를 병합 커밋으로 받았습니다. H5(PR 53)·H3·H4·G10·G9c와 그 앞 goal은 종결됐습니다. 보조 세션이 worktree `C:\Dev\AgentDeck-h6`에서 H6 현황판 시각 개편을 병행합니다.
- 사용자 부재: 2026-11-15 22:03부터 Night Shift입니다(「이제 나 자러가볼게, 부탁해」). 부재 중 규칙대로 병합을 부르지 않고 PR까지만 쌓습니다. 현황판은 H3(PR 50, 병합)로 `99_Others/Dashboard/`에 들어왔고, master를 G9c 브랜치에, G9c 브랜치를 이 브랜치에 병합 커밋으로 받았습니다.
- Night Shift는 끝났습니다(2026-11-14 아침, 사용자가 PR 40~43 병합을 승인). goal마다 PR 뒤 병합 승인을 받고 다음 goal로 갑니다. 이 브랜치는 `origin/master`를 추적하므로 push는 항상 `-u origin <브랜치>`로 원격 브랜치를 명시합니다.
- 멈추는 곳: 범위나 완료조건을 바꿔야 할 때, FAIL 세 번, 승인 항목(PR 병합, `master` 직접 push, 릴리스, 패키지 빌드·배포, 강제 push, 브랜치 삭제)입니다.
- 규율: 판정 장치(`.claude/hooks/`, `.claude/settings.json`, `98_Management/01_GateState/`, 두 헌법)는 현재 goal의 진척 단계에 명시된 것만 고칩니다. 범위 밖 발견은 `99_Backlog.md`에 한 줄로 남깁니다.
- 모델 라우팅: 정본은 `00_Documents/02_Rules/02_모델-라우팅-정책.md`입니다.

## 마감 요약 (최신 1건 — 3줄: 바뀐 것 / 내린 결정 / 봐야 할 것)

- 스탬프: 2026-11-15T23:09:54+09:00
- 바뀐 것: G11을 7단계까지 마쳐 PR 55로 올렸습니다(검수 차단 0, `npm test` master 대조 새 실패 0, 게이트 통과). H6 현황판 시각 개편은 PR 54입니다.
- 내린 결정: 검수 비차단 4건 중 2건은 고치고 2건은 Backlog 69로 넘겼습니다. Night Shift라 두 PR 모두 병합하지 않고 아침 승인을 기다립니다.
- 봐야 할 것: 아침 대기열은 PR 54·55 병합과 [AI] 결정 둘(버전 비교 비통합, SDK 폴백 별도 커밋)의 확인입니다. 4319 현황판은 H6 worktree 코드로 돌고, master 대조용 worktree `C:\Dev\AgentDeck-master`가 남아 있습니다.
