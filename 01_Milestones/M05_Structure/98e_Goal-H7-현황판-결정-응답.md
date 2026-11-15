# M05 H7 — 현황판 결정 응답 · 결정이 필요한 일을 현황판에서 고르고, 고른 답을 메인 입력창에 넣는다

- 마일스톤: M05 (사용자 요청 — H6 뒤 결정 응답) · 작성: 2026-11-16 · 상태: 실행 중 · 검증 강도: 강(에이전트 터미널에 글을 넣는 서버 경로라 등급이 애매하면 강이다. 마감 검수는 메인 세션이 구현 문맥 없는 검수자로 한다)
- 작업 브랜치: `chore/m05-h7-dashboard-decisions` — master `03570895`(PR 54 병합) 위 종결 커밋 `0e3c94e0`에서 시작했다. 보조 세션이 메인 폴더 `C:\Dev\AgentDeck`에서 일한다.
- 본보기: `C:\Dev\DawnHolder_Dashboard`(읽기만) — `lib/answer.mjs`·`lib/deliver.mjs`·`web/server.mjs`·`web/lib/answers.mjs`, README 「결정 응답 모드」·「결정 항목의 수명」·「결정 글 작성 기준」.

## 목표

결정이 필요한 일이 현황판에 카드로 보이고, 사용자가 화면에서 A·B나 C 코멘트를 고르면 서버가 만든 한 줄 문장이 메인 Claude 입력창에 들어간다(Enter는 누르지 않는다). 넣을 수 없으면 복사로 안내한다. README 「읽기 전용 보장」은 「쓰기는 결정 응답 두 경로뿐」으로 바뀐다.

## 범위

- **만들 것**
  - 결정 원천 — `01_Milestones/00_Decision_Board.local.json`(로컬 상태, `01_Milestones/.gitignore`의 `*.local.json`). 형식은 Dawnholder `board.json`의 `decisions`를 줄였다(`id`·`kind`·`title`·`state`·`pr`·`recommended`·`options`·`detail`·`arrivedAt`·`updatedAt`). 모양이 틀린 필드는 그 항목만 빼거나 경고하고, 파일이 반쯤 쓰였으면 직전 정상 목록을 유지한다. 없으면 실패가 아니라 「없음」이다.
  - 순수 함수 — 보드 판독, 목록 서명, 선택 가능 판정, 코멘트 정리, 문장 조립(`현황판 결정 응답: 1) <제목> → A <label> · …`, 한 줄), 고른 답 검사. 서버 쪽 `lib/`에 두고 시험을 먼저 쓴다.
  - 화면 — 「지금」 바로 아래 결정 카드(제목, 추천, A·B 선택 표시, C 코멘트 300자, 상세 글 접기, 지우기)와 「보낼 문장」 칸(「메인 입력창에 넣기」·「복사」). 새 결정 id는 H4 알림음·탭 제목 배지를 울린다(첫 스냅샷 무음 그대로). 기존 색 의미(노랑 = 사용자가 할 일)만 쓴다.
  - 서버 쓰기 경로 — `POST /api/answer/preview`·`/api/answer/send` 둘. 페이지 토큰(`timingSafeEqual`)과 Origin·Host 정확 일치(아니면 403), 본문 64KB 이하 JSON, 서버가 id와 키로 문장을 만듦, 목록 서명이 다르면 409, 없는 키 거절, 제어문자 제거(조립한 문장 전체), 같은 문장 두 번·겹치기 409, `orca terminal send`를 `execFile` 인자 배열로 `--enter` 없이 한 번(실패하면 다시 시도하지 않고 복사 안내). 메인 handle은 `config.local.json`의 `mainTerminalHandle`(`term_` + 소문자 UUID), 없거나 틀리면 복사만.
  - 문서 — `99_Others/Dashboard/docs/결정-응답.md`(형식·수명 규칙·글 작성 기준·보안 검사), README 「읽기 전용 보장」 고치기, `docs/던홀더-대비-점검.md` 2번 줄, `docs/알림.md` 키 표 한 줄.
  - 보드에 지금 걸린 결정 둘 — G11 결정 대장의 [AI] 둘(버전 비교 두 함수 비통합, SDK 폴백 값 별도 커밋).
