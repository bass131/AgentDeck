# AgentDeck 현황판

AgentDeck 저장소에서 지금 어떤 작업이 어디까지 왔는지를 한 화면에서 보는 **읽기 전용** 로컬 현황판이다.
Node 로컬 서버가 저장소 파일과 읽기 전용 git 명령을 읽고, 변경을 열린 화면에 SSE로 보낸다.
npm 의존성은 없다. Node 내장 모듈만 쓰며 Windows의 Node 24.15.0에서 확인했다.
구조와 시각 언어는 `C:\Dev\Second_Brain_Dashboard`(본보기)를 따른다. 색의 뜻과 토큰은 본보기 `design/DESIGN.md` 3·4절과 같다.

## Orca에서 열기

```powershell
Set-Location C:\Dev\AgentDeck_Dashboard
node open-in-orca.mjs
```

서버가 없으면 창 없이 백그라운드로 시작하고, 준비되면 AgentDeck 작업 공간에 Orca 내부 브라우저 탭을 연다.
같은 URL의 탭이 있으면 새로 만들지 않는다. Orca 자체는 실행돼 있어야 한다.
이미 서버가 떠 있으면 탭만 여는 명령은 다음과 같다.

```powershell
orca tab create --url http://127.0.0.1:4319 --worktree path:C:/Dev/AgentDeck --json
```

전경 실행도 된다. `node server.mjs`로 띄우고 `http://127.0.0.1:4319/`에 접속한다. Ctrl+C로 끝낸다.

## 설정

`config.example.json`을 `config.local.json`으로 복사하고 값을 바꾼다. `config.local.json`은 개인 파일이라 `.gitignore`에 넣었다.

| 설정 | 의미 |
|---|---|
| `repoPath` | AgentDeck 저장소 절대경로. 현재 `C:/Dev/AgentDeck` |
| `port` | 루프백 포트. 4319 (본보기 Second Brain 현황판은 4318) |

설정을 바꾸면 서버를 다시 시작한다. `node server.mjs C:/경로/별도설정.json`도 된다.
판정 기준(FAIL 한도 3, hook-log 꼬리 크기 등)은 `lib/markdown.mjs`의 `RULES` 코드 상수다.

## 화면과 원문

모든 값은 저장소 파일과 읽기 전용 git 명령에서 읽는다. 진행률은 만들지 않는다.

1. **현재 좌표** — `98_Management/01_GateState/gate-config.json`의 `planPath`·`workPinPath`를 따라간다.
   경로는 코드에 고정하지 않는다. 계획 문서의 `# ` 제목과 `- 마일스톤: … · 상태: …` 줄의 「상태:」 이후,
   pin의 「좌표」 절 줄들과 「마감 요약」 절(스탬프·바뀐 것·내린 결정·봐야 할 것)을 보인다.
   계획과 pin 포인터가 다른 폴더를 가리키면 점선 태그로 알린다.
2. **Phase 흐름** — Preview 「Phase 흐름」 표의 이름·태그·목표와, 같은 폴더 `NN_Phase_N.md`의 Phase 절을 읽는다.
   Phase마다 「검증 기록」 아래 `- PASS`·`- FAIL`·`- USER-INPUT` 줄 수, 마지막 기록 줄, 마지막 USER-INPUT 이후 FAIL 수를 보인다.
   그 수가 3 이상이면 강조색 카드와 「멈춤 — 사용자 판단 대기」로 그린다. 기록 줄이 없으면 「기록 없음」이다.
   머리의 PASS·FAIL·INPUT 큰 숫자는 이 줄 수의 합계일 뿐 진행률이 아니다.
3. **결정 대장** — `- [USER]`·`- [USER·위임]`·`- [AI]`·`- [AI·비가역]` 줄 수, 주도권 게이트 판정, 남은 `[AI]` 줄 문면.
4. **마일스톤 목록** — `01_Milestones` 아래 폴더마다 `_MilestonePreview.md`의 상태 줄을 해석 없이 보인다.
5. **작업 사본** — 브랜치, HEAD 짧은 해시·제목, 미커밋·미추적 파일 목록, origin 대비 앞·뒤 커밋 수, 마지막 fetch 시각.
   비교 대상은 추적 브랜치 → 같은 이름의 `origin/<브랜치>` → `origin/HEAD`(기본 브랜치) 순서로 정하고, 어느 것인지 화면에 쓴다.
