# M05 G3 — 죽은 코드와 복제 검사 테스트 정리

- 마일스톤: M05 구조 감사와 도메인별 재편 (로드맵 2번) · 작성: 2026-11-14 · 상태: 종결 (PR 40 병합) · 검증 강도: 강
- 작업 브랜치: `chore/m05-g3-dead-code`
- 출발점: `12_G1-재편-계획.md`의 G3 절과 감사 보고서 `11_G1-감사-보고서.md` 54·55줄.

## 목표

G4 이후 이동 goal이 옮길 파일 수를 줄이고, 테스트가 실물 모듈을 검사하게 만든다. 어디서도 쓰지 않는 코드가 사라지고, 복제본을 검사하던 테스트가 실제 핸들러와 소스를 import한다.

## 범위

- **만들 것**
  - 죽은 renderer 파일 6개 삭제: `renderer/src/features/agent/SubAgentModal.tsx`, `renderer/src/layout/CodeViewerPane.tsx`, `renderer/src/lib/composerSampleData.ts`, `renderer/src/lib/gitSampleData.ts`, `renderer/src/lib/treeFilter.ts`, `renderer/src/store/continuity.ts`, 그리고 `CodeViewerPane.tsx`만 쓰는 `renderer/src/layout/CodeViewerPane.css`(모두 `02_Project/00_Source/` 아래). 배럴 `index.ts`의 재수출 줄과, 이 파일들만 검사하는 테스트도 함께 정리한다.
  - 테스트만 쓰는 `usePanelSession`(`renderer/src/store/panelSession.ts`)과 `Shell.tsx`의 열릴 수 없는 견본 질문 모달 삭제.
  - 참조 0건인 export 삭제(감사 보고서 약 25개 — 착수 때 다시 센다).
  - 복제본을 검사하는 main 테스트 4개(`01_TestCode/main/permission-respond-handler`, `question-respond-handler`, `handlers/personalization`, `orchestration-ipc-normalize`)를 실제 핸들러 등록 함수를 거쳐 검사하도록 바꾼다(electron mock, 소스 무변경). 소스를 import하지 않는 renderer 테스트 2개(`w6-inject-nonce`, `m7-explorer-lazy`)도 실물 검사로 바꾼다.
- **건드릴 곳**: 위 소스와 테스트, 배럴 `index.ts`, `collection-baseline.test.ts`의 수집 개수. 핸들러 검증 로직을 테스트가 import할 수 있게 소스에서 꺼내는 export 추가(동작 불변).
- **하지 않을 것**: 안 쓰는 채널 3개의 제거(계약 변경은 G10), 동작 변경, 파일 이동, 판정 장치 변경. 살아 있는 코드가 쓰는 export의 삭제.
- **완료조건**
  - 감사 보고서의 죽은 코드 목록이 소스에서 사라졌다(파일 6개, `usePanelSession`, 견본 모달, 참조 0건 export). grep으로 확인한다.
  - 바뀐 테스트 6개가 실물 모듈을 import한다. 각 테스트가 실물 로직을 깨뜨리면 실패하는지 한 번씩 확인한다(뮤테이션 확인 뒤 되돌림).
  - 하드 게이트 다섯 종 exit 0, `npm test` 실패 0, `collection-baseline`의 개수가 지운 테스트 수만큼 줄었다.

## Phase 1 — 죽은 코드 정리 · 태그: `cleanup`·`test` · 의존: 없음

진척 단계 (완료 `[x]`, 진행 `[>]`, 남음 `[ ]` — 위치 표시일 뿐이고 통과 판정은 검증 기록 줄만 한다)

- [x] 1. G2 종결 기록, 이 goal 문서, 포인터 전환, pin 갱신
- [x] 2. 재실측 — 죽은 파일 6개와 `usePanelSession`이 정말 프로덕션 경로에서 안 쓰이는지, 그것만 검사하는 테스트가 몇 개인지, 참조 0건 export 목록을 센다. 지울 테스트가 그 코드만 검사하는지 판정한다
- [x] 3. 죽은 파일·`usePanelSession`·견본 모달·참조 0건 export 삭제와 테스트 정리
- [x] 4. 복제 검사 테스트 6개를 실물 import로 바꾸고 뮤테이션 확인
- [x] 5. 강 등급 검증 — 구현 문맥 없는 검수자, 하드 게이트 다섯 종, `npm test`
- [x] 6. 커밋, 작업 브랜치 push, PR 생성 (Night Shift — 병합은 사용자가 깬 뒤)

