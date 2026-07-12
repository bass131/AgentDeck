### ADR-026: 하네스 정식 이식 (ClaudeDev → AgentDeck) — ADR-025 부분 보강을 정식 포트로 확장 ⭐

**결정**: ClaudeDev 하네스를 *정식 이식*. 단일 진실원 = `docs/HARNESS_PORT_MANIFEST.md`(2026-06-26, ClaudeDev 세션이 외부 무편향 시점에서 작성). 자기편향 진단 `HARNESS_GAP.md`(AgentDeck 세션이 자기진단해 스킵 합리화)를 supersede. **2층 분리**: 프로세스 골격(A)=ClaudeDev 통째 이식·폴더명만 적응 / 도메인 살(B)=AgentDeck 문서에서 재유도(복붙 금지=누더기 제거).

- **`.claude/policies/` 10개 신설** (ADR-025 H5 "스킵" **개정**): reporting-format·pin-and-done·doc-thresholds·grade-and-risk·subagent-routing·review-tiering·pr-and-merge-gate·loop-driver·work-judge·review-throughput + INDEX. 헌법(`CLAUDE.md`)은 절대규칙+진입점만(350임계), 운영 정책은 외부화. `_routing.md`=*빠른 매핑*, policies=*상세 정책* 역할 분담.
- **훅 8종**(`scripts/hooks/`): 기존 6 + `pin-injector`(work-pin 주입)·`convention-size-guard`(God class 800줄). `shared-discipline-guard`는 별도 파일 X — `risk-detector`의 `shared-contract` 깃발이 흡수(중복 제거).
- **위험 깃발**: trust-boundary·**backend-contract**(AgentBackend/AgentEvent=전 어댑터)·**shared-contract**(IPC 계약 단일정의)·irreversible·**ui-visual**(renderer 시각)·harness.
- **Phase 정의 시스템**: `/work:plan`(목표→Phase 분해→`phases/M{N}-{slug}/`→work-pin 시드→plan-auditor) + 템플릿(done-md·pin·phase). `scripts/execute.py` **폐기**(ADR-011 미채택 정합) → work:plan + 세션/루프.
- **커맨드**: session/{start,end,review}(세션 2종)·harness-review·_escalation 신규. `/harness`는 work:plan 코어로 정합.
- **솔로 정합**(manifest §5.5): 팀 언어 제거(본인+미래 합류자), CODEOWNERS admin-bypass 휴면 배너(GO 게이트 유효), unity-bridge N/A.
- **곁다리 정리**(영호 직접 지시, C-동결 해제): `phases/` 37개 이력 삭제(이제 work:plan이 생성) · `UI_GUIDE`+`UI_FIDELITY`→`docs/UI.md`(현 src/renderer 실측 Clay HEX) · docs 드리프트 정정(sqlite→JSON·UI/execute 경로) · baseline 경로버그(CustomGUI_Agent→AgentDeck) 수정.

**스킵(D 확정)**: knowledge 캐시·GC(MEMORY.md auto-memory 대체 + self-reinforcement 위험) · `/engine:goal`(내장 `/loop`+Workflow) · `/cross-review`(Codex 듀얼백엔드 Track2 후 defer) · setup 커맨드/setup-steps(AgentDeck 이미 하네스 — 부트스트랩 불필요).

**이유**: ADR-025는 HARNESS_GAP(자기진단=자기편향)을 근거로 policies를 스킵했으나, 외부 재결정(manifest)이 "헌법 슬림 + 정책 카탈로그가 더 체계적"으로 바로잡음. 누더기 패치 → 정식 골격 + 도메인 재유도로 다음 세션 맥락충돌 방지.

**트레이드오프 / 불변**: ① policies 신설 vs _routing 단일정의(ADR-025): 파일 분산 위험 ↔ 헌법 슬림+카탈로그 체계 → 후자. ② 훅 advisory 유지(차단=dangerous-cmd·tdd만). ③ 하네스(`.claude/**`) 변경=사용자 단독 통제, PR/push=ask 게이트 불변. ④ ADR-011·014·025 본문 보존(역사) + superseded/개정 표기.

**위험도**: [H] — ADR-025 "policies 스킵" 결정 개정 포함.

**현황(2026-06-27)**: P0~P4 완료(브랜치 `chore/harness-port`). 회귀 게이트 green(typecheck + test 3619 PASS) · 깨진 링크 0 · baseline 7→0. (미push — 인간 게이트.)

---