- **건드릴 곳**: `99_Others/Dashboard/`의 `server.mjs`·`lib/`(새 `decisions.mjs`·`deliver.mjs`, `collector.mjs`·`config.mjs`)·`public/`(`app.js`·`chime.js`·`index.html`·`styles.css`)·`test/`·`config.example.json`·README·`docs/`. `01_Milestones/.gitignore`(새 파일)와 `01_Milestones/00_Decision_Board.local.json`(로컬, 커밋 밖). 이 goal 문서, `98_Management/01_GateState/gate-config.json`의 `planPath` 한 줄(판정 장치 — 1단계), work-pin, Backlog.
- **하지 않을 것**: `.claude/` 전부, `02_Project/`, 루트 설정·package, 두 헌법, CSP를 느슨하게 하는 변경, 외부 CDN·글꼴·음원 바이너리, 시각 디자인 개편(H8 몫), 결정 응답 두 경로 밖의 쓰기 API, Enter 누르기, Dawnholder의 병합 승인 줄·깨움·계획 검토·메인 handle 바꾸기·서명 추적, 게이트 해제 수단을 부르거나 승인 다이얼로그를 대신하는 줄, `config.local.json` 수정, 다른 goal 문서 수정, push·PR 생성·병합, 4319 서버 조작, 메인 handle 터미널에 글 넣기.
- **완료조건**
  - `99_Others/Dashboard`에서 `node --test` 실패 0이고, 보드 판독·서명·선택 가능 판정·코멘트 정리·문장 조립의 순수 함수 시험과 서버 경로 시험(토큰 없음·Origin 다름·Origin 없음·Host 다름·본문 초과·서명 다름 409·없는 키·같은 문장 두 번·겹치기·handle 없음·넣기 실패 재시도 없음·`--enter` 없음)이 있다.
  - 하드 게이트 다섯 종 exit 0.
  - 포트 4320 현황판(메인 저장소 데이터)에서 결정 카드 두 개, 고른 상태와 보낼 문장, 다크·라이트, 좁은 폭을 스크린샷으로 본다. 코멘트를 치는 도중 스냅샷이 와도 글자가 남는다. 버리는 터미널 handle로 넣기를 해서 글이 들어가고 제출되지 않았음을 `orca terminal read`로 본다. 끝나면 탭·터미널·서버를 닫는다.
  - README가 250줄 이하이고 「읽기 전용 보장」이 「쓰기는 결정 응답 두 경로뿐」으로 고쳐져 있다.

## Phase 1 — 현황판 결정 응답 · 태그: `dashboard` · 의존: 없음

진척 단계 (완료 `[x]`, 진행 `[>]`, 남음 `[ ]` — 위치 표시일 뿐이고 통과 판정은 검증 기록 줄만 한다)

- [x] 1. goal 문서와 포인터 — 이 문서, `98_Management/01_GateState/gate-config.json`의 `planPath`를 이 문서로, work-pin 「현재 goal」 줄
- [x] 2. 결정 원천 — 보드 파일·`.gitignore`, G11 결정 둘, 수명 규칙
- [x] 3. 순수 함수 — 시험을 먼저 쓰고(Red) `lib/decisions.mjs`에 구현
- [x] 4. 서버 쓰기 경로 — 수집 블록, 토큰·Origin·Host·64KB·409, `lib/deliver.mjs`, 시험 먼저
- [x] 5. 화면 — 결정 카드, 보낼 문장, 알림 키, 시험 먼저
- [x] 6. 화면 확인 — 4320에서 카드 둘, 선택·코멘트·문장, 두 테마, 좁은 폭, 버리는 터미널에 넣기
- [x] 7. 문서 — `docs/결정-응답.md`, README 「읽기 전용 보장」, 대비 점검 2번 줄, 알림 키 표
- [x] 8. 검증과 커밋 — 현황판 `node --test`, 하드 게이트 다섯 종, 이 브랜치에 커밋, 코디네이터에 보고(push·PR은 메인 세션 몫)

실행 단계 일괄 승인 대상 (보조 세션 지시문으로 받았다)

- 현황판 `node --test`, 하드 게이트 다섯 종, 포트 4320 현황판 서버 띄우기·끄기(scratchpad 실행 스크립트), Orca 브라우저 탭 열기·조회·스크린샷·닫기
- 버리는 Orca 터미널 만들기·`terminal send`(서버 경로)·`terminal read`·닫기 — 메인 handle에는 넣지 않는다
- 이 브랜치의 커밋

DoD

- diff는 「건드릴 곳」의 경로뿐이다.
- 쓰기 경로는 POST 두 경로뿐이고, 그 밖의 메서드와 경로는 405·404다.
- 넣는 문장은 서버가 만들고, 제어문자·줄바꿈이 없으며, `--enter`가 붙지 않는다.
- 새 색 의미가 없다. 노랑은 사용자가 할 일이다.
- 마크다운 문서 250줄 이하.

