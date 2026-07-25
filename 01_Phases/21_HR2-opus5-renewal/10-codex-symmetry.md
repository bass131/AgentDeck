---
owner: 영호
milestone: HR2
phase: 10
title: Codex 대칭 갱신 (⚠️ Claude 수행 불가 — CORE-12)
status: done
grade: 복잡
risk: harness
loop_track: human-gate
estimated: 2~4h
domain: cross
summary: .codex 런타임의 경로·계약을 새 이름으로 맞춘다 — 엔진 격리(CORE-12)로 Claude는 손댈 수 없으니 영호 또는 Codex 세션이 수행한다.
---

# Phase 10: Codex 대칭 갱신 (⚠️ Claude 수행 불가)

> **상태**: **done** (2026-07-25 — 영호가 직접 기동한 Codex 세션이 수행)
> **마일스톤**: HR2
> **등급**: 복잡 (risk: harness)
> **담당**: **영호 또는 Codex 세션** — Claude 수행 시 CORE-12 위반

---

## 🎯 목표

Claude 쪽 하네스가 새 이름으로 옮겨간 만큼 **Codex 쪽 하네스도 같이 옮긴다.** 이 Phase가 빠지면 Claude 쪽만 고쳐지고 **Codex 가드는 조용히 죽은 채** 남는다.

**왜 Claude가 못 하나**: CORE-12(엔진별 Hook 격리) — *"Claude는 `.claude/hooks/**`·`.claude/state/**`만, Codex는 `.codex/hooks/**`·`.codex/state/**`만. 상호 읽기·쓰기·실행 금지, 공유는 정책 의미(코어)뿐."*

---

## ⏪ 사전 조건

- [ ] P08 완료 (새 폴더 이름이 확정돼 있어야 대상이 정해진다)
- [ ] P03 완료 (coordinator `Agent` 반납 — 계약 테스트가 red인 상태)

---

## 📝 작업 내용

### 경로 갱신
- [ ] `.codex/config.toml:43-44` — 샌드박스 write 권한 루트 (`"02.Source" = "write"` · `"99.Others/tests" = "write"`). ⚠️ 안 고치면 Codex가 소스에 쓰지 못하거나, 반대로 잘못된 경로에 권한이 남는다
- [ ] `.codex/hooks/agentdeck-hook.mjs:82,343,384-397,449,631` — 특히 `riskFlagsFor`·`isImplementationPath`는 **fail-open**(매칭 실패 시 깃발 없음 = 통과)
- [ ] `.codex/harness-doctor.mjs:18,246,251,260,262` — canary 경로
- [ ] `.codex/hooks/agentdeck-hook.test.mjs:93-330` — 옛 경로 단언
- [ ] `.codex/README.md:3,20,29`
- [ ] ⚠️ `.codex/agents/reviewer.toml:7` — **Codex reviewer에게 "여기를 읽어라"고 지시하는 살아 있는 경로**. 산문이 아니다

### 계약 테스트 갱신 (P03 인계분)
- [ ] `.codex/harness-contract.test.mjs:131-136` — **"coordinator.md의 tools에 Agent가 있을 것"** 단언. P03이 Agent를 반납하면 red가 된다. 새 체제(메인만 위임자, 런타임 중첩 OFF)를 반영해 단언을 교체하거나 제거
- [ ] `.codex/harness-contract.test.mjs:183` — `/(?:SubAgent )?풀 8/` 옛 숫자 감시 가드. 9→10 전환 후에도 8만 보고 있으면 **다음 드리프트를 못 잡는다**
- [ ] `.codex/harness-contract.test.mjs:230-231` — 옛 경로 단언
- [ ] corpus 목록(`:167-179`)에 신설 역할 문서(`chief-tech-operator.md`)를 넣을지 결정

### 동형 구현 (P05 인계분)
- [ ] `.codex/hooks/agentdeck-hook.mjs:343`의 `harnessShellWriteReason` — Claude 쪽 `shell-policy.mjs`와 동형. P05의 sed `-i`/`w` 조건부와 따옴표 fail-open 봉합을 **대칭 적용**할지 판단

---

## ✅ 완료 조건

