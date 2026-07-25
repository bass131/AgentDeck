---
owner: 영호
milestone: HR2
phase: 05
title: 훅 보안 봉합 4건 + sed 오탐 + 게이트 연결
status: done
grade: 대규모
risk: harness, trust-boundary
loop_track: human-gate
estimated: 5~8h
domain: cross
summary: 실측으로 드러난 봉인 우회 4건(따옴표 fail-open·parse-payload·TTL 하한·git 서브커맨드)을 닫고, 훅 셀프테스트를 회귀 게이트에 연결한다. reviewer Tier 2-A가 같은 계열 4건을 추가로 잡아 2차 봉합했다(그중 1건은 이 Phase가 만든 회귀).
---

# Phase 05: 훅 보안 봉합 4건 + sed 오탐 + 게이트 연결

> **상태**: done
> **마일스톤**: HR2
> **등급**: 대규모 (risk: harness · trust-boundary)
> **담당**: 메인 직접 + qa(테스트)

---

## 🎯 목표

**지금 이 순간 열려 있는 봉인 우회 경로를 닫는다.** 리뉴얼과 무관하게 실측 과정에서 드러난 것들이라, 마일스톤에서 가장 시급한 Phase다.

부수 목표: 훅 셀프테스트가 **어떤 npm 게이트에도 물려 있지 않은** 상태를 해소한다.

---

## ⏪ 사전 조건

- [x] P01 완료 (ADR-038 개정 — OpenGate 실행/언급 구분은 **방어 범위 축소 = 계약 변경**)
- [x] OpenGate 개방
- [x] TDD: 실패 테스트 먼저 (`tdd-guard`가 강제, `.claude/state/tdd-enforce` 존재 확인됨)

---

## 📝 작업 내용

### 우선순위 1 — 따옴표 불균형 fail-open ⚠️ 최우선
- [x] `shell-policy.mjs:50` — `shellTokens`가 따옴표 불균형 시 `[]` 반환 → sealed 후보 0 → **통과**. 실측 재현: `tee .claude/settings.json # it's fine`(봉인 통과) · `rm -rf build # don't panic`(dangerous-cmd-guard 통과). **bash는 `#` 이후를 주석 처리하므로 명령은 정상 실행된다.**
- [x] 조치: 셸 주석(`#`) 선처리 + **판정 불가 시 fail-closed**(현재 fail-open)
- [x] RED 테스트 먼저: 위 두 명령이 차단되는지

### 우선순위 2 — `parse-payload.js` 단일 실패점
- [x] 전 훅이 공유하는 파서인데 `hook-common.sh:23`의 `eval ''` 경로가 exit 0 = **9종 전면 fail-open**
- [x] 테스트 0건이고 `hook-exit.test.mjs`의 크래시 주입 대상에서도 빠져 있음 → 크래시 주입 케이스 추가

### 우선순위 3 — OpenGate TTL 하한 + flag의 gitignore 부재
- [x] `supervisor-guard.sh:35` — 미래 epoch가 flag에 들어가면 age가 음수 → **무기한 개방**. 하한 검사 1줄
- [x] ⚠️ **`gate-open.flag`가 `.gitignore`에 없다** (실측 2026-07-25: `git check-ignore` 무매치, `git status`에 `??`로 노출). `git add .` 류나 부주의한 스테이징으로 **개방 상태가 저장소에 영구 박제**될 수 있고, 그 커밋을 받은 다른 머신은 창이 열린 채로 시작한다. `.gitignore`에 등재

### 우선순위 4 — git 서브커맨드 우회
- [x] `git mv|rm|restore|checkout <rev> --|apply|stash pop` · `tar -C` · `unzip -d` · `find -delete`가 전부 `harnessShellWriteReason=null`
- [x] 최소한 git 서브커맨드의 pathspec을 `classifyHarnessPath`에 통과시킨다
- [x] ⚠️ 시급성 근거: **P08이 바로 `git mv`를 대량 승인시킨다** — 승인 피로가 곧 우회 키 입력이 된다

