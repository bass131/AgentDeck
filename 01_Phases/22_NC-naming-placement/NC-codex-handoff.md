# NC 마일스톤 — Codex 어댑터 대칭 핸드오프

> **수신**: Codex 세션 (영호가 기동) · **발신**: Claude 세션 (NC P04, 2026-07-26)
> **성격**: 이 저장소 자신의 안전장치를 **개명 사고로부터 지키는** 방어 작업이다. 산출물은 우회를 *막는* 규칙이며, 우회 방법이 아니다.
> **엔진 격리(CORE-12)**: Claude 는 `.codex/**` 를 **읽지 못한다.** 아래 파일·줄 정보는 **Codex 자신의 교차 감사 보고**에서 온 것이며 Claude 가 검증한 것이 아니다. 실제 좌표는 Codex 가 직접 확인할 것.

---

## 0. 🚦 기동 조건 게이트 — 하나라도 어긋나면 **아무것도 건드리지 말고 멈춘다**

착수 전에 아래를 **직접 확인**하고, 결과를 receipt 에 그대로 적어라.

| # | 조건 | 확인 방법 |
|---|---|---|
| 1 | 브랜치가 `chore/nc-naming-docs` 인가 | `git branch --show-current` |
| 2 | HEAD 가 **NC P03 커밋(`b58d593`) 이후**인가 | `git log --oneline -5` |
| 3 | 폴더 개명이 **아직 일어나지 않았는가** — `00_Documents/harness`·`adr`·`reports` 가 **구 이름 그대로** 존재 | `ls 00_Documents` |
| 4 | 유지보수 창이 **닫혀 있는가** — `98_Management/Harness_OpenGate/gate-open.flag` **부재** | `ls` |

⚠️ **조건 3이 핵심이다.** 이 작업은 **개명 *전*에** Codex 훅이 신·구 이름을 모두 인식하게 만드는 것이다. 이미 개명이 일어난 뒤라면 순서가 뒤집힌 것이고, 그 상태에서 손대면 어디까지가 원래 상태였는지 알 수 없게 된다 → **멈추고 보고**.

**무수정 중단 조건**: 아래 셋 중 하나라도 발생하면 **아무것도 고치지 않고 보고 후 멈춘다.**
- 예상 밖의 파일·범위가 드러난다(§2 표에 없는 소비처 발견)
- `harness-doctor` 의 baseline 판정이 착수 전과 달라진다
- digest 동기화가 §3 절차대로 되지 않는다

---

## 1. 배경 — 무엇이 왜 위험한가

AgentDeck 은 명명 규범을 정본화하고(**ADR-039**, 2026-07-26 채택) 그에 따라 폴더·파일을 개명하는 중이다. 개명 자체는 **아직 하지 않았다** — 먼저 **양쪽 엔진의 훅이 신·구 이름을 모두 인식하게** 만드는 것이 이번 마일스톤의 핵심 순서다.

**Claude 쪽은 완료됐다**(P03, 커밋 `b58d593`): 봉인 판정 정규식과 셸 우회 후보 추출기를 `(?:\d{2}_)?` 로 확장하고, 골든 픽스처 6건으로 고정했다(훅 셀프테스트 113 → 119). 창을 닫고 실측한 프로브도 green 이다(§5).

**⭐ Codex 쪽은 위험의 방향이 Claude 와 다르다.** Claude 의 `classifyHarnessPath` 는 정규식 미스 시 `'unrelated'` 를 반환하는 **fail-open**(개명이 봉인을 조용히 푼다)이지만, Codex 의 `isHarnessPath()` 는 `00_Documents/{harness,adr}` 를 **애초에 보지 않는다**(ADR-037 이 "Codex baseline 은 봉인 밖"으로 명시). 따라서 **개명이 Codex 봉인을 푸는 일은 일어나지 않는다.** 대신 다른 것들이 깨진다 — 아래 표의 「실패 방향」 열이 그것이다.

---

## 2. 수리 대상 — 엔진 중립 개명 매니페스트

### 2-1. 개명될 이름 (현재명 → 신명)

**폴더**

