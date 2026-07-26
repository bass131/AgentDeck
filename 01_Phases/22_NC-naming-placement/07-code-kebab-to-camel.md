---
owner: 영호
milestone: NC
phase: 07
title: 코드 kebab 13개 → camelCase
status: done
grade: 대규모
risk: trust-boundary
loop_track: human-gate
estimated: 4~6h
domain: shared-ipc
summary: 02_Source에서 다수파 관례를 이탈한 kebab 파일 13개를 camelCase로 회수한다 — 그중 둘은 IPC 계약의 심장이라 참조가 345파일에 걸쳐 있다.
---

# Phase 07: 코드 kebab 13개 → camelCase

> **상태**: ✅ **done** (2026-07-27) — 게이트 전량 green · `reviewer`(Fable 5) **1차·2차 통과** · Codex 세션 A 교차 감사 회수 · 🔴 1건 + 🟡 20줄 봉합 완료
> **마일스톤**: NC
> **등급**: 대규모 (risk: **trust-boundary** — CORE-04 IPC 계약 파일 포함)
> **담당**: `shared-ipc` + `main-process` + `agent-backend` / `reviewer`(Fable 5) 필수 / **브랜치 `chore/nc-naming-code` · PR ②**

---

## 🎯 목표

이 Phase가 끝나면 `02_Source` 의 `.ts` 파일명이 **단일 관례(camelCase)** 로 통일된다. 이것은 새 규칙 도입이 아니라 **다수파 승인 + 이탈자 13개 회수**다.

---

## ⏪ 사전 조건

- [ ] **Phase 03 완료** — `risk-detector.sh:26·:30` 이 `agent-events`·`ipc-contract` 를 **신·구 양쪽으로 인식**해야 한다. 이 Phase에는 창이 없어 훅을 고칠 수 없다
- [ ] **Phase 06 완료** — 봉인층 문서 8줄이 신·구 병기돼 있어야 한다. 이 Phase에는 창이 없어 `.claude/agents|policies|commands/**` 를 고칠 수 없다
- [ ] ⭐ **창 2 폐쇄 후 재봉인 실측 (V1·V2)** — 이 마일스톤의 전제(*"창 안의 green은 방어에 대해 아무것도 말하지 않는다"*)를 **창 2에도 적용**한다. 초안은 창 1에만 적용해 비대칭이었다:
  - `gate-open.flag` **부재**
  - `.claude/settings.json` ≡ `settings.SEALED.json`
  - **개명된 신 경로 1곳에서 canary 발화 프로브 green**
  - ⚠️ 근거: TTL 만료는 **훅 층만** 복귀시키고 permission deny는 열린 채로 둘 수 있다(`supervisor-guard.sh:64-68` HR2 실측). 이걸 확인하지 않으면 **마일스톤이 봉인 열린 채 종결**된다
- [x] 브랜치 `chore/nc-naming-code` — ⚠️ **계획과 달라졌다.** 초안은 *"PR ① 머지 후 master 에서 딴다"* 였으나 실제로는 **`chore/nc-naming-docs` 위에 스택**했다.
  - **왜 바꿨나** — P03 의 훅 병행 수용(신·구 양쪽 인식)이 **docs 브랜치에만** 있다. master 에서 따면 개명한 신 stem 을 `risk-detector` 가 인식하지 못해 **fail-open 으로 조용히 놓친다**. 즉 P06→P07 간선은 초안이 판정한 *"운영 의존"* 이 아니라 **실제 데이터 의존**이었다
  - **대가** — PR ② 가 PR ① 위에 쌓이므로 머지 순서가 강제된다(① 먼저). 그 대신 개명 구간 내내 훅이 살아 있다
- [ ] ⭐ **Codex 세션 ①에서 스템 병행 수용이 끝났는지 확인** — `agentdeck-hook.mjs:439`·`:441` 이 `agent-events`·`ipc-contract` 문자열에 **직접 의존**하고, 미스하면 **빈 `flags` 를 반환해 경고가 아예 생성되지 않는다**(fail-open 침묵사). 고치지 않으면 `ipcContract.ts` 의 `shared-contract` 와 `agentEvents.ts` 의 `backend-contract` 경고가 **이후 모든 작업에서 영구히** 죽는다. Codex 테스트도 옛 `ipc-contract` 만 단언하므로 **테스트 green이 증거가 되지 못한다**
- [ ] **Codex 세션 ② 예약** — 커밋 전 `agentdeck-review` 교차 리뷰

