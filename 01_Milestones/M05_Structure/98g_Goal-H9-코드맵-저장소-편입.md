# M05 H9 — 코드맵 저장소 편입 · 저장소 밖에서 만든 코드 구조 지도를 AgentDeck 도구 폴더로

- 마일스톤: M05 (사용자 요청 — 코드 구조를 쉽게 보는 도구) · 작성: 2026-11-16 · 상태: 종결 (PR 59 병합, master `2362e72d`) · 검증 강도: 약(앱 소스 변경 0, 판정 장치는 포인터 한 줄)
- 작업 브랜치: `chore/m05-h9-codemap` — PR 58 병합 뒤 master(`0e21a5c4`)에서 시작했다. G12 종결 표기(상태·병합 승인 줄)도 이 브랜치에 얹는다.

## 목표

저장소 밖 `C:\Dev\AgentDeck-CodeMap`에서 보조 세션이 만든 코드 구조 계층 그래프(코드맵)가 `99_Others/CodeMap/`에 들어간다. 다른 PC에서 clone해도 명령 한 줄로 코드맵을 다시 만들어 볼 수 있다.

## 범위

- **만들 것**: `99_Others/CodeMap/`에 추출기·빌드 스크립트·HTML 템플릿·손으로 쓴 도메인 설명·조사 메모·README. 소스를 읽는 경로를 저장소 상대 경로로 바꾼다. 생성물은 `.gitignore`로 막는다.
- **건드릴 곳**: `99_Others/CodeMap/`(신설), 이 goal 문서, `98_Management/01_GateState/gate-config.json`의 `planPath` 한 줄(판정 장치 — 1단계), work-pin, G12 goal 문서의 종결 표기.
- **하지 않을 것**: AgentDeck 앱 소스·테스트·lint·vitest·tsconfig 설정 변경, 현황판 변경, 생성물(`codemap.html`·`codemap.json`)과 스크린샷 커밋, 옛 `C:\Dev\AgentDeck-CodeMap` 폴더 삭제(사용자 몫).
- **완료조건**
  - `99_Others/CodeMap/`에서 README의 다시 만들기 명령이 exit 0이고 `codemap.html`이 생긴다. 추출 수치(파일 287·클래스 15 등)가 옛 폴더의 결과와 같다.
  - 추출기 안에 `C:\Dev\AgentDeck` 같은 절대 경로가 0개다.
  - `git status`에 생성물이 보이지 않는다.
  - 하드 게이트 다섯 종 exit 0, `npm test` 수집 수는 434 그대로다.

## Phase 1 — 코드맵 편입 · 태그: `chore` · 의존: 코드맵 2차 작업 완료

진척 단계 (완료 `[x]`, 진행 `[>]`, 남음 `[ ]` — 위치 표시일 뿐이고 통과 판정은 검증 기록 줄만 한다)

- [x] 1. goal 문서 준비 — 이 goal 문서, 포인터 전환(`gate-config.json`의 `planPath`), pin 갱신, G12 종결 표기
- [x] 2. 코드맵 2차 결과 확인 — 보조 세션의 도메인 설명·따라 읽기 투어·코드 보기·적응형 너비를 화면과 수치로 대조
- [x] 3. 코드맵을 저장소로 가져오기 — 옛 폴더를 git 저장소로 묶어(생성물 제외 `.gitignore`) `git subtree add --prefix=99_Others/CodeMap`
- [x] 4. 저장소 안에서 돌게 고치기 — 소스 경로를 스크립트 위치 기준 상대 경로로, README의 경로와 명령 갱신
- [x] 5. 검증 — 새 위치에서 다시 만들기와 수치 대조, 절대 경로 0, 생성물 무시, 하드 게이트 다섯 종
- [x] 6. PR 올리고 병합 승인 요청 — 커밋, 작업 브랜치 push, PR 생성

실행 단계 일괄 승인 대상 (사용자가 「좋아 그렇게 진행해줘」로 방식을 승인했다)

- 옛 폴더의 `git init`·커밋, `git subtree add`, 코드맵 다시 만들기 명령, 하드 게이트 다섯 종
- 커밋, 작업 브랜치 push, `gh pr create`

DoD

- diff는 `99_Others/CodeMap/`, 이 문서, 포인터 한 줄, pin, G12 종결 표기뿐이다.
- 마크다운 문서 250줄 이하.

검증 기록