실행 단계 일괄 승인 대상 (로드맵 합의로 승인됐다)

- 하드 게이트 다섯 종, `npm test`, 개별 vitest 실행
- 계획에 이름이 적힌 파일과 그것만 검사하는 테스트의 `git rm`(결정 대장 [USER] 2026-11-14)
- `worker`(구현)·`reviewer`(검수) 하위 에이전트 기동
- 커밋, 작업 브랜치 push, `gh pr create`, 병합 승인 다이얼로그(`gh pr merge`)

DoD

- 지운 테스트마다 「죽은 코드만 검사했다」는 근거가 검증 기록에 있다. 살아 있는 코드를 함께 검사하던 테스트는 지우지 않고 그 부분을 남긴다.
- 바뀐 테스트 6개의 단언 의도가 보존되고, 실물 로직 변형에 실패한다.
- 프로덕션 동작 변경 0 — 검수자가 diff로 대조한다.
- 마크다운 문서는 250줄 이하다.

검증 기록

- PASS 2026-11-14T03:14:11+09:00 — 2단계 재실측(워커, 읽기 전용). TypeScript compiler API로 `main.tsx`에서 import 그래프를 따라간 결과다.
  - 죽은 파일: 닿지 않는 renderer 소스는 6개뿐이다. 배럴 재수출·문자열 경로 참조도 0건이다.
  - `usePanelSession`: 소스 사용 0건이다. 프로덕션은 `usePanelSlot`을 쓴다.
  - 견본 모달: `Shell.tsx:352-357`이다. `questionOpen`을 true로 만드는 곳이 없다.
  - 참조 0건 export: 어디서도 안 쓰는 것 16개다.
  - 「죽은 코드만 검사」로 판정한 테스트 파일은 셋이다. `01_TestCode/renderer/SubAgentModal.test.tsx`(SM1~4가 이 컴포넌트만 렌더), `renderer/treeFilter.test.ts`(`filterFiles`만 검사, 같은 로직의 소스 없음), `renderer/gap1-p16-s2-thinking-continuity.test.ts`(`isThinkingContinuous`만 검사, 실제 판정은 인라인)이다. 이 셋을 `git rm` 대상으로 적는다.
  - 부분 삭제: `gap1-p01-mcp-verb-label`·`codeviewer`·`markdown-image`·`reference-folder`의 해당 describe, `multi-concurrent:298` it, `panel-session` (e) it이다.
  - 바꿀 테스트: `usePanelSession` 테스트 10파일은 `usePanelSlot`으로 바꾼다. composer 테스트 2개는 고정 데이터를 안으로 옮긴다. 복제 검사 테스트는 6개다.
  - `collection-baseline` 개수는 417에서 414가 된다.
  - 세션 df394581.
- PASS 2026-11-14T03:40:05+09:00 — 3·4단계 구현(워커 보고 대조).
  - 삭제: `git rm` 10건(소스 7, 테스트 3)이다. 그 밖의 파일 삭제는 0건이다.
  - 소스 정리: `usePanelSession` 71줄, 견본 모달, A등급 export 17개(`SAMPLE_QUESTIONS` 포함)를 지웠다.
  - `nextInject`는 Shell.tsx에서 export한다. 반환 타입이 `features/conversation`에 있어서, lib에 두면 lib→features 의존이 생기기 때문이다.
  - 복제 검사 테스트 6개는 실물을 import한다. main 4개는 `vi.mock('electron')` 위에 실제 `register*Handlers`를 쓴다. 뮤테이션 확인에서 6개 모두 실패했다(1/17, 1/23, 1/15, 7/19, 5/5, 1/20). 깨뜨린 곳은 전부 되돌렸고, main 소스 diff는 0이다.
  - 테스트 파일은 417에서 414로, it은 47개 줄었다.
  - 게이트: 하드 게이트 다섯 종 exit 0, `npm test -- --reporter=dot --no-color --silent` 408파일 통과·6 skip·수집 414·실패 0(66초).
  - 세션 df394581.