---

## 📝 작업 내용

### 개명 13개 (Phase 02 매니페스트 = 이름 확정 목록)

| 현재 | 신 | 참조 규모 |
|---|---|---|
| `02_Source/shared/ipc-contract.ts` | `ipcContract.ts` | ⚠️ **196파일** |
| `02_Source/shared/agent-events.ts` | `agentEvents.ts` | ⚠️ **149파일** |
| `02_Source/shared/diff-types.ts` | `diffTypes.ts` | |
| `02_Source/shared/model-effort.ts` | `modelEffort.ts` | |
| `02_Source/main/00_ipc/agent-runs.ts` | `agentRuns.ts` | |
| `02_Source/main/00_ipc/engine-check-update.ts` | `engineCheckUpdate.ts` | |
| `02_Source/main/01_agents/claude-stream.ts` | `claudeStream.ts` | |
| `02_Source/main/01_agents/orchestration-meta.ts` | `orchestrationMeta.ts` | |
| `02_Source/main/01_agents/run-args.ts` | `runArgs.ts` | |
| `02_Source/main/05_settings/merge-slash-commands.ts` | `mergeSlashCommands.ts` | |
| `02_Source/main/backend-status.ts` | `backendStatus.ts` | |
| `02_Source/main/engine-state.ts` | `engineState.ts` | |
| `02_Source/main/engine-versions.ts` | `engineVersions.ts` | |

- [ ] `git mv` 로 13개 개명 (전부 대소문자 이상의 변경이라 `core.ignorecase` 함정에 걸리지 않는다)
- [ ] **import 문 419건 일괄 치환** — `from '.../kebab-name'` → `from '.../camelName'`
- [ ] **파생 테스트 파일도 stem 을 따라간다** — 소스 개명에 종속이며 독립 판정 대상이 아니다

### 손대지 않는 것 (명시)

- [ ] ❌ **`.tsx` 4개는 개명 대상 0개** — export 실측 결과 전부 현행이 원리에 맞다
  - `icons.tsx` = 주인공 없는 아이콘 모음 → 소문자 유지
  - `resizableModal.tsx`·`zoom.tsx` = 주 export가 훅(`useResizableModal`·`useZoom`) → camel 유지
  - `main.tsx` = **export 0, Vite 진입점 계약**(`index.html:15` 하드코딩). 대소문자 전용 개명이라 **Windows에선 dev·typecheck가 green으로 남고 Linux CI에서만 터진다**
- [ ] ❌ 모듈 폴더(`02_Source/{main,preload,renderer,shared}`) — ADR-027·028 명시 제외

---

## 🧪 실행 결과 (2026-07-26 · 커밋 전)

**개명 23건** — `02_Source` 소스 13건(매니페스트 전량) + 파생 테스트 10건. 파생은 §5-2 매니페스트에 없지만 학습 포인트가 이미 *"테스트는 개명 대상이 아니라 소스를 따라가는 것"* 이라 판정해 뒀다(ADR 각주화는 `BACKLOG.md` 20번).

**치환 규칙을 3종으로 좁혔다** — `/<stem>'` · `/<stem>"` · `<stem>.ts`. 즉 **경로를 뜻하는 형태만** 잡는다. 로그 태그 `[engine-versions]`, 에러 문구 `'engine-versions 로드 실패'`, 테스트 라벨 `describe('ipc-contract')` 는 **개념을 뜻하므로 그대로 뒀다** — ADR-039 가 규율하는 것은 파일 이름이지 문자열 리터럴이 아니고, 이런 문자열은 테스트 단정문과 커플링돼 있을 수 있다.

| 완료조건 | 결과 |
|---|---|
| 게이트 5종 | ✅ vitest **395 passed \| 6 skipped (401 files)** / **5330 passed** · typecheck 0 · lint 0 · build 751 modules · e2e core-loop 4/4 — **기준선 완전 일치, 회귀 0** |
| import 경로 문맥 잔여 | ✅ **0건** |
| 매니페스트 13건 대조 | ✅ 13/13 (`git status` R 항목으로 전수 확인) |
| `.tsx` 미변경 | ✅ 개명 **R=0** / import 수정 M=66 |
| `risk-detector` 라이브 발화 | ✅ 아래 |

