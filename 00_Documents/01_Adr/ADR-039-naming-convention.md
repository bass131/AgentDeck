### ADR-039: 명명 규범 — 폴더 층 전역 규칙 + 파일명은 폴더 계약이 소유

**결정(유지보수 창 2026-07-26, 영호)**: 저장소 명명 규범을 **두 층으로 나눠** 소유권을 확정한다. ① **분류 폴더(taxonomy)** 이름은 `NN_PascalCase` 전역 규칙을 따른다. ② **파일명은 각 폴더가 이미 가진 계약**을 따르며, 본 ADR이 "어떤 폴더가 어떤 계약을 갖는가"를 표로 소유한다. **모듈 폴더(import path)와 프레임워크 예약 이름은 대상이 아니다**(ADR-027·028의 명시 제외를 승계). 재발 방지는 **advisory 티어 훅**(`exit 0` + `systemMessage`)이 담당하며 **차단하지 않는다**.

**이유**: 영호의 문제 제기는 *"**폴더는** 어떤 건 `Prefix_Name` 형식인데 어떤 건 소문자 폴더 이름을 띄고, 대충 방에 쓰레기 던져놓은 것마냥 체계화가 전혀 안 되어 있다"* 였다. 그런데 실측하니 **진단이 통상과 반대**였다 — 규칙은 이미 있었고(ADR-027 채택 + 제외 규칙 명문화), **파일 층은 폴더마다 이미 일관**돼 있었다. 혼재는 **폴더 이름 층에서만** 일어난다.

| 구역 | 현행 계약 | 일관성 |
|---|---|---|
| `00_Documents/*.md` | `ARCHITECTURE.md` = UPPER_SNAKE | ✅ |
| `00_Documents/01_Adr/*.md` | `ADR-NNN-{kebab}.md` | ✅ |
| `00_Documents/02_Reports/**` | `{마일스톤코드}-{한글 서술}.html` | ✅ (영호가 정한 규약) |
| `01_Phases/**/*.md` | `NN-{kebab}.md` | ✅ |
| **폴더 이름** | `adr`·`assets` ↔ `Artifacts`·`_Codex_Review` | ❌ **혼재는 여기뿐** |

진짜 결함은 규칙 부재가 아니라 **규칙이 미이행 상태로 done 처리된 것**이다 — `01_Phases/00_RF1-cleanup/08-docs-prefix-renumber.md` 는 frontmatter `status: done`, 본문 `pending`, 체크박스 전부 미체크, 구현 0건이다. HR2가 반복해서 마주친 **거짓 green**과 같은 부류다.

**대안과 트레이드오프**: (a) *전역 획일화* — "모든 파일 PascalCase" 같은 단일 규칙. 개념은 단순하나 **이미 일관된 계약 4개를 동시에 깨야** 하고, `ADR-038-management-opengate.md`·`08-docs-prefix-renumber.md` 같은 정렬 의미를 가진 이름이 전부 대상이 된다. 채택 ADR-027·028과도 정면 충돌. (b) *현행 방치* — 비용 0이나 폴더 목록의 무질서가 남고 신규 생성물마다 판단이 반복된다. (c) **채택: 층 분리** — 전역 규칙을 폴더 이름에만 적용하고 파일명은 폴더 계약에 위임. 미래 세션이 새 파일을 만들 때 **"어느 폴더인가"만 보면 이름이 결정**된다. 비용 = 계약 표를 유지해야 하고, 새 폴더를 만들 때 계약을 함께 정의해야 한다.

**규모(실측)**: 소문자 시작 파일 **884건** = 동결 256 / 파생 종속 451(테스트가 소스 stem을 따라감 — 독립 판정 아님) / 개명 판정 177 → **실제 문자 변경 ≈ 20건**. 즉 이 규범의 도입 비용은 대공사가 아니라 정밀 작업이다.

---

## 1. 폴더별 파일 계약 (정본)

