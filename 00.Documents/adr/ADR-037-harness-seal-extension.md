### ADR-037: 하네스 기술 봉인 확장 — 의미 정본 층(harness 코어·ADR) 봉인

**결정(유지보수 창 2026-07-17, 영호)**: 기술 봉인(supervisor-guard의 sealed 분류 + settings.json `Edit(...)` deny)을 어댑터 층(`.claude/**`·`CLAUDE.md`·`.codex/**` 등)에서 **의미 정본 층 — `00.Documents/harness/**`·`00.Documents/adr/**`·`00.Documents/ADR.md`(인덱스)** 까지 확장한다. 구현 = `shell-policy.mjs` `classifyHarnessPath` sealed 규칙 2행 + `HARNESS_CANDIDATE_RE` 마커(`00.documents/(harness|adr)`·`adr.md`) + settings.json deny 3줄(`Edit(00.Documents/harness/**)`·`Edit(00.Documents/adr/**)`·`Edit(00.Documents/ADR.md)`).

**이유**: 2026-07-17 하네스 점검 🟡-15 — ADR-034 3층 구조에서 규칙의 *의미*를 소유하는 코어(CORE.md·core-manifest.json)와 결정 기록(ADR)은 규범 게이트(문서상 금지)만으로 보호되고, 그보다 하위인 어댑터 층에만 기술 차단이 걸린 **보호 비대칭**이 있었다. 의미 정본이 조용히 변조되면 어댑터 봉인이 지키는 규칙 자체가 바뀐다. 규범상 헌법/ADR은 이미 사용자 단독 통제(CORE-11·`_routing.md` 위임 금지 행)였으므로, 본 결정은 **기술이 기존 규범을 따라가는 정합화**다.

**대안과 트레이드오프**: (a) *현행 유지 + "의도적 제외" 박제* — 마찰 0이나 비대칭 존속. (b) *CORE+manifest만 확장* — ADR 작성 마찰은 없지만 결정 기록이 여전히 기술 무방비. (c) **채택: 전부 확장** — 보호 최대. 비용 = **이후 ADR 신설·superseded 마킹·`ADR.md` 인덱스 갱신도 유지보수 창(영호 오픈·재봉인) 필요** — 영호 감수(AskUserQuestion 2026-07-17). 인덱스를 포함한 이유 = adr/ 본문과 인덱스는 동체(본문만 봉인하면 인덱스 변조로 결정 상태[활성/superseded]를 조용히 뒤집을 수 있음).

**한계·범위 밖**: ① CORE-12 *읽기* 격리의 기술 강제(`Read(**)` allow가 `.codex` 포함)는 범위 밖 — 기존 백로그 유지. ② `00.Documents/harness/codex-baseline.json`(측정 기록)은 Claude 세션 기준 sealed에 포함되지만 Claude는 원래 이 파일을 쓰지 않는다 — Codex 세션의 baseline 갱신은 각 엔진 훅이 자기 세션만 구속하므로 **무영향**(`.codex/README.md`의 "봉인 밖" 서술은 Codex 자체 하네스 기준으로 여전히 참). ③ 심볼릭 링크 실경로·8.3 별칭 한계는 C-full 백로그 그대로 상속.

**파급**: `conformance-check.mjs`·`MAPPING.md` 등 harness/ 전 파일의 Claude 세션 편집 = 유지보수 창 필요. `/work-plan` 등이 "ADR 선행"을 요구하는 흐름에서 ADR 파일 생성은 에이전트 위임 불가 항목임이 기술로도 강제된다(초안은 봉인 밖 문서로 준비 → 창에서 착지).

**위험도**: [L] — 앱 코드 0, 통제 강화 additive(기존 봉인 거동 불변, sealed 집합 확장만). 하네스 통제 구조 변경이므로 CHANGELOG [H] 기록 동반.

**관련**: ADR-034(하네스 3층 구조) · CORE-11(사용자 단독 통제) · CORE-12(엔진 격리) · `.claude/hooks/_lib/shell-policy.mjs`·`shell-policy.test.mjs`(11/11) · `00.Documents/reviews/2026-07-17-harness-review-all.md`(🟡-15).

**현황(2026-07-17)**: 채택(영호 — 3지선다 중 "전부 확장"). 구현 완료 — sealed 규칙·마커·테스트 green, settings.json deny는 재봉인 시 반영.
