# NC — 명명 규칙·배치 체계화 (마일스톤 계획)

> **등급: 대규모** · **깃발: harness · trust-boundary** · **Phase 7개** · **유지보수 창 2회(+예비 1회)** · **PR 2개**
> 세션 플랜 원본은 휘발한다 — **이 문서가 저장소 정본**이다.

## 🎯 왜 하는가

영호의 문제 제기: *"**폴더는** 어떤거는 `Prefix_Name` 형식인데 어떤거는 소문자 폴더 이름을 띄고, 대충 방에 쓰레기 던져놓은 것마냥 체계화가 전혀 안 되어 있다."*

**실측 결과 진단이 달랐다.** 규칙은 이미 있고(ADR-027 채택 + 제외 규칙 명문화), **파일 층은 폴더마다 이미 일관돼 있다.** 혼재는 **폴더 이름 층에서만** 일어난다.

| 구역 | 현행 계약 | 일관성 |
|---|---|---|
| `00_Documents/*.md` | `ARCHITECTURE.md` = UPPER_SNAKE | ✅ |
| `00_Documents/01_Adr/*.md` | `ADR-038-{kebab}.md` | ✅ |
| `00_Documents/02_Reports/**` | `{코드}-{한글 서술}.html` | ✅ (영호의 규약) |
| `01_Phases/**/*.md` | `NN-{kebab}.md` | ✅ |
| **폴더 이름** | `adr`·`assets` ↔ `Artifacts`·`_Codex_Review` | ❌ **혼재는 여기뿐** |

진짜 결함은 규칙 부재가 아니라 **규칙이 이행되지 않은 채 "완료"로 기록된 것**이다:

> `01_Phases/00_RF1-cleanup/08-docs-prefix-renumber.md` — frontmatter `status: done`, 본문 `pending`, 체크박스 전부 미체크, 구현 0건.

HR2가 반복해서 마주친 **거짓 green**과 같은 부류다. 목표는 **① 규범을 정본 하나로 모으고 ② 미이행분을 이행하며 ③ 재발을 기계로 막는 것**이다.

## 📐 규모 — 880건 대공사가 아니라 20건 내외 정밀 작업

```
884  소문자 시작 파일 전체
 ├─ 동결        256   봉인·기계계약·채증 산출물
 ├─ 파생 종속   451   테스트가 소스 stem을 따라감 (독립 판정 아님)
 └─ 개명 판정   177 → 실제 문자 변경 ≈ 20
```

## ❌ 설계 중 반증된 전제 6건 (박제 — 미래 세션이 같은 오판을 반복하지 않도록)

1. **`.ts` 관례는 kebab이 아니다** — 센서스 camel 82 / 단일어 79 / kebab 13 / Pascal 76(`.tsx` 포함). **kebab 13개가 이탈자.**
2. **`.tsx` 4개는 개명 대상 0개** — `icons.tsx`(주인공 없는 모음)·`resizableModal.tsx`·`zoom.tsx`(주 export가 훅)·`main.tsx`(export 0, Vite 진입점 계약). CTO 독립 검증 일치.
3. **스크린샷 재생성 위험은 `Artifacts`가 아니다** — e2e `SHOT_DIR` 25곳 중 Artifacts 사용 0건. 실제 하드코딩 경로는 `01_Phases/**/ScreenShot`.
4. **`01_Phases/**/*.md` 223개는 애초에 후보가 아니다** — 전부 숫자 또는 `_` 시작.
5. **루트 설정 파일 16개 중 보정 없이 옮길 수 있는 건 0개** — `dev.bat`의 `%~dp0`, `LICENSE`의 GitHub 라이선스 자동 인식.
6. ⭐ **"시각적 주범 40개"는 쓰레기가 아니다** — `reports/**` 28개는 **영호 본인의 보고서 명명 규약**, `ScreenShot` 12개는 채증. 불평 대상은 **폴더 목록**이었다.

## 📏 확정 규범 → ADR-039

### 원칙: **전역 규칙은 폴더 이름 층이 소유하고, 파일명은 각 폴더의 계약이 소유한다**

| 층 | 규칙 |
|---|---|
| 분류 폴더 (taxonomy) | `NN_PascalCase` — **전역 적용** |
| 모듈 폴더 (import path) | 대상 아님 (ADR-027·028 명시 제외) |
| 파일명 | **각 폴더의 계약** — ADR-039가 "어떤 폴더가 어떤 계약을 갖는가"를 표로 박제 |

**폴더별 파일 계약 표** (ADR-039 본문이 될 것)