⭐ **라이브 발화를 로그로 관측했다 — 픽스처와 분리하라는 완료조건의 실물.**

```
13:53:50.043 | supervisor-guard | block  | 앱 코드 편집(…/02_Source/shared/ipcContractProbe.ts)
13:53:50.050 | risk-detector    | notify | ipcContractProbe.ts → 깃발 shared-contract
```

신 이름(camelCase)에 `shared-contract` 깃발이 실제로 붙었다. **화면에는 `supervisor-guard` 하나만 떴고 로그에만 둘 다 있다**(7밀리초 차) — HR2 의 *"판정은 출력이 아니라 로그로"* 가 또 한 번 유효했다.

> ⚠️ **첫 프로브는 설계가 틀렸다.** `old_string` 을 일부러 불일치시킨 Edit 으로 *"훅은 발화하고 파일은 안 바뀐다"* 를 노렸는데 로그 증가가 **0줄**이었고, 그것이 「훅 미발화」인지 「도구 입력 검증이 훅보다 먼저라 훅에 도달조차 못함」인지 **구분할 수 없었다**. 이건 `BACKLOG.md` 19번이 지적한 판정기 결함(「돌지 못함」과 「차단됨」이 같은 신호)을 **프로브가 그대로 재생산**한 것이다. 유효한 입력을 주되 다른 훅이 차단하는 벡터로 바꿔서 해결했다.

**vitest 파일 수 401 유지가 핵심 지표였다** — 개명으로 테스트가 글롭 수집에서 빠지면 *"전부 통과"* 로 보이면서 실제로는 10개 파일이 사라진 거짓 green 이 된다. 401·5,340 이 둘 다 그대로라 파일 교체·중복 수집 시나리오도 배제됐다.

**미해소 1건** — `.claude/` 봉인층 문서 8줄이 구 stem 을 가리킨다(→ `BACKLOG.md` **20번**). 이 Phase 말미의 경고가 예고한 그대로이며, 예고대로 **진행이 아니라 보고**로 처리했다.

### 🔬 `reviewer`(Fable 5) 판정: **통과** — 위반 0

⭐ **검증 방법이 판정의 값어치를 결정했다.** `git diff HEAD -M` 344파일 전량을 뜬 뒤 **모든 −/+ 라인 쌍에 「구 stem → 신 stem 치환만으로 −라인이 +라인과 일치하는가」를 스크립트로 기계 대조**했다. 육안 표본이 아니라 전수 판정이라, *"치환이 이름 외의 토큰을 건드리지 않았다"* 가 **주장이 아니라 측정**이 됐다.

| 축 | 근거 |
|---|---|
| **로직 변경 0** | 코드 변경 전량이 stem 치환과 정확히 일치. 비대칭 diff 는 `BACKLOG.md`·이 Phase 문서·`current-pin.txt` 셋뿐 — 전부 문서/상태 |
| **CORE-04 4면 정합** | 배럴 `ipcContract.ts` 실재 · `preload/index.ts:14,117` 이 신 경로 import · main 40파일·renderer 35파일 동일 경로 · **구 kebab 잔존 0** |
| **조각난 경로 0** | `path.join`·템플릿 리터럴·동적 `import()` 로 구 stem 을 조립하는 코드 없음. 동적 import 3곳 전부 신 이름 리터럴 |
| **매니페스트 대조** | ADR-039 §5-2 13건 ↔ 실제 13건 일치 · 파생 테스트 10건 소스 추종 |
| **`.tsx` 4개 동결 근거** | *"주 export 가 훅"* 주장을 `useZoom`·`useResizableModal` 실측으로 확인 · `index.html:15` 하드코딩 확인 |

**🟡 3건 — 전부 주석·문서 위생(런타임 영향 0). 커밋 전 처리 완료.**

성격이 `BACKLOG.md` 20번(`.claude/` 8줄)과 **같은 부류**다 — *에이전트가 읽는 지시문*이라 낡으면 없는 파일을 찾게 된다. 차이는 **이쪽은 봉인 밖이라 창 없이 지금 고칠 수 있다**는 것뿐이었다.

