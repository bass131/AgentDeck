# NC 마일스톤 — Codex 세션 ② 핸드오프 (개명 *후* 검증 + 백로그 2건)

> **수신**: Codex 세션 (영호가 기동) · **발신**: Claude 세션 (NC P07, 2026-07-26)
> **성격**: 이 저장소 자신의 안전장치가 **개명 이후에도 살아 있는지** 확인하는 검증 작업이다. 산출물은 판정과 수리이며, 우회 방법이 아니다.
> **엔진 격리(CORE-12)**: Claude 는 `.codex/**` 를 **읽지 못한다.** 아래의 `.codex/…` 파일·줄 정보는 전부 **Codex 자신의 이전 보고**에서 온 것이며 Claude 가 검증한 것이 아니다. 실제 좌표는 Codex 가 직접 확인할 것.
> **선행 문서**: 세션 ① 브리프 = [`NC-codex-handoff.md`](NC-codex-handoff.md). 그때는 **개명 전**이었고 지금은 **개명 후**다 — 조건이 뒤집혔으니 §0 을 반드시 다시 읽을 것.

---

## 0. 🚦 기동 조건 게이트 — 하나라도 어긋나면 **아무것도 건드리지 말고 멈춘다**

착수 전에 **직접 확인**하고 결과를 receipt 에 그대로 적어라.

| # | 조건 | 확인 방법 | 기대 |
|---|---|---|---|
| 1 | 브랜치가 `chore/nc-naming-code` 인가 | `git branch --show-current` | 일치 |
| 2 | 폴더 개명이 **끝났는가** | `ls 00_Documents` | `00_Harness` `01_Adr` `02_Reports` `03_Reviews` `04_Artifacts` `05_Assets` |
| 3 | 코드 stem 개명이 **끝났는가** | `ls 02_Source/shared` | `ipcContract.ts` `agentEvents.ts` 존재, kebab 부재 |
| 4 | 유지보수 창이 **닫혀 있는가** | `ls 98_Management/Harness_OpenGate/gate-open.flag` | **부재** |
| 5 | 워킹트리에 **미커밋 개명분**이 있는가 | `git status --porcelain` | P07 분이 미커밋 상태 — **정상이다** |
| **6** | **이 세션이 어떤 권한 상태로 열렸는지 관측** | 세션 시작 출력 · `node .codex/harness-doctor.mjs` | **기대값 없음 — 관측해서 기록하는 항목이다** |

🔴 **조건 6 은 게이트가 아니라 관측 항목이다 — 다른 다섯과 성격이 다르다.**

> ⚠️ **개정 (2026-07-26, 실사용 실패 후)** — 초판은 이 항목의 기대값을 `agentdeck-assistant` 하나로 못박고 불일치를 FAIL 로 규정했다. **그게 결함이었다.** 세션을 어느 프로필로 여는지는 **영호가 기동 시점에 정하는 변수**인데 판정기가 그걸 상수로 가정했고, 유지보수 세션(`:danger-full-access`)으로 열자 정상 동작을 FAIL 로 판정해 **세션 전체를 세웠다.**
> 이것은 §2-4 가 지적하는 병(「돌지 못함」과 「의도대로 됨」이 같은 신호)을 **이 브리프 자신이 재생산한 것**이다. 판정할 수 없는 것에 판정기 모양을 붙이면 red 의 뜻이 정해지지 않는다.

**할 일** — 관측값을 그대로 적고, 아래 표로 **의미를 해석해서** receipt ⑥ 에 넣어라. **어느 경우에도 이 항목만으로 중단하지 않는다.**

