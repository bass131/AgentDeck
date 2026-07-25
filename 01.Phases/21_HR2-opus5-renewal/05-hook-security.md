---
owner: 영호
milestone: HR2
phase: 05
title: 훅 보안 봉합 4건 + sed 오탐 + 게이트 연결
status: pending
grade: 대규모
risk: harness, trust-boundary
loop_track: human-gate
estimated: 5~8h
domain: cross
summary: 실측으로 드러난 봉인 우회 4건(따옴표 fail-open·parse-payload·TTL 하한·git 서브커맨드)을 닫고, 훅 셀프테스트를 회귀 게이트에 연결한다.
---

# Phase 05: 훅 보안 봉합 4건 + sed 오탐 + 게이트 연결

> **상태**: pending
> **마일스톤**: HR2
> **등급**: 대규모 (risk: harness · trust-boundary)
> **담당**: 메인 직접 + qa(테스트)

---

## 🎯 목표

**지금 이 순간 열려 있는 봉인 우회 경로를 닫는다.** 리뉴얼과 무관하게 실측 과정에서 드러난 것들이라, 마일스톤에서 가장 시급한 Phase다.

부수 목표: 훅 셀프테스트가 **어떤 npm 게이트에도 물려 있지 않은** 상태를 해소한다.

---

## ⏪ 사전 조건

- [ ] P01 완료 (ADR-038 개정 — OpenGate 실행/언급 구분은 **방어 범위 축소 = 계약 변경**)
- [ ] OpenGate 개방
- [ ] TDD: 실패 테스트 먼저 (`tdd-guard`가 강제, `.claude/state/tdd-enforce` 존재 확인됨)

---

## 📝 작업 내용

### 우선순위 1 — 따옴표 불균형 fail-open ⚠️ 최우선
- [ ] `shell-policy.mjs:50` — `shellTokens`가 따옴표 불균형 시 `[]` 반환 → sealed 후보 0 → **통과**. 실측 재현: `tee .claude/settings.json # it's fine`(봉인 통과) · `rm -rf build # don't panic`(dangerous-cmd-guard 통과). **bash는 `#` 이후를 주석 처리하므로 명령은 정상 실행된다.**
- [ ] 조치: 셸 주석(`#`) 선처리 + **판정 불가 시 fail-closed**(현재 fail-open)
- [ ] RED 테스트 먼저: 위 두 명령이 차단되는지

### 우선순위 2 — `parse-payload.js` 단일 실패점
- [ ] 전 훅이 공유하는 파서인데 `hook-common.sh:23`의 `eval ''` 경로가 exit 0 = **9종 전면 fail-open**
- [ ] 테스트 0건이고 `hook-exit.test.mjs`의 크래시 주입 대상에서도 빠져 있음 → 크래시 주입 케이스 추가

### 우선순위 3 — OpenGate TTL 하한 + flag의 gitignore 부재
- [ ] `supervisor-guard.sh:35` — 미래 epoch가 flag에 들어가면 age가 음수 → **무기한 개방**. 하한 검사 1줄
- [ ] ⚠️ **`gate-open.flag`가 `.gitignore`에 없다** (실측 2026-07-25: `git check-ignore` 무매치, `git status`에 `??`로 노출). `git add .` 류나 부주의한 스테이징으로 **개방 상태가 저장소에 영구 박제**될 수 있고, 그 커밋을 받은 다른 머신은 창이 열린 채로 시작한다. `.gitignore`에 등재

### 우선순위 4 — git 서브커맨드 우회
- [ ] `git mv|rm|restore|checkout <rev> --|apply|stash pop` · `tar -C` · `unzip -d` · `find -delete`가 전부 `harnessShellWriteReason=null`
- [ ] 최소한 git 서브커맨드의 pathspec을 `classifyHarnessPath`에 통과시킨다
- [ ] ⚠️ 시급성 근거: **P08이 바로 `git mv`를 대량 승인시킨다** — 승인 피로가 곧 우회 키 입력이 된다

### sed 오탐 (적대 검증 PARTIAL — 처방 수정됨)
- [ ] **세그먼트 좁히기는 하지 않는다** — 명령줄 전체 OR 판정이 `F=.claude/x; sed -i s/a/b/ $F`를 잡고 있다(실측). 좁히면 blocked→allowed 회귀
- [ ] ⚠️ **`-i`만 조건으로 하면 새 false negative** — sed는 `-i` 없이도 스크립트 `w` 명령으로 쓴다(`sed -n 's/a/b/w .claude/x'`·`sed '1w .claude/x'`, 둘 다 현재 차단됨). 조건에 `-i`·`-i.bak`·`--in-place[=SUFFIX]`·결합 단축(`-ni`)·**스크립트 본문의 `w`/`W`/`s///w`** 전부 포함
- [ ] 선례 참고: `perl -i`가 `shell-policy.mjs:307-312`에서 이미 인플레이스 조건부. 단 perl은 `runtimeCode` 경로, sed는 `containsDirectWriteCommand` 경로라 **코드 재사용 불가, 새 분기 필요**
- [ ] 변수 우회 회귀 테스트 등재 — 현 방어는 2단 결합(`D=.cl; F=${D}aude/x`)에 이미 뚫려 있고 테스트가 0건이라, 다음 리팩터에서 조용히 재발한다