- [x] `.codex` 계약 테스트 green (`node --test` 또는 Codex 하네스 doctor) — **30/31 pass**. 유일한 red는 개명과 무관한 CLI 버전 드리프트(§6-4)
- [ ] `.codex/harness-doctor.mjs` exit 0 — **미충족(의도된 발화)**: exit 3 `REVALIDATION_REQUIRED`. ADR-033이 설계한 대로 CLI 버전 불일치를 잡았다 — 버그가 아니라 계약이 일한 것. 해소는 **범위 밖 안건**(§6-4)
- [x] 새 경로에서 Codex 가드가 **실제로 발화**하는지 프로브 — 훅 테스트 green(`agentdeck-hook.test.mjs` 옛 경로 단언 24건이 새 경로로 전환된 채 통과)이 대리 증거. ⚠️ **라이브 발화 프로브는 P11 소관** — 여기서는 봉인이 *해제된* 세션이라 차단 실측이 불가능하다(Claude의 OpenGate 창과 같은 구조적 제약)
- [x] `npm run test` green (`harness-conformance.test.ts`가 Codex 어댑터 conformance를 검사)
- [x] 수행 주체·일시를 Phase 문서에 기록(Claude가 아님을 명시) — §6 머리말

---

## 📚 학습 포인트

- **엔진 격리의 대가** — 두 엔진이 같은 저장소를 쓰면서 서로의 런타임을 못 건드리게 하면 안전하지만, **대칭 갱신이 사람 손을 타는 마디**가 된다. 자동화의 경계가 곧 규율의 경계다.
- **fail-open 가드의 침묵** — `riskFlagsFor`가 경로를 못 알아보면 "위험 없음"으로 판정한다. 에러가 아니라 **무사통과**라 로그에도 안 남는다.

---

## ⚠️ 함정

- **Claude가 대신 고치기** — CORE-12 위반. 편해 보여도 하면 안 된다. Claude는 이 Phase에서 **읽기·보고만**.
- **P10을 생략하고 마일스톤을 닫기** — 개명이 반쪽이 되고, Codex 세션에서 가드 없이 작업하게 된다.
- **계약 테스트를 그냥 지우기** — `:183`의 숫자 가드는 드리프트 감지 장치다. 숫자를 **갱신**해야지 제거하면 다음 드리프트를 놓친다.

---

## 담당 SubAgent

**없음 — 사람(영호) 또는 Codex 세션 직접.** Claude는 대상 목록 제공과 완료 확인만 담당.

---

## 🔬 Codex 1차 위임 결과 — **읽기 전용 진단만 완료, 파일 변경 0건** (2026-07-25)

영호 승인 하에 Codex 서브에이전트에 위임했다(`task-ms0cf54g-d4ln49`). Codex는 첫 쓰기에서 훅 봉인에 막히자 **지시대로 즉시 중단**했다 — 프로필 전환·승격·우회 시도 없음. 그 대신 읽기 전용 실측으로 **이 Phase의 재료를 완성**했다.

### 1. ⭐ 대상은 42건이 아니라 **63건** — 내 grep이 21건을 놓쳤다

| 파일 | 점 표기 | **이스케이프 정규식** | 실제 |
|---|---:|---:|---:|
| `.codex/hooks/agentdeck-hook.test.mjs` | 24 | 0 | 24 |
| `.codex/harness-doctor.mjs` | 7 | 0 | 7 |
| `.codex/README.md` | 3 | 0 | 3 |
| `.codex/hooks/agentdeck-hook.mjs` | 3 | **13** | 16 |
| `.codex/config.toml` | 2 | 0 | 2 |
| `.codex/harness-contract.test.mjs` | 2 | **8** | 10 |
| `.codex/agents/reviewer.toml` | 1 | 0 | 1 |
| **합계** | **42** | **21** | **63** |

**왜 놓쳤나**: 검출 패턴이 `02\.Source`(리터럴 점)였는데 파일에는 `^02\.Source/...` 형태로 **백슬래시가 하나 더** 들어 있다. `02` 다음 문자가 `\`라서 "02+점+Source" 패턴과 어긋난다.
**왜 치명적인가**: 이 21건이 바로 `riskFlagsFor`·`isImplementationPath`의 **경로 판정 정규식 본체**다. Codex 표현대로 *"제외하면 매처가 계속 무력화된다"* — 이 Phase가 막으려는 fail-open 그 자체다.
⇒ *"계획 열거 = 전수 아님"* **4회차**. 이번엔 위임받은 쪽이 잡았다.

✅ **Claude 영역 교차 검사 = 0건**(`grep -rn '00\\.Documents\|…'` 전 소스). P07이 정규식을 `00[._]documents` **문자 클래스**로 바꾼 덕에 이스케이프 형태가 애초에 남지 않았다 — 운이 아니라 설계 효과다.

### 2. ⭐ 계약 테스트 red의 진짜 원인은 coordinator가 아니었다

```
BASELINE: FAIL — codex-baseline.json 읽기 실패
  (ENOENT: open 'C:\Dev\AgentDeck\00.Documents\harness\codex-baseline.json')