| 관측 | 기동 방식 | 뜻 |
|---|---|---|
| 프로필명 `agentdeck-assistant` 등이 보임 | 옵션 없이 `codex` | ✅ 권한 계층 정상 — 백로그 18 은 **직전 세션의 오관측** |
| `permission_profile type="disabled"` + `file_system unrestricted` | **`-c default_permissions=":danger-full-access"`** | ⚠️ **판정 불가.** 「요청대로 전면 개방됨」과 「프로필 시스템이 죽어 sandbox 가 없음」이 **같은 출력**이다 |
| 프로필 초기화 **에러 메시지**(`default_permissions requires a [permissions] table` 등) | 무엇이든 | 🔴 백로그 18 확정 — 원문을 그대로 receipt 에 |

⭐ **판정 불가로 나오면 그렇게 쓰라.** *"확인 불가 영역은 확인 불가라고 쓴다"* 가 이 저장소의 규율이다. 억지로 PASS/FAIL 중 하나를 고르는 쪽이 훨씬 나쁘다.

📌 **백로그 18 의 진짜 판정은 「옵션 없이 연 세션」에서만 나온다** — root 기본이 먹는지를 보는 것이 그 안건의 질문이기 때문이다. 유지보수 세션에서는 원리적으로 답할 수 없으니, 그 사실을 receipt ⑥ 에 명시하고 넘어가라.

⚠️ **조건 5 를 오해하지 말 것.** P07 은 *이 검토를 받은 뒤에* 커밋한다(사람 게이트). 워킹트리가 더러운 것이 결함이 아니다. **커밋하지 마라** — 커밋 주체는 Claude 세션이다.

⚠️ **조건 2·3 이 어긋나면**(개명이 아직 안 됐거나 일부만 됐으면) 트리가 중간 상태라는 뜻이다. 세션 ① 브리프 §4 의 운영 제약 ② 가 그대로 적용된다 — **멈추고 보고**.

**무수정 중단 조건**: 아래 중 하나라도 발생하면 **아무것도 고치지 않고 보고 후 멈춘다.**
- 예상 밖의 파일·범위가 드러난다
- `harness-doctor` 판정이 착수 전과 달라진다
- digest 동기화가 절차대로 되지 않는다

---

## 1. 무엇이 바뀌었나 (엔진 중립 요약)

세션 ① 이후 **개명이 실제로 실행됐다.** 세션 ① 은 「훅이 신·구 이름을 모두 받아들이게 만드는」 선행 작업이었고, 지금은 그 위에서 이름이 바뀐 상태다.

**폴더 11건** (`00_Documents/` 하위)

| 구 | 신 |
|---|---|
| `harness` | `00_Harness` |
| `adr` | `01_Adr` |
| `reports` | `02_Reports` |
| `reports/{milestones,guides,manuals,next}` | `02_Reports/{00_Milestones,01_Guides,02_Manuals,03_Next}` |
| `reviews` | `03_Reviews/Harness` |
| `_Codex_Review` | `03_Reviews/Codex` |
| `Artifacts` | `04_Artifacts` |
| `assets` | `05_Assets` |

**코드 stem 13건** (`02_Source/`) — kebab → camelCase

`ipc-contract`→`ipcContract` · `agent-events`→`agentEvents` · `claude-stream`→`claudeStream` · `agent-runs`→`agentRuns` · `run-args`→`runArgs` · `engine-state`→`engineState` · `diff-types`→`diffTypes` · `engine-versions`→`engineVersions` · `backend-status`→`backendStatus` · `model-effort`→`modelEffort` · `orchestration-meta`→`orchestrationMeta` · `engine-check-update`→`engineCheckUpdate` · `merge-slash-commands`→`mergeSlashCommands`

**파생 테스트 10건**도 소스 stem 을 따라 개명됐다(`99_Others/tests/**`).

❄️ **바뀌지 않은 것**: `98_Management/Harness_OpenGate` · `99_Others/{scripts,tests}` 폴더명 · 루트 설정 파일 16개 · `00_Documents/` 루트 `.md` · `.tsx` 4개(`icons`·`resizableModal`·`zoom`·`main`) · `01_Phases/**/Screenshot` 철자.

---

## 2. 해야 할 일 — 네 갈래

### 2-1. 🔴 개명 후 Codex 어댑터 실측 (최우선)