6. **훅 활동** — `98_Management/01_GateState/hook-log.jsonl`의 끝 512 KB에서 마지막 400줄만 읽는다.
   최근 40줄의 시각·훅·판정·규칙·이유를 보이고, verdict가 `deny`·`block`인 줄을 「막힌 판정」으로 따로 모은다.
   잘렸을 수 있는 첫 줄은 버리고, JSON이 아닌 줄은 「읽지 못한 줄」로 센다.
7. **Backlog** — 현재 마일스톤 폴더에 `99_Backlog.md`가 있으면 `N. **제목**` 번호 줄의 굵은 제목을 절별로 보인다.
   파일이 없으면 실패가 아니라 「없음」(회색)이다. 이 블록만 원문 자체가 선택 사항이기 때문이다.

### plan-gate와 같은 판정식

결정 대장 집계와 검증 기록 집계는 `.claude/hooks/20_plan-gate.cjs`와 **같은 정규식**을 쓴다.
절은 `^##\s+`로 나누고, Preview 뒤에 `NN_Phase_N.md`를 번호순으로 이어 붙인 텍스트에서 판정한다.
「검증 기록」 절 머리는 `^검증 기록\s*$` 단독 줄뿐이고, 그 아래 Phase 절 끝까지를 센다.
`[USER·위임]`은 [USER] 쪽으로 세며, `[AI·비가역]`이 하나라도 있으면 「즉시 발동」, `[AI]` > [USER] 쪽이면 「문답 분기 발동」이다.
`test/drift.test.mjs`가 이 정규식들이 훅 원문에 글자 그대로 있는지 확인한다. 훅이 바뀌면 이 시험이 먼저 실패한다.

### 실패와 0건

파일이 없거나 읽기에 실패한 블록은 그 블록만 「수집 실패」(빨강, 경고 삼각형, 한국어 이유)로 그린다.
수 자리는 `null`이고 빗금으로 그려 0과 구별한다. 포인터를 못 읽으면 그에 기대는 블록도 「미확인」이 된다.
Phase 파일 하나를 못 읽으면 plan-gate처럼 Phase 흐름과 결정 대장이 함께 실패하지만, 마일스톤 이름은 Preview만 읽어 그대로 보인다.
아래 「원천 수집 상태」 표에 블록마다 대상·상태·이유가 있다.

## 실시간 연결

`GET /`는 화면, `GET /events`는 연결 직후와 변경 때 전체 `snapshot`과 15초 간격 `ping`을 보낸다.
감시는 저장소 전체를 재귀로 보되 `node_modules`와 `.git/objects`·`logs`·`hooks`·`lfs`는 거른다.
작업 사본 블록은 어떤 파일 변경에도 달라질 수 있어 확장자로 거르지 않는다.
변경은 180ms로 모으고, 변경이 끊이지 않아도 1.5초마다 한 번은 다시 수집한다.
감시를 시작하거나 유지하지 못하면 원천 오류로 표시하고 30초 간격 재수집으로 대체한다.
화면은 45초 무응답·연결 오류 때 3초 뒤 다시 연결하고, 30초 경과 또는 5회 실패 때 끊김 띠를 띄운다. 자동 재시도는 계속한다.
바뀐 항목은 직전 스냅샷과 키별로 비교해 왼쪽 파랑 변경 선과 60초 「방금 바뀜」으로 알린다.

## 읽기 전용 보장

