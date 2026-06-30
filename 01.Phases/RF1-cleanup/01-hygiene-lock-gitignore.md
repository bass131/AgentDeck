---
owner: 영호
milestone: RF1
phase: 01
title: 런타임 lock 파일 추적 해제 (gitignore)
status: done
grade: 보통
risk: harness
loop_track: auto-gate
estimated: 0.5h
domain: cross
summary: .claude/scheduled_tasks.lock을 .gitignore에 추가하고 git 추적에서 제거 — 매 세션 churn 제거
---

# Phase 01: 런타임 lock 파일 추적 해제 (gitignore)

> **상태**: pending
> **마일스톤**: RF1-cleanup (트랙 A · 위생)
> **등급**: 보통 (1 도메인이지만 `.claude/**` = harness 깃발 → 보통 상향)
> **담당**: 메인 직접 (cross — git + .claude)

---

## 🎯 목표

`.claude/scheduled_tasks.lock`은 `{"sessionId","pid","acquiredAt"}` 런타임 잠금 상태인데 git에 추적돼 **매 세션 변경으로 잡힌다**. 이걸 `.gitignore`에 넣고 추적을 끊어, working tree가 세션마다 더러워지지 않게 한다.

---

## ⏪ 사전 조건

- [ ] 없음 (독립 Phase — 트랙 A 병렬 가능)

---

## 📝 작업 내용

- [ ] `.gitignore`에 `.claude/scheduled_tasks.lock` 추가 (이미 ignored 패턴이 있는지 먼저 확인)
- [ ] `git rm --cached .claude/scheduled_tasks.lock` — 인덱스에서만 제거(파일은 디스크 유지, 추적만 해제)
- [ ] 같은 패턴의 다른 런타임 상태 파일이 `.claude/state/` 등에 추적 중인지 점검 (current-pin.txt는 이미 gitignored 확인)

---

## ✅ 완료 조건

- [ ] `git status`에서 `scheduled_tasks.lock`이 더 이상 안 뜸
- [ ] `git check-ignore .claude/scheduled_tasks.lock` → 매치 확인
- [ ] 파일은 디스크에 그대로 존재(스케줄러 동작 불변)
- [ ] `npm run typecheck` green (거동 영향 없음 확인)

---

## 📚 학습 포인트

- **`git rm --cached`** — 파일을 디스크에서 지우지 않고 git *추적만* 끊는 법. (그냥 `git rm`은 디스크에서도 삭제)
- **런타임 산출물 vs 소스** — pid/세션ID 같은 머신 상태는 절대 버전 관리 X (충돌·노이즈 유발). lock·cache·pid 파일은 항상 gitignore.

---

## ⚠️ 함정

- `git rm` (--cached 빠뜨림) → 디스크에서도 삭제돼 스케줄러가 lock 못 잡음. **반드시 `--cached`**.
- `.claude/**`는 **harness 깃발** — 하네스 변경이라 CHANGELOG 한 줄 + 사용자 인지. 단 이건 위생(권한 변경 아님)이라 auto-gate.

---

## 담당 SubAgent

> 메인 직접 (git 명령 + .gitignore 1줄 — 위임 비용 > 작업 비용)
