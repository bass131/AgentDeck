# 의미 출처 매핑표 — 코어 추출 전후 (HR1 P02 산출물)

> **용도**: P03(CLAUDE.md 어댑터화)·P05(AGENTS.md 어댑터화)의 **작업 명세**. "같은 의미의 이중 서술"이 어디에 있고, 각 Phase가 무엇을 참조로 바꾸며, 무엇이 어댑터 전용으로 남는지의 단일 지도.
> **원칙**: 코어로 간 의미는 어댑터에서 **한 줄 요지 + CORE-NN 참조**로 축약(CRITICAL 라벨은 어댑터에 잔류 — 강제력 표시). 상세 서술의 정본은 코어 단일.

## A. 코어로 추출된 의미 (이중 서술 해소 대상)

| 코어 조항 | 현 CLAUDE.md 위치 | 현 AGENTS.md 위치 | P03 액션 (CLAUDE.md) | P05 액션 (AGENTS.md) |
|---|---|---|---|---|
| CORE-01 신뢰 경계 | 아키텍처 규칙 CRITICAL ① | §4 첫째 항목 | 요지+참조로 축약 | 요지+참조로 축약 |
| CORE-02 엔진 추상화 | 아키텍처 규칙 CRITICAL ② | §4 둘째 항목 | 〃 | 〃 |
| CORE-03 시크릿 보호 | 아키텍처 규칙 CRITICAL ③ | §4 넷째 항목 | 〃 | 〃 |
| CORE-04 IPC 단일 정의 | 아키텍처 규칙 CRITICAL ④ | §4 셋째 항목 | 〃 | 〃 |
| CORE-05 TDD | 개발 프로세스 CRITICAL | §4 여섯째 항목 | 〃 | 〃 |
| CORE-06 비가역 게이트 | 개발 프로세스·운영 모드(c) | §6 넷째 항목 | 〃 | 〃 |
| CORE-07 파괴 명령 금지 | (session:start 게이트·훅 의미) | §6 다섯~일곱째 항목 | 명시 참조 추가 | 요지+참조로 축약 |
| CORE-08 구조·의존성=ADR | 아키텍처 규칙·기술 스택 | §4 다섯째 항목 | 요지+참조 | 〃 |
| CORE-09 커밋 규율 | 개발 프로세스 | §6 마지막 항목 | 〃 | 〃 |
| CORE-10 등급·보고 의미 | 멀티에이전트 분담(등급) | §5 하단(등급 참조) | 정책 링크 유지(정본=policies) | 참조로 축약 |
| CORE-11 하네스 봉인 | 분담·하네스 게이트 | §2 다섯째·§9 유지보수 | 요지+참조 | 요지+참조(유지보수 절차는 Codex 전용 잔류) |
| CORE-12 런타임 격리 | 하네스 게이트(Hook 격리) | §2 여섯째·§9 | 〃 | 〃 |
| CORE-13 응대 원칙 | 응대 원칙(사용자 컨텍스트) | §3 | 요지+참조(4원칙 인라인 유지 가능 — 진입점 가독성) | 요지+참조 |

## B. Claude 어댑터 전용 잔류 (코어에 넣지 않음 — 조직론·Claude 실행 방식)

- **멀티에이전트 조직론**: 메인 = Supervisor 전임, 워커 함대(도메인 Worker·coordinator·reviewer·plan-auditor·secretary), 위임·재귀 차단, 등급별 동원 패턴 — `CLAUDE.md` + `.claude/agents/**` + `.claude/policies/subagent-routing.md`
- **loop-driven 운영 모드**: work-judge 3버킷, 루프 정지 지점, attended 원칙 — `CLAUDE.md` + `.claude/policies/loop-driver.md`·`work-judge.md`
- **work-pin·세션 커맨드·스킬**: pin-injector, /session:*, /work-plan·run — `.claude/**`
- **훅 9종 구현·관측성(P04 산출)**: systemMessage·guard-blocks.log — `.claude/hooks/**`

## C. Codex 어댑터 전용 잔류 (P05에서 재정의)

- **역할 선언**: 전담 보조(리뷰·진단·rescue·세컨드 오피니언) — Sol 직접 작업, Supervisor 전임 폐기 — `AGENTS.md`
- **권한·실행 계약**: permission profile(최소권한 기본 프로필 신설 예정)·execpolicy rules·hooks.json·doctor — `.codex/**` (결정 박제 = ADR-033 개정)
- **유지보수 절차**: `AGENTDECK_HARNESS_MAINTENANCE`·digest 재신뢰 — `AGENTS.md` §9 계열

## D. 이중 서술 허용 예외 (의도적)

- **CRITICAL 라벨 + 한 줄 요지**: 어댑터 진입점에서 절대 규칙이 한눈에 보여야 함 — 요지 문장까지 제거하면 진입점 기능 상실. *상세*만 코어 단일.
- **본 매핑표 자체**: P03·P05 완료 후 "이중 서술 0" 검증의 대조 기준으로 남고, 이후 기록물로 보존.