- PASS 2026-11-14T03:52:38+09:00 — 5단계 강 등급 검증. 구현 문맥 없는 검수자(fable)가 차단 0·중요 0·경미 8로 통과를 냈다.
  - 경미 1은 고쳤다. `orchestration-ipc-normalize`의 Layer B 「정규화 시뮬레이션」 it 3개는 정규화 식을 테스트 안에서 다시 계산하는 복제 검사였다. 같은 입력은 Layer A가 실제 AGENT_RUN 핸들러로 검사하므로 지웠다.
  - 경미 4는 이 줄로 메운다. `w6-inject-nonce`의 「버그 재현」 describe를 지운 근거다. 첫 it은 지역 변수로 옛 독립 카운터 버그를 재현할 뿐 소스를 부르지 않았다. 둘째 it은 위 describe의 순차 주입 it과 같은 검사였다.
  - 경미 5는 고쳤다. 지운 `CodeViewerPane`·`SubAgentModal`·ImagePreview default를 가리키던 배럴 주석 셋(viewer·conversation·agent)을 현재에 맞췄다.
  - 경미 7·8은 커밋 전에 처리한다(pin 정리, 미추적 goal 문서 stage). 경미 2·3·6은 Backlog 24~26번으로 넘겼다.
  - 게이트: 수정 뒤 하드 게이트 다섯 종 exit 0, `npm test -- --reporter=dot --no-color --silent` 408파일 통과·6 skip·수집 414·실패 0(66초).
  - 세션 df394581.
- PASS 2026-11-14T03:54:30+09:00 — 6단계. 커밋 `659aede`를 `chore/m05-g3-dead-code`로 push했고 PR 40(base `master`)을 열었다. Night Shift라서 병합하지 않았다. 이 줄과 종결 표시는 G4 브랜치의 첫 커밋에 실린다. 세션 df394581.

## 결정 대장

- [USER] 이 로드맵의 goal들은 헌법 11조의 예외로 합의 문답 없이 이어서 진행한다. 사용자가 「이번 순서만 예외로 이어서 처리」로 답했다 (로드맵 문답, 2026-11-13)
- [USER] 이 goal의 범위 초안은 G1 재편 계획의 G3 절이고, 사용자가 PR 37 병합으로 승인했다 (2026-11-13)
- [USER] 헌법 8조의 셸 경유 파일 작업 예외에, goal 문서에 이름이 적힌 파일의 `git rm` 삭제를 건별로 더한다. 헌법 문면은 고치지 않고 이 로드맵 동안의 해석으로 둔다. 사용자가 「goal에 적은 파일만 git rm 허용」으로 답했다 (파일 삭제 문답, 2026-11-14)
- [USER] 재실측 범위 판단 다섯을 추천안대로 한다. 사용자가 G3 범위 문답에서 「추천안대로」로 답했다 (2026-11-14). 내용은 다섯이다.
  - 참조 0건 export는 어디서도 안 쓰는 16개만 지운다. 자기 파일에서만 쓰는 164개의 `export` 키워드 제거는 Backlog로 넘긴다.
  - `CodeViewerPane.css`를 삭제 목록에 더한다.
  - FileModal의 같은 동작을 검사하는 새 테스트는 Backlog로 넘긴다.
  - 복제 검사 main 테스트 4개는 소스 변경 없이 `vi.mock('electron')`으로 실제 `register*Handlers`를 호출하는 꼴로 바꾼다(`settings-root-scan.test.ts` 패턴). renderer 2개는 순수 함수에 `export`를 붙이거나 기존 lib 파일로 꺼내 실물을 import한다.
  - `m7-explorer-lazy`에서 소스 로직 없이 Map·mock만 검사하는 블록은 지우고, 렌더 테스트로의 교체는 Backlog로 넘긴다.
- [USER] Night Shift: 이 goal부터 병합하지 않고 PR까지만 만든다. 다음 goal은 이 브랜치 위에 쌓는다. 판단은 Second Brain 성향을 따른다. 사용자가 「Night Shift 모드로 전환해줘, 판단 성향은 내 Second Brain 참고해주고, PR까지만 전부 올리고 나 일어나면 한번에 보고해줘」라고 했다 (2026-11-14, 로드맵 「goal 사이의 진행 방식」 절)
- [AI] 「그 코드만 검사하는 테스트」의 삭제도 같은 예외로 본다. 지울 테스트 파일은 2단계 재실측 뒤 이 문서의 검증 기록에 이름으로 적고 나서 지운다 (2026-11-14)