| 폴더 | 계약 | 예 |
|---|---|---|
| `00_Documents/` 루트 | `UPPER_SNAKE.md` | `ARCHITECTURE.md` · `ROOT_LAYOUT.md` · `BACKLOG.md` |
| `00_Documents/01_Adr/` | `ADR-NNN-{kebab}.md` | `ADR-039-naming-convention.md` |
| `00_Documents/02_Reports/**` | `{마일스톤코드}-{한글 서술}.html` | `HR1-P05-하네스개편.html` |
| `00_Documents/03_Reviews/**` | `YYYY-MM-DD-{kebab}.md\|html` | `2026-07-17-harness-review-all.md` |
| `01_Phases/**/` | `NN-{kebab}.md` | `01-adr-alignment.md` |
| `02_Source/**/*.ts` | **`camelCase`**, 단일어는 소문자 | `agentEvents.ts` · `git.ts` |
| `02_Source/**/*.tsx` | `PascalCase`(컴포넌트) / **훅·모음은 camel** | `ChatPanel.tsx` · `zoom.tsx` |
| **분류 폴더 전역** | `NN_PascalCase` | `00_Documents` · `01_Adr` |

⚠️ **보고서의 한글 서술 파일명은 *의도된 규약*이며 예외가 아니라 별도 계약이다.** 미래 세션이 이를 "정리 대상"으로 오인하지 않도록 명시한다.

⚠️ **번호는 「읽는 순서」를 뜻할 때만 붙인다.** `00_Harness`·`01_Adr`·`02_Reports`… 의 번호가 값어치를 갖는 이유는 정렬이 아니라 *"먼저 읽어야 할 것이 먼저 보이는 것"* 이다. 순서 개념이 없는 **병렬 분류**(엔진별·주체별 등)에는 번호를 붙이지 않고 `PascalCase` 만 쓴다 — `03_Reviews/Codex/` · `03_Reviews/Harness/` 가 그 예다. 억지 번호는 *"0번이 1번보다 먼저"* 라는 없는 의미를 주장한다.

⭐ **분류 폴더 루트에 산출물을 직접 두지 않는다.** 폴더가 분류를 뜻한다면 그 안의 것들도 분류돼 있어야 한다. 이 규칙이 없어서 `02_Reports/` 루트에 6개 파일이 분류 없이 쌓였고, 그것이 영호가 *"대충 방에 쓰레기 던져놓은 것마냥"* 이라고 말한 화면의 실물이다. 예외는 **인덱스 파일 하나**(`INDEX.md`) — 그건 산출물이 아니라 목차다.

### `.ts` 가 camelCase인 근거 — 두 축

1. **저장소 다수파** — `02_Source` 센서스 실측: camel **82** / 단일어 79 / kebab **13** / Pascal 76(`.tsx` 포함). **kebab 13개가 이탈자**이며, 이동 비용이 최소인 방향이 camel이다.
2. **`import` 노출** — 파일명은 `import` 문에 그대로 박힌다. JS/TS에서 대문자 시작은 *"값이 아니라 타입/클래스/컴포넌트다"* 를 뜻하므로, 함수 모음을 `Git.ts` 로 두면 잘못된 신호를 준다.

```ts
import { commit } from './git'   // "git 모듈에서 commit을 가져온다"
import { commit } from './Git'   // "Git…? 클래스인가?"
```