1. 🔴 **한 줄 안에 신·구가 공존하던 유일한 줄** — `99_Others/tests/shared/lm1-effort-support-contract.test.ts:34` 에서 앞쪽 `02_Source/shared/ipc-contract`(구)와 뒤쪽 `ipcContract.ts:51`(신)이 같은 문장에 있었다. 치환 규칙 3종이 `<stem>.ts` 형태만 잡는데 앞쪽은 **스페이스로 끝나서** 빠져나갔다. 읽는 쪽을 가장 헷갈리게 하는 형태라 앞쪽만 정정.
2. **경로 지시형 주석 9곳 정정** — `preload/index.ts:7`(**CORE-04 지시문 그 자체**) · `modelEffort.ts:6`(**자기 자신의 옛 경로**를 인용하고 있었다) · `gitSampleData.ts:4`(CRITICAL 라벨이 붙은 채 구 경로) · `AgentBackend.ts:26·323` · `useInputPalettes.ts:11` · `diff.test.ts:5` · `gap1-p13-live-mode-switch.test.ts:15`(`(claude-stream|eventNormalizer).ts` — `.ts` 가 stem 뒤가 아니라 `)` 뒤라 규칙을 빠져나갔다).
   > ⚠️ **규칙을 4종으로 넓히지 않고 이 목록만 표적 정리했다.** 넓히면 개념형(`run-args 가 처리`·로그 태그 `[engine-versions]`·테스트 라벨) ~35곳을 오폭한다. **범위를 좁히는 편이 규칙을 정교하게 만드는 것보다 싸다.**
3. **역사 문서는 되돌렸다** — `01_Phases/19_LM1-live-model-switch/01-shared-contract.md` 가 역사 문서 63개 중 **유일하게** 치환에 걸렸고 그마저 반쪽이라(12·50행 구 / 52·59행 신) 한 문서 안에서 신·구가 갈렸다. **52·59행을 구 이름으로 되돌려** 문서 전체를 그때 상태로 통일했다.
   - **왜 갱신이 아니라 되돌리기인가** — 이 문서 49행이 `99.Others/tests/…`(**점 표기**)다. 애초에 점 표기 시대의 기록이며, 역사 문서는 *"그 시점에 무엇이 있었나"* 를 기록한다. 208건 점표기를 증거로 보존한 것과 같은 원칙이다.
   - **단점을 적어둔다** — 미래 에이전트가 이 문서를 읽고 `ipc-contract.test.ts` 를 찾으면 못 찾는다. 다만 그 위험은 **나머지 62개 문서에 똑같이** 있고, 하나만 예외 처리하면 파일 간 불일치가 새로 생긴다.

> 📌 **reviewer 가 관찰한 것 하나** — 리뷰 도중 워킹트리가 움직였다(첫 스냅샷 +753/−751 → 둘째 +821/−796). 판정은 둘째 스냅샷 기준이며 추가분은 전부 문서/상태였다. **장시간 리뷰와 병행 편집은 판정 대상이 흔들린다** — 다음부터는 리뷰 착수 시점의 해시를 브리프에 박는 편이 낫다.

### 🔬 Codex 교차 감사(세션 A, 2026-07-27) — 🔴 **1건이 커밋을 막았다**

브리프 = [`NC-codex-handoff-2.md`](NC-codex-handoff-2.md). 기동 조건 6항목 통과, 미커밋 rename **23건(13 소스 + 10 테스트) 전량 `R100`** 확인.

#### 🔴 실제 피해가 난 결함 — 테스트가 영호의 사용자 설정을 파괴했다

`99_Others/tests/main/engineVersions.test.ts` 가 `C:\Users\<user>\.agentdeck-dev\engine-config.json` 을 `{"activeVersion": null}` 로 **실제로 덮었다.** mtime 이 직전 게이트 실행 시각과 일치해 실측 확인됐다.