| 현재명 | 신명 |
|---|---|
| `00_Documents/harness` | `00_Documents/00_Harness` |
| `00_Documents/adr` | `00_Documents/01_Adr` |
| `00_Documents/reports` | `00_Documents/02_Reports` |
| `00_Documents/reports/milestones` | `00_Documents/02_Reports/00_Milestones` |
| `00_Documents/reports/guides` | `00_Documents/02_Reports/01_Guides` |
| `00_Documents/reports/manuals` | `00_Documents/02_Reports/02_Manuals` |
| `00_Documents/reports/next` | `00_Documents/02_Reports/03_Next` |
| `00_Documents/reviews` | `00_Documents/03_Reviews/Harness` |
| `00_Documents/_Codex_Review` | `00_Documents/03_Reviews/Codex` |
| `00_Documents/Artifacts` | `00_Documents/04_Artifacts` |
| `00_Documents/assets` | `00_Documents/05_Assets` |

**파일 스템** (`02_Source/` 내 kebab → camelCase, 13건 중 훅이 아는 2건이 중요)

| 현재명 | 신명 |
|---|---|
| `02_Source/shared/ipc-contract.ts` | `ipcContract.ts` |
| `02_Source/shared/agent-events.ts` | `agentEvents.ts` |

> 나머지 11건: `agent-runs`·`engine-check-update`·`claude-stream`·`orchestration-meta`·`run-args`·`merge-slash-commands`·`backend-status`·`engine-state`·`engine-versions`·`diff-types`·`model-effort` → 각각 camelCase. 훅 리터럴에 걸린 것은 위 2건뿐으로 보고받았으나 **전수는 Codex 가 직접 확인**할 것.

❄️ **개명되지 않는 것** (건드리지 말 것): `98_Management/Harness_OpenGate` · `99_Others/{scripts,tests}` · 루트 설정 파일 16개 · `00_Documents/` 루트 `.md` 8개 · `.tsx` 4개(`icons`·`resizableModal`·`zoom`·`main`) · `01_Phases/**/Screenshot` 철자.

### 2-2. Codex 쪽에서 깨지는 곳 (Codex 자기 보고 — Claude 미검증)

| 개명 대상 | 걸리는 곳 | 실패 방향 |
|---|---|---|
| `00_Documents/reports` | `agentdeck-hook.mjs:81`·`:685` · `agentdeck-hook.test.mjs:60` | ⚠️ **fail-closed 과차단** — 신 `02_Reports` 가 검증 오류가 되어 PostToolUse 가 완료 보고를 막는다 |
| `00_Documents/harness` | `harness-doctor.mjs:14`·`:18` — baseline 읽기 실패 시 `process.exit(1)` | ⚠️ **import 시 즉사** |
| 〃 (연쇄) | `harness-contract.test.mjs:9`·`:94` — doctor 를 import + 옛 CORE 경로 단언 | 실행 전 종료 |
| `agent-events`·`ipc-contract` 스템 | `agentdeck-hook.mjs:439`·`:441` · `.test.mjs:329` | ⚠️ **fail-open 침묵사** — 미스 시 빈 `flags` 반환, 경고 0 |
| CORE 포인터 | `.codex/README.md:3` · `AGENTS.md:4` | 끊어진 포인터 |
| `.codex/state/**` · `config.toml` · `hooks.json` · `rules/` | **영향 없음**(전수 검색 0건) | — |

### 2-3. 권장 패턴 — 번호를 하드코딩하지 말 것

Claude 쪽은 `(?:\d{2}_)?` **선택 그룹**을 썼다. 특정 번호(`00_`·`01_`)를 나열하지 않은 이유는 **번호가 「읽는 순서」라서 문서가 하나 끼어들면 재정렬되기 때문**이다 — 하드코딩하면 재정렬마다 봉인이 조용히 풀린다.

⭐ 이 판단은 실측으로 값어치가 증명됐다: 권한 deny 목록(나열식)에는 `02_Harness` 가 없지만, 훅 정규식은 그것도 잡아서 차단했다(§5 프로브 ⑥). **나열은 재정렬을 못 따라가고 정규식은 따라간다.**

