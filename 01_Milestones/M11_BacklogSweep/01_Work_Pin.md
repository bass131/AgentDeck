# work-pin — 작업 좌표 (M11·M12·M13 사슬)

세션 재개의 단일 인수인계 표면입니다.
좌표와 마감 요약은 현재 상태만 덮어쓰기로 유지하고, 이력은 git이 보유합니다.
결정과 검증의 정본은 `gate-config.json`의 `planPath`가 가리키는 goal 문서와 그 출발점인 마일스톤 스펙입니다(헌법 2조).

## 좌표

- 로드맵: `01_Milestones/00_Roadmap.md` — M10 종결 → **M11 Backlog 정리(진행 중)** → M12 헌장·Taste 문답과 사용량 한도(합의) → M13 설치본과 업데이트(합의). 세 마일스톤은 2026-11-20 15:06 한 번에 합의했다.
- 사슬 규칙: 로드맵 「이번 사슬의 일회 예외 — M11·M12·M13」. 마일스톤 PR을 열면 병합을 기다리지 않고 다음 마일스톤 브랜치를 그 머리에서 가른다. 사람에게 묻지 않고, 갈리는 판단은 개발 성향으로 정해 `[USER·위임]`으로 적는다. 사슬의 끝은 M13 goal 5(릴리스 후보)이며 거기서 M11 PR에 감시를 걸고 멈춘다.
- 재개 신호: 세션 안 예약(매시 17분, 7일 만료). 세션을 새로 열었다면 예약이 없으니, 사슬 진행 중이면 다시 예약한다(4회차 「재개 신호 예약」).
- 마일스톤 스펙: `01_Milestones/M11_BacklogSweep/00_마일스톤-스펙.md`(분류표 `10_`~`13_분류-*.md`). 다음 `M12_CharterTaste/00_마일스톤-스펙.md`, `M13_Installer/00_마일스톤-스펙.md`.
- 마일스톤 브랜치: `milestone/m11-backlog-sweep`(`5419b812`에서 가름 — `chore/m10-close` 머리, M10 종결 기록과 브레인스토밍 기록).
- 사슬 PR: (아직 없음)
- 현재 goal: G8 가드·설정·CI·헌법 3조 — `80_Goal-G8-가드-설정-CI-헌법3조.md`, 브랜치 `chore/m11-g8-guard-settings-ci`(마일스톤 머리 `f630b36c`에서). G1~G7 종결(PR 108~114, 마지막 병합 `f630b36c`).
- 연습 저장소: `bass131/AgentDeck_Test`(공개, `main` 룰셋 `main-protect`). clone `C:\Dev\AgentDeck_Test`. 연습 토큰 `%USERPROFILE%\.agentdeck-practice\gh-token.txt`(만료 2026-11-27 03:20 UTC, 룰셋 읽기 확인). 연습 앱 데이터는 G1부터 `%USERPROFILE%\.agentdeck-practice\udd`.
- goal 병합의 정형 절차: ① goal 브랜치를 push하고 독립 검수를 PR 전에 반영한다. ② `gh pr view <N> --json headRefOid,statusCheckRollup`으로 `hard-gates`와 머리 SHA를 읽는다. ③ `git fetch origin` 뒤 로컬 마일스톤 브랜치가 원격과 같은지 확인하고 `git switch milestone/m11-backlog-sweep`, `git merge --no-ff -m "<메시지>" origin/<goal 브랜치>`. ④ 병합한 SHA가 머리 SHA와 같은지 확인한 뒤 `git push -u origin milestone/m11-backlog-sweep`. 작업 트리는 병합 전에 깨끗해야 한다.
- push는 항상 `-u origin <브랜치>`로 원격 브랜치를 명시합니다. `master`로 가는 병합은 사용자가 직접 합니다.
- 멈추는 곳: 완료조건·범위 변경, FAIL 세 번(막힌 goal 밖의 같은 마일스톤 goal은 이어 감), 승인 항목(`master` 병합·직접 push, 릴리스, 패키지 배포, 강제 push, 브랜치 삭제, 저장소 만들기·설정 변경). 멈추면 PushNotification.
- 규율: 판정 장치는 그 마일스톤 스펙 「건드릴 곳」에 이름이 있는 것만 고칩니다. 범위 밖 발견은 그 마일스톤 `99_Backlog.md`에 한 줄로 남깁니다. 파일 편집은 Edit·Write로만 합니다(헌법 8조).
- SDK·CLI 동작은 공개 타입·공식 문서·요청이 돌려준 값으로만 검증합니다. 번들 내부를 열람하지 않습니다(사용자 지시).

## 마감 요약 (최신 1건 — 3줄: 바뀐 것 / 내린 결정 / 봐야 할 것)

- 스탬프: 2026-11-21T06:45:44+09:00
- 바뀐 것: goal 7을 병합했고(PR 114, `f630b36c`), 종결한 goal 7에서 goal 8로 포인터를 바꾸는 실제 편집이 지나갔습니다. goal 8(가드·설정·CI·헌법 3조) 문서와 브랜치를 열었습니다.
- 내린 결정: goal 8은 정형 절차 명령(goal 병합·push·PR)이 질의 없이 지나감을 시험으로 먼저 묶고, PowerShell 백틱 꼴은 v2, 하위 에이전트 질의는 실제로 띄우지 않고 근거로 닫습니다. 사람 손 목록: `cwdprobe\`, 연습 `udd/loop`의 e2e 찌꺼기(Backlog 36), stash `pin-g3`, 옛 봉인 때문에 엔진 다시 고르기.
- 봐야 할 것: goal 8 워커가 가드와 `settings.json`을 고치는 동안 내 정형 절차 명령이 질의에 걸리지 않는지 봅니다.
