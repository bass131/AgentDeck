### ADR-034: 하네스 3층 구조 — 엔진 중립 코어 + 엔진별 어댑터 + conformance 게이트 ⭐

**결정(영호 방향 확정 2026-07-12, HR1)**: 하네스를 3층으로 재구성한다.

1. **공통 코어(엔진 중립 정본)** — `00.Documents/harness/CORE.md`: 안전 규칙의 *의미*(신뢰경계·엔진 추상화·시크릿·IPC 단일정의·TDD·비가역 게이트·파괴명령·ADR 규율·커밋·등급/보고·봉인·런타임 격리·응대 원칙 — CORE-01~13, 조항별 버전). 어떤 엔진이 와도 참인 문장만 수록.
2. **엔진별 어댑터** — `CLAUDE.md`+`.claude/**`(Claude: 멀티에이전트 조직론·loop-driven·훅 9종 존속) / `AGENTS.md`+`.codex/**`(Codex: 전담 보조 계약으로 경량화 — P05, ADR-033 개정 동반). 어댑터는 코어를 *참조*하고 "어떻게 강제하는가"만 소유.
3. **conformance 게이트(기계 강제)** — `00.Documents/harness/core-manifest.json`이 조항별 어댑터 구현·검증 지점을 기계 판독 형식으로 선언, 통합 검사(HR1 P06)가 미매핑·버전 불일치·impl 파일 부재·verify 선언 부재를 FAIL 처리. manifest 동기 갱신은 검증 지점을 바꾸는 Phase의 완료 조건(HR1 v2 계약).

**이유**: ① 같은 안전 의미가 CLAUDE.md와 AGENTS.md에 **이중 서술**되어 드리프트가 구조적으로 재발(H3 결함 ① — bcfdcb5 실증. 동기화 노력 부족이 아니라 정본이 두 개인 구조의 필연). ② Codex 이식(ADR-033) 때 안전 규칙과 함께 Claude의 *운영 조직론*까지 복제되어 사용자 의도(전담 보조)와 어긋남 — 층 분리가 "무엇이 보편이고 무엇이 엔진 사정인가"를 구조로 답함. ③ 문서 코어만으로는 어댑터 정합을 강제 못 함(Codex adversarial review [high]#4 — "CORE만 바뀌고 어댑터가 안 바뀌어도 전 테스트 green") → manifest + conformance 게이트가 사람 눈이 아닌 기계로 검사.

**트레이드오프**: ① 문서 계층 +1 — 어댑터에서 상세를 보려면 한 번 더 이동(간접 참조 비용). 완화: 어댑터에 CRITICAL 라벨+한 줄 요지는 잔류(MAPPING.md §D). ② manifest 유지 의무 — 새 안전 규칙 추가 시 3곳(CORE·manifest·어댑터) 동기 필요. 그 비용이 곧 침묵 드리프트를 막는 기계 계약이며, 게이트가 누락을 FAIL로 잡아 잊기가 불가능. ③ 코어 추출은 *현행 의미의 이동*이지 신규 입법 아님 — 의미 변경은 각 조항 버전 상향 + 사용자 단독 결정으로만.

**관련**: ADR-025/026(하네스 이식 계보) · ADR-033(Codex 실행 계약 — HR1 P05가 풀 드라이버 전제 철회로 개정 예정) · 산출물 `00.Documents/harness/{CORE.md, core-manifest.json, MAPPING.md}` · 계획 `01.Phases/15_HR1-harness-renewal/`.

**완료조건(측정가능)**: ① CORE.md 13조항 + manifest 전 조항 매핑(P02) ② P03/P05 후 어댑터-코어 이중 서술 0(MAPPING.md §A 대조) ③ P06 conformance 게이트 green(미매핑 0) ④ 어댑터 훅·계약 테스트 회귀 green.

**위험도**: [H] — 하네스 문서 아키텍처 재편(헌법·AGENTS.md 개정 동반 — P03/P05).

**현황(2026-07-12)**: P02 코어 3산출물 작성 + **영호 설계 승인 완료**(검토 포인트 4건 원안 확정 — ① CORE-13 코어 포함 유지 ② manual 검증 허용·선언 부재 불허 ③ CRITICAL 라벨+한 줄 요지 어댑터 잔류 ④ CORE-03 Claude 기계 차단 공백은 HR1 밖 백로그 등재). P03(Claude 어댑터)·P05(Codex 원자 전환)가 소비.