세션 ① 에서 Codex 훅·doctor 가 신 이름을 받아들이도록 고쳤다고 보고받았다. **그것이 개명 *전* 상태에서의 계약 테스트였다면, 지금이 처음으로 실제 조건에서 도는 것이다.**

- [ ] `harness-doctor` 실행 — **baseline 이 신 경로(`00_Documents/00_Harness/…`)에서 읽히는가.** 세션 ① 보고에 따르면 실패 시 `process.exit(1)` 로 즉사하는 구조였다
- [ ] Codex 계약 테스트 실행 — 전량 통과 여부
- [ ] ⭐ **신 경로 live canary** — 계약 테스트 green 은 훅이 *활성*이라는 증거가 아니다. 실제 도구 호출로 발화를 확인하고 **로그 원문**을 붙여라
- [ ] ⭐ **음성 확인도 함께** — 봉인 밖 경로가 **통과**하는지. 양성만 보면 과봉인을 못 잡는다
- [ ] 스템 리터럴(`agentEvents`·`ipcContract`) 이 실제로 깃발을 붙이는지 — 세션 ① 보고상 미스 시 **빈 flags 반환 + 경고 0 = fail-open 침묵사**였다

> 📌 참고로 Claude 쪽에서는 같은 검증을 이렇게 했다. `risk-detector` 가 신 이름에 실제로 발화하는지를 **guard 로그**로 판정했고, 화면에는 다른 훅 하나만 떴는데 로그에는 둘 다 7밀리초 차로 기록돼 있었다. **판정은 출력이 아니라 로그로 한다.**

### 2-2. 🔴 `agentdeck-review` 교차 감사 (P07 커밋 전 게이트)

`.agents/skills/agentdeck-review` 로 **미커밋 변경**을 검토해달라. 특히:

1. **CORE-04(IPC 계약 단일 정의)** — `ipcContract.ts`·`agentEvents.ts` 는 이 조항의 심장이다. 개명으로 채널명·타입의 단일 정의가 깨지지 않았는가
2. **로직 변경 0 인가** — 일괄 치환이 이름·경로 외의 토큰을 건드리지 않았는가
3. **놓친 참조** — 특히 **문자열로 조각난 경로**(`path.join('02_Source','shared','ipc-contract')` 형태). P05 에서 실제로 이 형태를 놓친 전례가 있다
4. **치환 범위 판단** — Claude 는 *경로를 뜻하는 형태만* 바꾸고 *개념을 뜻하는 문자열*(로그 태그 `[engine-versions]`, 에러 문구, 테스트 라벨)은 남겼다. 남긴 것 중 실제로는 파일을 가리키는 것이 있는가

### 2-3. 🔴 백로그 18 — codex 프로필 3종 초기화 실패

`agentdeck-assistant` 세션 실측에서 `agentdeck-assistant`·`agentdeck-rescue`·`agentdeck-readonly` 전부 **`default_permissions requires a [permissions] table`** 로 sandbox 초기화에 실패했다(`--include-managed-config` 를 붙여도 재현). codex-cli **0.145.0** 의 config 스키마 변경으로 보인다.

⚠️ **직전 Codex 세션 receipt 와 판정이 모순된다** — 그때는 `profiles 3/3`·`WRITE-BOUNDARY 5/5` 였는데 그 세션에서는 `0/3`·`3/5` 였다. 관측된 유일한 변수는 **세션 프로필**이다. **Claude 는 CORE-12 로 어느 쪽이 참인지 판정할 수 없어 모순 상태 그대로 기록해 뒀다.**

- [ ] ⭐ **§0 조건 6 의 관측이 첫 증거다** — 이 세션 자신의 프로필이 먹었는지가 별도 재현 실험보다 강한 데이터다
- [ ] 어느 판정이 참인지 **실행 출력으로** 가른다
- [ ] 실패가 참이면 **권한 계층(1층)이 빠진 상태**다. 훅(2층)은 살아 있는 것으로 관측됐다 — 다층 방어에서 한 층이 통째로 없는 것이므로 우선순위가 높다
- [ ] 스키마 변경이 원인이면 `config.toml` 을 현행 스키마로 맞춘다