### sed 오탐 (적대 검증 PARTIAL — 처방 수정됨)
- [x] **세그먼트 좁히기는 하지 않는다** — 명령줄 전체 OR 판정이 `F=.claude/x; sed -i s/a/b/ $F`를 잡고 있다(실측). 좁히면 blocked→allowed 회귀
- [x] ⚠️ **`-i`만 조건으로 하면 새 false negative** — sed는 `-i` 없이도 스크립트 `w` 명령으로 쓴다(`sed -n 's/a/b/w .claude/x'`·`sed '1w .claude/x'`, 둘 다 현재 차단됨). 조건에 `-i`·`-i.bak`·`--in-place[=SUFFIX]`·결합 단축(`-ni`)·**스크립트 본문의 `w`/`W`/`s///w`** 전부 포함
- [x] 선례 참고: `perl -i`가 `shell-policy.mjs:307-312`에서 이미 인플레이스 조건부. 단 perl은 `runtimeCode` 경로, sed는 `containsDirectWriteCommand` 경로라 **코드 재사용 불가, 새 분기 필요**
- [x] 변수 우회 회귀 테스트 등재 — 현 방어는 2단 결합(`D=.cl; F=${D}aude/x`)에 이미 뚫려 있고 테스트가 0건이라, 다음 리팩터에서 조용히 재발한다

### OpenGate 실행/언급 구분 (P01의 ADR-038 개정 후에만)
- [x] `supervisor-guard.sh:70-72`의 부분문자열 매칭 → 실행/언급 구분
- [x] `98.Management/Harness_OpenGate/README.md:36` + 훅 헤더 주석(`:20-23`) 동반 갱신

### 우선순위 5 — **`open-gate` 원장 라벨이 소실된다** 🆕 (P03 작업 중 실측 발견, 2026-07-25)

**증상**: 개방 창에서 훅을 통과한 이력을 `grep open-gate .claude/state/guard-blocks.log` 로 회수하면 **0건**이다. 실제 원장에는 `notify`로 찍혀 있고, 그 라벨은 2,526건 중 하나라 **개방 통과만 골라낼 수 없다.**

**원인** — `.claude/hooks/_lib/guard-log.mjs:29`:
```js
const normalized = action === 'block' ? 'block' : 'notify'
```
`supervisor-guard.sh:36`은 `log_guard_event "supervisor-guard" "open-gate" ...` 로 **정확히 넘기는데**, 이 한 줄이 `block` 아닌 모든 라벨을 `notify`로 뭉갠다. 훅 쪽은 처음부터 옳았고 로거가 삼킨 것이다.

**왜 고쳐야 하나 — 이건 미관이 아니라 계약 위반이다**:
- **ADR-038 `:9`** 가 위협 모델의 *정직 선언*으로 이렇게 적었다 — *"개방 중 통과 이력은 전량 `guard-blocks.log`에 **`open-gate`로** 남아 사후 감사 가능."* 이 ADR은 "적대 봉쇄가 아니라 성실한 에이전트의 실수 방지"라고 방어를 낮춰 잡는 대신, **사후 감사 가능성**을 그 대가로 내세웠다. 라벨이 없으면 그 대가가 지불되지 않는다.
- **P11 발화 프로브 #3**(*"OpenGate OPEN → 훅 통과 로그(`guard-blocks.log` open-gate) 남는가"*)은 현 상태로 **반드시 실패**한다. P05가 이걸 안 고치면 P11에서 막힌다.

**조치**:
- [x] `guard-log.mjs`의 라벨 정규화를 **allowlist 방식**으로 — `['block','open-gate','notify']`에 있으면 그대로, 없으면 `notify`로 폴백. (현행 이분법은 새 라벨이 생길 때마다 조용히 삼킨다 — 지금 일어난 일이 정확히 그것이다.)
- [x] ⚠️ **다른 훅이 `block`/`notify` 외 라벨을 넘기고 있는지 전수 확인** — 같은 방식으로 삼켜진 라벨이 더 있을 수 있다. `grep -rn "log_guard_event" .claude/hooks/`
- [x] 회귀 테스트: `formatLine({action:'open-gate'})` → `open-gate` 보존 / 미등록 라벨 → `notify` 폴백. **`guard-log.mjs`는 현재 테스트 0건**이라 §게이트 연결의 "테스트 0건 훅 0개" 조건에도 걸린다.
- [x] 로테이션(`log.1`) 때문에 옛 이력은 복원 불가 — **소급하지 않는다.** 고친 시점 이후만 감사 가능함을 ADR-038 개정 1 하단이나 README에 한 줄로 명시.