⭐⭐ **이 Phase 최대의 발견은 이것이다 — 풀 액세스 환경에서는 「쓰면 안 될 곳에 쓰는 것」이 보이지 않는다.** 우리 세션은 권한이 있어 조용히 성공했고 **테스트는 green** 이었다. Codex 의 읽기 전용 세션에서만 EPERM 으로 red 가 났다. **같은 사각지대가 방향만 바꿔 재발한 것이다** — `HR1-DONE.md` 「발견2(P1)」가 *"내 CI/Bash 는 풀 액세스라 못 덮었던 사각지대"* 라고 적은 그것이다(그때는 Codex 도구가 저장소에 썼고, 이번엔 Claude 테스트가 사용자 홈에 썼다). ⇒ **제한 권한 세션은 테스트 격리 결함을 찾는 도구다.**

> ⚠️ **내 최초 진단은 틀렸고 qa 가 실측으로 반증했다.** 나는 *"`vi.mock` 이 `it()` 안에 있어서"* 로 봤는데, 프로브 결과 **모킹은 적용되고 있었다**. 진짜 원인 2겹: ⓐ `{...actual}` 이 펼치는 네임스페이스에 **`default` 키(진짜 fs)** 가 들어 있는데 앱은 `import fs from 'node:fs'` — **모킹이 앱이 지나는 문이 아닌 옆문에만** 걸렸다 ⓑ `vi.mock` 호이스팅으로 같은 모듈의 **mock 7개가 마지막 1개로 붕괴** — 테스트별 fs 시나리오는 **처음부터 존재하지 않았다**(7개가 green 이었지만 아무것도 검증하지 않았다).

**수리**(qa) — fs 모킹 폐기 + per-test 임시 userData 주입. **앱 소스 변경 0**(`overrideUserData` 매개변수가 이미 있었다). 3중 방어: ① 명시 주입 ② `electron.app.getPath` 모킹으로 폴백마저 샌드박스 ③ 홈 config mtime·sha 카나리아. ⭐ **뮤테이션 음성 대조**로 가드가 실제로 무는지 확인했다 — 일부러 주입을 빼자 red 가 났고, 카나리아 프로브에서는 **테스트 33개 전부 통과했는데 파일 검사가 실패**했다(= 예전에 조용히 넘어가던 시나리오가 이제 red). 27 → 33 tests.

#### ⭐ 1차 reviewer 가 놓친 구조적 이유 — diff 기반 검토의 사각지대

Codex 가 `agentEvents.ts:13`·`ipcContract.ts:24` 를 잡았는데 1차 reviewer 는 못 잡았다. **23개 파일 전부 `R100` = 내용 변경 0 = diff 에 나타나지 않기 때문**이다. 그런데 그 파일들이 **자기 옛 이름을 참조**하고 있어서 **안 바뀌었기 때문에 오히려 틀린 내용**이 됐다. diff 는 *"무엇이 바뀌었나"* 만 보여주고 *"안 바뀌어서 틀려진 것"* 은 못 보여준다.

⇒ 개명 23파일을 **전수 grep** 했더니 **8파일에 잔여**가 있었다(reviewer 9곳 + Codex 2곳으로도 안 끝났다).

#### 🟡 봉합 — 주석 경로 14줄 + 활성 정본 6줄

- **개명 파일 자신의 자기참조 14줄** — `agentRuns.ts:153` · `backendStatus.ts:10,13,18,60` · `engineState.ts:37,39`(**자기 자신을 옛 이름으로**) · `engineVersions.ts:24,438` · `agentEvents.ts:13,221` · `ipcContract.ts:24` · `backendStatus.test.ts:8`
- **`ARCHITECTURE.md:62,64,65,101,158,162`** — 디렉토리 트리 그림 + 본문. ⭐ **왜 놓쳤나: 축의 교차점이 비었다.** P05 는 *"문서 영역"*, P07 은 *"코드 영역"* 으로 축을 갈랐는데 **「문서 안의 코드 참조」는 어느 축에도 안 들어갔다.**

**이번에 확정한 판별 원칙** — *개명된 파일 자신이 옛 stem 을 쓰면 고친다. 예외는 **로그 태그**(런타임 출력·로그 파싱 커플링)와 **테스트 라벨**(리포트 커플링) 둘뿐.* `engineVersions.ts:457` 의 `` `[engine-versions]` `` 와 `ipcContract.test.ts:14` 의 `describe('ipc-contract')` 를 **남긴** 근거다.

