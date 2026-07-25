---
owner: 영호
milestone: HR2
phase: 03
title: 역할 재편 — 신설 1·축소 1·재정의 1 + 숫자 9→10
status: done
grade: 대규모
risk: harness
loop_track: human-gate
estimated: 5~8h
domain: cross
summary: chief-tech-operator 신설, coordinator를 경계 정합 검증으로 축소, secretary를 컨텍스트 격리 전담으로 재정의하고 역할 개수 하드코딩 8곳을 스윕한다.
---

# Phase 03: 역할 재편 — 신설 1·축소 1·재정의 1

> **상태**: ✅ done (2026-07-25)
> **마일스톤**: HR2
> **등급**: 대규모 (risk: harness)
> **담당**: 메인 직접

---

## 🎯 목표

SubAgent 풀을 9역할 → **10역할**로 재편한다. 끝나면 각 역할의 문서 서술이 **런타임에서 실제로 가능한 일**과 일치한다.

---

## ⏪ 사전 조건

- [ ] P02 완료 (모델 티어 4층 — 새 역할의 model 값이 그 표에 근거)
- [ ] P01 완료 (ADR-010 — 조직론 변경 근거)
- [ ] OpenGate 개방 — ⚠️ `chief-tech-operator.md`는 **신규 Write**인데 `supervisor-guard.sh:61-66`이 Edit·Write **둘 다** 차단한다(`settings.json:48` deny는 Edit만이라 훅이 더 넓다)

---

## 📝 작업 내용

### ① `chief-tech-operator` 신설
- [ ] `.claude/agents/chief-tech-operator.md` 생성 — `model: claude-fable-5` · `effort: xhigh`(P04 프로브 통과 시) · `tools: Read, Glob, Grep, Bash` · `disallowedTools: Edit, Write` · `maxTurns` · `color`
- [ ] `description`에 **PROACTIVELY를 쓰지 않는다** — 발동은 "메인이 제안 → 영호 승인" 혼합 방식(영호 결정). 자동 발화하면 Fable 비용이 새어 나간다.
- [ ] 역할 = 설계 분기 자문(선택지 비교·ADR 초안) + 막힌 문제 진단(에스컬레이션 최종단). 산출물은 **권고**이며 반영은 메인/Worker가 한다(CORE-11 불침범).
- [ ] `coordinator.md:77-98`의 **분해 패턴 카탈로그**(IPC 기능·백엔드 어댑터·3-pane UI의 도메인 순서·의존성)를 여기로 **이관** — 저장소에서 유일한 서술이라 통째 삭제하면 지식이 사라진다.

