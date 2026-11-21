# work-pin — 작업 좌표 (M11·M12·M13 사슬, M12)

세션 재개의 단일 인수인계 표면입니다.
좌표와 마감 요약은 현재 상태만 덮어쓰기로 유지하고, 이력은 git이 보유합니다.
결정과 검증의 정본은 `gate-config.json`의 `planPath`가 가리키는 goal 문서와 그 출발점인 마일스톤 스펙입니다(헌법 2조).

## 좌표

- 로드맵: `01_Milestones/00_Roadmap.md` — M11 Backlog 정리(마일스톤 PR 118, 사용자 병합 대기) → **M12 헌장·Taste 문답과 사용량 한도(진행 중)** → M13 설치본과 업데이트(합의).
- 사슬 규칙: 로드맵 「이번 사슬의 일회 예외 — M11·M12·M13」. 마일스톤 PR을 열면 병합을 기다리지 않고 다음 마일스톤 브랜치를 그 머리에서 가른다. 사람에게 묻지 않고, 갈리는 판단은 개발 성향으로 정해 `[USER·위임]`으로 적는다. 사슬의 끝은 M13 goal 5(릴리스 후보)이며 거기서 M11 PR에 감시를 걸고 멈춘다.
- 재개 신호: 세션 안 예약(매시 17분, 7일 만료). 세션을 새로 열었다면 예약이 없으니, 사슬 진행 중이면 다시 예약한다.
- 마일스톤 스펙: `01_Milestones/M12_CharterTaste/00_마일스톤-스펙.md`. 다음 `M13_Installer/00_마일스톤-스펙.md`.
- 마일스톤 브랜치: `milestone/m12-charter-taste`(`6c31c299`에서 가름 — M11 마일스톤 PR 118 머리).
- 사슬 PR: M11 118(`master`로, 사용자 병합 대기 — 감시는 사슬 끝에서 건다).
- 현재 goal: G2 문답 엔진과 화면 — `20_Goal-G2-문답-엔진과-화면.md`, 브랜치 `feat/m12-g2-taste-dialog`(마일스톤 머리 `e544d797`에서). G1 종결(PR 119).
- 연습 저장소: `bass131/AgentDeck_Test`(공개, `main` 룰셋 `main-protect`). clone `C:\Dev\AgentDeck_Test`. 연습 토큰 `%USERPROFILE%\.agentdeck-practice\gh-token.txt`(만료 2026-11-27 03:20 UTC). 연습 앱 데이터 `%USERPROFILE%\.agentdeck-practice\udd`.
- goal 병합의 정형 절차: ① goal 브랜치를 push하고 독립 검수를 PR 전에 반영한다. ② `gh pr view <N> --json headRefOid,statusCheckRollup`으로 `hard-gates`와 머리 SHA를 읽는다. ③ `git fetch origin` 뒤 로컬 마일스톤 브랜치가 원격과 같은지 확인하고 `git switch milestone/m12-charter-taste`, `git merge --no-ff -m "<메시지>" origin/<goal 브랜치>`. ④ 병합한 SHA가 머리 SHA와 같은지 확인한 뒤 `git push -u origin milestone/m12-charter-taste`. 작업 트리는 병합 전에 깨끗해야 한다.
- push는 항상 `-u origin <브랜치>`로 원격 브랜치를 명시합니다. `master`로 가는 병합은 사용자가 직접 합니다.
- 멈추는 곳: 완료조건·범위 변경, FAIL 세 번(막힌 goal 밖의 같은 마일스톤 goal은 이어 감), 승인 항목(`master` 병합·직접 push, 릴리스, 패키지 배포, 강제 push, 브랜치 삭제, 저장소 만들기·설정 변경). 멈추면 PushNotification.
- 규율: 판정 장치는 마일스톤 스펙 「건드릴 곳」에 이름이 있는 것(`gate-config.json`)만 고칩니다. 범위 밖 발견은 `M12_CharterTaste/99_Backlog.md`에 한 줄로 남깁니다. 파일 편집은 Edit·Write로만 합니다(헌법 8조).
- SDK·CLI 동작은 공개 타입·공식 문서·요청이 돌려준 값으로만 검증합니다. 번들 내부를 열람하지 않습니다(사용자 지시).

## 마감 요약 (최신 1건 — 3줄: 바뀐 것 / 내린 결정 / 봐야 할 것)

- 스탬프: 2026-11-21T13:44:17+09:00
- 바뀐 것: M11 마일스톤 PR 118을 열고 그 머리에서 `milestone/m12-charter-taste`를 갈랐습니다. M12 goal 1 문서를 썼습니다.
- 내린 결정: Taste·헌장은 사람이 읽는 마크다운에 고정된 꼴(항목 머리 + 원칙·레퍼런스·금지 줄)로 쓰고, 공유 파서가 읽고 씁니다. 루프 세션은 사용자 전역 설정을 싣지 않고 Taste·헌장을 시스템 프롬프트에 싣습니다.
- 봐야 할 것: goal 1 구현이 끝났습니다(`npm test` 9190 passed, 실패 0). 실앱 e2e에서 `user` 원천 없이 메인 대화가 실제 모델 턴을 끝냈고, 독립 검수 지적(쓰기 검사·덮어쓰기 거절·덧붙임 상한 등)을 반영했습니다(`npm test` 9204 passed). goal 1을 병합했습니다(PR 119, `e544d797`). goal 2(문답 엔진과 화면) 구현을 마쳤고(`npm test` 9251 passed, 실패 0) 독립 검수가 돌고 있습니다 — 프로젝트 문서는 기본 브랜치로 가는 별도 PR로 커밋합니다.