| 폴더 | 계약 |
|---|---|
| `00_Documents/` 루트 | `UPPER_SNAKE.md` (`ARCHITECTURE.md`, 신설 `ROOT_LAYOUT.md`) |
| `00_Documents/01_Adr/` | `ADR-NNN-{kebab}.md` |
| `00_Documents/02_Reports/**` | `{마일스톤코드}-{한글 서술}.html` |
| `01_Phases/**/` | `NN-{kebab}.md` |
| `02_Source/**/*.ts` | **`camelCase`**, 단일어는 소문자 |
| `02_Source/**/*.tsx` | `PascalCase`(컴포넌트) / 훅·모음은 camel |

> 이 구조의 값어치: 미래 세션이 새 파일을 만들 때 **"어느 폴더인가"만 보면 이름이 결정된다.** 전역 규칙 하나로 밀면 이미 일관된 계약 4개를 동시에 깨야 한다.

**`.ts`가 camelCase인 근거 — 두 축** (참고 프로젝트와 무관하게 성립)

1. **저장소 다수파** — camel 82 vs kebab 13. 이동 비용 최소.
2. **import 노출** — 파일명은 `import` 문에 그대로 박힌다. JS/TS에서 대문자 시작은 *"값이 아니라 타입/컴포넌트"* 를 뜻한다. `import { commit } from './Git'` 는 "Git이 클래스인가?"라는 오독을 만든다.

> AgentCodeGUI의 kebab 0건은 **참고 데이터포인트로 각주 강등** — 참고 프로젝트의 위상이 또 바뀌어도 ADR-039가 흔들리지 않도록. (영호 정정 2026-07-26: AgentCodeGUI는 "원본"이 아니라 **참고용 프로젝트**이며 무조건 Copy는 하지 않는다 → Phase 01의 ADR-013 개정 대상)

## 🧊 동결 경계 — ADR-039에 명문화

| 구역 | 동결 사유 | 축 |
|---|---|---|
| 루트 설정 파일 16개 | 도구가 루트에서만 인식 / 이동 시 전부 보정 필요 | 축1 |
| 루트 `artifacts/`·`out/`·`test-results/` | 도구 기본 출력 (`outDir` 미설정 = cwd 상대) | 축1 |
| `99_Others/{scripts,tests}` | `vitest.config.ts:11`·`playwright.config.ts:20`·`tsconfig.node.json:23-26`·`.eslintrc.cjs:13` 리터럴 | 축1 |
| `.claude`·`.codex`·`.agents`·`.env*` | 외부 도구가 이름으로 탐색 | 축1 |
| **프레임워크 진입점·배럴·config** (`main.tsx`·`index.ts`·`env.d.ts`·`*.config.ts`) | `index.html:15`가 `/src/main.tsx` 하드코딩. ⚠️ 대소문자 전용 개명이라 **Windows에선 dev·typecheck가 green으로 남고 Linux CI에서만 터진다** | 축1 |
| **`01_Phases/**/Screenshot` 철자** | 같은 대소문자 함정 + 채증 + 가이드 HTML 참조 + Windows에선 두 표기가 같은 폴더 → **시각 이득 목록 한 줄** | 축1·축3 |
| 채증 산출물 | **그때 무슨 일이 있었나의 기록** — 개명하면 -DONE.md·가이드 참조 정합이 깨진다 | 축3 |

## 🗺️ Phase 지도

**핵심 원리: 훅이 신·구 이름을 모두 받아들이게 먼저 만들고(P03), 그 다음에 개명한다(P05·P07).**

`shell-policy.mjs`의 `classifyHarnessPath`는 **정규식이 안 맞으면 `'unrelated'` = fail-open**. 로그도 에러도 없다. HR2에서 폴더 개명이 안전장치 4곳을 동시 무력화한 실사고가 있었다.

| Phase | 제목 | 등급 | 창 | PR |
|---|---|---|---|---|
| 01 | ADR 3건 정합 — 039 신설 · 027 개정2 · 013 개정 | 복잡 | **창 1** | ① |
| 02 | 루트 지도 + 개명 매니페스트 확정 | 보통 | 창 1 | ① |
| 03 | 골든 픽스처 선행(TDD) + 훅 병행 수용 전수 + 명명 가드 | 대규모 | 창 1 | ① |
| 04 | 창 폐쇄 후 봉인 발화 프로브 + Codex 핸드오프 | 보통 | 창 밖 | ① |
| 05 | 문서 폴더 개명 전수 | 복잡 | **창 2** | ① |
| 06 | 유령 포인터 정정 + 수용 방향 일몰 + 화석 삭제 | 보통 | 창 2 | ① |
| 07 | 코드 kebab 13개 → camelCase | 대규모 | 창 없음 | ② |

