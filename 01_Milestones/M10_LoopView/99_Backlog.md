# M10 Backlog

- 범위 밖 발견을 한 줄로 남긴다(헌법 11조). 최신 번호가 위다.

8. (G1 독립 검수 사소 10, 기존) `useGlobalShortcuts.test.tsx`의 `makeOnEscape`는 Shell의 Esc 처리를 다시 구현한 사본이라, `Shell.tsx`의 `workspaceMode !== 'single'` 가드를 지워도 그 묶음은 통과한다. 실제 가드는 `panelSession.difference-pins` B2가 본다. 사본을 진짜 Shell 렌더로 바꿀지 정한다.
7. (G1 독립 검수 사소 11) `README.md` 15~17·33줄이 지운 멀티 에이전트 화면(「6개 패널 동시 실행」)을 소개하고, 그 그림을 만들던 `readme-shots.e2e.ts` 컷④도 지워졌다. G3 화면이 서면 README 글과 그림을 새 작업 모드로 바꾼다.
6. (G1 독립 검수 사소 8 → G2) 작업 모드로 끈 뒤 다시 켜면 채팅의 마지막 대화가 복원되지 않는다(`restoreWorkspace.ts` — 대화 배치일 때만 복원). 작업 모드가 메인 대화를 갖는 G2에서 두 모드의 복원을 함께 정한다.
5. (G1 독립 검수 중요 4 → G3·G4) 작업 모드에서는 채팅 실행의 질문·권한 요청이 보이는 곳이 없다 — `QuestionModal`·`PermissionCard`가 `Conversation` 안에만 있고 작업 모드는 `Conversation`을 내린다. 사이드바 점은 「진행 중」뿐이다. G3 사이드바·G4 알림에서 「채팅이 답을 기다림」을 보인다.
4. (G1 독립 검수 중요 3, 로컬 현황판 불변 합의로 범위 밖) 로컬 현황판의 판정 ③ 사본(`99_Others/Dashboard/lib/markdown.mjs` 196~208, `progress.mjs` 226~229)은 goal 대장만 세는 옛 규칙이라, 훅은 통과시키는 goal(대장 [AI] 3 · [USER] 1)에 「새 워커를 띄울 수 없어요」 멈춤 알림을 띄운다. 현황판을 여는 마일스톤에서 같은 폴더 스펙 합산으로 맞춘다.
3. (범위 밖, G1 작업자 관찰) 멀티 모드를 지운 뒤 쓰는 곳이 없어진 것 — `multiAgentDefaults`의 COLS·COUNT_OPTIONS·SAMPLE_*, 앱에서 부르는 곳이 0인 `FolderSwitchDialog`(시험만 씀), 값이 app 하나뿐인 `QuestionModal`의 `layer` prop, 디스크 채널이 없어진 `panelSession` 스냅샷·복원 기계. G3 세션 탭이 다시 쓸지 본 뒤 정리한다.
2. (범위 밖, G1 작업자 관찰) 「새 소식」 표본 데이터 `whatsNewSampleData.ts`에 「멀티 에이전트」 소개 카드(N개 패널 병렬 작업)가 아직 사용자에게 보인다 — 제품 문구라 G3 화면 정리 때 고친다.
1. (범위 밖, 판정 장치) `.claude/commands/gate.md` 41·54·58줄이 G1에서 지운 `multi-agent-ops.e2e.ts`를 알려진 실패 기준으로 적고 있다. 판정 장치라 M10 「건드릴 곳」에 이름이 없어 고치지 않았다 — 다음에 판정 장치를 여는 마일스톤에서 줄을 뺀다.
