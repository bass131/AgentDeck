# M07 G6 — CI 필수 검사 · 하드 게이트 다섯 종을 GitHub Actions에서 PR마다 돌린다

- 마일스톤: M07 사용자 컨트롤 · 작성: 2026-11-17 · 상태: 실행 중 · 검증 강도: 강(판정 장치 성격의 새 검사 경로)
- 작업 브랜치: `feat/m07-g6-ci-gate` — G5 브랜치(`feat/m07-g5-control-panel`, PR 71 미병합) 위에서 갈랐다(로드맵 「병합하지 않고 쌓기」). PR은 `master` 기준으로 열어, PR 71이 먼저 병합되면 diff가 이 goal만 남는다.

## 목표

지금 하드 게이트 다섯 종(헌법 6조)은 에이전트 세션이 로컬에서 돌리고, 통과했다는 주장은 검증 기록 줄로만 남는다. 서버는 PR이 게이트를 통과했는지 모른다.
이 goal이 끝나면 `master`로 가는 PR마다 GitHub Actions가 다섯 종을 돌리고, PR 화면에 검사 결과가 하나의 이름으로 붙는다. 사용자가 그 이름을 `master` 보호의 필수 검사로 걸면, 게이트를 통과하지 않은 PR은 서버가 병합을 거부한다(G8 설계 `60` 순서 3, 뒤 goal 「병합 버튼」의 앞선 조건).

## 범위

- **만들 것**
  - 워크플로 `.github/workflows/hard-gates.yml`. 이벤트는 `master`로 가는 `pull_request`와 수동 실행(`workflow_dispatch`)이다. 작업(job) 하나가 `npm ci` 뒤에 `typecheck:node` → `typecheck:web` → `lint` → `test:hooks` → `build`를 차례로 돌린다. 하나라도 실패하면 검사가 실패한다.
  - 검사 이름을 고정한다 — 작업 이름 `hard-gates`. 보호 설정은 이 이름으로 건다.
  - 최소 권한(`permissions: contents: read`), 같은 PR의 이전 실행 취소(`concurrency`), npm 캐시.
  - 이 goal 문서에 사용자가 할 보호 설정 절차를 적는다(GitHub 화면 경로와 검사 이름).
- **건드릴 곳**: `.github/workflows/`(새 파일), 이 goal 문서, `M07_Controls/01_Work_Pin.md`·`99_Backlog.md`, `98_Management/01_GateState/gate-config.json`의 `planPath`(1단계, 판정 장치).
- **하지 않을 것**
  - `master` 보호에 필수 검사를 거는 일. 사용자 몫이다(헌법 9·10조, 설계 `60` 「GitHub 설정 변경은 사용자 몫」). 에이전트는 `gh api`로 보호 설정을 읽지도 바꾸지도 않는다.
  - `npm test` 전체. 헌법 6조가 하드 게이트가 아니라 기준선 차분으로 읽는 검사이고, 실행 시간(로컬 약 3분)과 창 띄우는 테스트의 러너 의존이 크다. Backlog.
  - e2e·설치본 빌드·릴리스. M08 몫이다.
  - 저장소 훅과 헌법 문구의 변경. 헌법 6조 문구에 CI를 적는 일은 병합 버튼 goal(헌법 10조 개정)과 함께 한다.
- **완료조건**
  - 이 goal의 PR에서 `hard-gates` 검사가 돌고 통과한다(`gh pr checks`로 본다). 다섯 단계가 각각 로그에 이름으로 보인다.
  - 워크플로가 `master`로 가는 PR에만 걸리고, 권한이 `contents: read`다(파일 실사).
  - 로컬 하드 게이트 다섯 종 exit 0.
  - 사용자 보호 설정 절차가 이 문서에 있고, 병합 승인 요청과 함께 아침 보고에 오른다.
  - 구현 문맥 없는 검수자 1회의 지적이 반영되거나 Backlog로 넘어가 있다.

## Phase 1 — CI 하드 게이트 · 태그: `infra` · 의존: G5 브랜치

진척 단계 (완료 `[x]`, 진행 `[>]`, 남음 `[ ]` — 위치 표시일 뿐이고 통과 판정은 검증 기록 줄만 한다)

- [x] 1. goal 준비 — 이 문서, `gate-config.json`의 `planPath` 전환(판정 장치), pin
- [>] 2. 워크플로 작성과 로컬 하드 게이트
- [ ] 3. 커밋, push, PR — PR에서 `hard-gates` 검사 실행을 보고 결과를 기록한다
- [ ] 4. 독립 검수 1회와 반영
- [ ] 5. 보호 설정 절차를 아침 보고 대기열에 올린다

실행 단계 일괄 승인 대상 (로드맵 일회 예외 — 「이번 순서만 예외로 이어서 처리」)

- 하드 게이트 다섯 종, 독립 검수 하위 에이전트, 커밋, 작업 브랜치 push, `gh pr create`, `gh pr checks`·`gh run view`(읽기)

DoD

- 위 완료조건 다섯.
- 마크다운 문서 250줄 이하.

검증 기록

- PASS 2026-11-17T19:41:10+09:00 — 1단계: 이 문서를 쓰고 `planPath`를 전환했다. pin의 현재 goal을 G6으로 바꾸고 G5 문서 상태를 「PR 71 병합 대기」로 표기했다.

## 결정 대장

- [USER] 로드맵의 goal들은 합의 문답 없이 이어 간다 — 「이번 순서만 예외로 이어서 처리」 (2026-11-13, 로드맵 합의)
- [USER] 남은 goal과 Backlog를 끝까지 이어 간다 — 「더이상 백로그나 이어서 할 Goal이 없을때까지 전부 완주해보자」 (2026-11-17, G4 결정 대장). 보호 설정 같은 사용자 몫에서는 멈춘다.
- [AI] 러너는 `windows-latest`다 — 개발 PC가 Windows이고, 훅 테스트와 경로 처리가 Windows에서 길러졌다. 러너 차이로 생긴 실패를 이 goal에서 쫓지 않으려는 것이다. 되돌리기 쉽다(한 줄) (2026-11-17, Night Shift 메인 결정)
- [AI] 검사는 작업 하나 `hard-gates`로 묶는다 — 필수 검사 이름이 하나면 사용자 보호 설정이 한 번으로 끝나고, 단계별 결과는 로그의 단계 이름으로 보인다 (2026-11-17, Night Shift 메인 결정)

출처 태그는 네 가지다 — `[USER]`·`[USER·위임]`·`[AI]`·`[AI·비가역]`.

## 부록 — 사용자가 할 보호 설정 (병합 뒤)

1. GitHub 저장소 → Settings → Branches → `master` 규칙 편집(또는 Rules → Rulesets).
2. 「Require status checks to pass before merging」을 켠다.
3. 검사 목록에서 `hard-gates`를 고른다. 목록에 없으면 이 PR에서 검사가 한 번 돈 뒤에 나타난다.
4. 「Require branches to be up to date before merging」은 선택이다. 켜면 쌓인 PR을 병합할 때마다 뒤 PR을 갱신해야 한다.