**병렬 가능**: 없음 — P01→P02→P03은 규범이 훅 대상을 정의하는 순차 의존이고, P03→P05·P07은 **병행 수용이 개명보다 앞서야 한다는 안전 순서**다.

**브랜치**: `chore/nc-naming-docs`(P01~P06 → PR ①) / `chore/nc-naming-code`(P07 → PR ②). 두 PR이 건드리는 파일이 거의 겹치지 않아 rename 충돌이 없다.

> ⭐ **창 2회가 최소인 이유는 프로브 때문이다.** `supervisor-guard.sh:57-59` — **창이 열려 있으면 훅 전체가 exit 0**이라, 창 안에서는 봉인 발화를 실측할 방법이 원리적으로 없다. P03 후 창을 닫아야만 P04 프로브가 성립하고, 그게 green일 때만 P05 개명에 들어간다.
>
> 📌 **예비 창 1회를 명시한다** — P04 프로브가 실패하면 3번째 창 없이는 못 고친다. 적어두지 않으면 실패 시점에 "창 하나 더"가 계획 위반처럼 보여 **무리한 우회를 유도한다.**

## 🧪 회귀 게이트 정본 (Phase AC는 **여기를 참조**한다 — 복제 금지)

> ⚠️ **이 절이 존재하는 이유**: 초안은 게이트 명령을 Phase 7곳에 복제했고, 그중 **2종이 실재하지 않는 파일을 가리켰다**(`_selftest.sh`·`core-conformance.mjs` — 둘 다 부재). 실행자가 그 명령을 치면 "파일 없음"이 뜨고 즉석 대체하거나 건너뛰게 되는데, 그것이 정확히 `08-docs-prefix-renumber.md`를 거짓 green으로 만든 경로다. **복제본은 갈라진다** — 이 마일스톤이 문서에 대해 주장하는 원칙을 계획서 자신에게 먼저 적용한다.

| 게이트 | 명령 | 기준선 |
|---|---|---|
| **G1 훅 셀프테스트** | `npm run test:hooks` (= `cd .claude/hooks/_lib && node --test`) | **113/113** |
| **G2 CORE conformance** | `node 00_Documents/00_Harness/conformance-check.mjs` ⚠️ **P05 이후 → `00_Documents/00_Harness/conformance-check.mjs`** | **13/13** |
| **G3 harness-conformance** | `npx vitest run 99_Others/tests/harness-conformance.test.ts` | 12/12 |
| **G4 단위 전체** | `npx vitest run` | **5,330 passed / 10 skipped** |
| **G5 타입·린트** | `npm run typecheck && npm run lint` | 0 / 0 ⚠️ eslint는 `.ts,.tsx`만 — **훅 `.mjs`는 대상 밖** |
| **G6 e2e 핵심** | `npx playwright test 99_Others/tests/e2e/core-loop` | 4/4 |

⚠️ **G2는 P05가 개명하는 폴더 안에 산다** (`00_Documents/harness/` → `00_Documents/00_Harness/`). P05 이후 Phase는 신 경로로 실행한다. 이 자기참조가 P02 역산 표에 **반드시** 들어가야 한다.

### 이 마일스톤 고유 검증 — 기존 게이트가 원리적으로 못 잡는 것

| # | 검증 | 왜 필요한가 |
|---|---|---|
| **V1 봉인 생존 프로브** | 창 폐쇄 후 **canary 경로**(존재하지 않는 가짜 경로)로 봉인 대상 쓰기를 시도해 훅이 차단하는지 **로그로** 확인 | G1~G6은 봉인이 죽어도 전부 green이다. 그리고 `classifyHarnessPath`는 **파일 존재와 무관한 순수 문자열 분류**라 canary로도 판정이 등가다(정본을 다치지 않게 하는 HR2 P11 선례) |
| **V2 재봉인 상태 확인** | `gate-open.flag` 부재 + `.claude/settings.json` ≡ `settings.SEALED.json` | TTL 만료는 **훅 층만** 복귀시키고 permission deny는 열린 채로 둘 수 있다(HR2 실측) |
| **V3 포인터 실재 확인** | `report_html:` 가 가리키는 경로가 **파일시스템에 존재**하는지 | 훅 검증 통과 ≠ 파일 존재. 유령 포인터 15건이 그 실증(P02 실측 — 초안 12는 과소) |
| **V4 매니페스트 목록 대조** | 개명 24건이 **전부** 반영됐는지 이름 단위 대조 | "N개쯤"은 실행 후 대조할 것이 없다 |