검증 기록

- PASS 2026-11-16T04:55:17+09:00 — 1~5단계. 이 문서를 쓰고 `planPath`를 옮겼고, 보드 `01_Milestones/00_Decision_Board.local.json`(커밋 밖, `01_Milestones/.gitignore`)에 G11 결정 둘을 네 절 상세 글로 올렸다. `test/decisions.test.mjs`·`answer.test.mjs`·`decide-view.test.mjs`를 먼저 써서 모듈이 없어 실패하는 Red를 본 뒤 `lib/decisions.mjs`·`lib/deliver.mjs`·수집 블록·`server.mjs`·`chime.js` `AgentDeckDecide`·`app.js` 결정 영역·`styles.css`를 넣었다. 현황판 `node --test` 131건 통과·실패 0을 세 번 연속 봤다. 구현 선택(직전 정상 목록은 서버가 `collect`에 직전 스냅샷을 넘겨 보존, 카드는 「지금」 밖 `#decide`에 칠함, 결정은 `decision:<id>` 손 항목으로 알림에 얹음)은 커밋 메시지에 둔다. 보조 세션.
- PASS 2026-11-16T04:55:17+09:00 — 6단계. scratchpad 실행 스크립트로 4320을 버리는 터미널 handle `term_6bbf7a69…`로 띄웠다(메인·이 세션 handle은 스크립트가 거절). 카드 둘, 「지금」 노랑과 탭 제목 `(2)`, A·C 고른 상태와 서버 문장, 상세 글, 다크·라이트, 본문 600px 한 열을 찍었다. 코멘트를 치는 사이 스냅샷이 두 번 와도(04:49:45→04:50:07) 글자·포커스·커서가 남았다. 넣기는 버리는 PowerShell 프롬프트 줄에 문장만 들어가고 제출되지 않았음을 `orca terminal read`로 봤고, 두 번째 넣기는 「같은 문장을 이미 넣었어요」로 거절됐다. 보드에 임시 결정을 넣자 그 id만 울리고(`data-chime-count` 1→2) 고름이 새 번호로 유지됐고, 바로 지웠다. 탭·터미널·서버를 닫았다. 실제 Claude Code 프롬프트에 넣는 것은 보지 않았다. 보조 세션.
- PASS 2026-11-16T04:55:17+09:00 — 7단계와 하드 게이트. `docs/결정-응답.md`(104줄)를 새로 쓰고 README(243줄) 「읽기 전용 보장」을 「쓰기는 결정 응답 두 경로뿐」으로, 대비 점검 2번 줄을 「있음, H7」로, 알림 키 표에 `decision:<id>`를 더했다. 하드 게이트 다섯 종 exit 0(`test:hooks` 첫 실행 통과). 범위 밖은 Backlog 70. 기준 HEAD `0e3c94e0`. 보조 세션.
- PASS 2026-11-16T05:02:27+09:00 — 8단계. 구현 커밋 `3ba48242` 뒤 자체 검토에서 두 구멍을 막았다. 넣기가 실패해도 같은 문장 표시를 남겨 다시 눌러도 쌓이지 않게 했고, send가 「보낼 문장」 칸에 보인 문장을 `expect`로 보내 서버 문장과 다르면 409로 넣지 않게 했다(페이지도 미리보기를 기다리는 동안 멈춤). 시험을 먼저 고쳐 `answer.test.mjs`·`decide-view.test.mjs`에 더했고 현황판 `node --test` 133건 통과·실패 0을 세 번 봤다. 하드 게이트 다섯 종 exit 0. 이 보강은 화면에서 다시 보지 않았다(코드 경로와 시험만). 보조 세션.

## 결정 대장

- [USER] 결정이 필요한 일을 Dawnholder 현황판처럼 화면에서 고를 수 있게 한다 — 「결정이 필요한거 똑같이 던홀더 현황판처럼 체크할 수 있게 개선해줘」. 사용자가 메인 세션에 한 말을 보조 세션 지시문으로 받았다. README 「읽기 전용 보장」과 H4·H5의 「쓰기 경로를 들이지 않는다」 판단을 이 요청으로 뒤집는다 (2026-11-16)

출처 태그는 네 가지다 — `[USER]`·`[USER·위임]`·`[AI]`·`[AI·비가역]`.
