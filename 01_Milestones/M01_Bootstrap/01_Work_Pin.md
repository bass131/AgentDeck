# work-pin — 작업 좌표 (M01)

세션 재개의 단일 인수인계 표면입니다.
좌표와 마감 요약은 현재 상태만 덮어쓰기로 유지하고, 이력은 git이 보유합니다.
결정과 검증의 정본은 같은 폴더의 `_MilestonePreview.md`와 Phase 파일 여섯 개입니다.
Phase 4에서 SessionStart 훅을 켜고 나면, 세션이 기동할 때 이 파일의 전문이 자동으로 주입됩니다.

## 좌표

- 마일스톤: **M01 Bootstrap (Moodie 하네스 인스턴스화)** — `01_Milestones/M01_Bootstrap/_MilestonePreview.md` (파일 구획 구성, Phase 파일 6개)
- 상태: **Phase 3 완료** (2026-08-10, 커밋 cb0d92a) — 결손 규칙 다섯 건을 TDD로 차단 축에 넣었고, git 판정을 머리 토큰 기준으로 바꿔 인용문 오탐을 제거했습니다. 하드 게이트 5종과 npm test 기준선 대조를 통과했습니다.
- 다음 액션: **Phase 4 — 훅 7종 이식·활성화** (`04_Phase_4.md`). 새 세션에서 시작하고, 수정표대로 훅을 옮긴 뒤 fixtures와 스모크 러너를 `npm run test:hooks`에 편입합니다.
- 규율: Phase 경계는 전부 새 워커 세션입니다 — 각 Phase를 실행하는 워커가 새 세션이어야 한다는 뜻이고, 감독하는 오케스트레이터 세션은 여러 Phase에 걸쳐 지속할 수 있습니다 ([USER] 2026-08-10 해석 확정, 결정 대장 참조). `--resume`은 전 구간 금지이고, 재개는 이 pin과 계획 문서로만 합니다.
- 모델 라우팅: 정본은 `00_Documents/02_Rules/02_모델-라우팅-정책.md`입니다.

## 마감 요약 (최신 1건 — 3줄: 바뀐 것 / 내린 결정 / 봐야 할 것)

- 스탬프: 2026-08-10T10:51:27+09:00
- 바뀐 것: dangerous-cmd-guard에 Moodie 대조 결손 다섯 건(git restore·del /s·rmdir /s·Remove-Item -Recurse 단독·git config --global)을 TDD Red→Green으로 추가했고, git 판정을 머리 토큰 기준으로 바꿨습니다. 테스트 12개 명령 케이스가 늘었고 커밋은 cb0d92a입니다.
- 내린 결정: 사람 승인 축(push·publish)은 [USER] 판정대로 ask 다이얼로그를 유지했고, gh·npm 규칙이 아직 정규식 판정이라는 점은 범위 밖 관찰로만 기록했습니다. 워커는 orca-cycle 분할 페인에서 claude-opus-5·effort high로 돌렸고 영수증을 대조했습니다.
- 봐야 할 것: Red 단계에서 옛 정규식의 실오탐(echo git reset --hard 차단)과 누락(git -C repo reset --hard 미검출)이 드러나 함께 수리됐습니다. 인용부 내부를 통째로 버리는 scanSegments의 트레이드오프(인용 속 위험 명령도 못 봄)는 Phase 4 이후 판단거리입니다.
---
재개 절차: 위 좌표를 기점으로 현재 Phase 파일의 목표·Steps·DoD·검증 기록을 읽고 재개하세요. 검증 기록 줄 밖의 통과 주장은 무효입니다.