Codex 쪽도 같은 형태를 권한다. **봉인 방향(차단 집합을 넓히는 쪽)은 존재하지 않는 번호가 매치돼도 무해**하므로 넓게 잡는 것이 공짜다. 반대로 **수용 방향(통과 집합을 넓히는 쪽)은 구멍**이므로 넓히지 말 것.

---

## 3. 🔴 CRITICAL — 훅 digest 동기화

**훅 본문의 digest 가 `hooks.json` 인자와 다르면 모든 Codex 훅이 아무 출력 없이 return 한다**(fail-open no-op, 테스트로도 고정돼 있다). 즉 **경로는 고쳤는데 훅 자체가 안 도는** 반쪽 수정이 되고, 그 상태에서 **시크릿·파괴·비가역·하네스·TDD 차단이 전부 조용히 사라진다.**

- [ ] `hooks.json` 의 **command / commandWindows 8개 필드 digest 를 전부 동기화**
- [ ] 동기화 후 **digest 일치를 출력으로 확인**하고 receipt 에 원문 첨부
- [ ] ⚠️ **`/hooks` 재신뢰는 영호가 실행**한다(trusted 새 세션). 파일 갱신은 Codex, 재신뢰는 사람 — 이 분리를 지킬 것
- [ ] 재신뢰 후 **신 이름 live canary** 로 실제 발화 확인 — **계약 테스트 green ≠ 훅 활성**이다

> HR2 에서도 브리프가 이 항목을 빠뜨릴 뻔했고, Codex 가 스스로 발견해 8곳을 갱신했다. 그때 안 했으면 "경로는 고쳤는데 훅이 안 도는" 상태였다.

---

## 4. 운영 제약 3항목

**① Codex receipt 회수 전에는 P05·P07(개명 실행)을 개시하지 않는다.** — hard gate. 이 문서의 §6 여섯 항목이 전부 도착해야 개명이 시작된다.

**② P05 의 부분 이동 구간에는 Codex 세션을 돌리지 않는다.** — 트리가 중간 상태(일부는 개명, 일부는 구 이름)일 때 감사를 돌리면 그 결과가 무엇을 뜻하는지 알 수 없다. Codex 세션은 **개명 전(지금)** 또는 **개명 완료 후**에만.

**③ Codex 는 `.claude/hooks/**`·`.claude/state/**` 를 읽지 않는다.** — CORE-12 격리의 **대칭**이다. Claude 가 `.codex/**` 를 못 읽는 것과 같은 이유로, Codex 도 Claude 런타임을 읽지 않는다. 필요한 정보는 **이 문서(엔진 중립 매니페스트)** 에 전부 담았다. 부족하면 추측하지 말고 **물어라**.

---

## 5. Claude 쪽 실측 결과 (참고 — 같은 성질의 확인을 Codex 쪽에서도 해달라)

창 폐쇄 후 프로브 6종, 전부 기대대로. 판정은 **출력이 아니라 로그**(`.claude/state/guard-blocks.log`)로 했다 — *"차단됐다"* 는 화면에 보이지만 *"차단 안 됐다"* 는 아무것도 안 보이는 것과 구별되지 않기 때문이다.

| # | 벡터 | 경로 | 기대 | 결과 |
|---|---|---|---|---|
| ① | Bash `>` | `00_Documents/harness/` (구) | 차단 | ✅ block |
| ② | Bash `>` | `00_Documents/00_Harness/` (신) | 차단 | ✅ block |
| ③ | Bash `>` | `00_Documents/` (봉인 밖) | **통과** | ✅ 통과 — 과봉인 아님 |
| ④ | Write 도구 | `00_Documents/00_Harness/` | 차단 | ✅ permission deny |
| ⑤ | Write 도구 | `00_Documents/harness/` | 차단 | ✅ permission deny |
| ⑥ | Write 도구 | `00_Documents/02_Harness/` (재정렬 가정) | 차단 | ✅ **훅 단독 차단** — 권한 목록엔 없는 번호 |

부작용 0(생성된 파일·폴더 없음). 프로브는 **존재하지 않는 canary 경로**로 했다 — red 여도 정본이 다치지 않는다.