- PASS 2026-11-16T10:57:26+09:00 — 2단계. 보조 세션 2차 보고(도메인 설명 카드 47, 따라 읽기 8정거장, 컨벤션 예시 8, 오프라인 코드 보기, 3/2/1단 적응형)와 사용자 추가 요청 둘(종류별 묶음·소스 순서 전환, 소유자·영역 구분)을 스크린샷으로 대조했다 — 파일 안 선언이 타입·상수·함수·컴포넌트 묶음과 개수 머리줄로 나뉘고, `createRunManager` 안의 `lastUserContent`가 「내부 함수 · 소유 createRunManager(main › 03_Agent › agentRuns.ts)」로, 반환 객체 메서드가 「반환 객체」 배지로 보이며, 영역 색 띠가 경로·상세·코드 머리에 이어진다. 1차 수치(287파일, 30,447줄, 클래스 15)는 소스 grep과 같다. 보조 페인은 워커 해제 뒤 닫았다.
- PASS 2026-11-16T11:10:24+09:00 — 3~5단계. 옛 폴더를 git으로 묶고(`a786f24d`, `.gitignore`가 생성물·`shots/`·`REPORT.md` 제외) `git subtree add`로 들였다(`f824b81a`, 8파일). 4단계(`0ec4f1e5`)는 `extract.mjs`의 소스·TypeScript 기본 경로와 출력, `build.mjs`의 읽기를 스크립트 위치 기준으로 바꾸고 README를 「이 폴더 안에서 실행」으로 고쳤다. TDD 가드가 셋째 소스 편집을 막았고, 리셋 경로인 `npm test` Green이 이 기계에서는 5초 타임아웃 182건으로 성립하지 않아(Backlog 57 계열, `--testTimeout=30000`이면 5,781 통과·실패 0) `build.mjs` 쓰기와 `descriptions.json`·`guide.json` 읽기는 cwd 기준으로 남기고 README에 적었다. 새 위치에서 `node extract.mjs && node build.mjs`가 exit 0이고, 생성 시각을 뺀 `codemap.json`이 옛 폴더 결과와 바이트 같다(287파일, 30,447줄). 스크립트 안 절대 경로 0, 생성물은 `git status`에 안 보인다. 하드 게이트 다섯 종 exit 0, diff는 `99_Others/CodeMap/`·이 문서·G12 문서·포인터 한 줄·pin·Backlog뿐이다.
- PASS 2026-11-16T11:11:09+09:00 — 6단계. `-u origin chore/m05-h9-codemap`으로 push하고 PR 59(https://github.com/bass131/AgentDeck/pull/59)를 만들었다. 병합 승인은 현황판 결정 보드로 요청한다.

## 결정 대장

- [USER] 코드맵은 별도 프로젝트가 아니라 AgentDeck 도구 영역으로 옮긴다 — 「코드맵은 별도 프로젝트가 아니라 AgentDeck의 Tool 영역으로 이관해줘」 (2026-11-16)
- [USER] 위치 `99_Others/CodeMap/`, 생성물은 gitignore, 소스 경로는 상대 경로, G12 PR 뒤 별도 goal — 메인 제안에 「좋아 그렇게 진행해줘」 (2026-11-16)
- [USER] PR 59를 병합한다 — 현황판 결정 응답 「PR 59 코드맵 저장소 편입을 병합할지 → A 병합한다」 (2026-11-16)
- [AI] 가져오기는 H3 현황판 편입과 같이 `git subtree add`로 한다 — 헌법 8조상 Bash로 파일을 복사할 수 없고, 수십 KB 스크립트를 Write로 다시 쓰면 옮기며 내용이 바뀔 위험이 있다. 옛 폴더를 git으로 묶으면 들어온 내용이 원본과 같음을 커밋 해시로 보인다 (2026-11-16)
- [AI] 옛 폴더의 `shots/`(확인용 스크린샷 약 20MB)와 `REPORT.md`(작업 보고서 377줄, 헌법 5조 250줄 상한 초과)는 가져오지 않는다 — 다시 만드는 데 필요 없고, 보고서의 결론은 코드맵 화면(컨벤션 관찰·따라 읽기)과 이 문서에 남는다. 옛 폴더에는 그대로 있다 (2026-11-16)

출처 태그는 네 가지다 — `[USER]`·`[USER·위임]`·`[AI]`·`[AI·비가역]`.
