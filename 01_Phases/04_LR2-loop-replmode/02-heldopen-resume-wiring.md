---
owner: 영호
milestone: LR2
phase: 02
title: held-open 경로 resumeSessionId 배선 (옵트인 held-open 재시작 생존)
status: done
grade: 복잡
risk: backend-contract
loop_track: auto-gate
domain: agent-backend
summary: held-open(_runPersistentPump) 경로도 resumeSessionId를 SDK에 전달해, 옵트인 held-open(자율 루프용)이 재시작 시 이전 세션을 복원하도록 배선. sdkOptions.ts:189 resume 매핑을 persistent 경로로 확장.
---

# Phase 04: held-open 경로 resumeSessionId 배선

> **상태**: pending
> **마일스톤**: LR1
> **등급**: 복잡 (backend-contract 깃발 → reviewer 무조건 + 모델 상향 Opus)
> **담당**: coordinator + agent-backend Worker(Opus) + reviewer(무조건)

---

## 🎯 목표

Explore 진단 후보 ②의 근본 처방: `sdkOptions.ts:189`의 resume 매핑이 **단발 경로에만** 적용되던 것을, held-open(`_runPersistentPump`, `claudeAgentRun.ts:533`) 경로에도 적용한다. 옵트인 held-open(자율 루프 /goal·/loop용)이 재시작 시 이전 session_id로 세션을 되살리게. → held-open으로 돌던 자율 루프가 PC 종료에도 이어짐.

---

## ⏪ 사전 조건

- [ ] Phase 02 — session_id 디스크 영속(resume 소스가 유효)
- [ ] Phase 03 — held-open 옵트인화(기본은 resume, held-open은 켤 때만)

### 🚦 착수 go/no-go 게이트 (plan-auditor 권고 B — 이 Phase의 안전 절삭선)
- [ ] **probe 선행** — `resume + persistent` 동시 지정 시 SDK 거동 실측(`/goal`·`/loop` held-open 재수립). **이 probe가 이 Phase의 공식 go/no-go**:
  - **GO**(SDK 지원) → 아래 복잡·backend-contract 본체 진행.
  - **NO-GO**(SDK 미지원) → Phase04를 **"한계 문서화"(단순 등급)로 강등** — backend-contract/reviewer 무조건/Opus 기구를 소비하지 않고, "held-open 재시작은 새 세션, 기본 resume(Phase03)로 커버"를 문서화하고 종료. 이 경우 04는 **백로그로 이월 가능**(02+03+06이 주 가치 전달).

---

## 📝 작업 내용

- [ ] **resume 매핑 확장** — `sdkOptions.ts:189` `...(req.resumeSessionId ? { resume: ... } : {})`가 `persistent:true`일 때도 주입되게 (현재 단발 경로만인지 실측 후 수정).
- [ ] **held-open 시작 시 seed** — `claudeAgentRun.ts:300-306` 분기에서 `_runPersistentPump()` 진입 시 resumeSessionId를 첫 세션 수립에 전달.
- [ ] **AgentBackend 계약 확인** — `AgentBackend.ts:85`(resumeSessionId)·`:87`(persistent)이 동시 지정 가능한 계약인지, 어댑터가 둘 다 처리하는지.
- [ ] **테스트** — held-open 재시작 resume 테스트(`persistent-pump.test.ts` 확장): persistent=true + resumeSessionId 지정 시 SDK에 resume 옵션이 전달됨을 assert.

---

## ✅ 완료 조건

- [ ] held-open + resumeSessionId 동시 지정 시 SDK에 resume 전달 — 테스트 green
- [ ] `npm run typecheck` 0 errors · `npm run test` green · `npm run lint` 0
- [ ] **reviewer GO** (backend-contract 무조건 — 전 어댑터[Claude/Codex] 영향 점검)
- [ ] 옵트인 held-open 자율 루프가 재시작 후 이어짐 (또는 실측으로 SDK 한계 확정 시 문서화)

---

## 📚 학습 포인트

- **backend-contract 경계** — `sdkOptions`/`AgentBackend`는 엔진 추상화 계약(ADR-003). 한 곳 변경이 Claude·Codex 어댑터 전부에 영향 → reviewer 무조건·모델 상향(Opus)의 이유.
- **resume + held-open 양립** — resume은 "죽은 세션 되살림", held-open은 "세션 안 죽임". 둘의 조합 = "재시작 시 held-open을 이전 세션으로 되살려 유지". SDK가 이걸 지원하는지가 실측 포인트.

---

## ⚠️ 함정

- **SDK 미지원 가능성** — resume + persistent 동시가 SDK에서 안 될 수 있음. probe로 먼저 확인, 안 되면 "held-open 재시작은 새 세션"으로 한계 문서화하고 기본 resume로 커버(Phase03이 이미 주 처방).
- **전 어댑터 영향** — Codex 어댑터(stub)도 이 계약을 따라야 함. 계약 변경이 stub 시그니처와 충돌 안 하는지.
- **Phase03과 순서** — held-open이 옵트인화(03)된 뒤라야 이 배선이 "옵트인 held-open 개선"으로 위치. 03 선행.

---

## 담당 SubAgent

**coordinator** + **agent-backend** Worker (**Opus** — 복잡+backend-contract 모델 상향) + **reviewer**(무조건). Phase05와 병렬 가능(도메인 독립).