> 🚦 **V1·V2는 창이 닫힌 상태에서만 성립한다** — `supervisor-guard.sh:57-59`가 창 개방 중엔 훅 전체를 exit 0으로 만든다.

---

## 👥 편성 — 이번 마일스톤 한정 격상 (영호 승인 2026-07-26)

| 역할 | 평시 | 이번 한정 |
|---|---|---|
| `plan-auditor` | `claude-opus-5` / xhigh | **Fable 5** |
| `reviewer` | `claude-opus-5` / xhigh | **Fable 5** |
| **Codex 교차 리뷰** | — | `harness-review`(P04) · `agentdeck-review`(P07 커밋 전) |

### ⚠️ 담당 배치 — 위임 판정은 **2축 AND**다

초안이 여기서 헌법을 어겼다. `qa` 에게 `.claude/hooks/**` 픽스처를, `secretary` 에게 ADR·`AGENTS.md`·`.claude/policies/**` 치환을 맡겼는데 **둘 다 R/W 경계 위반**이다(`_routing.md:21`·`:82`·`:83`).

| 축 | 물음 |
|---|---|
| ① **기계 / 판단** (잡무 기준 v1) | 판단이 끝난 기계 실행인가? |
| ② **경로 소유권** (`_routing.md`) | 그 역할이 **쓸 수 있는 경로**인가? |

**두 축을 모두 통과해야 위임된다.** 초안은 ①만 보고 ②를 빠뜨렸다 — *"대량 치환 = 기계 작업 = secretary"*, *"TDD 픽스처 = qa"* 라는 **역할 연상이 경로 소유권을 덮어썼다.**

| 구역 | 담당 |
|---|---|
| `.claude/**` · ADR · `CLAUDE.md` · 공유 문서 (판단·치환 모두) | **메인 직접** — 위임 금지 |
| `.codex/**` · `AGENTS.md` | **Codex root 전담** (CORE-12) |
| `99_Others/tests/**` | `qa` |
| read-only 인벤토리 · 허용 경로의 기계 작업(Phase·reports·state·화석 삭제) | `secretary` |

**격상 방식 = 파일 수정이 아니라 호출 시점 override.** `Agent` 도구의 `model` 파라미터가 정의의 `model:` frontmatter를 이긴다. ① `.claude/agents/**`(CORE-11 봉인) 수정이 없어 **창이 불필요**하고 ② **에이전트 정의 편집은 같은 세션에서 반영되지 않는다**는 함정을 피하며 ③ "이번 한정"이 **되돌릴 것 없이** 성립한다.

> ⚠️ **Fable 5 격상의 이 마일스톤 고유 위험** — P03은 전부 방어적 보안 작업(봉인 정규식·우회 케이스 픽스처·deny 목록·가드 훅)이다. 과거 Fable 5 세션이 이런 방어 작업을 안전장치로 거부한 선례가 있다. **완화**: 브리프에 *"이 저장소 자신의 안전장치를 강화하는 작업이며 산출물은 우회를 막는 규칙"* 을 명시하고, 거부 시 `claude-opus-5`로 재호출하되 **품질 저하가 아니라 모델 안전장치 발동임을 구분해 기록**한다.
> **실측 참고**: 설계 단계의 CTO(Fable 5) 자문은 봉인 fail-open·우회 경로·토큰화 구멍을 상세히 논했고 **거부가 발동하지 않았다.**

## 🚦 사람 게이트 — 자율 완주가 원리적으로 끊기는 지점

| # | 지점 | 주체 |
|---|---|---|
| 1 | 창 1 개방 `OPEN-GATE.bat` | 영호 (TTL 7h — 초과 시 재개방) |
| 2 | 창 1 폐쇄 `CLOSE-GATE.bat` | 영호 |
| 3 | P04 프로브 = **중간 게이트** | 자동, 결과 보고 |
| 4 | **Codex 세션 ①** — CX 훅 대칭 + `harness-review` | 영호 |
| 5 | 창 2 개방·폐쇄 | 영호 |
| 6 | P06 후 **폴더 목록 before/after 확인 1회** | 영호 육안 |
| 7 | **Codex 세션 ②** — P07 커밋 전 `agentdeck-review` | 영호 |
| 8 | `push` / `gh pr create` / `gh pr merge` ×2 | 영호 `!` 직접 (CORE-06 v2) |

그 사이 구간은 전부 자율. **개입 10~12회.**

## ⚠️ 마일스톤 전역 함정

