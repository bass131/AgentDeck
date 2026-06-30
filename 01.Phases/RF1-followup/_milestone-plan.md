# RF1-followup — RF1-cleanup 후속 정리 마일스톤

> **트랙**: RF (Refactor — 기능 로드맵 M번호와 분리된 독립 정리 트랙)
> **선행**: RF1-cleanup (15/15 완료·PR #2·#3·#4 머지) — 본 마일스톤은 그 *잔여 개선점*(🟡 차단-아님)
> **등급**: 복잡 (도메인 분산 · 거동 불변 · 일부 대규모 분해) → Worker 분담 + reviewer 통합
> **생성**: 2026-07-01 (`/work-plan`)
> **브랜치**: `refactor/rf1-followup` (이미 생성)

---

## 🎯 마일스톤 목표

RF1-cleanup이 거대파일을 1차 분해했지만 **차단은 아니나 남겨둔 잔여물**이 4종 있다(work-pin "후속🟡"). 이를 정리해 RF1 트랙을 완전히 닫는다. **전부 거동 불변(behavior-preserving)** — 기능 변화 0, 회귀 게이트(typecheck/test/lint)로 증명.

추가로, RF1-cleanup의 **frontmatter status drift**(9개 Phase가 실제 머지됐는데 `pending` 잔존)를 봉합해 work-pin·`/work-run` 정합을 회복한다(선행 Phase).

### 잔여 개선점 출처 (실측 대조 완료)

| 후속 | 실측 (2026-07-01) | 정리 방향 |
|---|---|---|
| **drift** | `01.Phases/RF1-cleanup/` 9개 `status: pending` (실제 머지됨) | frontmatter → `done` + work-pin 정합 |
| **P11①** | `_sanitizeDescription` 2중복 (ClaudeAgentRun · RunEventNormalizer) | 공통 유틸 추출 (DRY) |
| **P11②** | `ClaudeCodeBackend.ts` 1596줄(`ClaudeAgentRun` 클래스만 ~1000줄), `eventNormalizer.ts` 770줄 | 책임 축 분리 (>500 해소) |
| **P10** | `00_ipc/index.ts` 191줄(>150), `agent-runs.ts` 272줄 | index 추가 분리 + 테스트 copy 정리 |
| **P14** | `QueuedMessage` 3중복 정의(Composer·SchedStrip·types.ts) | `types.ts` 단일화 + useCallback perf + no-op disable 제거 |
| **P09** | `ipc-contract.ts` 배럴 = 이미 깔끔 / `ARCHITECTURE.md` stale(옛 단일파일 기술) | 배럴 검증(확인만) + ARCHITECTURE ipc/ 트리 문서 갱신 |

---

## 🧱 구조 제약 (불가침)

- **거동 불변** — 분해·이동·DRY는 import·동적 경로·CSS 참조가 숨은 결합. 회귀 게이트 없이 commit 금지.
- **신뢰 경계 불가침** — `00_ipc/`(trust-boundary)·`shared/ipc/`(shared-contract)·`01_agents/`(backend-contract) 변경은 깃발 발동 → reviewer 무조건.
- **docs = 영호 단독 통제** — `ARCHITECTURE.md`(00.Documents) 갱신은 AI *초안 제시만*, 확정은 영호 (P06 human-gate).
- **공개 API 유지** — 분해는 *내부* 책임 이동. export 표면(배럴·인터페이스)은 소비처 import 경로 변경 0을 목표.

---

## 📂 Phase 목록 (의존 순서)

| # | Phase | 등급 | 도메인 | risk | loop_track |
|---|---|---|---|---|---|
| 01 | drift 봉합 + 마일스톤 정합 | 보통 | cross | — | auto-gate |
| 02 | `_sanitizeDescription` DRY 공통화 | **복잡** | agent-backend | backend-contract | auto-gate +reviewer |
| 03 | ClaudeCodeBackend·eventNormalizer 거대모듈 분해 | 대규모 | agent-backend | backend-contract | **human-gate(설계)** +auto·reviewer |
| 04 | `00_ipc/index.ts` 추가 분리 + 테스트 copy | 복잡 | main-process | trust-boundary | **human-gate** |
| 05 | `QueuedMessage` 단일화 + perf 정리 | 보통 | renderer | — (무깃발) | auto-gate |
| 06 | 배럴 검증 + ARCHITECTURE ipc/ 트리 문서 | **복잡** | shared-ipc+cross | shared-contract+docs | **human-gate** |

> **등급 일관 (영호 결정 — grade-and-risk §3)**: 계약 깃발(backend-contract·trust-boundary·shared-contract)은 등급 +1 자동 상향 → P02·P04·P06 모두 **복잡**. P03은 이미 대규모(무영향)인데 권한경계(canUseTool) 추출 설계 분기로 **설계 단계만 human-gate**(GO 후 추출은 auto). P05는 ui-visual이 JSX 손댈 때만 발동하나 본 Phase는 타입/perf/no-op이라 미발동 → 무깃발 보통.

---

## 🔗 의존성 그래프

```
01(drift, 선행) ──┬─→ 02(DRY) ──→ 03(분해, 설계 GO)   [agent-backend 순차]
                  ├─→ 04(ipc index) ──→ 06의 00_ipc 문서  [main-process]
                  ├─→ 05(QueuedMessage)                   [renderer, 독립]
                  └─→ 06(배럴검증 + shared/ipc 문서)       [shared-ipc+docs]
                         └ 00_ipc 트리 문서化는 04 이후 (seam)
```

- **01은 선행** — drift 봉합으로 work-pin·status 정합 회복 후 본 작업.
- **02 → 03 순차**: DRY 공통화(02)를 먼저 하면 분해(03) 시 중복 메서드를 한 번만 옮긴다 (import churn 최소화). 03은 설계 단계 영호 GO 후 추출.
- **05는 완전 독립** — renderer, 병렬 가능.
- **04 → 06(부분 seam, plan-auditor #3)**: 06이 `ARCHITECTURE.md`에 `main/00_ipc/` 트리를 문서화하는데 04가 그 구조를 *변경*. 06의 **00_ipc 문서 부분만 04 이후**(04 미완 시 도착 즉시 stale). 06의 `shared/ipc/` 13파일 문서·배럴 검증은 04와 **독립이라 병렬 OK**.

---

## 🚦 회귀 게이트 (매 Phase 공통)

```bash
npm run typecheck   # main+renderer 0 errors
npm run test        # Vitest green — 시작 시점 대비 비감소 + 신규 fail 0
npm run lint        # 0 problems
```

- 거대모듈 분해(03)·계약 인접(04·06)은 추가로 `npm run build` green.
- P05(renderer)는 JSX 건드리면 ui-visual 육안 병행 — 단 QueuedMessage 타입 통합·useCallback은 로직이라 기계 게이트로 충분.

---

## 🔒 게이트·약속

- **비가역(push/PR/merge)** = 사람 게이트 보존. 마일스톤 1 PR 권장(후속 정리는 응집).
- **docs(ARCHITECTURE)·status drift 봉합** = 영호 통제 영역 인접 — P01은 작업추적 메타라 자율, P06 문서는 human-gate.
- **거동 불변 증명** = 각 Phase 회귀 게이트 출력이 트랜스크립트에 남게.

---

## 📚 이 마일스톤에서 배울 핵심 개념

- **DRY 추출 안전법** — 두 클래스의 중복 메서드를 공통 유틸로 빼되 호출부 거동을 깨지 않는 순서
- **거대 클래스 책임 분리** — `ClaudeAgentRun` 1000줄을 "왜·어떤 축으로" 쪼개는가(permission / 이벤트 / 명령 캡처)
- **타입 단일 진실(SSOT)** — 같은 `interface`가 3곳에 흩어지면 왜 위험한가, 어디로 모으나
- **문서 드리프트** — 코드 구조가 바뀌면 ARCHITECTURE가 어떻게 stale 되고, 왜 docs는 사람 게이트인가

---

## ⚠️ 마일스톤 차원 함정

- **"거동 불변 착각"** — 분해가 기능을 안 바꾸는 것처럼 보여도 import·`this` 바인딩·static 메서드 이동이 숨은 결합. 게이트 없이 commit 금지.
- **`_sanitizeDescription` 정적 메서드 추출** — 두 클래스가 `Class._sanitizeDescription`(static)으로 호출. 공통 유틸로 빼면 호출부를 함수 import로 바꿔야 함 — 빠뜨리면 typecheck가 잡지만 동작 의미는 같아야.
- **배럴 over-engineering 경계** — P09 배럴은 *이미 충분*. 더 쪼개려 들면 over-engineering. 검증(확인)에 그치고 ARCHITECTURE 문서만 손댄다.