### 2-4. 🔴 백로그 19 — `harness-doctor --live` 가 판정기로서 신뢰할 수 없다 (두 겹)

- **ⓐ `LIVE: PENDING` 이 판정이 아니라 무조건 출력되는 상수 문자열이다.** 재신뢰 여부를 읽지 않으므로 **정보량이 0** 인데, 같은 출력의 다른 줄(`STATIC: PASS`·`HOOK-GUARD: PASS`)과 동일한 `축: 값` 형식이라 판정처럼 보인다. **실제로 Claude 세션이 이것을 「재신뢰 대기 상태」라는 상태 정보로 오독했다.**
- **ⓑ `OS-READ-BOUNDARY` 가 실패 원인을 구분하지 못한다.** sandbox 가 설정 오류로 `exit 1` 한 것을 *"읽기가 차단됨"* 으로 분류해 `REVALIDATION_REQUIRED` 를 냈다. **「돌지 못함」과 「차단됨」이 같은 신호**로 들어오므로 red 가 무엇을 뜻하는지 알 수 없다.

> ⚠️ 이 결함은 남 얘기가 아니다 — **Claude 도 이번 P07 에서 같은 병을 재생산했다.** 훅 발화를 확인하려고 만든 프로브가 「훅 미발화」와 「도구가 훅에 도달조차 못함」을 구분하지 못해 판정 불가였다. 판정기를 고칠 때 **"이 red 는 무엇을 뜻하는가"** 를 한 번 더 물어라.

- [ ] ⓐ — 판정할 수 없는 것에 판정기 모양을 붙이지 않는다. 실제로 읽어서 값을 내거나, **`LIVE: N/A(사유)`** 처럼 판정이 아님을 표기하거나 둘 중 하나
- [ ] ⓑ — 「실행 실패」와 「정책 차단」을 **다른 값**으로 분리

---

## 3. 🔴 CRITICAL — 훅 digest 동기화 (세션 ① 과 동일)

**훅 본문의 digest 가 `hooks.json` 인자와 다르면 모든 Codex 훅이 아무 출력 없이 return 한다**(fail-open no-op). 즉 **경로는 고쳤는데 훅 자체가 안 도는** 반쪽 수정이 되고, 그 상태에서 **시크릿·파괴·비가역·하네스·TDD 차단이 전부 조용히 사라진다.**

- [ ] 훅 본문을 고쳤다면 `hooks.json` 의 command / commandWindows digest 를 **전부 동기화**
- [ ] 동기화 후 **일치를 출력으로 확인**하고 receipt 에 원문 첨부
- [ ] ⚠️ **`/hooks` 재신뢰는 영호가 실행한다**(trusted 새 세션). 파일 갱신은 Codex, 재신뢰는 사람 — 이 분리를 지킬 것
- [ ] 재신뢰 후 **live canary** 로 실제 발화 확인 — **계약 테스트 green ≠ 훅 활성**

---

## 4. 운영 제약

**① 커밋하지 마라.** P07 의 미커밋 변경은 이 검토를 받은 뒤 Claude 세션이 커밋한다. Codex 가 `.codex/**` 를 고쳤다면 **그 변경만** 별도 커밋하고, `02_Source`·`00_Documents`·`01_Phases` 는 건드리지 않는다.

**② `push`·PR·merge 절대 금지** — CORE-06 v2. 비가역은 영호가 직접 실행한다.

**③ Codex 는 `.claude/hooks/**`·`.claude/state/**` 를 읽지 않는다** — CORE-12 격리의 **대칭**이다. 필요한 정보는 이 문서(엔진 중립)에 담았다. 부족하면 추측하지 말고 **물어라**.