✖ .codex\harness-contract.test.mjs (58.5574ms)
ℹ tests 1 / pass 0 / fail 1
```

`harness-doctor.mjs:18`이 **옛 경로**의 baseline을 읽는데 그 파일은 P08에서 `00_Documents/harness/`로 옮겨졌다. 그래서 테스트가 **import 단계에서 죽어** 개별 test까지 도달하지 못한다.
⇒ 예상했던 coordinator `Agent` red(`:132`)는 **그 뒤에 가려져 있었다.** 두 개가 동시에 걸려 있고, baseline이 먼저다.

### 3. 계약 테스트 대안 (Codex 제안 — 채택)

```js
test('Claude 전 역할은 Agent 도구를 명시 차단해 재귀 위임을 이중 잠금한다', () => {
  const roles = fs.readdirSync(path.join(ROOT, '.claude', 'agents'))
    .filter((name) => name.endsWith('.md') && !name.startsWith('_')).sort()
  assert.equal(roles.length, 10, 'Claude 역할 수')
  for (const role of roles) {
    assert.match(read(`.claude/agents/${role}`), /^disallowedTools:.*\bAgent\b/m, role)
  }
  assert.match(read('.claude/agents/_routing.md'), /중첩 OFF[\s\S]*disallowedTools: Agent/)
})
```

폐기된 *"coordinator만 `tools: Agent` 보유"* 대신 **10개 역할 전부의 `disallowedTools: Agent`** + `_routing.md`의 런타임 중첩 OFF 이중 잠금을 검사한다. 테스트의 **의도**(재귀 위임 차단 보장)는 살리고 **수단**만 새 계약(ADR-010 개정 1)에 맞춘 형태다. 읽기 전용 실측으로 10/10 선언 확인됨.

- **`:103`** — Codex용 `AGENTS.md`에 폐기된 풀 드라이버 역할명이 재유입되지 않았는지 검사. 개명·재귀 계약과 무관하고 현 정본과 일치 → **수정 대상 아님**(Codex 판단, 타당).
- **`:183`** — `풀 8` 금지 가드는 유지하되, 현 정본의 `SubAgent 풀 분해 적정성 (10개 적정한가)` 문구를 **적극 검증**하는 단언을 추가 제안.

### 4. 차단 지점 — sandbox가 아니라 **훅 봉인**이었다

```
활성 프로필: agentdeck-assistant (config.toml root 기본)
시도: apply_patch — .codex/hooks/agentdeck-hook.test.mjs + harness-contract.test.mjs (원자 패치)
차단: Command blocked by PreToolUse hook:
      AgentDeck guard 차단: 하네스 파일 '.codex/hooks/agentdeck-hook.test.mjs'은
      사용자 단독 통제 영역입니다.