### ② `coordinator` 축소
- [ ] `tools`에서 `Agent` 반납 + `disallowedTools`에 명시. ⚠️ 권한 회수가 아니라 **이미 죽어 있던 항목의 정리**(실측 #2)
- [ ] `description` 전면 재작성 → "경계 코드 정합 검증(R only)"
- [ ] Hard rule 5(IPC 채널 == shared 계약 == main 핸들러 == preload 노출, AgentEvent 타입, 테스트 정합)만 **존치·승격**. "재위임 1회" → "메인에 보고"로 교체
- [ ] 삭제: 책임범위 5항 중 분해·위임·에스컬레이션 3항(`:12-17`), Hard rules 1~4(`:24-28`), 표준 워크플로 Step 1~2(`:36-53`), Step 4~5 조율·보고 양식(`:60-75`), 에스컬레이션 룰(`:100-106`)
- [ ] `:108-112` "자주 하는 실수"의 **"메인 세션이 직접 분해"는 신 모델에서 정상 동작** — 반전 필요
- [ ] **이름 유지** — `name`은 훅이 `agent_type`으로 받는 값(`supervisor-guard.sh:83`)이라 변경 시 훅 분기가 같이 움직인다
- [ ] ⚠️ **`.codex/harness-contract.test.mjs:131-136`이 red가 된다** → P10으로 인계(CORE-12, Claude 수정 불가)
- [ ] **"메인만 위임자"의 담보 명시** — 현행은 "coordinator만 Agent 보유"가 곧 기계 강제였다. 반납 후엔 **런타임 중첩 OFF**가 그 자리를 대신함을 문서화

### ③ `secretary` 재정의
- [ ] 존재 근거를 "싼 모델로 비용 절감" → **"출력·입력이 큰 작업을 메인 컨텍스트 밖에서 돌리고 결론만 회수"**로 교체 (`secretary.md:3` description + `:8` 본문)
- [ ] ⚠️ **커밋·게이트 소유는 유지** — 빼면 `supervisor-guard.sh:110/115/120` 차단 메시지 3개, `execution-owner.md:30` 판정표 NO행, `CORE.md:90`·`core-manifest.json:49`(CORE-09 conformance)가 전부 고아가 된다
- [ ] `_routing.md:15`의 secretary 근거가 폐기된 "Supervisor 전임"으로 서술됨 → 격리 근거로 교체

### ④ 숫자·잔재 스윕
- [ ] 역할 개수 **9→10**: `subagent-routing.md:1,6,10,169` · `INDEX.md:22` · `loop-driver.md:106` · `harness-review.md:32,55` · `work-plan/SKILL.md:22`
- [ ] **3세대 규범 겹침 해소** — `_routing.md:15,25`·`MAPPING.md:26`의 폐기된 "Supervisor 전임(2026-07-04)" 제거(2026-07-24 잡무 기준 v1이 이미 대체). `work-plan/SKILL.md:47`("Phase 파일은 메인 직접 Write를 supervisor-guard가 차단하므로 secretary 위임")은 훅 주석 `:16`("01.Phases 차단 제거")과 **정면 모순** → 정정
- [ ] `_routing.md:25`의 "Codex secretary=Luna" — `.codex/agents/`엔 reviewer·plan-auditor 2종만 실재(ADR-033) → 정정
- [ ] `loop-driver.md:40` "coordinator SubAgent는 Workflow의 부분 구현" → 대체 서술
- [ ] `_escalation.md` §1·§4·§5·§6 + `subagent-routing.md` §2·§7의 "coordinator가 단독 위임자" 전제 → "메인이 단독 위임자, 런타임이 구조로 강제"

---

## ✅ 완료 조건

- [ ] `.claude/agents/` 파일 수 = **10**, 각 frontmatter에 `model`·`tools`·`disallowedTools`·`maxTurns`·`color` 존재
- [ ] `grep -rn "9개 역할\|9역할\|9종"` in `.claude/**` → **0건**(전부 10으로)
- [ ] `grep -rn "Supervisor 전임"` in `.claude/**` → **0건**
- [ ] `coordinator.md`에 분해·위임 절차 서술 0, 경계 정합 검증 서술 존재
- [ ] `chief-tech-operator.md`에 분해 패턴 카탈로그 3종 이관 완료
- [ ] `npm run typecheck` 0 · `npm run test` green · `npm run lint` 0
- [ ] ⚠️ `.codex` 계약 테스트 red는 **P10 인계 항목으로 명시 기록**(이 Phase에서 green 요구 X)
- [ ] **reviewer 처리** — 등급 대규모지만 내용이 문서 재편·숫자 스윕이라 `review-tiering.md:38`("주석/오타/rename만 → 스킵")에 해당한다. 스킵하되 **그 사유를 `-DONE.md`에 기록**한다(무언의 생략과 구분)

---

## 📚 학습 포인트

- **역할 정의는 런타임 능력을 넘어설 수 없다** — 문서에 "위임한다"고 써도 도구가 없으면 그냥 에러다. 조직론은 실행 가능성 위에서만 성립한다.
- **지식의 행선지** — 문서를 삭제할 때 "이 내용이 여기에만 있는가"를 먼저 묻는다. 분해 패턴 카탈로그가 그 사례다.

---

## ⚠️ 함정

- **secretary에서 커밋 소유를 빼기** — 정리해 보이지만 훅 메시지 3개와 CORE-09 conformance가 고아가 된다. "역할 축소"와 "책임 이관"은 다르다.
- **`.codex` 테스트 red를 이 Phase에서 고치려 하기** — CORE-12 위반. 인계가 정답.
- **`name` 변경** — 실질에 맞추고 싶어도 훅의 `agent_type` 분기가 따라 움직인다.

---

## 담당 SubAgent

**메인 직접**. 전수 grep·치환 심부름은 `secretary` 위임 가능(판단은 메인이 확정한 뒤).

---

## 🧾 실행 기록 (2026-07-25 마감)

### 게이트

| 게이트 | 결과 | 비고 |
|---|---|---|
| `npm run typecheck` | **0** | |
| `npm run test` | **395 파일 / 5,330 passed / 10 skipped** | P02와 동일 — P03은 테스트 추가 없음 |
| `npm run lint` | **0** | |
| `node --test .claude/hooks/_lib/*.test.mjs` | **49/49 pass** | 훅 주석 1줄 수정 후 baseline 유지 확인 |
| `agent-model-canon.test.ts` | **5 passed** | `chief-tech-operator`가 `EXPECTED_MODEL`에 있어 신설 즉시 검사 대상이 됨 |

### 완료 조건 판정 — 2건은 **조건 자체가 부정확**했다

- ✅ `.claude/agents/` 역할 파일 **10개**, 전부 `model`·`tools`·`disallowedTools`·`maxTurns`·`color` **5키 보유**(스크립트로 전수 확인).
- ⚠️ *"`grep "9역할\|9종"` → **0건**"* → **갱신 이력 1건이 남는 것이 정상.** `subagent-routing.md:201`은 *"9역할 → 10역할"* 이라는 **변경 기록**이라 지우면 이력이 사라진다. 조건이 "현행 서술"과 "이력 서술"을 구분하지 않았다.
- ⚠️ *"`grep "Supervisor 전임"` → **0건**"* → **5건이 남는 것이 정상.** `execution-owner.md:7,99` · `subagent-routing.md:178` · `supervisor-guard.sh:12` · `hook-exit.test.mjs:105`는 전부 *"구 Supervisor 전임을 **대체**한다"* 는 **폐기 표기**다. 이걸 지우면 "왜 규범이 바뀌었는가"가 사라지고, 다음 점검이 옛 규범을 새것으로 오인해 되살릴 수 있다 — 이 마일스톤이 치우고 있는 사고가 정확히 그 형태다.
  - ⭐ 다만 **1건은 진짜 잔재였다** — `supervisor-guard.sh:85`의 절 제목이 `── ② Supervisor 전임 — 메인 세션만 ──`으로, **같은 파일 `:12`의 본문(잡무 기준 v1)과 자기모순**이었다. 제목만 옛 이름으로 남아 있던 것. `── ② 실행 경계(잡무 기준 v1) ──`로 정정(주석 1줄, 동작 무변경 — `bash -n` + 훅 테스트 49/49로 확인).
- ✅ `coordinator.md`에 분해·위임 절차 서술 0, 경계 정합 4대조 존재.
- ✅ `chief-tech-operator.md`에 분해 패턴 카탈로그 3종 이관 완료(저장소 유일 서술 보존).

### 계획에 없던 스윕 4건 (전수 grep에서 추가 발견)

계획 ④는 잔재 위치를 열거했는데, 열거가 전수가 아니었다. `coordinator + (분해|위임|escalate)` 패턴으로 전수 스캔해 추가로 잡았다:

`doc-thresholds.md:28`(대규모 상향 시 coordinator 위임) · `main-process.md:55,59` · `qa.md:43,46` · `shared-ipc.md:35,36` · `agent-backend.md:29,41,48,49,53` · `renderer.md:47,48,52` · `plan-auditor.md:38`.

> 📌 **교훈**: Phase 정의에 적힌 파일 목록은 *발견된 것*이지 *전부*가 아니다. 스윕형 작업은 열거를 따라가지 말고 **패턴으로 전수 스캔**한 뒤 열거와 대조한다. (같은 교훈 = 메모리 「UI 롤아웃 노출 지점 전수 열거」)

### P02 인계 4건 — 전부 처리

① `execution-owner.md:50`의 `⚠️(P03 신설 예정)` 주석 제거 ② `subagent-routing.md` 숫자 9→10 ③ **Codex 짝 표기** — 열을 고치는 게 아니라 **삭제**했다(§1 하단에 이유 명시): ADR-033 개정 1이 워커 함대와 Sol/Terra/Luna를 철회해 Codex엔 `main-process` 같은 Worker가 **애초에 없다**. 1:1 짝이 존재하지 않는데 짝 열을 유지하면 계속 거짓을 적게 된다. ④ 메모리 `coordinator-longrun-visibility` — 결정부는 철회 표기, 가시성 습관 2가지는 *모든 장기 위임*으로 일반화해 존치.

### reviewer 스킵 — 사유 명시 (완료 조건 §79)

등급은 대규모지만 변경 실질이 **문서 재편 + 숫자 스윕 + frontmatter 키 추가**이고 실행 코드 변경이 0이다. `review-tiering.md:38`("주석/오타/rename만 → 스킵")에 해당해 **스킵**한다. 대신 기계 심판을 둘 붙였다 — `agent-model-canon.test.ts`(모델 값 고정)와 훅 테스트 49/49. *무언의 생략과 구분하기 위해 여기 남긴다.*

### 🔴 범위 밖 발견 → P05 등재 (고치지 않음)

게이트를 메인에서 돌렸는데 `supervisor-guard.sh:115`("게이트 실행은 secretary에 위임")에 안 걸려서 fail-open을 의심하고 추적한 결과:

1. **통과는 정상이었다** — `supervisor-guard.sh:30-41`의 ③ OpenGate 절이 flag 신선 시 `exit 0`으로 **훅 전체를 통과**시킨다. ADR-038 `:3`이 *"신선하면 전체 통과"* 라고 명시한 **설계 의도**다. fail-open 아님.
2. **그런데 원장 라벨이 소실되고 있었다** — `guard-log.mjs:29`의 `action === 'block' ? 'block' : 'notify'` 가 훅이 넘긴 `open-gate`를 `notify`로 뭉갠다. 결과: `grep open-gate guard-blocks.log` → **0건**, 개방 통과가 notify 2,526건에 섞여 **사후 감사 불가**. ADR-038 `:9`가 위협 모델을 낮춰 잡는 대가로 내세운 *"전량 open-gate로 남아 사후 감사 가능"* 이 성립하지 않는다. **P11 발화 프로브 #3이 현 상태로는 반드시 실패한다.**

→ `05-hook-security.md`에 **우선순위 5**로 등재(원인·조치·회귀 테스트·소급 불가 명시). P03에서 고치지 않은 이유 = 훅 로거 수정은 P05 범위이고, 여기서 손대면 P05의 TDD 순서(RED→GREEN)를 깬다.
