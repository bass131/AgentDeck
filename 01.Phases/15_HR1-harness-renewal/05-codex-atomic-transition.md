---
owner: 영호
milestone: HR1
phase: 05
title: Codex 전담 보조 원자 전환 — 계약·기계장치·최소권한 프로필
status: done
grade: 대규모
risk: irreversible
loop_track: human-gate
estimated: 5~8h
domain: cross
summary: AGENTS.md 계약 재정의부터 TOML·doctor·계약테스트 축소까지 Codex 레이어 전환을 단일 green 커밋으로 원자 처리한다 (구 P05+P06 합병 — Sol 리뷰 반영).
---

# Phase 05: Codex 전담 보조 원자 전환 — 계약·기계장치·최소권한 프로필

> **상태**: pending · **마일스톤**: HR1 · **등급**: 대규모 + irreversible(stash drop) · **담당**: 메인 직접 + 영호 게이트 2회
> **재편 이력**: 구 P05(계약 재정의)+P06(기계장치 경량화) 합병 — Codex adversarial review [high]#3 "P05는 계약 테스트가 깨진 상태를 커밋하도록 설계됨" 반영. **어떤 중단 지점에서도 커밋된 하네스는 green**이 본 Phase의 제1 원칙.

---

## 🎯 목표

Codex 레이어 전체(AGENTS.md·브리지·TOML·doctor·계약 테스트)가 **단일 green 커밋**으로 전담 보조 계약으로 전환된다. Sol이 리뷰·진단·rescue를 직접 수행하되, 시크릿·범위 밖 쓰기는 **문서가 아니라 기계(최소권한 프로필 + negative canary)가 차단**한다.

## ⏪ 사전 조건

- [ ] P02 완료 (코어 정본 + 매핑표)
- [ ] 유지보수 창 개방 (`AGENTS.md`·`.codex/**`·`.agents/skills/**` = 봉인 대상)

## 📝 작업 내용

