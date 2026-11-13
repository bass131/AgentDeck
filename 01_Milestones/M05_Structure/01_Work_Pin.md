# work-pin — 작업 좌표 (M05)

세션 재개의 단일 인수인계 표면입니다.
좌표와 마감 요약은 현재 상태만 덮어쓰기로 유지하고, 이력은 git이 보유합니다.
결정과 검증의 정본은 `gate-config.json`의 `planPath`가 가리키는 goal 문서입니다.

## 좌표

- 로드맵: `01_Milestones/00_Roadmap.md` — M04 마감 → M05 구조 감사와 재편 → M06 자가 개발 → M07 실전 투입. 이 로드맵의 goal들은 헌법 11조의 일회 예외로 합의 문답 없이 이어집니다.
- 마일스톤: **M05 구조 감사와 도메인별 재편** — goal 파일은 `10_Goal-G1-…`, `20_Goal-G2-…` 순서로 이 폴더에 둡니다.
- 현재 goal: **G7 renderer 재배치 1 (`02_Common`·`03_Agent`·`05_Conversation`)** (`70_Goal-G7-renderer-공용-에이전트-대화-재배치.md`, 강 등급) — 작업 브랜치는 `chore/m05-g7-renderer-core`이고 병합된 master `36ce790`에서 시작했습니다. G6(PR 43)·G5(PR 42)·G4(PR 41)·G3(PR 40)와 그 앞 goal은 종결됐습니다.
- Night Shift는 끝났습니다(2026-11-14 아침, 사용자가 PR 40~43 병합을 승인). goal마다 PR 뒤 병합 승인을 받고 다음 goal로 갑니다. 이 브랜치는 `origin/master`를 추적하므로 push는 항상 `-u origin <브랜치>`로 원격 브랜치를 명시합니다.
- 멈추는 곳: 범위나 완료조건을 바꿔야 할 때, FAIL 세 번, 승인 항목(PR 병합, `master` 직접 push, 릴리스, 패키지 빌드·배포, 강제 push, 브랜치 삭제)입니다.
- 규율: 판정 장치(`.claude/hooks/`, `.claude/settings.json`, `98_Management/01_GateState/`, 두 헌법)는 현재 goal의 진척 단계에 명시된 것만 고칩니다. 범위 밖 발견은 `99_Backlog.md`에 한 줄로 남깁니다.
- 모델 라우팅: 정본은 `00_Documents/02_Rules/02_모델-라우팅-정책.md`입니다.

## 마감 요약 (최신 1건 — 3줄: 바뀐 것 / 내린 결정 / 봐야 할 것)

- 스탬프: 2026-11-14T08:48:14+09:00
- 바뀐 것: 사용자 승인으로 PR 40~43(G3~G6)이 병합돼 shared·main 재배치가 master에 들어갔습니다. G7 브랜치를 master에서 만들고 goal 문서를 썼습니다.
- 내린 결정: G7의 화면 무변경은 빌드 CSS 파일 이름(내용 해시)과 e2e 스크린샷 해시 대조로 판정하고, 진짜 견본의 fixture 이동은 미룹니다(성향 4·37).
- 봐야 할 것: G7 재실측(이동 목록, `*SampleData` 판정, 화면 기준선)이 다음입니다. 옛 로컬 브랜치들·`01_Phases/` PNG·미사용 claude.ai 아티팩트 정리는 사용자 몫입니다.
