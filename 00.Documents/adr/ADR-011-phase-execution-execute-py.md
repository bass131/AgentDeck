### ADR-011: Phase 실행 — `scripts/execute.py` 헤드리스 순차 **(superseded 2026-06-26: /work:plan + 세션/루프로 대체)**
**결정**: 마일스톤을 Phase로 쪼개 `execute.py`가 `claude -p`로 순차 실행, Phase별 새 세션 + 상태(`status.json`) 추적 + 자동 커밋.
**이유**: 하네스 프레임워크 Layer 3. 각 Phase 범위가 문서로 제한 → 에이전트가 범위 밖 작업 안 함.
**트레이드오프**: 헤드리스 자동실행은 사람 게이트가 약해질 위험 → 비가역(push/PR/배포)은 `ask` 게이트 보존(settings.json).
**Superseded(2026-06-24)**: `scripts/execute.py`는 **미구현**(미채택). 실제 개발 프로세스는 **ADR-010(coordinator/도메인 Worker/reviewer/plan-auditor) + `/loop` 자율 루프**로 진행 — ADR-011의 '마일스톤→Phase 분해·범위 제한·자동 커밋' 의도는 `phases/NN/_INDEX.md` 정의서 + 사람 게이트(push/배포 ask)로 충족됨. `claude -p` 순차 실행 전제는 ADR-016(CLI 제거)으로도 무효. ADR-011은 초기 의도 기록으로 보존하되 **이 방식은 채택하지 않음**.