- 서버는 `127.0.0.1`에만 바인딩한다. GET·HEAD 밖의 요청은 405, 다른 Host는 403, 다른 Origin의 `/events`는 403이다.
- 저장소에 쓰는 API, 터미널로 텍스트를 넣는 API(본보기의 「답 보내기」), 임의 파일 열기 API는 없다.
- git은 `lib/git.mjs`의 목록(`rev-parse`·`log`·`status`·`rev-list`·`symbolic-ref`)만 셸 없이 실행한다.
  `--no-optional-locks`와 `GIT_OPTIONAL_LOCKS=0`으로 `git status`가 색인을 갱신해 쓰는 일도 막는다. `git fetch`는 하지 않는다.
- 화면에 넣는 원문 글은 모두 HTML 이스케이프하고, 굵게(`**`)와 인라인 코드(`` ` ``)만 살린다. CSP로 외부 스크립트·연결을 막는다.

## 글꼴

글꼴은 설치된 Pretendard → `public/fonts/PretendardVariable.woff2` → 맑은 고딕 순서로 쓴다. CDN은 쓰지 않는다.
이 저장소에는 글꼴 파일을 넣지 않았다. 파일 쓰기를 편집 도구로만 하는 규칙 때문에 바이너리를 복사하지 못했다.
본보기와 같은 글꼴을 쓰려면 사용자가 직접 복사한다(OFL 라이선스 파일도 함께).

```powershell
New-Item -ItemType Directory -Force C:\Dev\AgentDeck_Dashboard\public\fonts | Out-Null
Copy-Item C:\Dev\Second_Brain_Dashboard\public\fonts\PretendardVariable.woff2, C:\Dev\Second_Brain_Dashboard\public\fonts\OFL.txt C:\Dev\AgentDeck_Dashboard\public\fonts\
```

## 로그·종료

로그와 PID 기록은 `%LOCALAPPDATA%\AgentDeckDashboard\`에만 둔다. 저장소 안이면 실행하지 않는다.
`server.log`는 백그라운드 서버 출력, `server.json`은 도우미가 시작한 프로세스의 PID와 주소다.
서버는 화면 생성물이나 수집 캐시를 디스크에 쓰지 않는다.
백그라운드 서버 종료는 기록된 PID가 이 현황판 프로세스인지 확인한 뒤 실행한다.

```powershell
$state = Get-Content "$env:LOCALAPPDATA\AgentDeckDashboard\server.json" -Raw | ConvertFrom-Json
$proc = Get-CimInstance Win32_Process -Filter "ProcessId=$($state.pid)"
if ($proc.Name -eq 'node.exe' -and $proc.CommandLine -like '*AgentDeck_Dashboard*server.mjs*') { Stop-Process -Id $state.pid }
```

## 시험

```powershell
Set-Location C:\Dev\AgentDeck_Dashboard
node --test
```

`test/fixtures/repo`는 고정 입력이고 git 저장소가 아니라서 git은 가짜 실행기를 주입한다. 시험은 파일을 쓰지 않는다.
Markdown 판독(첫머리·표·검증 기록·결정 대장·pin·Backlog·hook-log 꼬리·git status), 블록별 실패 격리,
포인터 실패 시 미확인, 읽기 전용 git 목록, 서버(Host·Origin 거부, 405, SSE·ping·변경 모으기·감시 실패 폴링),
Orca 도우미(탭 재사용·생성·포트 충돌), plan-gate 정규식 일치를 검사한다.

## 본보기와 다른 점 · 남은 것

- 「답 보내기」와 페이지 토큰은 만들지 않았다. 쓰기 API가 없으므로 토큰도 필요 없다.
- 본보기의 마감 자·카운트다운·FLIP·잔상 움직임은 옮기지 않았다. 이 화면에는 마감 시각 원문이 없다.
- 줄 번호는 화면 표기와 복사에만 쓴다. 파일을 여는 링크는 없다.
- Orca 1.4.255의 `tab create`에는 `--split <right|left|down|up>`이 생겼지만, 기준 pane 동작을 확인하지 않아 쓰지 않았다.
- 정상 감시 중 운영체제가 오류 없이 이벤트를 놓치는 경우의 주기 대조는 없다(본보기와 같음).
