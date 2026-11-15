# M05 H3 — 현황판 저장소 편입 · 별도 저장소였던 현황판을 AgentDeck 하위 폴더로

- 마일스톤: M05 (사용자 요청 — 노트북 이전 준비) · 작성: 2026-11-15 · 상태: 실행 중 · 검증 강도: 약(앱 소스 변경 0, 판정 장치는 포인터 한 줄)
- 작업 브랜치: `chore/dashboard-into-repo` — `origin/master`에서 시작했다. G9c(PR 49)·G10 줄기와는 별개이고, 병합 뒤 master를 두 브랜치에 병합 커밋으로 받는다.

## 목표

원격이 없던 현황판 저장소(`C:\Dev\AgentDeck_Dashboard`)가 AgentDeck의 `99_Others/Dashboard/`에 커밋 이력째 들어가, 다른 PC에서도 AgentDeck을 clone하면 현황판까지 받는다.

## 범위

- **만들 것**: `git subtree add`로 현황판 `feat/dashboard-redesign` 브랜치(그 안에 `master`·`fix/goal-format-stages` 포함)를 `99_Others/Dashboard/`로 가져온 병합 커밋, README의 경로 갱신.
- **건드릴 곳**: `99_Others/Dashboard/`(신설), 이 goal 문서, `98_Management/01_GateState/gate-config.json`의 `planPath` 한 줄(판정 장치 — 1단계), work-pin.
- **하지 않을 것**: 현황판 코드·화면·판독 규칙 변경, AgentDeck 앱 소스·테스트·lint·vitest 설정 변경, 옛 `C:\Dev\AgentDeck_Dashboard` 폴더 삭제(사용자 몫), 글꼴 바이너리 추가.
- **완료조건**
  - `99_Others/Dashboard/`에서 `node --test`가 실패 0이다.
  - `git log -- 99_Others/Dashboard`에 현황판의 원래 커밋들이 보인다.
  - 하드 게이트 다섯 종 exit 0. vitest `include`(`02_Project/01_TestCode/**`)와 eslint `--ext .ts,.tsx` 범위 밖이라 `npm test` 수집 수는 그대로다.
  - 새 위치에서 서버를 띄워 `http://127.0.0.1:4319/`가 응답한다.

## Phase 1 — 현황판 편입 · 태그: `chore` · 의존: 없음

진척 단계 (완료 `[x]`, 진행 `[>]`, 남음 `[ ]` — 위치 표시일 뿐이고 통과 판정은 검증 기록 줄만 한다)

- [x] 1. 이 goal 문서, 포인터 전환(`98_Management/01_GateState/gate-config.json`의 `planPath`), pin 갱신
- [x] 2. `git subtree add --prefix=99_Others/Dashboard C:/Dev/AgentDeck_Dashboard feat/dashboard-redesign`
- [x] 3. README의 `C:\Dev\AgentDeck_Dashboard` 경로를 새 위치로 갱신
- [x] 4. 검증 — 현황판 `node --test`, 하드 게이트 다섯 종, 새 위치에서 서버 응답
- [x] 5. 커밋, push, PR 생성, 병합 승인 요청(사용자 자리에 있음)
- [x] 6. 병합 뒤 master를 G9c·G10 브랜치에 병합 커밋으로 받고(포인터·pin 충돌은 각 브랜치 쪽으로) push

실행 단계 일괄 승인 대상 (사용자 문답으로 승인됐다)

- `git subtree add`, 하드 게이트 다섯 종, 현황판 `node --test`, 현황판 서버 실행
- 커밋, 작업 브랜치 push, `gh pr create`, G9c·G10 브랜치에 master 병합 커밋과 push

DoD

- diff는 `99_Others/Dashboard/`, 이 문서, 포인터 한 줄, pin뿐이다.
- 마크다운 문서 250줄 이하.

검증 기록

- PASS 2026-11-15T16:48:20+09:00 — 1~4단계. subtree 병합 커밋 `2b08b783`의 둘째 부모가 현황판 `06d87ac6`이라 원래 커밋이 `git log`에 남는다(경로가 루트였던 커밋이라 `git log -- 99_Others/Dashboard`에는 병합 커밋만 보인다). 새 위치 `node --test` 56건 통과·건너뜀 0(drift 시험은 `config.local.json`이 있어야 돌아서 옛 파일과 같은 내용으로 만들었고, `.gitignore`가 막는 것을 확인했다). 하드 게이트 다섯 종 exit 0. 새 위치 서버(pid 14000, `99_Others\Dashboard\server.mjs`)가 4319에서 200으로 응답했다. diff는 `99_Others/Dashboard/` 46파일, 이 문서, 포인터 한 줄, pin뿐이다. 세션 df394581.
- PASS 2026-11-15T16:51:04+09:00 — 5~6단계. PR 50을 사용자 승인으로 merge commit 병합했다(master `74665745`). master를 G9c 브랜치에 받았고(`7ece0239`, 포인터·pin은 G9c 쪽 값), G10 브랜치는 master 대신 G9c 브랜치를 받아 base가 G9c인 PR diff에 `99_Others/` 변화가 0이다. G10 브랜치에서 하드 게이트 다섯 종 exit 0이다. G9c 쪽 병합 커밋은 기본 메시지라 Co-Authored-By 줄이 빠졌다(push 뒤라 고치지 않음). 세션 df394581.

## 결정 대장

- [USER] 현황판은 별도 원격을 만들지 않고 AgentDeck 저장소의 하위 폴더로 올린다 — 「AgentDeck의 저장소에 별도 하위폴더로 같이 올리는게 나을거같다」 (노트북 이전 문답, 2026-11-15)
- [USER] 올릴 자리는 master다 — 문답에서 「master에 바로」를 골랐다. 병합 뒤 master를 G9c·G10 브랜치에 받는다 (2026-11-15)
- [AI] 위치는 도구 모음인 `99_Others/Dashboard/`이고, 이력을 살리려 `git subtree add`(병합 커밋)로 가져온다. 가져올 브랜치는 지금 서버가 돌고 있는 `feat/dashboard-redesign`이다 — 현황판 저장소의 `master` 병합 여부(사용자 몫으로 남겨 둔 일)는 이것으로 갈음되므로 결과 보고에 공개한다 (2026-11-15)