널리 통하는 원리는 **"파일명은 그 파일의 주 export 심볼의 케이스를 따른다"** 이며, 위 표는 그 원리의 적용 결과다. (C#의 *"파일명 = 클래스명"* 이 성립하지 않는 이유 = JS/TS는 파일 하나가 여러 심볼을 내보내는 것이 정상이라 **"무엇의 이름인지"가 애초에 정해지지 않기** 때문이다.)

> 📌 참고 프로젝트 AgentCodeGUI의 kebab **0건**은 **각주 데이터포인트**로만 둔다 — 근거를 저장소 자체 다수파와 생태계 관용에 두어, 참고 프로젝트의 위상이 바뀌어도(ADR-013 개정: "원본" → **참고용 프로젝트**) 본 ADR이 흔들리지 않게 한다.

---

## 2. 동결 경계 — 무엇을 남기는가

| 구역 | 동결 사유 | 축 |
|---|---|---|
| 루트 설정 파일 16개 | 도구가 루트에서만 인식. **보정 없이 옮길 수 있는 것은 0개**(`dev.bat` 의 `%~dp0` 는 배치파일 자기 위치, `LICENSE` 는 GitHub 라이선스 자동 인식) | 축1 |
| 루트 `artifacts/`·`out/`·`test-results/` | 어떤 설정도 `outDir`/`outputDir` 를 지정하지 않아 **도구 기본값이 cwd 상대**로 떨어진다 | 축1 |
| `99_Others/{scripts,tests}` | `vitest.config.ts:11`·`playwright.config.ts:20`·`tsconfig.node.json:23-26`·`.eslintrc.cjs:13` 리터럴 | 축1 |
| `.claude`·`.codex`·`.agents`·`.env*` | 외부 도구가 **이름으로 탐색**(Codex 확인: `$CWD/.agents/skills` 등 3경로) | 축1 |
| **프레임워크 진입점·배럴·config** (`main.tsx`·`index.ts`·`env.d.ts`·`*.config.ts`) | `02_Source/renderer/index.html:15` 가 `/src/main.tsx` 하드코딩. ⚠️ 대소문자 전용 개명이라 **Windows에선 dev·typecheck가 green으로 남고 Linux CI에서만 터진다** | 축1 |
| **`01_Phases/**/Screenshot` 철자** | 같은 대소문자 함정 + 채증 + 가이드 HTML 참조 + Windows에선 두 표기가 같은 폴더 → **시각 이득 목록 한 줄** | 축1·축3 |
| 채증 산출물(스크린샷·로그·리뷰 원본) | *그때 무슨 일이 있었나의 기록* — 개명하면 `-DONE.md`·가이드의 참조 정합이 깨진다 | 축3 |
| `98_Management/Harness_OpenGate` | 이미 규칙 적합(`PascalCase_PascalCase`)이며, 개명 범위에 넣는 순간 **부트스트랩 자물쇠**(창을 여는 플래그 경로가 `supervisor-guard.sh:42-43` 에 하드코딩)에 진입한다 | 축1·축4 |

> ⚠️ **「외부 도구가 탐색하는 이름」과 「우리가 만든 판정 규칙」을 같은 것으로 읽지 말 것**(2026-07-26 Codex 교차 감사 Finding 3). 위 표의 `.claude`·`.codex`·`.agents`·`AGENTS.md` 는 **공식 도구가 그 이름을 직접 찾는다** — 바꾸면 도구가 못 찾으므로 **통제권 밖(축0)** 이고 동결이 유일한 선택이다. 반면 `00_Documents/(?:\d{2}_)?Harness/` 같은 정규식은 **우리 훅·doctor 의 내부 탐색 규칙**이라 우리가 함께 고치면 이름을 바꿀 수 있다 — 이쪽은 축1(기계 계약)이지 축0이 아니다. 둘을 뭉뚱그리면 *"Codex 공식 규칙이 `00_Documents/Harness` 를 요구한다"* 로 오독되어, 바꿀 수 있는 것을 못 바꾸는 쪽으로 굳는다.

> ⚠️ **`core.ignorecase = true`** — 이 저장소에서 대소문자만 바뀌는 개명은 `git mv` 한 번으로는 **조용한 no-op**이고 typecheck도 green으로 남는다(파일시스템이 대소문자를 무시해 import가 계속 해석됨). 그래서 **대소문자 전용 개명은 규범 적용 범위에서 제외**한다.

---

## 3. 판정 프레임 — 사전식 4축

이름을 바꿀지 말지가 갈릴 때 **위에서부터** 적용한다. 상위 축에서 결론이 나면 하위 축은 보지 않는다.

| 축 | 물음 | 결론 |
|---|---|---|
| **축0 통제권** | 우리가 정할 수 있는 이름인가? | 외부 도구가 정하면 → 동결 |
| **축1 기계 계약** | 이름이 런타임에 해석되는가? (**fail-open 가중**) | 계약이면 → 동결 또는 갱신 동반 |
| **축2 생성 주체** | 사람이 쓴 것인가, 도구가 만든 것인가? | 생성물이면 → 동결 |
| **축3 포인터 / 기록** | 가서 읽을 용도인가, 그때 무슨 일이 있었나의 서술인가? | 기록이면 → 동결 |
| **축4 기존 규약** | 이미 일관된 계약이 있는가? | 있으면 → 그 계약을 따른다 |

⚠️ **축1에 fail-open 가중을 두는 이유**: 훅의 경로 판정기(`shell-policy.mjs` 의 `classifyHarnessPath`)는 정규식이 맞지 않으면 `'unrelated'` 를 반환한다 — **로그도 에러도 없이 봉인이 사라진다.** HR2에서 폴더 개명이 안전장치 4곳을 동시에 무력화한 실사고가 있었다. 따라서 **개명보다 훅의 신·구 병행 수용이 항상 먼저**다.

---

## 4. 기계 강제의 티어 — 차단이 아니라 advisory

**경계선: fail-closed 차단은 안전 속성(봉인·파괴·비가역)에만, 품질 규범(명명)은 fail-visible advisory에만.**

명명 위반은 사후 교정 비용이 싸고 보안 결과가 없다. 차단형으로 만들면 **오탐 하나가 핫픽스를 막는** 나쁜 교환이 된다. `convention-size-guard`·`risk-detector` 가 이미 이 티어(`exit 0` + `systemMessage`)의 선례다.

**기계화 범위 = 안정적인 불변식 4개 + 신규 생성물 한정**

1. 새 최상위 폴더 = **`NN_PascalCase`**
2. `00_Documents` 하위 새 폴더 = `NN_PascalCase`
3. 새 `.ts` = camel ⚠️ **`.tsx` 는 기계 강제하지 않는다**
4. 파일명 공백 금지

> ⚠️ **불변식 1의 표기 정정(2026-07-26, P03 reviewer 지적)** — 초안은 `NN_Name` 이라 적었고 훅도 그대로 구현해 `03_tools` 처럼 **소문자로 시작하는 폴더가 통과**했다. §1 표는 *"분류 폴더 전역 = `NN_PascalCase`"* 인데 §4가 `NN_Name` 이라 **같은 규칙이 한 문서 안에서 두 표기로 갈라져** 있었고, 기계는 느슨한 쪽을 따랐다. **강제가 정본보다 느슨하면 규칙은 사실상 두 개다.** 이 ADR이 고치려는 병을 이 ADR이 앓고 있었던 셈이라 기록으로 남긴다.

⚠️ **`.tsx` 를 강제하지 않는 이유**: 케이스 판정이 *"주 export 심볼이 컴포넌트인가"* 라는 **내용 기반**이라 파일명만으로 결정 불가다. 단순 규칙으로 강제하면 `zoom.tsx`(훅)·`icons.tsx`(모음)·`main.tsx`(진입점) 같은 **합법적인 파일에 상시 오경고**가 뜬다. `.tsx` 판정은 **본 ADR의 문장이 소유**한다.

⚠️ **소급 스캔은 하지 않는다** — 동결 파일에 상시 경고가 뜨면 노이즈가 **승인 피로를 거쳐 우회 습관**이 된다. 불변식 1·2에는 동결 예외 목록(`artifacts`·`out`·`test-results`·`node_modules`·`.claude`·`.codex`·`.agents`)을 함께 넣는다.

⚠️ **"훅이 보는 경로 리터럴 전수 지도" 문서는 만들지 않는다** — 문서는 드리프트한다. **골든 픽스처가 곧 기계 검증되는 지도**다(낡으면 red로 알려준다).

---

## 5. 개명 매니페스트 (확정 — 2026-07-26 전수 실측)

> **"N개쯤"이 아니라 이름 확정 목록이다.** 추정치는 실행 후 대조할 것이 없지만 목록은 대조가 된다.
> 아래의 모든 「현재명」은 파일시스템에 **실재함을 전수 확인**했다(유령 항목 0).

### 5-1. 폴더 11건

**`00_Documents/` 직속 7개**

| 현재명 | 신명 | 판정 |
|---|---|---|
| `harness` | `00_Harness` | 개명 ⚠️ **CORE-11 봉인** — 창 필요 |
| `adr` | `01_Adr` | 개명 ⚠️ **CORE-11 봉인** — 창 필요 |
| `reports` | `02_Reports` | 개명 |
| `reviews` | `03_Reviews/Harness/` | **통합 이동** (2파일) |
| `_Codex_Review` | `03_Reviews/Codex/` | **통합 이동** (6파일) |
| `Artifacts` | `04_Artifacts` | 개명 |
| `assets` | `05_Assets` | 개명 |

⭐ **`reviews` 는 설계 시점에 누락됐던 폴더다**(2026-07-26 P02 실측에서 발견). `_Codex_Review` 만 알고 있었는데 소문자 `reviews` 가 **별도로 존재**했고, 이쪽이 오히려 **활성 기계 소비처**다 — `.claude/commands/harness-review.md:69`·`:93` 이 *"산출물을 `00_Documents/03_Reviews/Harness/` 에 쓰라"* 고 지시한다. 두 폴더 다 「어떤 시점의 검토 기록」이라 성격이 같으므로 `03_Reviews/` 아래 엔진별로 가른다.

**`00_Documents/02_Reports/` 하위 4개**

| 현재명 | 신명 |
|---|---|
| `milestones` | `00_Milestones` |
| `guides` | `01_Guides` |
| `manuals` | `02_Manuals` |
| `next` | `03_Next` |

**`02_Reports/` 루트에 분류 없이 남은 6파일 → `00_Milestones/`** (`INDEX.md` 는 인덱스라 루트 유지)

`LP1-01-대상선정.md` · `LP1-02-doc-maintainer-손실행.md` · `LP1-03-P0-매트릭스-초안.md` · `LP1-지표-원장.md` · `LP-루프-이식-확정안-순서와-시스템.html` · `UPSTREAM-원본대조-엔진자유도-실측.html`

> ❄️ **이 6개의 *파일명* 은 바꾸지 않는다** — 보고서 계약(`{마일스톤코드}-{한글 서술}`)에 이미 부합하고, 채증 성격이라 축3(기록)에서 동결이다. ⚠️ `UPSTREAM-원본대조-…` 의 "원본"도 그대로 둔다. ADR-013 개정 1이 위상을 바꾼 것은 *앞으로의 서술*이지, **그때 그 대조를 수행한 기록의 제목이 아니다.**

### 5-2. 파일 13건 — `02_Source` kebab → camelCase

| 현재명 | 신명 | 참조 파일 수 |
|---|---|---|
| `shared/ipc-contract.ts` | `ipcContract.ts` | **196** ⚠️ CORE-04 심장 |
| `shared/agent-events.ts` | `agentEvents.ts` | **149** ⚠️ backend-contract |
| `main/01_agents/claude-stream.ts` | `claudeStream.ts` | 38 |
| `main/00_ipc/agent-runs.ts` | `agentRuns.ts` | 31 |
| `main/01_agents/run-args.ts` | `runArgs.ts` | 16 |
| `main/engine-state.ts` | `engineState.ts` | 9 |
| `shared/diff-types.ts` | `diffTypes.ts` | 9 |
| `main/engine-versions.ts` | `engineVersions.ts` | 8 |
| `main/backend-status.ts` | `backendStatus.ts` | 6 |
| `shared/model-effort.ts` | `modelEffort.ts` | 6 |
| `main/01_agents/orchestration-meta.ts` | `orchestrationMeta.ts` | 4 |
| `main/00_ipc/engine-check-update.ts` | `engineCheckUpdate.ts` | 3 |
| `main/05_settings/merge-slash-commands.ts` | `mergeSlashCommands.ts` | 3 |

> ❄️ **`.tsx` 4개는 개명하지 않는다** — `icons.tsx`(주인공 없는 모음) · `resizableModal.tsx`·`zoom.tsx`(주 export 가 훅) · `main.tsx`(export 0, Vite 진입점 계약). §1 표의 *"훅·모음은 camel"* 에 이미 부합한다.

**합계 = 폴더 11 + 파일 13 = 24건**

---

### 5-3. ⭐ 역산 표 — 각 개명 대상이 무엇에 걸려 있는가

> 이 표가 Phase 03·05·06·07의 **입력**이다. "무엇을 바꾸나"에서 "그것이 무엇에 걸려 있나"를 뽑아 두면, 훅 수정이 *빠짐없이* 됐는지를 **목록 대조로 판정**할 수 있다. 이게 없으면 grep에 안 보이는 정규식을 기억에 의존해 찾아야 한다.

#### ① 훅 — fail-open (개명 시 **조용히** 죽는다)

> ⚠️ **아래 줄 번호는 「P03 수정 *전*」 좌표다.** P03이 주석을 덧붙이며 실제 줄이 밀렸다(예: `shell-policy.mjs:425` → 현재 `:430`, `done-report-policy.mjs:76`·`:144` → 현재 `:90`·`:158`). 좌표를 갱신하지 않고 기준 시점을 밝히는 쪽을 택한 이유는, **이 표가 「무엇이 걸려 있었나」의 기록**이지 「지금 몇 번째 줄인가」의 인덱스가 아니기 때문이다 — 후자는 편집할 때마다 낡는다. 현재 위치를 찾을 때는 **줄 번호가 아니라 골든 픽스처**를 보라(§4).

| 개명 대상 | 걸리는 곳 (2026-07-26 실측 · P03 수정 전 좌표) | 판정 |
|---|---|---|
| `00_Documents/{harness,adr}` | `shell-policy.mjs:425`·`:426` — `/^00[._]documents\/(?:harness\|adr)(?:\/\|$)/` | ✅ **수정 완료** (P03) |
| 〃 (짝) | `shell-policy.mjs:451-452` `HARNESS_MARKERS` — ⚠️ **초안은 "무접점"으로 오판정**했으나 `:452`가 `00[._]documents/(?:harness\|adr)` 를 품고 있었다 | ✅ **수정 완료** (P03) |
| `00_Documents/02_Reports` | `done-report-policy.mjs:76` **＋** `:144` — 동일 정규식이 **문자 그대로 2회 정의** | ✅ **상수 추출로 복제 제거** (P03) |
| `agent-events` (스템) | `risk-detector.sh:26` — `*02[._]Source/shared/agent-events*` | ✅ **수정 완료** (P03) |
| `ipc-contract` (스템) | `risk-detector.sh:30` — `*02[._]Source/shared/ipc-contract*` | ✅ **수정 완료** (P03) |
| `98_Management/Harness_OpenGate` | `shell-policy.mjs:428`·`:704`, `supervisor-guard.sh:42-43` | ❄️ **개명 안 함 → 변경 0건 확인** |
| `99_Others/tests` | `tdd-guard.sh:43` `TESTS_RELS="99_Others/tests 99.Others/tests"` (신·구 병행 이미 존재). `:26` 은 `02_Source/shared` 제외 케이스. 파일 스템은 `:41-42` 가 `basename` 으로 **동적 추출** | ❄️ **동결 → 변경 0건 확인** |

> ⭐ **P03이 이 표를 한 번 고쳤다** — `HARNESS_MARKERS` 를 「무접점 → 변경 0건 확인」으로 판정했는데, 골든 픽스처를 쓰자 **red 가 났다**. `:452` 가 `00[._]documents/(?:harness|adr)` 를 품고 있어 실제로는 **수정 대상**이었고, 여기만 빠지면 Edit 도구 경로는 막히는데 **셸 우회 쓰기(`tee`·`>`·`sed -i`)는 통과**하는 반쪽 봉인이 된다. **표는 사람이 읽고 픽스처는 기계가 읽는다** — 그래서 「훅 경로 리터럴 지도」 문서를 따로 만들지 않고 픽스처를 지도로 삼는다(§4).

> 📌 **줄 번호 정정 4건**(계획 초안 → 실측): `HARNESS_MARKERS` 는 450 이 아니라 **451**부터 · `tdd-guard.sh` 의 스템 추출은 45 가 아니라 **41-42** · `supervisor-guard.sh` 의 창 개방 시 `exit 0` 은 57-59 가 아니라 **62** · `shell-policy.mjs:428`·`:704` 는 `Harness_OpenGate` **리터럴이 아니라 소문자 정규식**(`98[._]management\/harness_opengate`)이다. 넷 다 동결·확인 대상이라 실행에 영향은 없으나, **번호가 틀린 표는 다음 세션이 엉뚱한 줄을 고치게 만든다.**

⚠️ **fail-open 이 왜 최악인가**: `classifyHarnessPath` 는 정규식이 안 맞으면 `'unrelated'` 를 반환한다 — **로그도 에러도 없이 봉인이 사라진다.** 그래서 **병행 수용이 개명보다 항상 먼저**다(P03 → P05·P07).

#### ② 기계 소비자 — fail-visible (red 로 드러나지만 목록에 없으면 놓친다)

| 개명 대상 | 걸리는 곳 | 판정 |
|---|---|---|
| `00_Documents/00_Harness` | `conformance-check.mjs:37` — `const manifestRel = '00_Documents/00_Harness/core-manifest.json'` (**자기가 사는 폴더**) | **수정** |
| `00_Documents/00_Harness` | `99_Others/tests/harness-conformance.test.ts:27` — `SCRIPT` 경로 상수 | **수정** |
| `00_Documents/00_Harness` | `core-manifest.json` — 내부 경로 문자열 **1건** (⚠️ `00_Documents/01_Adr` 는 **0건** — 초안 추정과 다름) | **수정** |

> ⚠️ **G2 게이트 자체가 P05 의 개명 대상 폴더 안에 산다.** P05 이후 모든 Phase 의 게이트 실행 경로가 `00_Documents/00_Harness/conformance-check.mjs` 로 바뀐다.

#### ③ 봉인층 문서 — 창 없이는 못 고친다 (P07 에는 창이 없다)

| 파일·줄 | 참조 | 판정 |
|---|---|---|
| `.claude/agents/shared-ipc.md:16`·`:33` | `ipc-contract.ts` | **신·구 병기** |
| `.claude/agents/shared-ipc.md:17` | `agent-events.ts` | **신·구 병기** |
| `.claude/agents/agent-backend.md:21` | `agent-events.ts` | **신·구 병기** |
| `.claude/agents/main-process.md:31` | `ipc-contract.ts` | **신·구 병기** |
| `.claude/policies/grade-and-risk.md:60` | `agent-events*` ⚠️ **위험 깃발 도메인 정의표** | **신·구 병기** |
| `.claude/policies/grade-and-risk.md:61` | `ipc-contract*` 〃 | **신·구 병기** |
| `.claude/commands/refactor-sweep.md:97` | `ipc-contract` | **신·구 병기** |
| `.claude/commands/harness-review.md:69`·`:93` | **`00_Documents/03_Reviews/Harness`** ⚠️ 산출물을 쓰라고 **지시**하는 경로 | **수정** (병기 아님) |

⚠️ **`harness-review.md` 는 성격이 다르다.** 나머지 7줄은 *가리키는* 참조라 신·구 병기가 안전하지만, 이 둘은 *쓰라고 지시하는* 경로다. 병기하면 **개명된 `03_Reviews/` 옆에 옛 `03_Reviews/Harness/` 를 다시 만든다.** 지시 경로는 하나여야 한다.

> 📌 초안은 `harness-review.md` 를 ④축(Codex)에 넣었으나 **`.claude/commands/**` 는 Claude 봉인층**이라 ③축이 맞다.

#### ④ Codex 어댑터 — ⚠️ **Claude 는 검증할 수 없다** (CORE-12)

> 아래는 **Codex 교차 감사 보고를 옮긴 것**이며 Claude 는 `.codex/**` 를 읽을 수 없어 확인이 불가능하다. **확인 불가 영역은 확인 불가라고 쓴다.**
>
> ⭐⭐ **위험의 방향이 Claude 와 반대다.** 초안은 *"Claude 가 fail-open 이니 Codex 도 대칭이겠지"* 라고 추정했으나 **틀렸다** — Codex 의 `isHarnessPath()` 는 `00_Documents/{harness,adr}` 를 **아예 보지 않는다**(ADR-037 이 "Codex baseline 은 봉인 밖"으로 이미 명시). 즉 개명이 Codex 봉인을 푸는 일은 **일어나지 않는다.** 대신 다른 것들이 깨진다.

| 개명 대상 | 걸리는 곳 (Codex 보고) | 실패 방향 |
|---|---|---|
| `00_Documents/02_Reports` | `agentdeck-hook.mjs:81`·`:685` · `agentdeck-hook.test.mjs:60` | ⚠️ **fail-closed 과차단** — 신 `02_Reports` 가 검증 오류가 되어 완료 보고가 막힌다 |
| `00_Documents/00_Harness` | `harness-doctor.mjs:14`·`:18` — baseline 읽기 실패 시 `process.exit(1)` | ⚠️ **import 시 즉사** |
| 〃 (연쇄) | `harness-contract.test.mjs:9`·`:94` | 실행 전 종료 |
| `agent-events`·`ipc-contract` 스템 | `agentdeck-hook.mjs:439`·`:441` · `.test.mjs:329` | ⚠️ **fail-open 침묵사** — 미스 시 빈 `flags`, 경고 0 |
| CORE 포인터 | `.codex/README.md:3` · `AGENTS.md:4` | 끊어진 포인터 |
| `.codex/state/**`·`config.toml`·`hooks.json`·`rules/` | **영향 없음** (전수 검색 0건) | — |

🔴 **CRITICAL — 훅 digest**: Codex 훅은 본문 digest 가 `hooks.json` 인자와 다르면 **모든 훅이 아무 출력 없이 return** 한다(fail-open no-op, 테스트로도 고정됨). **훅을 고치고 digest 를 갱신하지 않으면 시크릿·파괴·비가역·하네스·TDD 차단이 전부 조용히 사라진다.** → P04 핸드오프 브리프의 **필수 항목**.

❄️ **Codex 문서층 봉인은 이번에 추가하지 않는다**(영호 결정 2026-07-26) — 평시엔 `config.toml` 의 기본 프로필 권한이 문서 쓰기를 막으므로 훅 봉인은 같은 문을 두 번 잠그는 것이다. **단 full-access 유지보수 세션에서는 문서층 방어가 0층**이며, 이는 개명이 만든 구멍이 아니라 **선재 구조**다 → [`00_Documents/BACKLOG.md`](../BACKLOG.md) **17번**.

---

### 5-4. 동결 목록도 이름으로

**무엇을 남기는지가 무엇을 바꾸는지만큼 명시적이어야 한다.**

| 동결 대상 | 근거 |
|---|---|
| 루트 파일 16개 · 폴더 12개 | [`ROOT_LAYOUT.md`](../ROOT_LAYOUT.md) 전수 근거 |
| `00_Documents/` 루트 `.md` 7개 | ADR-027 개정 1 — 무번호 확정 |
| `98_Management/Harness_OpenGate` | 규칙 적합 + 부트스트랩 자물쇠 회피 |
| `99_Others/{scripts,tests}` | 4개 설정 파일의 경로 리터럴 |
| `02_Source` `.tsx` 4개 | 훅·모음·진입점 — §1 계약에 이미 부합 |
| `02_Reports/` 6파일의 **파일명** | 보고서 계약 부합 + 채증(축3) |
| `01_Phases/**/Screenshot` 철자 | `core.ignorecase` 함정 + 채증 |

---

**파급**: ADR-027(문서 폴더 번호 접두)의 미이행 `docs/` 항목이 본 ADR의 폴더 계약으로 흡수된다(ADR-027 개정 2). ADR-028의 `02_Source` 명시 제외는 그대로 승계한다. `convention-size-guard` 에 명명 가드가 추가되고, 기존 훅 4종은 신·구 병행 수용으로 확장된다(NC P03). 루트 배치의 근거는 `00_Documents/ROOT_LAYOUT.md` 가 별도로 소유한다.

**위험도**: [H] — 봉인 영역(`.claude/hooks/**`) 변경 동반 + 경로 계약 전반에 걸침. CHANGELOG [H] 기록 동반.

**관련**: ADR-027(문서 폴더 번호 접두 — 개정 2로 범위 확정) · ADR-028(루트 재편 — `02_Source` 제외 승계) · ADR-013(AgentCodeGUI 위상 — 참고용 프로젝트로 재분류) · ADR-037(봉인 확장) · CORE-08(디렉토리 경계·ADR 선행) · CORE-11(하네스 사용자 단독 통제) · `01_Phases/22_NC-naming-placement/_milestone-plan.md`(적용 마일스톤).

**현황(2026-07-26)**: 채택(영호 — 명명 규칙 범위 "전 영역", `00_Documents` 하위 `NN_PascalCase`, 루트 `.md` 번호 없음, 파일명은 "폴더별 계약이 소유", 재발 방지는 "훅 정규식으로 기계 강제"). 적용 = NC 마일스톤.
