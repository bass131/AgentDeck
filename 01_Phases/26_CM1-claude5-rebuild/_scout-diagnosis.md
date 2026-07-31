# CM1 진단 스카우트 노트 — 전수 인벤토리 · 병리 · 설계 비평 · 프로브 실측

> 2026-07-29, 트랙 채택 세션에서 작성. 다음 세션이 이 문서와 `_decisions.md`만 읽으면 맥락을 이어받을 수 있게 만든 이어달리기 재료다. 원 조사는 Explore 서브 3개(`.claude` 하네스 / `00_Documents` / memory·주변부)의 전수 인벤토리와 Plan 에이전트의 설계 비평으로 수행했다.

## 1. 트랙 배경

Boris Cherny(Claude Code 헤드)가 Claude 5 세대 전환기에 권고한 방식 — 하네스(CLAUDE.md·skills·hooks)를 삭제하고, 더 적은 가이드로 모델을 관찰한 뒤 필요한 것만 실측 근거와 함께 되돌려 넣는 것 — 을 이 프로젝트에 적용한다. Anthropic 자신도 Claude Code 시스템 프롬프트의 약 80%를 최신 모델용으로 삭제했고 성능이 오히려 향상됐다는 실측을 공개했다. 영호의 문제의식 4가지가 출발점이었다: work-pin 비대 / supervisor-guard의 자율성 침해 / 에스컬레이션 절차의 시대착오 / 문서 구조의 Context Rot("시어머니 스타일").

## 2. 전수 인벤토리 규모 (실측)

| 구획 | 규모 | 비고 |
|---|---|---|
| `.claude/` 하네스 | 65파일 8,282줄 (state 로그 포함 시 15,714줄) | hooks 24파일 4,363줄(판정 엔진 `shell-policy.mjs` 단독 989줄, 테스트 2,095줄) · agents 12파일 897줄 · policies 12파일 1,662줄 · skills 5종 354줄 · commands 6파일 622줄 |
| 루트 헌법 | CLAUDE.md 107줄 + AGENTS.md 87줄 | 매 세션 상주 |
| `00_Documents/` 텍스트 | 98파일 19,812줄 | 루트 정본 10종 1,437줄 · 00_Harness 847줄(conformance 기계 675줄) · ADR 42개 1,325줄 · Reports/Reviews 16,000줄+ |
| `01_Phases/` | 26폴더, md 253개 21,871줄 | 00_Documents 전체보다 크다 |
| memory | 29파일 596줄 | 철회 마커 4개 파일이 매 세션 로드 |
| 상주 주입 | pin 36줄 5.5KB **매 턴** + CLAUDE.md 15.5KB + MEMORY.md 4.1KB 매 세션 | |
| **문서성 총계** | **약 5만 줄** | 앱 코드가 아닌, 시스템을 위한 텍스트 |

## 3. 병리 3종 (대표 증거)

1. **자기 강화 루프** — 같은 규칙이 여러 곳에 산다: "Clay 에디토리얼" 서술 6곳, "옛 OKLCH에서 진화" 문장 4곳 거의 축자 동일, 위험 깃발·등급·3버킷 2~4중, `-DONE.md` 양식 4중, 정책 12개 파일 전부가 동일한 범례 6줄을 복제. 중복 → 문서마다 "변경 시 동기화 책임 4~5파일" → 동기화 이력이 CHANGELOG 거대 항목으로 박제(최대 항목 약 6,100단어, 파일 전체의 32%) → 그 이력이 다시 컨텍스트를 오염. rename 하나(NC)가 유지보수 창 2개를 소비한 것이 이 루프의 실측이다.
2. **이력의 본문 침투** — 죽은 참조 20+곳(CLAUDE.md의 `adr/`, UI.md의 archive/, HARNESS_PORT_MANIFEST의 구 경로 10건 전량 등), 문서 간 정면 모순 2건(`01_Phases/README.md` "비워라" ↔ `INDEX.md` "지우지 마라" / settings.json $comment가 CORE-06 v2 기준 서술 ↔ 현행 v3), "구 X" 표현 CHANGELOG에만 57회, supervisor-guard 167줄 중 절반이 사고 이력 주석.
3. **구세대 조직론 스캐폴딩** — supervisor-guard ②(메인의 코드 편집·테스트 실행·git add/commit 차단), 에스컬레이션 8흐름 규정집, 10역할 편성표, 3-Tier 리뷰, 등급 판정표. 시스템 스스로 아는 흔적: INDEX.md가 review-throughput.md를 "첫 삭제 후보"로 자평, execution-owner.md가 "차단은 작성을 막지 못하고 타이핑만 막는다(대필세 실측)"를 이미 문서화.

## 4. 설계 비평 결과 (Plan 에이전트, 14건 — 전부 계획 v2에 반영됨)

치명 4건이 계획을 크게 바꿨다:

1. **재봉인 롤백 함정** — CLOSE-GATE.bat이 `settings.SEALED.json`(canonical)을 활성 settings.json에 복사한다. 새 settings를 배치해도 canonical 2벌을 함께 교체하지 않으면 재봉인 순간 구본으로 롤백된다. → Phase 4 산출물 = settings **3벌**, Phase 6 절차에 "canonical 교체 → CLOSE" 순서 고정.
2. **의존성 역전** — 훅은 상류가 아니라 하류다. supervisor-guard 한 파일이 봉인(문서 결정 종속)+실행 경계(조직 결정 종속)+OpenGate 3축이고, circuit-breaker는 pin 포맷을 grep하며(pin 포맷 변경으로 실제 사망한 이력 있음), DONE 검증기는 보고 체계에 종속. → Phase 순서를 의미(1)→조직(2)→운영(3)→집행/훅(4)로 재배열.
3. **conformance 충돌** — conformance-check.mjs가 전 조항에 claude·codex 양 어댑터의 정확 동등성을 강제한다. CORE 재편 시 손대지 못하는 `.codex` 축이 전 조항 red가 된다. → 재편 조항은 codex `conformedVersion=0` + gap을 BACKLOG 등재(ADR-040 §5 합법 경로, 현행 WARN 3건과 동일 방식). AGENTS.md 갱신은 Codex 세션 몫.
4. **스위치 원자성** — 동기 갱신 대상이 봉인층·비봉인층에 흩어져 있고(core-manifest impl 경로, package.json test:hooks, agent-model-canon·harness-conformance 앱 테스트, BACKLOG, .gitattributes, state 잔재), git mv 직후 그 세션의 훅 배선은 시작 스냅샷이라 무게이트 구간이 된다. → Phase 6에 전수 체크리스트 + "스위치 커밋 = 창의 마지막 행위, 직후 세션 종료" + revert runbook.

중대·보통 10건 요약: drafts는 저장소 루트 동형 미러 규격이어야 스테이징 검증 성립(글루 테스트는 자기 위치 기준 샌드박스라 이식 가능, unit 테스트는 구현 결합) / drafts의 .sh는 CRLF 지뢰(autocrlf=true) → `.gitattributes` 선반영 미니 창 필요(그 파일 자체가 봉인 대상) / 코드 층 백지 재작성 금지(방어 로직 = 실사고 결정체) / "깨끗한 서브"는 기본값으로 성립 안 함(CLAUDE.md 자동 주입 — 프로브로 확정, §5) / Phase 0 프로브를 훅 계약 전반으로 확장 / 파일럿 관찰은 폐지 훅의 무음 원장 모드(would-have-fired 카운터)와 사전 선언 복원 트리거로 / pin↔헌법 상호 감량 순환은 "매 턴 상주 예산표" 1회 결정으로 차단 / 이 트랙 자체의 ADR 승계표 필요(CORE-08 자기 준수) / sealed 집합 기준 전수 배정표로 소유자 없는 구성물 제거 / state 전환·글로벌 CLAUDE.md 경계·auto 모드 함정·ignorecase 함정.

## 5. 런타임 프로브 5종 실측 (2026-07-29, 현 런타임)

| # | 프로브 | 결과 |
|---|---|---|
| ① | 서브 스폰 별칭 `opus` → 실제 모델 | **`claude-opus-5`** (트랜스크립트 model 필드 실측). ⚠️ 구 실측(2026-07-24, 별칭→opus-4.8)은 stale — 별칭 semantics가 런타임 갱신으로 바뀌었다. "별칭은 이동 표적이니 full ID 고정" 원칙 자체는 유효 |
| ② | 훅 payload의 `agent_type` 키(메인/서브 구분) | **유효** — 서브의 `npx tsc --version`이 supervisor-guard ② 면제로 통과(메인이면 차단되는 명령) |
| ③ | `permissionDecision:"ask"` 경로 | **유효** — 당일 라이브 실증 5회(push 프로브·push×2·PR 생성·머지, CORE-06 v3 랜딩 실측 인용) |
| ④ | UserPromptSubmit stdout 주입 | **유효** — 본 세션에서 pin-injector가 매 턴 발화 중 |
| ⑤ | 서브 컨텍스트에 구 CLAUDE.md 주입 여부 | **주입됨(전문)** — 프로젝트 CLAUDE.md + 글로벌 CLAUDE.md 모두 확인. **→ 산문 층 백지 작성은 격리 환경 필수(확정)** |

## 6. sealed 집합 실측 (전수 배정표의 기초 재료 — 배정표 완성은 Phase 0 잔여)

`shell-policy.test.mjs` 실측 기준, 봉인 판정기가 하네스로 취급하는 경로: `.claude/**`(state 제외 — `state/**`는 허용), `.claude/CHANGELOG.md`(포인터, ADR-041 반전으로 봉인 대상), `CLAUDE.md`, `.gitattributes`, `.agents/skills/**`, `.codex/**`(격리), 홈 `~/.claude`의 config류(plans/·projects/ 데이터 디렉토리는 허용). 절대 경로는 앵커 세그먼트 일치로만 판정하고 `..` 재진입 표기도 해소해 봉인한다.

계획서의 8개 Phase에 소유자가 없던 구성물(비평 5): `.claude/templates/` 3종, `.agents/skills/` 2종, skills 5종, commands 비세션 3종(harness-review·refactor-sweep·review), `.gitignore`의 하네스 절, `package.json` scripts, `.claude/CHANGELOG.md` 포인터 — Phase 0 잔여 작업에서 배정표로 확정한다.

## 7. 다음 세션 진입 안내

1. `/session:start` → 이 폴더의 `_milestone-plan.md` → `_decisions.md` → 본 문서 순으로 읽는다.
2. Phase 0 잔여(`00-bootstrap.md`)부터: git pull → 트랙 브랜치 → 미니 창(.gitattributes) → 전수 배정표.
3. Phase 1부터는 각 Phase 파일의 결정 포인트를 카드로 펼쳐 영호와 대화 확정 후 진행한다.