```

즉 `config.toml`의 write-root(옛 폴더명)보다 **한 층 위에서** Codex 자신의 훅이 막았다. Claude의 `supervisor-guard` ①과 대칭이다.

**해제는 2층**(`AGENTS.md:50`):
```
AGENTDECK_HARNESS_MAINTENANCE=1                     ← 훅 봉인만 해제
codex -c default_permissions=":danger-full-access"  ← 쓰기 권한(별도 필요)
```
문서가 *"환경 변수는 훅 봉인만 해제할 뿐 쓰기 권한을 주지 않으므로 권한 전환이 별도로 필요"* 라고 명시하고, 조건은 ***"사용자가 승인한 세션만"***.

⇒ **영호 결정(2026-07-25): 영호가 직접 Codex 세션을 기동한다.** Claude의 OpenGate가 "영호 단독 실행"인 것과 대칭이며, `:danger-full-access`를 에이전트가 자동으로 켜지 않는다는 원칙을 지킨다.

### 5. 부트스트랩 자물쇠 — 이 Phase의 구조적 성질

이 Phase는 **3중 순환**이다:
1. `.codex/**`를 고치려면 → 훅 봉인 해제 필요(env)
2. 쓰기 권한이 필요한데 → `config.toml`의 write-root가 **옛 폴더명**이라 무효, 그런데 그 파일을 고치는 게 이 작업
3. `.codex/` 자체에 write를 주는 프로필이 **어디에도 없다**

Claude 쪽 P07의 `GATE_FLAG` 자물쇠와 같은 형태이고, 마찬가지로 **코드가 아니라 순서(사람 개입)로만** 풀린다.

---

## ✅ 최종 수행 결과 — **영호가 직접 기동한 Codex 세션** (2026-07-25)

**수행 주체**: 영호 (PowerShell에서 `AGENTDECK_HARNESS_MAINTENANCE=1` + `codex -c default_permissions=":danger-full-access"` 직접 기동)
**Claude의 역할**: 브리프 작성 · 결과 검증 · 커밋 · 문서 마감. **`.codex/**` 파일은 한 줄도 쓰지 않았다**(CORE-12 준수).

변경 파일 8개: `README.md` · `agents/reviewer.toml` · `config.toml` · `harness-contract.test.mjs` · `harness-doctor.mjs` · `hooks.json` · `hooks/agentdeck-hook.mjs` · `hooks/agentdeck-hook.test.mjs`.

### 1. 치환 실적 — 63건 예측 **일치**

Codex가 두 형태(점 표기 · 이스케이프 정규식)를 모두 훑어 §1의 파일별 건수와 정확히 일치했다. 실제로 바뀐 **문자열 토큰은 65개** — `README.md` 한 줄에 옛 경로가 2개, contract canary 한 줄에도 2번 나오기 때문이다(건수 ≠ 토큰 수).

**Claude 교차 검증**(P10 마감 시점):

| 검사 | 결과 |
|---|---|
| 옛 경로 잔존 — 점 표기 `00\.Documents` 외 4종 | **0건** |
| 옛 경로 잔존 — 이스케이프 `00\\\.Documents` 외 4종 | **0건** |
| 의미 손상 — `(새이름).{0,14}(→\|->\|옛\|이전\|리네임\|개명)` | **0건** |
| fail-open 매처 본체 육안 — `riskFlagsFor`(384-389) · `isImplementationPath`(395-397) · `htmlTarget`(631) · 테스트 루트(449) · TDD deny 메시지(588) | **전부 새 경로** |

⇒ 이 Phase가 막으려던 침묵의 실패(경로 매칭 실패 → `'unrelated'` → 무사통과)가 실제로 봉합됐다.

### 2. ⭐ Codex가 브리프에 없던 것을 하나 잡았다 — `hooks.json` SHA-256 8곳

훅 본문(`agentdeck-hook.mjs`)을 고치면 그 파일의 SHA-256이 바뀐다. `hooks.json`은 그 해시를 **캐시버스터로 명령줄에 박아두는데**, 갱신하지 않으면 digest 불일치로 훅이 **신뢰되지 않은 상태**가 된다. Codex가 이를 스스로 인지해 8곳을 `2f18cb…acb433`으로 맞췄다.

⚠️ 이건 브리프에 없던 항목이다. 놓쳤다면 **경로는 다 고쳤는데 훅 자체가 안 도는** 상태 — 가장 나쁜 종류의 반쪽 수정이 됐을 자리다. 계약 테스트에 `Hook command definition은 현재 script SHA-256을 cachebuster로 포함한다`(`:141`)가 있어서 red로 잡혔을 것이나, **테스트가 없었다면 조용히 죽었다.**

### 3. 계약 테스트 — 새 계약이 옛 계약보다 **강해졌다**

| 항목 | 처리 |
|---|---|
| `:132` coordinator `Agent` 보유 단언 | **폐기 → 대안 채택**(§3). ADR-010 개정 1 반영 |
| `:186` `풀 8` 금지 가드 | **유지** + `SubAgent 풀 분해 적정성 (10개 적정한가)` 적극 단언 **추가** |
| `:103` AGENTS.md 폐기 역할명 검사 | **수정 안 함** (Claude 판단에 Codex 동의 — 개명·재귀 계약과 무관) |
| `:85-87` rescue write-root · `:94` CORE.md 참조 · `:235-236` canary 경로 | 새 경로로 갱신 |

⭐ **옛 `:132`는 역할 5개를 손으로 나열**했다(`main-process`·`agent-backend`·`renderer`·`shared-ipc`·`qa`). 새 것은 `fs.readdirSync`로 **디렉토리를 동적 열거**하고 `roles.length === 10`까지 단언한다. 역할이 하나 늘어도 옛 테스트는 조용히 통과했겠지만, 새 테스트는 **red를 낸다.** 계약이 문서가 아니라 **파일 시스템에 붙었다**는 뜻이다.

### 4. ⚠️ 미해소 1건 — `REVALIDATION_REQUIRED`는 **버그가 아니라 계약이 일한 것**

```
✖ harness doctor --live는 3축(훅 가드·읽기 경계·쓰기 경계)을 정직하게 보고한다
  OS-READ-BOUNDARY: REVALIDATION_REQUIRED — codex-cli 0.145.0 ≠ baseline 0.144.1
  3 !== 0  (at .codex/harness-contract.test.mjs:213:10)

ℹ tests 31 / pass 30 / fail 1
```

**성격 판정 — 이 red는 P10이 만들지 않았다.**

| 근거 | 내용 |
|---|---|
| 원인 | `codex-cli`가 0.144.1 → **0.145.0**으로 올라갔다. 개명과 무관한 **환경 드리프트** |
| 설계 의도 | ADR-033:30 — *"UNENFORCED 판정은 baseline 튜플(cli·platform·rootProfile)에 묶이고, CLI 버전 불일치 시 **결과가 같아도** exit 3"*. **읽기 deny가 강제되기 시작하는 *좋은 방향*의 드리프트도 계약 재검토를 강제**하는 장치다 |
| 전례 | **2회차 발화**다. 1회차 = 2026-07-13 도입 당일 0.144.0 → 0.144.1 패치 업그레이드(ADR-033 재실측 이력) |

**해소에 필요한 것**(ADR-033의 attended 절차 — `codex-baseline.json:$comment`):
1. 격리 canary로 **읽기 deny 실태 재실측** ← Codex의 `harness-doctor.mjs --live` 소관
2. `00_Documents/harness/codex-baseline.json` 갱신 ← Claude 영역, **봉인 해제 불필요**
3. ADR-033 재실측 이력에 한 줄 ← Claude 영역

⇒ 2·3은 Claude가 지금 할 수 있지만 **1이 선행 조건**이고, 그건 Codex 세션 재기동을 요구한다. **HR2 범위 밖 별개 안건으로 백로그 등재**(영호 판단 대기). Codex도 같은 이유로 *"둘 다 이번 `.codex/**` 전용 범위 밖이라 건드리지 않았어"* 라고 정직하게 보고했다.

### 5. Codex가 남긴 미이행 2건 → **Claude가 대행 / 영호 몫**

| 항목 | Codex의 사유 | 처리 |
|---|---|---|
| CHANGELOG 기록 | *"CORE-11의 CHANGELOG 기록은 `.claude/**` 수정 금지와 충돌"* | ✅ **Claude가 대행**(이 Phase 커밋에 포함) |
| `/hooks` 재검토·재신뢰 | 훅 digest가 바뀌었으므로 신뢰된 새 세션 필요 | ⏸ **영호 몫** — P11 마감 절차에 포함 |

Codex의 자기 보고 3건도 Claude가 확인했다: canary 파일 잔존 0건 · `.claude/settings.json`의 기존 사용자 변경 보존(OpenGate 개방판 그대로) · 커밋·스테이징·push 미실행.

### 6. 학습

- **CORE-12는 "못 하게 하는 규칙"이 아니라 "누가 하는지 정하는 규칙"이었다.** Claude가 `.codex/**`를 못 고친다는 제약은 작업을 막지 않았다 — **브리프를 정확히 쓰는 일**로 형태가 바뀌었을 뿐이다. 그리고 그 브리프가 부정확했을 때(42건), 위임받은 쪽이 바로잡았다(63건). 격리는 비용이지만 **교차 검증의 기회**이기도 하다.
- **위임의 품질은 브리프의 정확도에 비례하지 않는다 — 넘어서기도 한다.** Codex는 브리프에 없던 `hooks.json` digest를 스스로 잡았다. *"시킨 것만 하는 실행기"* 로 대하면 이런 발견이 안 나온다. 브리프에 **왜 하는지**(fail-open이 침묵한다)를 적은 것이 범위 밖 추론을 가능하게 했다.
- **red를 "고쳐야 할 것"과 "일한 것"으로 갈라야 한다.** `REVALIDATION_REQUIRED`는 green으로 만들고 싶은 충동이 강하게 드는 red다. 하지만 baseline을 무작정 0.145.0으로 덮어쓰는 건 **재실측 없이 계약을 통과시키는 것** — ADR-033이 정확히 막으려던 행위다. 게이트를 green으로 만드는 가장 빠른 길이 게이트를 무력화하는 길과 같을 때가 있다.
