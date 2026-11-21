# work-pin — 작업 좌표 (M11·M12·M13 사슬, M13)

세션 재개의 단일 인수인계 표면입니다.
좌표와 마감 요약은 현재 상태만 덮어쓰기로 유지하고, 이력은 git이 보유합니다.
결정과 검증의 정본은 `gate-config.json`의 `planPath`가 가리키는 goal 문서와 그 출발점인 마일스톤 스펙입니다(헌법 2조).

## 좌표

- 로드맵: `01_Milestones/00_Roadmap.md` — M11 Backlog 정리(PR 118) → M12 헌장·Taste 문답과 사용량 한도(PR 125) → **M13 설치본과 업데이트(진행 중)**.
- 사슬 규칙: 로드맵 「이번 사슬의 일회 예외 — M11·M12·M13」. 사람에게 묻지 않고, 갈리는 판단은 개발 성향으로 정해 `[USER·위임]`으로 적는다. 사슬의 끝은 M13 goal 5(릴리스 후보)이며 거기서 M11 PR에 감시를 걸고 pin을 「(병합 대기, PR 118)」로 적고 멈춘다.
- 재개 신호: 세션 안 예약(매시 17분, 30일 만료, 세션이 끝나면 사라짐). 세션을 새로 열었다면 예약이 없으니, 사슬 진행 중이면 다시 예약한다.
- 마일스톤 스펙: `01_Milestones/M13_Installer/00_마일스톤-스펙.md`.
- 마일스톤 브랜치: `milestone/m13-installer`(`186ccace`에서 가름 — M12 마일스톤 PR 125 머리).
- 사슬 PR: M11 118, M12 125(둘 다 `master`로, 사용자가 118 → 125 → M13 순서로 병합).
- 현재 goal: G2 GitHub 기기 인증과 자격 — `20_Goal-G2-GitHub-기기-인증과-자격.md`, 브랜치 `feat/m13-g2-device-auth`(마일스톤 머리 `12c15838`에서). G1 종결(PR 126).
- 설치본 빌드: `npm run dist:win` 출력은 저장소 밖 `C:\Dev\AgentDeck-release`. Git Bash에서 NSIS 인자는 `MSYS_NO_PATHCONV=1`로 넘긴다(`/S`가 `S:/`로 바뀜).
- goal 병합의 정형 절차: ① goal 브랜치를 push하고 독립 검수를 PR 전에 반영한다. ② `gh pr view <N> --json headRefOid,statusCheckRollup`으로 `hard-gates`와 머리 SHA를 읽는다. ③ `git fetch origin` 뒤 로컬 마일스톤 브랜치가 원격과 같은지 확인하고 `git switch milestone/m13-installer`, `git merge --no-ff -m "<메시지>" origin/<goal 브랜치>`. ④ 병합한 SHA가 머리 SHA와 같은지 확인한 뒤 `git push -u origin milestone/m13-installer`. 작업 트리는 병합 전에 깨끗해야 한다.
- push는 항상 `-u origin <브랜치>`로 원격 브랜치를 명시합니다. `master`로 가는 병합은 사용자가 직접 합니다.
- 멈추는 곳: 완료조건·범위 변경, FAIL 세 번, 승인 항목(`master` 병합·직접 push, Release 게시, 패키지 배포, 강제 push, 브랜치 삭제, 저장소 만들기·설정 변경, OAuth App 등록). 멈추면 PushNotification.
- 규율: 판정 장치는 스펙 「건드릴 곳」에 이름이 있는 것(`gate-config.json`, `package.json`의 `scripts`)만 고칩니다. `.claude/settings.json`과 훅은 이 마일스톤의 건드릴 곳이 아닙니다. 범위 밖 발견은 `M13_Installer/99_Backlog.md`에 한 줄로 남깁니다. 파일 편집은 Edit·Write로만 합니다(헌법 8조).
- SDK·CLI 동작은 공개 타입·공식 문서·요청이 돌려준 값으로만 검증합니다. 번들 내부를 열람하지 않습니다(사용자 지시).

## 마감 요약 (최신 1건 — 3줄: 바뀐 것 / 내린 결정 / 봐야 할 것)

- 스탬프: 2026-11-22T00:03:58+09:00
- 바뀐 것: 사용자의 「이어 가줘」로 설치본 번들 SDK 실행 파일 경로를 `app.asar.unpacked`로 고쳤고, 설치본이 실제 엔진 턴(Haiku `ok`)까지 돌았습니다. goal 1 완료조건 네 줄이 `PASS`이고 하드 게이트 다섯 종과 `npm test` 실패 0입니다.
- 내린 결정: 빌드 출력은 저장소 밖 `C:\Dev\AgentDeck-release`로 둡니다(저장소 안 `.asar` 잠김). 경로 수정은 번들 SDK 폴백에만 걸고 호출자 값은 덮지 않습니다.
- 봐야 할 것: 반영분 재검수가 돌고 있고, 반영 뒤 goal PR과 병합, 그다음 goal 2(GitHub 기기 인증)입니다. 저장소 안 옛 `release/`는 사람이 치웁니다.