### A. 계약 (문서)
- [ ] AGENTS.md 재작성: ① 역할 = 전담 보조(리뷰·진단·rescue·세컨드 오피니언) ② 안전 규칙 = 코어 참조 ③ Sol 직접 작업 허용 + 비가역 사람 게이트·시크릿·파괴명령 금지 존치 ④ Supervisor 전임·위임 조직론 삭제 ⑤ 공존 계약(§2)·훅 한계(§9) 경량 존치
- [ ] ADR-033(Codex Harness 실행 계약) 개정 — 풀 드라이버 전제 철회를 명시 박제: 옛 전제(root Supervisor·역할별 profile 5종·Sol/Terra/Luna 비용 계층)와 철회 사유(전담 보조 전환, 영호 2026-07-12) + supersede 표기 + 신규 3층 구조 ADR(P02) 상호 링크 (plan-auditor 🔴#1)

### B. 최소권한 프로필 (Sol adversarial [high]#1)
- [ ] `agentdeck-assistant`(가칭) 최소권한 프로필 신설: `:read-only` 기반 + `.env*`/`secrets/**` deny + `:tmpdir` write — **root 기본 실행에 적용 검토**. 현행 `:danger-full-access` 루트는 시크릿 deny를 프로필로 강제받지 않는 구조적 공백(deny 규칙이 위임 프로필에만 존재)
- [ ] review/diagnose/rescue별 허용 쓰기 범위 정의 (rescue가 코드 수정까지 하면 그 쓰기 범위를 명시적으로)
- [ ] Windows sandbox 마찰 실측 후 결정: 초기화 실패로 최소권한 루트가 불가능하면 **폴백 = full-access 유지 + 그 사실과 보상 통제(execpolicy·훅·사람 게이트)를 ADR-033 개정 블록에 명시 기록** — 침묵 유지 금지

### C. stash 처분 (Sol adversarial [high]#2 — OID 고정)
- [ ] **대상 앵커(2026-07-12 박제)**: stash 커밋 OID `99704c1bce265280b0ea36f8636aa92cfb4d4926` — source-command-* 브리지 5파일(harness 50 · review 41 · session-end 174 · session-review 57 · session-start 127 = 449줄, 전부 untracked 신규)
- [ ] drop 직전 재검증: `git rev-parse stash@{N}`이 위 OID와 **정확 일치**할 때만 진행 — 위치 참조(`stash@{0}`)는 신뢰하지 않음(stash 번호는 생성·삭제로 이동)
- [ ] 복구점 생성 후 처분: `git stash show -u -p` patch를 `99.Others/_archive/`로 export(또는 영호 선택 시 순수 폐기 — 문서 박제만) → OID 확인된 selector로 `git stash drop` — **영호 최종 GO(비가역)**

### D. 기계장치 (구 P06)
- [ ] `.codex/agents/*.toml` 정리: 보조 역할 프로필만 잔존, 워커 5종·coordinator 등 풀 드라이버 전제 프로필 제거
- [ ] `harness-doctor.mjs` 축소 — 단, **live negative canary는 유지·강화**: ① 시크릿(`.env*`/`secrets/**`) 읽기 실차단 ② 허용 범위 밖 쓰기 실차단 (Sol adversarial #1 권고 — 축소 대상은 조직론 canary, 안전 canary가 아님)
- [ ] `harness-contract.test.mjs` 재작성: 새 계약 반영 + **안전 게이트 검사 존치**(execpolicy prompt/forbidden·시크릿 deny·파괴명령) (참고: H1 기록 "38 pass"는 node --test 서브테스트 카운트 — 완료 기준은 개수가 아니라 RED 0)
- [ ] `.agents/skills/**` 브리지 선별 반영: 8종 → 보조 역할 필요분만(1차 후보 `agentdeck-review`·`harness-review`) — **선별안 영호 확인**
- [ ] hooks.json 정의 변경 시 SHA-256 cachebuster 갱신 (재신뢰는 Codex 새 세션에서)

### E. 원자 커밋
- [ ] **A~D 전체를 단일 커밋으로**: 커밋 직전 `node --test`(새 계약) + `doctor --live` green 필수. **RED 상태의 중간 커밋 금지** — 작업이 길어지면 워킹트리 유지(필요 시 patch 백업), rollback = 이 단일 커밋 revert 한 번 (단, stash drop은 커밋 밖 비가역 — 복원은 C의 아카이브 patch로만. plan-auditor v2 🟡#4)

## ✅ 완료 조건

- [ ] AGENTS.md: Supervisor 전임·위임 브리프 조항 부재 + 코어 참조 존재 + 비가역 게이트·시크릿·파괴명령 존치
- [ ] ADR-033 개정 블록 존재(전제 철회·supersede·3층 ADR 상호 링크) (plan-auditor 🔴#1)
- [ ] `node --test .codex/harness-contract.test.mjs` green + `node .codex/harness-doctor.mjs --live` PASS — **커밋 시점 기준, RED 중간 커밋 0**
- [ ] negative canary 2종 PASS: 시크릿 읽기 차단 + 범위 밖 쓰기 차단 (Sol adversarial #1)
- [ ] stash 처분 완결: drop 전 OID 일치 검증 기록 + 복구점 여부 영호 결정 기록 (Sol adversarial #2)
- [ ] Codex 라이브 스모크 1회(영호 attended): 잔존 스킬 발화 + 파괴명령 차단 프로브
- [ ] 코어↔AGENTS.md 동일 의미 이중 서술 0 (P02 매핑표 대조)
- [ ] P05 산출 검증 지점(negative canary·재작성 계약 테스트)이 `core-manifest.json` 선언 경로/식별자와 일치 (plan-auditor v2 🟡#1)

## 📚 학습 포인트

- **원자성(atomicity)은 브랜치가 아니라 커밋 단위** — "같은 브랜치에서 연속 처리"는 세션 중단·충돌 앞에서 아무것도 보장하지 않는다. 중간 상태가 존재할 수 없게 만드는 것이 원자 전환.
- **가변 참조 vs 불변 앵커** — `stash@{0}`은 이름이 가리키는 대상이 바뀌는 가변 참조, OID는 내용이 정하는 불변 앵커. 비가역 작업의 대상 지정은 항상 불변 앵커로.
- **최소권한 원칙(principle of least privilege)** — 규칙(문서)과 강제(기계)는 다르다. deny가 프로필에만 있고 루트가 프로필 밖이면 강제는 없는 것.

## ⚠️ 함정

- **stash drop은 영호 "GO" 발화 없이 실행 금지** — OID 검증 통과여도 사람 게이트가 우선.
- **경량화가 안전 게이트를 걷어내면 안 됨** — 축소 대상은 조직론(워커 프로필 수·조직 canary), 안전 의미(execpolicy·시크릿·파괴명령·negative canary)가 아님.
- Codex 훅 정의 hash 변경 → 재신뢰 전까지 조용히 no-op — 라이브 스모크 전 `/hooks` 재신뢰 필수.
- doctor 축소 시 Windows sandbox EPERM 우회(단일 cmd.exe canary — H1 학습)를 회귀시키지 말 것.
- 작업 범위가 크므로 유지보수 창이 열린 채 오래 감 — 창 개방 중 다른 작업 병행 금지(봉인 해제 표면 최소화).

## 담당 SubAgent

메인 직접(하네스 = 영호 단독 통제 대행, 유지보수 창) + secretary(단일 커밋·CHANGELOG) — 영호 게이트 2회(브리지 선별안 · stash drop GO)
