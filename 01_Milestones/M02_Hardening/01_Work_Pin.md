# work-pin — 작업 좌표 (M02)

세션 재개의 단일 인수인계 표면입니다.
좌표와 마감 요약은 현재 상태만 덮어쓰기로 유지하고, 이력은 git이 보유합니다.
결정과 검증의 정본은 같은 폴더의 `_MilestonePreview.md`와 Phase 파일 다섯 개입니다.
gate-config의 pin 포인터가 이 파일로 전환되면(Phase 1 Step 3), 세션 기동 시 이 파일의 전문이 자동 주입됩니다.

## 좌표

- 마일스톤: **M02 Hardening (하네스 강도 수리)** — `01_Milestones/M02_Hardening/_MilestonePreview.md` (Phase 파일 5개)
- 상태: **Phase 2 Steps 1~13 집행 완료** (2026-08-10) — 가드 우회면을 수리해 기대-실패 플래그가 18건에서 0건이 됐고, 가드 spawn 테스트 전건이 공통 격리 헬퍼를 경유하며, 가드 판정 로그가 신설되고 settings matcher가 `^Bash$`로 정합됐습니다. 하드 게이트 다섯 종 green에 `npm test` 실패 0입니다.
- 다음 액션: **Phase 3 워커 사이클** — 시작 Step은 Phase 2 인수 대조(검증 기록 줄·`git log`의 `M02-P2` 토큰·`git status` clean·hook-log의 stop-gate 확인 후 Phase 2에 확인 줄 append)이고, 본체는 게이트 판독·증거 강도 수리와 동시성 진짜 동시 재실측입니다. [USER] 마일스톤 완주 기동 승인이 있어 Phase별 기동은 승인 없이 진행하되, AD-02 문답(P4)·처분 승인·삭제 직접 실행(P5)·마감 판정·push는 사용자 게이트로 남습니다.
- 규율: Phase 경계는 전부 새 워커 세션(top-level, `claude --agent worker` 기동 — 역할 신호 agent_type=worker 실측 성립)입니다. `--resume`은 전 구간 금지이고, 재개는 이 pin과 계획 문서로만 합니다. 인수 대조는 사람 감사 수준([USER] 결정 1)입니다.
- 모델 라우팅: 정본은 `00_Documents/02_Rules/02_모델-라우팅-정책.md`입니다.

## 마감 요약 (최신 1건 — 3줄: 바뀐 것 / 내린 결정 / 봐야 할 것)

- 스탬프: 2026-08-10T20:07:43+09:00
- 바뀐 것: 위험 명령 가드가 인용 우회·rm 재귀 변형·git 머리 토큰(`git.exe`·대문자)·branch 삭제강제 동치·stash 폐기·checkout `.`를 잡고 읽기 전용 `git config --get`과 실행되지 않는 heredoc 본문은 통과시키게 수리돼, 기대-실패 플래그가 18건에서 0건이 됐습니다. 가드 spawn 테스트 전건이 격리 헬퍼를 경유하고, 가드 판정 로그와 matcher 앵커가 신설·정합됐습니다.
- 내린 결정: heredoc 면제는 실행되지도 파일로 남지도 않는 소비자 셋(`git commit -F -`·operand 없는 `cat`·operand 없는 `tee`)뿐이고 파일 sink는 판별 불가로 스캔을 유지합니다. 격리 판정은 코디네이터 재정에 따라 문자열 포함이 아니라 `session`·`agent_id` 필드 동등 비교로 두고, 가드 로그의 `cmd` 필드는 초과분으로 유지 승인됐습니다.
- 봐야 할 것: Step 8의 로거를 Step 3~6 수리와 한 편집으로 넣어 「구현 전 Red」 순서를 어겼고 사후 재현으로 영수증을 남긴 자기보고 줄이 있습니다(검증 기록 20:07:00). Backlog 2~4번은 계획 밖이라 손대지 않은 관찰 3건입니다.
