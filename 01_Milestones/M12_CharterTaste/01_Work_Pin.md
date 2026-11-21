# work-pin — 작업 좌표 (M11·M12·M13 사슬, M12)

세션 재개의 단일 인수인계 표면입니다.
좌표와 마감 요약은 현재 상태만 덮어쓰기로 유지하고, 이력은 git이 보유합니다.
결정과 검증의 정본은 `gate-config.json`의 `planPath`가 가리키는 goal 문서와 그 출발점인 마일스톤 스펙입니다(헌법 2조).

## 좌표

- 로드맵: `01_Milestones/00_Roadmap.md` — M11 Backlog 정리(마일스톤 PR 118, 사용자 병합 대기) → **M12 헌장·Taste 문답과 사용량 한도(진행 중)** → M13 설치본과 업데이트(합의).
- 사슬 규칙: 로드맵 「이번 사슬의 일회 예외 — M11·M12·M13」. 마일스톤 PR을 열면 병합을 기다리지 않고 다음 마일스톤 브랜치를 그 머리에서 가른다. 사람에게 묻지 않고, 갈리는 판단은 개발 성향으로 정해 `[USER·위임]`으로 적는다. 사슬의 끝은 M13 goal 5(릴리스 후보)이며 거기서 M11 PR에 감시를 걸고 멈춘다.
- 재개 신호: 세션 안 예약(매시 17분, 30일 만료, 세션이 끝나면 사라짐). 세션을 새로 열었다면 예약이 없으니, 사슬 진행 중이면 다시 예약한다.
- 마일스톤 스펙: `01_Milestones/M12_CharterTaste/00_마일스톤-스펙.md`. 다음 `M13_Installer/00_마일스톤-스펙.md`.
- 마일스톤 브랜치: `milestone/m12-charter-taste`(`6c31c299`에서 가름 — M11 마일스톤 PR 118 머리).
- 사슬 PR: M11 118(`master`로, 사용자 병합 대기 — 감시는 사슬 끝에서 건다).
- 현재 goal: G4 사용량 한도 — `40_Goal-G4-사용량-한도.md`, 브랜치 `feat/m12-g4-usage-limit`(마일스톤 머리 `47e87bcd`에서). G1 종결(PR 119), G2 종결(PR 120), G3 종결(PR 121).
- 연습 저장소: `bass131/AgentDeck_Test`(공개, `main` 룰셋 `main-protect`). clone `C:\Dev\AgentDeck_Test`. 연습 토큰 `%USERPROFILE%\.agentdeck-practice\gh-token.txt`(만료 2026-11-27 03:20 UTC). 연습 앱 데이터 `%USERPROFILE%\.agentdeck-practice\udd`.
- goal 병합의 정형 절차: ① goal 브랜치를 push하고 독립 검수를 PR 전에 반영한다. ② `gh pr view <N> --json headRefOid,statusCheckRollup`으로 `hard-gates`와 머리 SHA를 읽는다. ③ `git fetch origin` 뒤 로컬 마일스톤 브랜치가 원격과 같은지 확인하고 `git switch milestone/m12-charter-taste`, `git merge --no-ff -m "<메시지>" origin/<goal 브랜치>`. ④ 병합한 SHA가 머리 SHA와 같은지 확인한 뒤 `git push -u origin milestone/m12-charter-taste`. 작업 트리는 병합 전에 깨끗해야 한다.
- push는 항상 `-u origin <브랜치>`로 원격 브랜치를 명시합니다. `master`로 가는 병합은 사용자가 직접 합니다.
- 멈추는 곳: 완료조건·범위 변경, FAIL 세 번(막힌 goal 밖의 같은 마일스톤 goal은 이어 감), 승인 항목(`master` 병합·직접 push, 릴리스, 패키지 배포, 강제 push, 브랜치 삭제, 저장소 만들기·설정 변경). 멈추면 PushNotification.
- 규율: 판정 장치는 마일스톤 스펙 「건드릴 곳」에 이름이 있는 것(`gate-config.json`)만 고칩니다. 범위 밖 발견은 `M12_CharterTaste/99_Backlog.md`에 한 줄로 남깁니다. 파일 편집은 Edit·Write로만 합니다(헌법 8조).
- SDK·CLI 동작은 공개 타입·공식 문서·요청이 돌려준 값으로만 검증합니다. 번들 내부를 열람하지 않습니다(사용자 지시).

## 마감 요약 (최신 1건 — 3줄: 바뀐 것 / 내린 결정 / 봐야 할 것)

- 스탬프: 2026-11-21T19:41:37+09:00
- 바뀐 것: goal 4(사용량 한도)를 구현했고 메인이 다시 돌린 하드 게이트와 `npm test`(실패 0)로 구현 `PASS` 줄을 남겼습니다. 독립 검수가 돌고 있습니다.
- 내린 결정: 한도 멈춤은 `needs-user`가 아닌 새 상태 `usage-limit`이라 FAIL 기준점을 옮기지 않습니다. 주입 자리는 환경변수 `AGENTDECK_E2E_RATE_LIMIT`일 때만 켜집니다.
- 봐야 할 것: 검수(goal 3 `fd3bc2e2` 포함) 반영, PR, 병합 뒤 goal 5 실주행입니다. GUI 레이아웃 재구성안 캔버스는 사람의 답(Backlog로 둘지)을 기다립니다.
