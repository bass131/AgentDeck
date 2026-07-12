---
owner: 영호
milestone: HR1
phase: 05
title: Codex 전담 보조 계약 재정의 — AGENTS.md + 브리지·stash 처분
status: pending
grade: 복잡
risk: irreversible
loop_track: human-gate
estimated: 2~4h
domain: cross
summary: AGENTS.md를 전담 보조(리뷰·진단·rescue) 계약으로 재작성하고, 스킬 브리지를 선별·stash 5종을 폐기한다(영호 재확인 게이트).
---

# Phase 05: Codex 전담 보조 계약 재정의 — AGENTS.md + 브리지·stash 처분

> **상태**: pending · **마일스톤**: HR1 · **등급**: 복잡 + irreversible(stash drop) · **담당**: 메인 직접 + 영호 게이트 2회

---

## 🎯 목표

AGENTS.md가 **전담 보조 계약**이 된다: Sol이 리뷰·진단·rescue를 **직접 수행**하고(Supervisor 전임 폐기), 안전 의미는 코어(P02) 참조. Codex가 풀 드라이버라는 전제의 조항(워커 함대 위임·위임 브리프 5항목·비용 계층 운영론)은 제거된다.

## ⏪ 사전 조건

- [ ] P02 완료 (코어 정본 — AGENTS.md가 참조할 대상)

## 📝 작업 내용

- [ ] AGENTS.md 재작성: ① 역할 선언 = 전담 보조(리뷰·진단·rescue·세컨드 오피니언) ② 안전 규칙 = 코어 참조(§4 중복 서술 제거) ③ Sol 직접 작업 허용 + 비가역 사람 게이트·시크릿·파괴명령 금지 존치 ④ §5 Supervisor 전임·위임 조직론 삭제 ⑤ Claude 하네스 공존 계약(§2)·훅 한계 명문화(§9)는 경량화해 존치
- [ ] ADR-033(Codex Harness 실행 계약) 개정 — 풀 드라이버 전제 철회를 명시 박제: 옛 전제(root Supervisor·역할별 permission profile 5종·Sol/Terra/Luna 비용 계층)가 무엇이었고 왜 철회되는지(전담 보조 전환, 영호 2026-07-12)를 개정 블록에 기록 + 해당 조항 supersede 표기 + 신규 3층 구조 ADR(P02)과 상호 링크. P01 이후 구조면 `00.Documents/adr/`의 개별 파일에서 개정 (plan-auditor 🔴#1 봉합)
- [ ] 스킬 브리지 선별: 8종 → 보조 역할 필요분만 (1차 후보: `agentdeck-review`·`harness-review`. `work-plan`/`work-run`/`session-*`/`refactor-sweep`은 풀 드라이버 전제 → 제거 후보) — **선별안 영호 확인**
- [ ] **stash@{0} 폐기 게이트**: `source-command-*` 5종(449줄) — 본문 복제 포크로 계약 위반 판명(2026-07-12 실측). 목록·근거를 이 문서에 박제했으므로 **영호 최종 재확인 후 `git stash drop`** (비가역 — reflog 한시 복구만 가능)
- [ ] (영호 선택) drop 전 아카이브 export 여부 — `git stash show -p` patch를 `99.Others/_archive/`에 보존 vs 순수 폐기(문서 박제만). 기본 권고 = 순수 폐기(드리프트 제조기 보존 가치 낮음), 복구 불안 시 export (plan-auditor 🟡#6)
- [ ] `.agents/skills/**` 잔여 정리(제거 후보 삭제는 P06 계약 테스트 재작성과 연속 처리)
- [ ] secretary: 커밋 + CHANGELOG [H]

## ✅ 완료 조건

- [ ] AGENTS.md에 Supervisor 전임·위임 브리프 조항 부재, 코어 참조 존재, 비가역 게이트·시크릿·파괴명령 조항 존치
- [ ] 브리지 선별안 영호 승인 + stash 처분 완결(drop 또는 영호 보류 결정 기록)
- [ ] 코어와 AGENTS.md 간 동일 의미 이중 서술 0 (P02 매핑표 대조)
- [ ] ADR-033 개정 블록 존재 — 풀 드라이버 전제 철회·supersede 표기·3층 구조 ADR 상호 링크 (plan-auditor 🔴#1)

## 📚 학습 포인트

- **계약은 사용 시나리오의 그림자** — "무엇을 시킬 것인가"가 바뀌면 계약·권한·검증장치가 전부 따라 바뀐다. 계약을 먼저 고치고(P05) 기계를 맞추는(P06) 순서.

## ⚠️ 함정

- **stash drop은 비가역** — drop 전 stash 내용 5파일 목록·판정 근거가 본 문서와 milestone-plan에 박제돼 있는지 확인. 영호 "GO" 발화 없이 drop 금지.
- **경량화가 안전 게이트까지 걷어내면 안 됨** — push/PR/merge/배포 prompt·시크릿 deny-read·파괴명령 금지는 역할과 무관한 코어 의미.
- P05 문서 변경 시점엔 기존 계약 테스트(8종 정확 일치)가 RED — **P06과 같은 브랜치에서 연속 처리**(중간에 master 머지 금지).

## 담당 SubAgent

메인 직접(하네스 = 영호 단독 통제 대행, 유지보수 창) + secretary(커밋·CHANGELOG)