> ⭐ 이 방식이 성립하는 이유: 봉인 판정이 **파일 존재와 무관한 순수 문자열 분류**라, 개명 *전*에 아직 없는 신 경로로 프로브해도 개명 *후* 동작과 논리적으로 등가다.

---

## 6. Receipt — 이 여섯 개가 전부 도착해야 P05 가 시작된다

⚠️ **자기보고는 증거가 아니다.** *"36/36 통과"* 라고 적어도 Claude 는 그 실행을 확인할 수 없다. **출력 원문**을 붙여라.

- [ ] **①** 변경 파일 목록 또는 diff 식별자 (커밋 해시 우선)
- [ ] **②** hook / contract 테스트 **출력 원문** (요약 말고 그대로)
- [ ] **③** `harness-doctor` 출력
- [ ] **④** **digest 동기화 확인** 출력 + `/hooks` 재신뢰 결과 (재신뢰는 영호 실행 — 그 사실도 적을 것)
- [ ] **⑤** **신·구 canary 로그** — 양성(차단됨)과 **음성(봉인 밖은 통과함)** 양쪽. 음성이 없으면 과봉인 여부를 알 수 없다
- [ ] **⑥** **`harness-review` 스킬 교차 감사** 결과 — Claude 정본(`00_Documents/harness/CORE.md`·`core-manifest.json`) ↔ Codex 어댑터 대조. finding 은 **심각도 · 증거 파일 · Claude 영향 · Codex 영향 · 권고** 순으로

### `harness-review` 에서 특히 봐줬으면 하는 것

1. **CORE.md 의 어댑터 서술이 실제와 맞는가** — NC P01 에서 CORE-06 v2 의 *"Codex 는 아직 v1"* stale 서술을 정정했다(근거: `HR2-DONE.md:151`). 그 정정이 실제 Codex 상태와 맞는지 확인해달라.
2. **conformance 게이트의 맹점** — `conformance-check.mjs` 는 조항 `v` 와 `CORE.md` 헤더, `impl` 경로의 파일 실재만 보고 **어댑터별 준수는 보지 않는다.** 어느 어댑터가 뒤처져도 게이트는 조용히 green 이다(백로그 15, `HR2-DONE.md:157`). 이 맹점을 메울 실행 가능한 설계가 있는지 의견을 달라 — 크로스엔진 실행은 CORE-12 가 막으므로 ① 선언 기반(매니페스트에 `conformedVersion`) ② 각 엔진이 자기 doctor 결과를 파일로 남기고 conformance 가 신선도만 검사, 두 방향이 후보다.
3. **ADR-039 자체에 대한 외부 시각** — 명명 규범이 Codex 어댑터에 만드는 마찰이 있는가.

---

## 7. 검증 비대칭 — Claude 가 확인할 수 없는 영역 (정직 선언)

**CORE-12 격리의 대가**이며, 숨기지 않고 기록하는 것이 유일한 정직한 처리다.

- `.codex/**` 의 **모든 파일** — 읽기조차 금지다. §2-2 의 파일·줄 좌표는 전부 Codex 보고를 옮긴 것이고 Claude 는 그 존재조차 확인하지 못했다.
- Codex 훅의 **digest 일치 여부** — 확인 불가. receipt ④가 유일한 증거다.
- Codex 계약 테스트의 **실제 실행** — 그 파일을 실행하는 것 자체가 CORE-12 위반이다. 출력 원문을 받는 것이 최선이다.
- `/hooks` **재신뢰 결과** — 영호의 세션에서만 관측된다.

> Claude 가 확인할 수 있었던 것은 전부 확인했다: 창 폐쇄 실측, 재봉인 deny 22줄, 프로브 6종, 골든 픽스처 119/119. 그 경계 밖은 위 목록이 전부다.

---

**관련**: `00_Documents/adr/ADR-039-naming-convention.md`(명명 규범 정본 — §5 매니페스트·역산 표) · `01_Phases/22_NC-naming-placement/_milestone-plan.md`(마일스톤 정본) · `04-seal-probe-codex-brief.md`(이 Phase 정의) · ADR-037(봉인 확장 — Codex baseline 이 봉인 밖이라는 근거) · CORE-12(엔진 격리).