### OpenGate 실행/언급 구분 (P01의 ADR-038 개정 후에만)
- [ ] `supervisor-guard.sh:70-72`의 부분문자열 매칭 → 실행/언급 구분
- [ ] `98.Management/Harness_OpenGate/README.md:36` + 훅 헤더 주석(`:20-23`) 동반 갱신

### 게이트 연결 ⚠️ 중요
- [ ] `npm run test:hooks` 스크립트 신설 — 훅 테스트가 현재 **어떤 npm 게이트에도 안 물려 있다**(`vitest.config.ts:9` include는 `99.Others/tests/**`뿐, 실행법은 수동 `node --test`뿐). **`package.json`은 봉인 밖이라 수정 가능**
- [ ] 선례: `harness-conformance.test.ts`가 `conformance-check.mjs`를 spawn해 vitest에 물린 방식
- [ ] 무방비 훅 5종(pin-injector·risk-detector·circuit-breaker·reviewer-auto-trigger·convention-size-guard) + `parse-payload.js`·`shell-tokens.js` 테스트 신설
- [ ] ⚠️ OpenGate 회귀는 `.sh` 글루 동작이라 **`hook-exit.test.mjs` 소관**(`shell-policy.test.mjs` 아님)

---

## ✅ 완료 조건

- [ ] **차단 프로브 양방향 실측** (테스트 통과로 갈음 X):
  - `tee .claude/settings.json # it's fine` → **차단**
  - `rm -rf build # don't panic` → **차단**
  - `sed -n '1,5p' .claude/agents/coordinator.md` → **통과**(오탐 해소)
  - `sed -i` + `.claude` 경로 → **차단**(회귀 없음)
  - `sed '1w .claude/x' infile` → **차단**(w 명령)
  - `F=.claude/x; sed -i s/a/b/ $F` → **차단**(변수 우회 회귀 없음)
- [ ] `npm run test:hooks` 존재하고 green (현 baseline 49/49 → 신설 케이스 포함 증가)
- [ ] 훅 9종 중 테스트 0건인 것 = **0개**
- [ ] ⚠️ **reviewer Tier 2-A 1회 — 결함 0** (대상 = `shell-policy.mjs`·`supervisor-guard.sh`·`tdd-guard.sh` diff). 등급 대규모 + trust-boundary라 `grade-and-risk.md:23`상 reviewer 통합이 의무다. 봉인 판정기를 fail-open→fail-closed로 뒤집고 sed 조건 분기를 신설하는데 심판이 없으면 **작성자가 곧 승인자**가 된다
- [ ] `npm run typecheck` 0 · `npm run test` green · `npm run lint` 0
- [ ] TDD 순서 준수(RED 커밋 → GREEN 커밋)

---

## 📚 학습 포인트

- **fail-open vs fail-closed** — 판정기가 실패했을 때 통과시키는가 막는가. 보안 가드의 기본값은 **막는 쪽**이어야 한다. 이 저장소는 2026-07-13(BL1 P06)에 이미 한 번 fail-closed로 전환했는데, 토큰화 실패 경로가 남아 있었다.
- **파서가 단일 실패점** — 모든 가드가 같은 파서를 쓰면 그 파서가 곧 신뢰 경계다.
- **명령 이름 ≠ 동작** — `sed`는 읽기도 쓰기도 한다. 이름 기반 판정은 오탐과 미탐을 동시에 만든다.
- **테스트가 게이트에 안 물리면 썩는다** — 존재하는데 안 돌아가는 테스트는 없는 것과 같다.

---

## ⚠️ 함정

- **세그먼트 좁히기로 오탐을 고치려 하기** — 실제 보안 회귀가 생기고, 게다가 기록된 오탐 표본(`sed … | node -e`)은 같은 세그먼트라 **해소되지도 않는다**.
- **`-i`만 조건에 넣기** — `w` 명령이 새로 뚫린다.
- **ADR-038 개정 없이 OpenGate 완화** — 계약을 어기는 코드 변경이 된다.
- **`.codex/hooks/agentdeck-hook.mjs:343`에 동형 구현이 있다** — CORE-12로 Claude가 못 고치니 P10 인계.

---

## 담당 SubAgent

**메인 직접**(훅 본문 = 하네스, 영호 단독 통제 대행) + **qa**(테스트 작성 — `99.Others/tests` 밖이지만 훅 테스트는 `.claude/hooks/_lib/` 소재라 메인이 직접, TDD 순서만 준수).