**④ `.claude/` 봉인층 문서 8줄이 아직 구 stem 을 가리키는 것은 이미 알고 있다**(`00_Documents/BACKLOG.md` 20번, 유지보수 창 대기). **중복 보고 불필요.**

**⑤ `.codex/**` 수리 여부는 이 세션의 기동 방식에 달렸다 — 조건 6 의 관측으로 스스로 판단하라.**

| 이 세션이 | §2-3·§2-4 범위 |
|---|---|
| **읽기 전용**(`agentdeck-assistant` 등) | **진단서까지.** 쓰기를 우회 시도하지 말고, *「무엇이 왜 고장 났고 어떻게 고쳐야 하는가」* 를 남겨라 — 그것이 다음 세션의 입력이 된다 |
| **하네스 유지보수 세션**(`AGENTDECK_HARNESS_MAINTENANCE=1` + full-access) | **수리까지 가능.** 단 **진단을 먼저 보고하고 착수**하라 — 무엇을 고칠지 영호가 보고 판단할 수 있게 |

⚠️ **어느 쪽이든 `.codex/**` 밖은 건드리지 않는다**(제약 ①). `02_Source`·`00_Documents`·`01_Phases` 는 Claude 세션 소관이다.

> 📌 **원래 이 안건을 두 세션으로 나눈 이유** — 백로그 18 이 참이면 *"프로필 지정 자체가 고장"* 이라, 수리 세션을 여는 명령(`-c default_permissions=…`)도 같은 이유로 실패할 수 있다. **고치려면 권한이 필요한데 권한 지정이 고장 난 것이 문제**인 순환이다. 유지보수 세션으로 열려 있다면 그 순환은 이미 우회된 상태이니, 나누지 말고 한 세션에서 끝내라.

---

## 5. Receipt — 두 세션에 나뉜다 (영호 결정, 2026-07-26)

⚠️ **자기보고는 증거가 아니다.** *"전부 통과"* 라고 적어도 Claude 는 그 실행을 확인할 수 없다. **출력 원문**을 붙여라.

| # | 항목 | **A: 일반 세션**<br>(옵션 없이 `codex`) | **B: 유지보수 세션**<br>(`AGENTDECK_HARNESS_MAINTENANCE=1` + full-access) |
|---|---|---|---|
| ① | 기동 조건 게이트 6항목 | ✅ | ✅ (재확인) |
| ② | `harness-doctor` 출력 원문 (개명 후 baseline 로드 성공 여부) | ✅ | ✅ |
| ③ | Codex 계약·훅 테스트 출력 원문 | ✅ | — |
| ④ | 신 경로 live canary **양성**(봉인 경로가 차단됨) | ⚠️ 아래 주의 | ✅ |
| ④ | 신 경로 live canary **음성**(봉인 밖은 통과함) | ❌ **원리적으로 불가** | ✅ **여기서만** |
| ⑤ | `agentdeck-review` finding | ⭐ **A 에서** — 읽기 전용 감사라 A 가 제 조건이다 | — |
| ⑥ | 백로그 18 판정 | ⭐ **A 에서만 가능** | ❌ 원리적으로 불가 |
| ⑦ | 백로그 19 수리 | ❌ 쓰기 권한 없음 — **진단까지** | ⭐ **B 에서** |

**🔴 A 세션이 P07 커밋 게이트다** — ⑤(`agentdeck-review`)와 ④ 양성이 커밋을 막는 항목이고, ⑥·⑦은 백로그 안건이라 커밋을 막지 않는다. A 가 끝나면 P07 은 커밋 가능하다.

### ⚠️ 왜 음성 확인이 A 에서 불가능한가 — 판정기 설계의 문제다

음성 확인은 *"봉인 **밖** 경로에 쓰면 **통과**한다"* 를 보이는 것이다. 그런데 **읽기 전용 세션에서는 그 쓰기가 sandbox 에 먼저 막힌다.** 그러면 관측되는 것은 「실패」 하나뿐이고, 그것이

