# RF1-cleanup — 프로젝트 정리/리팩토링 마일스톤

> **트랙**: RF (Refactor — 기능 로드맵 M번호와 분리된 독립 정리 트랙)
> **등급**: 대규모 (3+ 도메인 · 비가역 일부 · 300줄+) → coordinator + plan-auditor + reviewer 통합
> **생성**: 2026-06-27 (`/work:plan`)
> **선행 ADR**: ADR-027 (번호접두 폴더 컨벤션 — B0에서 초안, 사용자 확정 게이트)

---

## 🎯 마일스톤 목표

AgentDeck 코드베이스의 **위생·구조·거대파일**을 정리해, M6(Codex 듀얼백엔드) 이전에 깨끗한 기반을 만든다. 세 가지를 의존 순서로:

1. **위생** — git 추적 잡파일·런타임 lock·dead code 제거
2. **구조/번호접두** — `components/`·`src/main/`·`docs/`를 `NN.<name>` 번호접두 폴더로 재구성 (사용자 요청)
3. **거대파일 리팩토링** — 1,200줄+ 파일 6개를 SOLID 단일책임으로 분해

---

## 🧱 구조 제약 (불가침)

- **electron-vite 고정 진입점**: `src/main/index.ts`·`src/preload/index.ts`·`src/renderer/index.html` + alias `@shared`·`@renderer`. → **최상위 `src/{main,preload,renderer,shared}`는 번호접두 대상 제외** (빌드·alias·헌법 "최상위 폴더=ADR" 동시 위반).
- **번호접두는 그 *안쪽* 하위폴더만** — agent R/W 글롭이 `src/main/**`·`src/renderer/**`처럼 `/**`라 하위폴더 rename은 *라우팅*은 안 깨짐 (import 경로만 갱신).
- **⚠️ 단, hook 리터럴은 안전하지 않음 (plan-auditor 결함1)** — `.claude/hooks/risk-detector.sh`는 글롭이 아닌 **리터럴 `*src/main/ipc/*`**로 trust-boundary를 검출. `ipc/`→`00.ipc/` rename 시 이 패턴이 깨져 **권한 누수 자동검출이 조용히 사라짐**. → Phase 07에서 hook 패턴 갱신(영호-확정)을 동반하거나 `ipc/`만 예외. (`*ClaudeCodeBackend*`·`*agent-events*`는 파일명 기반이라 폴더 rename에 생존.)
- **신뢰 경계 불가침** — 폴더 이동·파일 분해 중에도 fs/proc/db = main 단독, IPC 계약 단일정의 유지.

---

## 📂 Phase 목록 (의존 순서)

| # | Phase | 트랙 | 등급 | 도메인 | risk | loop_track |
|---|---|---|---|---|---|---|
| 01 | lock gitignore + 추적 해제 | A 위생 | 보통 | cross | harness | auto-gate |
| 02 | artifacts 프로브 스크립트 정리 | A 위생 | 단순 | cross | — | auto-gate |
| 03 | dead code·미사용 export 스윕 | A 위생 | 보통 | cross | — | auto-gate |
| 04 | **ADR-027 초안** (번호접두 컨벤션) | B 구조 | 복잡 | cross | — | **human-gate** |
| 05 | components 카테고리 매핑 설계 | B 구조 | 보통 | renderer | — | auto-gate |
| 06 | components 번호접두 이동 + import | B 구조 | 대규모 | renderer | ui-visual | human-visual |
| 07 | src/main 모듈 번호접두 + hook/문서 갱신 | B 구조 | 대규모 | main-process+cross | trust-boundary | **human-gate** |
| 08 | docs 번호접두 + CLAUDE.md 링크 | B 구조 | 대규모 | cross | harness | **human-gate** |
| 09 | ipc-contract.ts 분해 | C 리팩 | 대규모 | shared-ipc | shared-contract | auto-gate +reviewer |
| 10 | ipc/index.ts 핸들러 분해 | C 리팩 | 대규모 | main-process | trust-boundary | **human-gate** |
| 11 | ClaudeCodeBackend.ts 분해 | C 리팩 | 대규모 | agent-backend | backend-contract | auto-gate +reviewer |
| 12 | appStore.ts + reducer.ts 슬라이스 분해 | C 리팩 | 대규모 | renderer | — | auto-gate |
| 13 | MultiWorkspace.tsx 분해 | C 리팩 | 복잡 | renderer | ui-visual | human-visual |
| 14 | Composer.tsx 분해 | C 리팩 | 복잡 | renderer | ui-visual | human-visual |
| 15 | REPL docs 드리프트 정정 (실측 발견) | A 위생 | 보통 | cross | harness | **human-gate** |

