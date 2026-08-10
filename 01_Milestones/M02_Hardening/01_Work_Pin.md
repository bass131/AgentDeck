# work-pin — 작업 좌표 (M02)

세션 재개의 단일 인수인계 표면입니다.
좌표와 마감 요약은 현재 상태만 덮어쓰기로 유지하고, 이력은 git이 보유합니다.
결정과 검증의 정본은 같은 폴더의 `_MilestonePreview.md`와 Phase 파일 다섯 개입니다.
gate-config의 pin 포인터가 이 파일로 전환되면(Phase 1 Step 3), 세션 기동 시 이 파일의 전문이 자동 주입됩니다.

## 좌표

- 마일스톤: **M02 Hardening (하네스 강도 수리)** — `01_Milestones/M02_Hardening/_MilestonePreview.md` (Phase 파일 5개)
- 상태: **Phase 4 Steps 1~8 집행 완료** (2026-08-10) — 응답 표피 검사 훅 `51_surface-probe.cjs`가 차단 없는 피드백형으로 신설돼 Stop에 배선됐고, `check-readme-links`의 판정 사각 네 종이 수리됐으며, 문서 정합 3건과 AD-02 수리 방안 [USER] 확정이 끝났습니다. 하드 게이트 다섯 종 green에 `npm test` 실패 0입니다.
- 다음 액션: **Phase 5 워커 사이클** — 시작 Step은 Phase 4 인수 대조(검증 기록 줄·`git log`의 `M02-P4` 토큰·`git status` clean·hook-log의 표피 훅 Stop 줄과 stop-gate 확인 후 Phase 4에 확인 줄 append)이고, 본체는 이주 잔재·무효 테스트의 이름 확정 목록과 사용자 승인 뒤 집행입니다. [USER] 마일스톤 완주 기동 승인이 있어 Phase별 기동은 승인 없이 진행하되, 처분 승인·삭제 직접 실행(P5)·마감 판정·push는 사용자 게이트로 남습니다.
- 규율: Phase 경계는 전부 새 워커 세션(top-level, `claude --agent worker` 기동 — 역할 신호 agent_type=worker 실측 성립)입니다. `--resume`은 전 구간 금지이고, 재개는 이 pin과 계획 문서로만 합니다. 인수 대조는 사람 감사 수준([USER] 결정 1)입니다.
- 모델 라우팅: 정본은 `00_Documents/02_Rules/02_모델-라우팅-정책.md`입니다.

## 마감 요약 (최신 1건 — 3줄: 바뀐 것 / 내린 결정 / 봐야 할 것)

- 스탬프: 2026-08-10T21:24:30+09:00
- 바뀐 것: 응답 표피를 기계 판정하는 훅이 생겨 Stop에 배선됐습니다 — 원문자 임시 기호·문장당 괄호 2쌍·화살표 3개·200자 초과 넷을 보고, 차단 없이 systemMessage 한 건과 hook-log 한 줄만 냅니다. `check-readme-links`는 공백 든 타깃·reference-style 링크를 집계하고 저장소 밖 형제 경로와 대소문자 불일치를 반려하도록 수리됐으며, 라우팅 정책의 Backlog 조항·README 옛 편제·M01 Phase 2 DoD 정정 줄도 함께 들어갔습니다.
- 내린 결정: AD-02는 안 B(뜬 워커의 첫 편집 차단)로 확정됐습니다 — 안 A(스폰 셸 명령 판별)는 이미 기각된 가드 공통 한계를 물려받는 표면이라 기각했고, 기동 이후 차단이라 계획 없는 세션이 뜨는 비용은 수용했습니다. 실물화는 후속 마일스톤이고 유지 대장 AD-02 상태는 존치에서 진행으로 옮겼습니다.
- 봐야 할 것: 표피 훅 배선의 영수증은 이 세션 종료 Stop이 남기는 hook-log 줄이며, 판정은 Phase 5 인수 Step이 합니다. 관찰 자기보고 2건(설정 배선 단정 테스트 부재·문장 경계 재량 두 자리)은 Step 7 이후 편집 제한 때문에 Backlog가 아니라 04_Phase_4.md 검증 기록 21:23:00 줄에 적혀 있습니다.