- 훅이 과봉인해서 막았는지
- sandbox 가 읽기 전용이라 막았는지

를 **구분할 수 없다.** 원인이 다른 두 실패가 같은 신호로 들어온다 — §2-4 가 지적하는 바로 그 병이다. **B 에서 하라.**

📌 ④ **양성**은 A 에서도 시도해 볼 값어치가 있다. 훅이 sandbox 보다 먼저 발화하면 **훅 메시지**가 나오므로 판정이 선다. 훅 메시지 없이 권한 에러만 나오면 **판정 불가로 기록하고 B 로 넘겨라** — 억지로 PASS/FAIL 을 고르지 않는다.

📌 변경을 했다면 **커밋 해시**도 함께. 안 했으면 "변경 0건"이라고 명시.

---

## 6. ✅ A 세션 완료 (2026-07-27) — B 세션은 여기서 이어받는다

A 세션(옵션 없이 `codex`)이 **파일 변경 0건**으로 receipt ①②③⑤⑥ 을 회수했다. 그 결과 **B 세션의 범위가 좁아졌다.**

| # | A 결과 | B 가 할 일 |
|---|---|---|
| ⑥ | ✅ **백로그 18 = 오탐 확정.** A 는 `type="managed"` + read-only/tmpdir, B 는 `type="disabled"` + unrestricted — **같은 메커니즘이 두 입력에 각각 요청대로** 반응했다. 실제 권한 계층은 살아 있다 | — (종결) |
| ⑦ | ✅ 백로그 19 **ⓐⓑ 확정 + ⓒ 신규**(`codex sandbox -P` 프록시가 config 해석과 비호환) + **수리 설계 회수** | 🔴 **수리 실행.** 설계는 `BACKLOG.md` 19번에 그대로 박혀 있다 |
| ④ | ⚠️ 양성 **판정 불가** — Codex 훅이 `00_Documents/00_Harness` 를 봉인 집합에 넣지 않아 훅 과봉인과 sandbox 차단을 분리할 수 없었다(`.codex/config.toml` 양성은 PASS) | 🔴 **음성 + 신 문서 경로 양성** — sandbox 가 없는 B 에서만 훅 단독 판정이 선다 |
| — | ✅ 계약 테스트 3건 중 **2건이 이미 제거된 구 경로** `00_Documents/harness/CORE.md` 를 여전히 단언해 실패 · `.codex/README.md` 도 구 경로를 *"현재"* 로 서술 | 🔴 **둘 다 신 경로로**(세션 ①의 병행 수용이 테스트까지 닿지 않았다) |
| — | — | ⚠️ **판단 요청** — `BACKLOG.md` **22번**: Codex 훅이 `00_Documents/00_Harness` 를 막지 않는 것이 *"같은 문을 두 번 잠그지 않는다"* 설계대로인가, 아니면 유지보수 세션 구간의 구멍인가. **영호와 상의해 결정**하고 결과를 receipt 에 |

### 🔴 A 가 찾아낸 것 중 Claude 쪽에서 이미 처리한 것 (중복 보고 불필요)

`agentdeck-review` 의 🔴 1건(`engineVersions.test.ts` 가 실제 사용자 홈을 덮던 결함)과 🟡 3건은 **전부 봉합됐고 게이트도 재실행됐다**(`395 passed | 6 skipped (401)` · `5336 passed | 10 skipped (5346)` · 파괴 카나리아 무변). 다시 보고할 필요 없다.

⚠️ **PowerShell 기동 주의** — `VAR=1 cmd` 는 bash 문법이라 PowerShell 에서 실패한다. `$env:AGENTDECK_HARNESS_MAINTENANCE="1"` 로 설정하되, 이 값은 **창에 눌러앉고 자동 만료가 없다**(OpenGate 의 TTL 7h 같은 장치가 없다). 끝나면 `Remove-Item Env:\AGENTDECK_HARNESS_MAINTENANCE` 하거나 **그 창을 닫아라**.