| 위험 | 실측 근거 | 대응 |
|---|---|---|
| **fail-open 봉인** | `classifyHarnessPath` 미스 → `'unrelated'` | P03을 개명보다 먼저 |
| **정규식이 grep에 안 보임** | `/^00[._]documents\/(?:harness\|adr)/` — 소문자+문자클래스+이스케이프 | 골든 픽스처 + 발화 프로브 |
| **중복 정의 정규식** | `done-report-policy.mjs:76` ↔ `:144` 동일 정규식 2회 | 원자 수정 |
| **원자 쌍 분리** | `tdd-guard.sh:26` 글롭 ↔ `:45` `TESTS_RELS` | 같은 커밋 |
| **훅 리터럴 침묵사** | `risk-detector.sh:26·:30`의 `agent-events`·`ipc-contract` | P03에서 병행 수용 (P07엔 창이 없다) |
| **조용한 no-op 개명** | `core.ignorecase = true` | 대소문자 전용 개명은 **범위에서 제외** |
| **canonical 이중화** | `settings.SEALED.json`이 유일 정본, `.claude/settings.json`은 배치가 덮는 파생물 | SEALED만 수정 |
| ⚠️ **Codex는 fail-open이 아니다 — 방향이 반대** | Codex `isHarnessPath()` 는 `00_Documents/{harness,adr}` 를 **아예 보지 않는다**(ADR-037 명시). 대신 `reports` 리터럴이 **fail-closed 과차단**, `harness-doctor` 가 **import 시 `process.exit(1)`** | P02 역산 표 ④축 + P04 **receipt hard gate** |
| 🔴 **Codex 훅 digest** | 본문 digest ≠ `hooks.json` 인자 → **모든 훅이 무출력 return**(fail-open no-op) | P04 브리프 필수 항목 + `/hooks` 재신뢰(영호 실행) |
| **Codex 위험 깃발 침묵사** | `agentdeck-hook.mjs:439·441` 이 `agent-events`·`ipc-contract` 문자열에 직접 의존, 미스 시 빈 `flags` | P07 사전 조건에 스템 병행 수용 확인 |
| ⚠️ **lint 사각지대** | `.eslintrc.cjs`는 `.ts,.tsx`만 본다 → **훅 `.mjs`는 lint 대상 밖** | 훅 변경은 골든 테스트가 유일한 기계 판정 |

> 📌 **부트스트랩 자물쇠는 비용 0** — `98_Management/Harness_OpenGate`는 이미 `PascalCase_PascalCase`라 **범위에서 빼면 진입조차 안 한다.** HR2가 치른 비용이 이번엔 없다. *범위 설계로 위험을 제거하는 편이 관리하는 것보다 항상 싸다.*

## 📤 다음 창으로 이월

- 봉인 방향 옛 리터럴 정리 (집합을 넓히는 쪽이라 fail-closed → 영구 존치해도 무해)
- `settings.SEALED.json` 옛 폴더명 deny 4줄 + `$comment` 문단 — 제거 조건 *"master 머지 + 한 마일스톤 경과"* 이고 **이번 마일스톤이 그 한 마일스톤**
- HR2 잔여 백로그 **14·15·16**
- 🆕 **백로그(`00_Documents/BACKLOG.md`) 17 — Codex 문서층은 full-access 세션에서 0층이다.** Codex `isHarnessPath()` 가 `00_Documents/**` 를 보지 않고, 평시엔 `config.toml` 프로필 권한이 문서 쓰기를 막지만 **유지보수 세션에서는 그 권한이 열리므로 방어가 남지 않는다.** Claude 쪽은 `permissions.deny` + 훅 2층인데 Codex는 1층 → **층의 비대칭**(HR2가 CORE-06에서 진단한 것과 같은 구조). **개명이 만든 구멍이 아니라 선재 구조**이며, 이번 마일스톤은 봉인을 추가하지 않기로 했다(영호 결정 2026-07-26: *"어차피 Reviewer position이라 Permission이 Edit 불가"* — 평시엔 맞다). ADR-037·CORE-11의 Codex 적용 범위 결정이 필요하다

## 📦 종결 산출물

- `NC-DONE.md` + **5단계 보고**(🎯🤔🛠️🧪➡️)
- `.claude/CHANGELOG.md` 이력 행 (`[H]` — 하네스·ADR 3건 변경)
- work-pin 갱신
- **HTML 보고서는 만들지 않는다** — 이번 산출물이 「규범 문서(ADR-039) + 루트 지도」 자체라, HTML은 세 번째 사본이 되어 드리프트 원천이 된다 (영호 결정)
