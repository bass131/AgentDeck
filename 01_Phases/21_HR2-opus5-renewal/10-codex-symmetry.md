---
owner: 영호
milestone: HR2
phase: 10
title: Codex 대칭 갱신 (⚠️ Claude 수행 불가 — CORE-12)
status: pending
grade: 복잡
risk: harness
loop_track: human-gate
estimated: 2~4h
domain: cross
summary: .codex 런타임의 경로·계약을 새 이름으로 맞춘다 — 엔진 격리(CORE-12)로 Claude는 손댈 수 없으니 영호 또는 Codex 세션이 수행한다.
---

# Phase 10: Codex 대칭 갱신 (⚠️ Claude 수행 불가)

> **상태**: pending
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

- [ ] `.codex` 계약 테스트 green (`node --test` 또는 Codex 하네스 doctor)
- [ ] `.codex/harness-doctor.mjs` exit 0
- [ ] 새 경로에서 Codex 가드가 **실제로 발화**하는지 프로브(정적 grep 아님 — `riskFlagsFor`가 fail-open이라 grep으로는 못 잡는다)
- [ ] `npm run test` green (`harness-conformance.test.ts`가 Codex 어댑터 conformance를 검사)
- [ ] 수행 주체·일시를 Phase 문서에 기록(Claude가 아님을 명시)

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
