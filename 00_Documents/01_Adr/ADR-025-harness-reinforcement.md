### ADR-025: 하네스 보강 (ClaudeDev 참고) — CHANGELOG · advisory 훅 · /refactor-sweep · phase-gate · work-judge 3버킷 ⭐

**결정**: AgentDeck Agent Harness를 `C:\Dev\ClaudeDev` 하네스 참고로 보강(2026-06-26, 사용자 인가 — `.claude/**` deny 일시 해제 후 직접 적용). 심층감사·드라이버=`docs/HARNESS_GAP.md`(UltraCode 워크플로 4 병렬감사 + 합성).

- **가져옴**: ① `.claude/CHANGELOG.md` — 헌법/ADR/하네스/공유계약 변경 박제(compact·세션 경계에서 옛 결정 기반 사고 방지, 솔로+AI 적응). ② advisory 훅 3종(`scripts/hooks/`) — `risk-detector`(Edit/Write 시 4깃발 자동검출) · `reviewer-auto-trigger`(경계/계약 파일 변경 시 reviewer 권장) · `phase-gate-validator`(완료보고 5단계 점검). **전부 exit0 advisory**(차단 아님). ③ `/refactor-sweep` 커맨드 — 무인 자동 리팩토링(TS 적응, G1~G9 안전가드, 신뢰경계/ADR-003 영구제외, push 금지, 전용브랜치 atomic). ④ work-judge 3버킷(기계 자동게이트 / 육안 사용자트랙 / 비가역 사람게이트) → `_routing.md`에 명문화.
- **스킵(솔로+AI 부적합)**: 별도 `.claude/policies/` 파일군 — `_routing.md`가 이미 등급/깃발/라우팅/review-tiering/권한경계를 **단일정의** → 별도 파일은 중복·분산. knowledge-gc(MEMORY.md auto-memory가 대체 + self-reinforcement 위험) · 팀 namespace(솔로) · `/engine:goal` 루프드라이버(내장 /loop 활용이 1순위) · `/cross-review`(Codex 듀얼백엔드는 Track 2 미착수).

**이유**: ClaudeDev=다인 팀, AgentDeck=솔로+AI → 팀 운영 기능은 적응/스킵. 하네스가 강해지면 후속 정리·리팩토링이 안전·빠름(refactor-sweep·게이트·자동 깃발). CHANGELOG는 compact 빈발 환경에서 결정 기억의 단일원.

**트레이드오프 / 불변**: ① 훅은 **advisory(exit0) 선행** — 잘못된 차단(exit2)은 전 도구 호출 마비 위험 → 안정 후 승격 검토. ② 하네스(`.claude/**`) 변경=사용자 단독 통제 — 보강은 deny 일시 해제(인가) 후 적용, 작업 후 **deny 복원**. ③ refactor-sweep = 신뢰경계·ADR-003 영구제외(G7) + push/배포 인간 게이트(G4). ④ **정책 단일정의**: 등급/깃발/라우팅은 `_routing.md` 단일원 유지(별도 파일 분산 금지 — H5 별도파일 스킵 근거).

**위험도**: [L] — 전부 추가만(기존 결정·헌법/ADR 본문 수정 0).

**현황(2026-06-26)**: H1(CHANGELOG·risk-detector·reviewer-auto-trigger ✅) + H2(`/refactor-sweep` ✅) + H4(phase-gate-validator ✅) + H6(work-judge 3버킷 ✅) 적용. `.claude/settings.json` 훅 6종 등록. H11(본 ADR) 박제. (미push — 인간 게이트.)

> **개정(2026-06-27, ADR-026)**: 본 ADR의 *"policies 별도 파일 스킵(H5)"* 결정은 **ADR-026(정식 이식)이 개정** — `.claude/policies/` 10개 신설(헌법 슬림 350임계 + INDEX 카탈로그, `_routing`은 빠른 매핑으로 역할 분담). 나머지(CHANGELOG·advisory 훅·refactor-sweep·work-judge 3버킷·knowledge/engine:goal/cross-review 스킵)는 ADR-026이 **계승·확장**.

---