---

## 🔗 의존성 그래프

```
트랙 A (위생, 병렬 가능)     트랙 B (구조)                       트랙 C (리팩토링)
  01 ─┐                       04(ADR) ─→ 05 ─→ 06 ──────┐         09 ─(독립)
  02 ─┼─(독립)                       └────→ 07 ──┐       │        12 ─(독립)
  03 ─┘                                          ├→ 08   ├──→ 13(←06) 14(←06)
                                          06,07 ─┘       └──→ 10(←07) 11(←07)
```

- **A(01·02·03·15)**: 서로 독립 — 병렬 가능. C보다 먼저일 필요는 없으나 저위험이라 워밍업으로 선행. **Phase 15(REPL docs 드리프트 정정)는 02 실측 중 발견된 추가 위생 항목** — 독립·human-gate(헌법/docs=영호 단독), 트랙 A와 함께 조기 실행 가능. (번호는 15지만 실행 순서는 트랙 A 권장.)
- **B 내부**: 04(ADR 확정) → 05(매핑) → 06(components 이동). 07은 04 이후 06과 병렬 가능. **08(docs rename)은 06·07 *이후*** — 06·07이 `docs/UI.md`·`docs/ARCHITECTURE.md`를 참조하므로 08이 먼저 끝나면 그 참조가 stale (주의4).
- **B → C 결합 (plan-auditor 결함2)**: "09~12는 components 밖이라 B와 무관"은 **부분 거짓**.
  - **09(ipc-contract)·12(appStore)**: shared·store라 07과 무관 — 트랙 B와 독립 진행 OK.
  - **10(ipc 핸들러)·11(ClaudeCodeBackend)**: 07이 rename하는 바로 그 `src/main/ipc/`·`src/main/agents/` *내부*를 분해 → **07이 10·11보다 먼저** (폴더 rename → 내부 분해 = import 1회). `07→10`·`07→11` 엣지 강제.
  - **13·14(MultiWorkspace·Composer)**: 06(components 이동) 이후 — 옮긴 뒤 분해 = import 1회 갱신.

---

## 🚦 회귀 게이트 (매 Phase 완료 조건 공통)

```bash
npm run typecheck   # main+renderer 0 errors
npm run test        # Vitest green — 각 Phase *시작 시점* 측정값 대비 비감소 + 신규 fail 0
npm run lint        # 0 problems
```

> baseline은 **고정 숫자 박제 X** (refactor-sweep.md 정합 — 14 Phase에 걸쳐 자연 증가하므로 "시작값 대비 비감소"로 판정).

- 폴더 이동(06·07)·계약 분해(09)는 추가로 `npm run build` green + e2e smoke.
- ui-visual Phase(06·13·14)는 사람 육안 트랙 (`docs/UI.md` 안티슬롭) — 무인 commit X.

---

## 🔒 게이트·약속

- **비가역(push/PR/merge)** = 사람 게이트 보존. 트랙별 PR 권장(A·B·C 각 1 PR → 리뷰 단위 작게).
- **ADR(04)·헌법 문서지도(08)·하네스 문서(_routing 07)** = **사용자 단독 통제** — AI는 *초안 제시*만, 확정은 영호.
- **번호접두 범위**: components/ + src/main/ + docs/ (광범위, 사용자 선택). 최상위 src 4종 제외.

---

## 📚 이 마일스톤에서 배울 핵심 개념

- **리팩토링 안전망** — 거동 불변(behavior-preserving) 변경을 회귀 게이트(typecheck/test)로 증명하는 법
- **SOLID 단일책임** — 거대 파일을 "왜·어떻게" 쪼개는가 (책임 축 식별)
- **import 그래프 churn 관리** — 폴더 이동 시 영향 최소화 순서 설계
- **ADR 프로세스** — 구조 변경을 결정·트레이드오프로 박제하는 이유

---

## ⚠️ 마일스톤 차원 함정

- **14 Phase = 5~7 권장 초과** — 의도적(사용자 "세부 다수" 요청). plan-auditor가 분할 제안 시, 트랙별 3 PR로 쪼개는 것으로 흡수(폴더는 단일 유지).
- **거동 불변 착각** — 폴더 이동·파일 분해는 "기능 안 바뀜"처럼 보여도 import·동적 경로·CSS 참조가 숨은 결합. 회귀 게이트 없이 commit 금지.
- **ADR 미확정 채 B 진행** — 04 확정 전 06·07 착수 시 컨벤션 번복 리스크. 04는 human-gate.
