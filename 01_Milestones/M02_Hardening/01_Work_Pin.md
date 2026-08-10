# work-pin — 작업 좌표 (M02)

세션 재개의 단일 인수인계 표면입니다.
좌표와 마감 요약은 현재 상태만 덮어쓰기로 유지하고, 이력은 git이 보유합니다.
결정과 검증의 정본은 같은 폴더의 `_MilestonePreview.md`와 Phase 파일 다섯 개입니다.
gate-config의 pin 포인터가 이 파일로 전환되면(Phase 1 Step 3), 세션 기동 시 이 파일의 전문이 자동 주입됩니다.

## 좌표

- 마일스톤: **M02 Hardening (하네스 강도 수리)** — `01_Milestones/M02_Hardening/_MilestonePreview.md` (Phase 파일 5개)
- 상태: **Phase 5 Steps 1~7 집행 완료** (2026-08-10) — 이주 잔재 12건이 `00_Documents/05_Design_Notes/`로 이주하고 삭제 2건은 사용자 직접 실행으로 처리됐으며, 활성 소비자 표면 935건의 옛 경로 참조가 0건이고 수집 차분이 고정치와 정확 일치합니다. 하드 게이트 다섯 종 green에 `npm test` 실패 0이고, Phase 1~5 전 구간이 이로써 집행 완료입니다.
- 다음 액션: **M02 마감 절차 (새 세션)** — Preview 「마감 절차」의 열 단계이고, 시작은 Phase 5 인수 대조(검증 기록 줄·`git log`의 `M02-P5` 토큰·`git status` clean·hook-log의 stop-gate 줄 확인 후 Phase 5에 확인 줄 append)입니다. 리뷰어 1차와 Codex 교차 검수, 마감 보고서 등재(워커 위임), 마감 커밋과 사용자 마감 판정, 원격 push가 남았습니다.
- 규율: Phase 경계는 전부 새 워커 세션(top-level, `claude --agent worker` 기동 — 역할 신호 agent_type=worker 실측 성립)입니다. `--resume`은 전 구간 금지이고, 재개는 이 pin과 계획 문서로만 합니다. 인수 대조는 사람 감사 수준([USER] 결정 1)입니다.
- 모델 라우팅: 정본은 `00_Documents/02_Rules/02_모델-라우팅-정책.md`입니다.

## 마감 요약 (최신 1건 — 3줄: 바뀐 것 / 내린 결정 / 봐야 할 것)

- 스탬프: 2026-08-10T22:05:00+09:00
- 바뀐 것: 이주 잔재 문서 12건이 `01_Documents/`에서 신설 거처 `00_Documents/05_Design_Notes/`로 옮겨졌고, 훅 주석 2건과 문서 자기 참조 3건이 새 경로로 갱신됐습니다. 삭제 2건(`orig-probe.e2e.ts`·`12_M01-Bootstrap-Phase-Steps.md`)은 사용자가 직접 실행했고 워커 집행은 0건이며, `collection-baseline`이 하한 402에서 등호 417로 전환되고 e2e 기준선이 `gate.md`에 새 절로 등재됐습니다.
- 내린 결정: 처분 목록 네 안건이 [USER] 판정으로 확정됐습니다 — 목적지는 제3안인 논의본 전용 거처 신설, 산출물 3종은 「재생성 허용」(.gitignore 등재 확인으로 대체), M01 계획의 이관 전 원본은 중복본이라 이동에서 삭제로 재분류, e2e 실패 2건 중 하나는 삭제하고 하나는 알려진 실패로 명기 후 Backlog 이월입니다.
- 봐야 할 것: 이 세션의 마감 커밋(`M02-P5` 토큰)·`git status` clean·정상 Stop은 새 마감 세션이 인수 대조로 판정해 `05_Phase_5.md`에 append합니다. 그다음이 Preview 「마감 절차」이며, 잔여 사용자 게이트는 마감 판정과 원격 push 둘입니다.
