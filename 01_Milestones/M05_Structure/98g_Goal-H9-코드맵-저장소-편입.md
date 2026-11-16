# M05 H9 — 코드맵 저장소 편입 · 저장소 밖에서 만든 코드 구조 지도를 AgentDeck 도구 폴더로

- 마일스톤: M05 (사용자 요청 — 코드 구조를 쉽게 보는 도구) · 작성: 2026-11-16 · 상태: 실행 중 · 검증 강도: 약(앱 소스 변경 0, 판정 장치는 포인터 한 줄)
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
- [ ] 2. 코드맵 2차 결과 확인 — 보조 세션의 도메인 설명·따라 읽기 투어·코드 보기·적응형 너비를 화면과 수치로 대조
- [ ] 3. 코드맵을 저장소로 가져오기 — 옛 폴더를 git 저장소로 묶어(생성물 제외 `.gitignore`) `git subtree add --prefix=99_Others/CodeMap`
- [ ] 4. 저장소 안에서 돌게 고치기 — 소스 경로를 스크립트 위치 기준 상대 경로로, README의 경로와 명령 갱신
- [ ] 5. 검증 — 새 위치에서 다시 만들기와 수치 대조, 절대 경로 0, 생성물 무시, 하드 게이트 다섯 종
- [ ] 6. PR 올리고 병합 승인 요청 — 커밋, 작업 브랜치 push, PR 생성

실행 단계 일괄 승인 대상 (사용자가 「좋아 그렇게 진행해줘」로 방식을 승인했다)

- 옛 폴더의 `git init`·커밋, `git subtree add`, 코드맵 다시 만들기 명령, 하드 게이트 다섯 종
- 커밋, 작업 브랜치 push, `gh pr create`

DoD

- diff는 `99_Others/CodeMap/`, 이 문서, 포인터 한 줄, pin, G12 종결 표기뿐이다.
- 마크다운 문서 250줄 이하.

검증 기록

## 결정 대장

- [USER] 코드맵은 별도 프로젝트가 아니라 AgentDeck 도구 영역으로 옮긴다 — 「코드맵은 별도 프로젝트가 아니라 AgentDeck의 Tool 영역으로 이관해줘」 (2026-11-16)
- [USER] 위치 `99_Others/CodeMap/`, 생성물은 gitignore, 소스 경로는 상대 경로, G12 PR 뒤 별도 goal — 메인 제안에 「좋아 그렇게 진행해줘」 (2026-11-16)
- [AI] 가져오기는 H3 현황판 편입과 같이 `git subtree add`로 한다 — 헌법 8조상 Bash로 파일을 복사할 수 없고, 수십 KB 스크립트를 Write로 다시 쓰면 옮기며 내용이 바뀔 위험이 있다. 옛 폴더를 git으로 묶으면 들어온 내용이 원본과 같음을 커밋 해시로 보인다 (2026-11-16)

출처 태그는 네 가지다 — `[USER]`·`[USER·위임]`·`[AI]`·`[AI·비가역]`.