#### ⚖️ Codex 와 판단이 갈린 1건 — 채택하지 않았다

`lm1-effort-support-contract.test.ts:63·119`. Codex 는 *"슬래시 포함 명시적 모듈 경로"* 라 갱신을 권했으나 — **63행**은 `// RED: shared/model-effort 모듈 미존재` 로 **TDD RED 시점의 상태 서술**이라 갱신하면 *"modelEffort 모듈 미존재"* 가 되어 **문장이 거짓**이 된다. **119행**은 `it(…)` 테스트 라벨이라 위 예외 규칙에 해당한다. ⇒ **미변경.** (2차 reviewer 에 판정을 맡겨 뒀다.)

#### ✅ 봉합 후 게이트 — 파괴 카나리아 포함

| 게이트 | 결과 |
|---|---|
| typecheck · lint | 0 · 0 |
| vitest | `395 passed \| 6 skipped (401 files)` · **`5336 passed \| 10 skipped (5346)`** |
| ⭐ **파괴 카나리아** | 홈 `engine-config.json` **sha256·mtime 무변** · `%TEMP%/ev-test-*` **증가 0** |

> ⚠️ **기준선이 5330 → 5336 으로 바뀌었다**(+6). 내가 secretary 에 준 예상치(+11)는 틀렸다 — 옛 파일 개수를 22 로 잡았는데 **실제 27** 이었다. secretary 가 `git show HEAD:…/engine-versions.test.ts`(⚠️ **옛 kebab 경로**로 조회해야 나온다)로 실측해 정정했다. 파일 수 401 유지라 수집 누락은 없다.

### 🔬 reviewer 2차(Fable 5) — 봉합분 검토: **통과 · 위반 0**

1차는 개명 자체를(diff 기계 대조), 2차는 **봉합분**을 봤다. 특히 `engineVersions.test.ts` 전면 재작성(+396/−354)은 *"green 인데 아무것도 안 보던"* 병을 고친 것이라 **「33개가 정말 검증하는가」** 를 전수 정독으로 확인했다 — **빈 통과 케이스 0**. 거부 케이스 7종은 주석 주장(*"spawn 0"*)을 `toHaveBeenCalledTimes(0)` + 디렉토리 부재 + progress 미호출의 **3중 기계 단언**으로 승격했고, null 반환 케이스는 실패 *사유*까지 판별한다(major 가드 vs 동적 로드 실패를 `console.warn` 유무로 구분). 격리 3겹도 단독 실행 전후 sha256·mtime 동일로 실측 확인.

#### ⚖️ 쟁점 판정 — **63행은 Codex 가 옳았고 119행은 메인이 옳았다**

`lm1-effort-support-contract.test.ts:63` 을 **갱신**했다(`shared/model-effort` → `shared/modelEffort`). **내 판단이 틀렸다.** reviewer 의 반증이 결정적이었다:

- ⭐ **같은 파일 29~30행이 완전히 동일한 RED 서사인데 이번 캠페인에서 이미 갱신돼 있었다** — 실패 메시지 모사 문자열(`"Failed to load url .../model-effort"`)까지 신 이름으로 바꿨다. *"RED 시점 원문 보존"* 이 원칙이었다면 29행이 옛 이름으로 남았어야 한다. ⇒ **63행만 남기는 것은 원칙이 아니라 한 파일 안의 비일관이었다.**
- ⭐ **"갱신하면 문장이 거짓이 된다"는 논변은 판별력이 없다** — RED 시점엔 *어느 이름의 모듈도* 없었으므로 두 표기 모두 그 시점에 대해 참이다. **과거임을 표시하는 것은 이름이 아니라 `RED:` 접두다.**
- 63행이 설명하는 대상은 42~45행의 import 문이고, 그것은 이제 `modelEffort` 를 가리킨다.

**119행**(`it(…)` 테스트 라벨)은 유지 — 예외 규칙이 캠페인 전체에 균일 적용됐고(`ipcContract.test.ts:14` 의 `describe('ipc-contract')` 도 같은 이유), 119행만 갱신하면 라벨 처리 기준이 갈린다.