### 게이트 연결 ⚠️ 중요
- [x] `npm run test:hooks` 스크립트 신설 — 훅 테스트가 현재 **어떤 npm 게이트에도 안 물려 있다**(`vitest.config.ts:9` include는 `99.Others/tests/**`뿐, 실행법은 수동 `node --test`뿐). **`package.json`은 봉인 밖이라 수정 가능**
- [x] 선례: `harness-conformance.test.ts`가 `conformance-check.mjs`를 spawn해 vitest에 물린 방식
- [x] 무방비 훅 5종(pin-injector·risk-detector·circuit-breaker·reviewer-auto-trigger·convention-size-guard) + `parse-payload.js`·`shell-tokens.js` 테스트 신설
- [x] ⚠️ OpenGate 회귀는 `.sh` 글루 동작이라 **`hook-exit.test.mjs` 소관**(`shell-policy.test.mjs` 아님)

---

## ✅ 완료 조건

- [x] **판정기 CLI 양방향 실측** (테스트 통과로 갈음 X) — 7건 전부 기대대로:
  - `tee .claude/settings.json # it's fine` → **차단** ✅
  - `rm -rf build # don't panic` → **차단** ✅
  - `sed -n '1,50p' .claude/agents/coordinator.md` → **통과**(오탐 해소) ✅
  - `sed -i 's/a/b/' .claude/settings.json` → **차단**(회귀 없음) ✅
  - `sed '1w .claude/settings.json' infile` → **차단**(w 명령) ✅
  - `git mv .claude/agents/qa.md …` → **차단** / `git diff .claude/settings.json` → **통과** ✅
  - `F=.claude/x; sed -i s/a/b/ $F` → **차단**(변수 우회 회귀 없음, 테스트로 고정) ✅
- [ ] ⚠️ **훅 글루 레벨 발화 프로브는 P11로 이관** — OpenGate 창이 열려 있으면 `supervisor-guard.sh`가 `exit 0`으로 **전체 통과**시키는 것이 설계 의도(ADR-038:3)라, 창 안에서는 글루 레벨 차단을 실측할 수 없다. 창을 닫은 뒤 P11에서 수행한다. (샌드박스 글루 테스트 `hook-exit.test.mjs`가 그 사이의 회귀는 막는다)
- [x] **`open-gate` 라벨 회수 경로 복구** — allowlist 전환 + 회귀 테스트 3건(`guard-log.test.mjs`). 실 원장에서의 `grep -c` 확인은 창을 닫았다 여는 사이클이 필요하므로 **P11 프로브 ③**에서. ⚠️ **소급 불가 명시 완료**(ADR-038 「보완」 절 + README)
- [x] `npm run test:hooks` 존재하고 green — **49 → 73(1차) → 83(reviewer 2차 봉합 포함)** (⚠️ `node --test <dir>`는 디렉토리 인자를 받지 않아 cwd 이동 방식 채택)
- [x] 훅 9종 중 테스트 0건인 것 = **0개** — `hook-advisory.test.mjs` 신설(무방비 5종 + 공유 파서 2종). ⚠️ **Phase 정의의 「`_lib/guard-log.mjs`도 현재 0건」은 오측**이었다 — `guard-log.test.mjs`가 131줄로 이미 존재했고 baseline 49건에 포함돼 있었다
- [x] ⚠️ **reviewer Tier 2-A 1회** (대상 = `shell-policy.mjs`·`shell-tokens.js`·`hook-common.sh`·`supervisor-guard.sh` diff). 영호 승인 후 호출. **결함 0이 아니었다 — 🔴 4건 / 🟡 6건.** 전량 봉합했고 상세는 아래 「reviewer 2차 봉합」 절. 심판을 세운 판단이 옳았음이 증명됐다: 그중 **1건은 이 Phase가 직접 만든 회귀**였고, 작성자 자신은 그걸 "오탐 해소 완료"로 읽고 있었다
- [x] `npm run typecheck` 0 · `npm run test` green(**395파일 / 5,330 passed / 10 skipped** — HR2 기준선 동일, 회귀 0) · `npm run lint` 0 · `test:hooks` **83/83**
- [x] TDD 순서 준수 — RED(36d9a17·332e632) → GREEN(43c9aeb·f2afa08). ⚠️ 마지막 묶음(d85f947)은 테스트 선작성·RED 확인·구현 순서는 지켰으나 **커밋을 분리하지 않았다**(advisory 12건 중 10건이 기존 동작 고정이라 한 묶음으로 감)
- [x] ⭐ **계획 열거 밖 동일 결함 1건 봉합** — 우선순위 1은 `shell-policy.mjs:50`만 지목했으나 `shell-tokens.js`가 같은 fail-open을 공유했고, `supervisor-guard.sh`의 ②절(실행 경계)이 `git add . # it's fine`에 통째로 열려 있었다. P03에 이어 **두 번째로 "계획 열거가 전수가 아니다"** 를 확인한 지점