> 📌 **교훈** — 판별 원칙을 세울 때는 **그 원칙이 이미 적용된 이력과 대조**해야 한다. 나는 원칙을 세우고 그 원칙으로 63행을 지켰는데, 정작 **같은 캠페인이 같은 파일 29행에서 반대로 처리**하고 있었다. 원칙의 일관성은 선언이 아니라 **실제 적용 이력**으로 확인된다.

#### 🟡 커밋 비차단 4건 → `BACKLOG.md` **24번**

**교차참조 잔여**(비개명 파일이 개명된 남의 이름을 옛 stem 으로 부름 — `02_Source` 약 27곳 + 테스트 주석 다수) + qa 후속 3건(`ANTHROPIC_API_KEY` 무조건 `delete` → 저장 후 복원 / 카나리아가 config 단일 파일만 감시 / `h.appDir.value` 미복원 순서 결합).

⭐ **P07 의 원칙 스코프가 「개명 파일 자신」이었음이 여기서 드러난다** — 그 안에서는 일관되게 닫혔지만, **같은 부류의 stale 이 스코프 밖에 남아 있다.**

### 📦 커밋 — `fe03430` (2026-07-27, 346 files · +1713/−1313)

⚠️ **커밋 메시지의 「개명 23건 전량 R100」은 검증 시점의 수치이고 커밋된 diff 와는 다르다.** 그 시점에는 개명만 인덱스에 올라와 있어 23/23 이 R100 이었는데, 최종 스테이징에서는 **개명 위에 내용 수정이 겹쳐** 유사도가 흩어졌다(R073~R099). 특히 `engineVersions.test.ts` 는 rename + 전면 재작성이 겹쳐 기본 임계(50%) 아래로 떨어져 **`A`+`D` 쌍으로 갈라진다** — `git show fe03430 --find-renames=10%` 로 보면 23건 전량이 R 로 복원된다. **결함이 아니라 유사도 임계의 표시 문제**이며, 커밋 메시지가 지목한 *"동반 수리"* 파일과 정확히 일치한다.

⚠️ **그리고 나는 커밋이 도는 도중에 이 pin 을 또 편집했다** — 커밋에 담긴 `current-pin.txt` 는 reviewer 2차 반영 *이전* 판이고, 차이(7 insertions / 8 deletions)는 후속 커밋으로 얹었다. 📌 **이것은 바로 앞 절에서 reviewer 가 지적한 「장시간 작업과 병행 편집은 판정 대상을 흔든다」를 커밋 단계에서 그대로 재생산한 것이다.** 리뷰에는 *"이후 안 건드린다"* 는 약속을 적용했으면서 커밋에는 적용하지 않았다. ⇒ **판정·기록을 남기는 모든 비동기 작업(리뷰·게이트·커밋)에 같은 규율이 필요하다** — 착수 전에 대상을 고정하거나, 고정할 수 없으면 그 사실을 산출물에 적는다.

#### 📌 Codex 가 남긴 것 — 백로그로 이관

백로그 **18 오탐 확정**(→19 흡수) · **19 확정 + 수리 설계 회수** · 신규 **21**(테스트 쓰기 경계 게이트 부재) · **22**(두 엔진 봉인 집합 비대칭 — Codex 훅은 `00_Documents/00_Harness` 를 막지 않는다) · **23**(`src/` 옛 디렉토리 포인터 144건). 상세 = [`BACKLOG.md`](../../00_Documents/BACKLOG.md).

---

## ✅ 완료 조건

- [x] **게이트 G1·G4·G5·G6 green** (정본 = `_milestone-plan.md` 「🧪 회귀 게이트 정본」). G2는 P05 이후 **신 경로**로 실행
- [x] `git grep -cE "from '[^']*/(ipc-contract|agent-events|diff-types|model-effort|agent-runs|engine-check-update|claude-stream|orchestration-meta|run-args|merge-slash-commands|backend-status|engine-state|engine-versions)'"` **0건** — ⚠️ **import 경로 문맥 한정**(`from '…'`). 산문·주석·로그 메시지의 같은 문자열은 대상이 아니다
- [x] ⭐ **`risk-detector` 라이브 발화 확인 — 픽스처와 분리한다.** 개명 편집 중 실제 guard 로그에 backend-contract·shared-contract 깃발 기록이 남는지 확인. **픽스처 green ≠ 라이브 발화**(HR2 교훈: 판정은 로그로)
- [x] **V4 매니페스트 목록 대조** — 13건 **전부** 개명됨. 12건이면 실패다
- [x] `.tsx` 4개 **미변경** 확인 (`git diff --stat` 에 부재) — 개명 R=0 / import 수정 M=66
- [x] `reviewer`(Fable 5) **1차 통과**(개명 diff 기계 대조 — 🟡 3건 처리) + **2차 통과**(봉합분 — 🟡 4건은 `BACKLOG.md` 24번으로 이관, 커밋 비차단)
- [x] ✅ **Codex `agentdeck-review` 교차 리뷰 회수** — 세션 A(브리프 [`NC-codex-handoff-2.md`](NC-codex-handoff-2.md)). 🔴 1건(테스트가 실제 사용자 홈을 파괴) 발견 → 봉합 완료. ⭐ **이 hard gate 가 실제로 값을 했다** — 우리 게이트가 green 으로 놓치던 결함을 제한 권한 환경이 잡았다
- [ ] ⏳ **Codex 세션 B**(유지보수) — `.codex/**` 수리(백로그 19) + 음성 canary. **P07 과 무관한 Codex 어댑터 작업이라 이 Phase 의 종결을 막지 않는다**

---

## 📚 학습 포인트

- **파일명은 `import` 문에 노출되는 공개 인터페이스다** — C#의 `using System.IO`는 네임스페이스라 파일명과 무관하지만, JS/TS는 **경로가 곧 코드에 박힌다.** 그래서 파일명 선택이 스타일 문제가 아니라 가독성 계약이 된다.
- **PascalCase의 의미** — JS/TS에서 대문자 시작은 *"이건 값이 아니라 타입/클래스/컴포넌트다"* 라는 신호다. 함수 모음을 `Git.ts` 로 두면 잘못된 신호를 준다. (C#은 "public이면 Pascal", JS/TS는 "타입이면 Pascal" — 기준 자체가 다르다.)
- **파생 종속** — 테스트 파일명이 소스 stem을 따라가는 구조에서는, 테스트 451개가 "개명 대상"이 아니라 "소스를 따라가는 것"이다. 이 구분을 못 하면 규모를 20배 과대평가하게 된다.

---

## ⚠️ 함정

- **Phase 03 없이 이 Phase에 들어오는 것** — `risk-detector.sh` 가 `agent-events`·`ipc-contract` 를 **파일명 리터럴**로 매칭한다. 개명만 하면 backend-contract 깃발이 조용히 죽고, **이 Phase에는 창이 없어 훅을 고칠 수 없다.**
- **`.tsx` 를 "일관성"으로 밀어버리는 것** — 특히 `main.tsx`. Windows 파일시스템이 대소문자를 무시해 **이 머신에선 전부 green으로 남고 다른 머신·Linux CI에서만 터진다.** 멀티머신 운용에서 최악의 잠복 결함이다.
- **일괄 치환의 과적중** — `agent-events` 라는 문자열이 import 경로가 아닌 곳(문서 산문·주석·로그 메시지)에도 있다. **경로 리터럴만** 치환한다.
- **`ipcContract`·`agentEvents` 는 CORE-04의 심장** — `trust-boundary` 깃발이므로 `reviewer` 호출이 **무조건**이고, 사람 GO 없이 커밋하지 않는다.

---

## 담당 SubAgent

**`shared-ipc`**(`02_Source/shared` 4건) + **`main-process`**(`02_Source/main` 하위) + **`agent-backend`**(`01_agents` 하위) — 전부 `02_Source/**` 라 도메인 Worker 영역이 맞다.
**`qa`** — 파생 테스트 파일의 stem 개명(`99_Others/tests/**` = qa의 쓰기 범위).
**`reviewer`(Fable 5) 필수** / **Codex `agentdeck-review`** 교차.

> ⚠️ 이 Phase는 **`.claude/**` 를 일절 건드리지 않는다** — 창이 없기도 하고, 필요한 갱신은 P03(훅)·P06(봉인층 문서)이 이미 끝냈어야 한다. 여기서 `.claude/` 를 고쳐야 할 상황이 오면 **그것은 P03·P06이 빠뜨렸다는 신호**이고, 진행이 아니라 보고 대상이다.