---

## 🔁 reviewer 2차 봉합 (Tier 2-A, 2026-07-25)

reviewer 판정은 **🔴 4건 / 🟡 6건 / 🟢 9건 + 미검증 7항목**이었다. 🔴는 전부 *"판정기가 쓰기 명령이나 sealed 경로를 못 찾아 통과시킨다"* 는 **같은 계열**이고, 그중 하나는 이 Phase가 sed를 무조건 차단에서 조건부로 바꾸며 **직접 연 회귀**다.

> reviewer는 결론에 *"봉인 대상이니 에이전트 수정 금지, 영호 유지보수 창으로"* 를 달았다. 이는 **창 상태를 모른 채 내린 보수적 판단**이다 — 지금이 그 창이고, P01~P05가 같은 경로로 진행됐다. 판단 자체는 옳고(CORE-11), 전제만 달랐다.

### 🔴 4건 — 봉합 완료

| # | 결함 | 실측 재현 | 처방 |
|---|---|---|---|
| 🔴-1 | **개행이 세그먼트 구분자가 아니었다.** 둘째 줄 명령이 첫 세그먼트에 흡수돼 실행 이름이 앞줄 명령으로 읽혔다 | `echo hi`↵`sed -i … .claude/settings.json` → 통과 / `echo hi`↵`rm -rf …` → 통과 (**봉인·파괴 가드 동시 무력화**) | 토큰화에서 `\n`을 `;` 상당으로 승격 + **짝으로 heredoc 본문 제거**(안 하면 문서 작성이 통째로 오탐) |
| 🔴-2 | sed 조건부 판정의 미탐 — 부정 주소·임의 구분자·`e` 명령 | `1!w` · `$!w` · `/x/!w` · `\%x%w` · `1e tee …` 전부 통과. GNU sed 4.9로 다섯 형태 모두 실제 쓰기 확인 | 주소부 문법을 제대로 구현(행번호·`$`·범위·`/re/`·`\c…c`·수식자·부정) + `e`를 쓰기로 등재 |
| 🔴-3 | 리다이렉트 대상이 **언제나 프로젝트 루트 기준**이라 `cd` 한 번으로 훅 파일을 덮어쓸 수 있었다 | `cd .claude/hooks && echo x > supervisor-guard.sh` → 통과 (대상 토큰에 마커가 없어 후보 추출조차 안 됨) | 세그먼트 체인 따라 `cd`/`pushd` 추적, 리다이렉트 대상을 **그 시점 cwd** 기준으로 분류 |
| 🔴-4 | 따옴표 밖 백슬래시 미처리 + 후보 추출이 왼쪽으로 greedy | `tee \`↵`.claude/settings.json`(줄 이음) · `sed 'w.claude/settings.json'` 전부 통과 | POSIX대로 이스케이프 처리 + `/` 경계 기준 2차 추출. **대가**: 토큰 단계에서 Windows 백슬래시 경로가 깨지므로 후보 소스에 **원본 명령**을 추가하고 `openGateExecReason`은 정규화 사본도 판정 |

⚠️ 🔴-4의 대가는 즉시 드러났다 — `cmd /c 98.Management\Harness_OpenGate\OPEN-GATE.bat` 차단 테스트가 깨졌다. **기존 테스트가 회귀를 잡은 사례**이므로 그대로 남긴다.

### 🟡 6건 — 5건 반영, 1건 백로그

- **🟡-1 파서 fail-closed의 구멍 2개**: `JSON.parse("5")`는 성공하지만 `tool_input`이 없어 파서가 5줄을 **빈 값으로** 출력했고, 호출측은 그걸 *파싱 성공*으로 읽어 봉인 검사를 건너뛰었다. `null`만 우연히 TypeError로 걸렸을 뿐 **설계된 방어가 아니었다.** → 비객체 거부 + 빈 stdin도 `PARSED=0`.
- **🟡-2 git 쓰기 서브커맨드 6종 추가**(`config`·`archive`·`bundle`·`format-patch`·`worktree`·`init`) — sealed 경로가 명령줄에 보일 때만 걸리는 AND 조건이라 평범한 git 사용에는 영향이 없다.
- **🟡-5 `git stash show`/`list` 오탐 해소** — stash만 하위 동사로 분기.
- **🟡-6 `sed -f`** — 스크립트 *파일*이라 내용이 시야 밖이다. 옛 구현은 파일명을 인라인 스크립트인 양 정규식에 넣었다. **판정 불가 = 쓰기로 간주**(fail-closed)로 바꿨다.
- **🟡-3 `git apply` 한계** — 패치 *내용*의 경로는 못 본다. 목록 등재가 방어를 주는 것처럼 보이는 착시라 코드 주석에 박제.
- **🟡-4 `git switch`·`git stash pop`은 경로 토큰 없이 워킹트리를 갈아엎는다** → 경로 토큰 기반 판정기의 **구조적 한계**다. 코드 주석에 명시하고 **백로그**로 넘긴다(설계 사안 = ADR 필요, 영호 판단 영역).

### 미검증 7항목 — 실측했더니 결함이 하나 더 나왔다

reviewer가 *"정합으로 적지 않는다"* 며 정직하게 남긴 7항목을 이어서 측정했다. **#3에서 실제 결함이 나왔다.**

- 🔴 **#3 ReDoS — 확정.** `sed 's/a\\\\…\\b/c' <sealed>` 형태에서 백슬래시 n=30 → 29ms, **n=40 → 3,652ms**(≈125배, 지수). 원인은 `(?:\\.|[^])*?` 두 분기가 **백슬래시에서 겹쳐** 한 글자를 소비하는 방법이 둘이 되는 것. → 겹침 제거(`\\[^]` 우선) 후 같은 입력이 **0.1ms**. ⚠️ **느린 정규식은 그 자체로 우회 벡터다** — 판정기가 멈추면 훅이 타임아웃되고, 훅 타임아웃은 차단이 아니라 조용한 통과다. 회귀 테스트로 고정(임계 500ms).
- **#6 TTL 초장문 숫자 — 지금은 우연히 안전했다.** bash 산술이 오버플로우로 **음수**를 내고 하한 0 검사가 그걸 잡는다. 다만 wrap 결과가 양수 신선 구간에 떨어지는 값도 원리상 존재하므로, 안전을 검사 하나에 의존하지 않도록 **자릿수 상한(11자리)** 을 추가하고 회귀 테스트 3건 등재.
- **#7 openGateExecReason** — 실행 접두사(`exec`·`nohup`·`command`·`time`·`xargs`·`stdbuf`)를 건너뛰지 않아 쓰기 명령 이름이 판정기 눈에 안 보이던 경로를 함께 봉합(종전엔 `sudo`·`env`만). `EXEC_PREFIXES`로 일원화해 `dangerousCommandReason`까지 같이 개선.
- **#1·#2·#5** — heredoc·재토큰화 조합은 🔴-1 봉합 과정에서 테스트로 흡수. `|| assignments=''`(node 부재) 분기는 **여전히 미도달** — 재현에 node 자체를 제거해야 해 이번엔 못 했다. **정직하게 미검증으로 남긴다.**

### 곁다리: OpenGate TTL 4h → 7h (영호 지시)

창이 도중 만료되면 봉인 복귀로 끝나지 않고 **루프 전체가 사람을 기다리며 멈춘다**(에이전트는 설계상 재오픈 불가). 12 Phase짜리 창에 4h는 짧다. 근거·트레이드오프 = **ADR-038 개정 2**. 동기화 6지점(`GATE_TTL_SEC`·훅 주석 2곳·bat 2곳·README·ADR).

⚠️ **이 과정에서 테스트가 상수를 복제하고 있던 걸 발견했다** — `nowSec() - 14401`이 TTL 확장 순간 "신선" 구간으로 넘어가 **거짓 통과**가 됐다. 이제 `supervisor-guard.sh`에서 `GATE_TTL_SEC`을 파싱해 쓴다. *상수를 문서와 테스트가 각자 베껴 적으면, 값을 바꾸는 날 조용히 어긋난다.*

---

## 📚 학습 포인트

- **fail-open vs fail-closed** — 판정기가 실패했을 때 통과시키는가 막는가. 보안 가드의 기본값은 **막는 쪽**이어야 한다. 이 저장소는 2026-07-13(BL1 P06)에 이미 한 번 fail-closed로 전환했는데, 토큰화 실패 경로가 남아 있었다.
- **파서가 단일 실패점** — 모든 가드가 같은 파서를 쓰면 그 파서가 곧 신뢰 경계다.
- **명령 이름 ≠ 동작** — `sed`는 읽기도 쓰기도 한다. 이름 기반 판정은 오탐과 미탐을 동시에 만든다.
- **테스트가 게이트에 안 물리면 썩는다** — 존재하는데 안 돌아가는 테스트는 없는 것과 같다.
- ⭐ **오탐을 고치면 미탐이 생긴다** — sed를 "무조건 차단"에서 "조건부"로 바꾼 순간 부정 주소·임의 구분자·`e` 명령이 새로 열렸다. 판정을 **넓은 것에서 정밀한 것으로** 바꾸는 변경은 정밀도의 *경계마다* 새 구멍이 난다. 이런 전환에는 조건식 하나가 아니라 **문법 전체의 열거**가 필요하다.
- ⭐ **느린 정규식은 성능 문제가 아니라 보안 결함이다** — 판정기가 멈추면 훅이 타임아웃되고, 훅 타임아웃은 차단이 아니라 **조용한 통과**다. 정규식 대안이 한 글자를 소비하는 방법을 둘 이상 갖게 하지 말 것(`\\.|[^]`가 백슬래시에서 겹쳤다).
- ⭐ **작성자는 자기가 만든 구멍을 "해소 완료"로 읽는다** — 🔴-2는 이 Phase가 직접 연 회귀인데, 작성자 관점에서는 완료 조건의 *"sed 읽기 오탐 해소 ✅"* 로만 보였다. reviewer가 필요한 이유는 능력 차이가 아니라 **위치 차이**다(P06 §③의 근거 재서술과 같은 논지).
- **상수 복제는 값을 바꾸는 날 드러난다** — 테스트가 `14401`을 베껴 적고 있었고, TTL 확장 순간 그 입력이 "신선" 구간으로 넘어가 거짓 통과가 됐다. 계약 상수는 **정본에서 읽어 쓴다**.

---

## ⚠️ 함정

- **세그먼트 좁히기로 오탐을 고치려 하기** — 실제 보안 회귀가 생기고, 게다가 기록된 오탐 표본(`sed … | node -e`)은 같은 세그먼트라 **해소되지도 않는다**.
- **`-i`만 조건에 넣기** — `w` 명령이 새로 뚫린다.
- **ADR-038 개정 없이 OpenGate 완화** — 계약을 어기는 코드 변경이 된다.
- **`.codex/hooks/agentdeck-hook.mjs:343`에 동형 구현이 있다** — CORE-12로 Claude가 못 고치니 P10 인계.

---

## 담당 SubAgent

**메인 직접**(훅 본문 = 하네스, 영호 단독 통제 대행) + **qa**(테스트 작성 — `99.Others/tests` 밖이지만 훅 테스트는 `.claude/hooks/_lib/` 소재라 메인이 직접, TDD 순서만 준수).
