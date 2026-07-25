---
owner: 영호
milestone: RF1
phase: 07
title: src/main 모듈 번호접두 + 문서 갱신
status: done
grade: 대규모
risk: trust-boundary
loop_track: human-gate
estimated: 3h
domain: cross
summary: src/main 내부 모듈(ipc/agents/fs/lsp/persistence/window)을 NN.name 번호접두로 이동 + import + _routing/ARCHITECTURE 문서 갱신
---

# Phase 07: src/main 모듈 번호접두 + 문서 갱신

> **상태**: pending
> **마일스톤**: RF1-cleanup (트랙 B · 구조)
> **등급**: 대규모 (main 전역 import churn + 하네스 문서 동반)
> **담당**: main-process + cross (docs/.claude 부분은 영호 확정)

---

## 🎯 목표

`src/main/` 내부 모듈 폴더를 `NN.<name>` 번호접두로 재구성 (예: `00.ipc/`·`01.agents/`·`02.fs/`·`03.lsp/`·`04.persistence/`·`05.window/`)하고, import + 이를 참조하는 **문서**(`docs/ARCHITECTURE.md` 디렉토리 트리, `.claude/agents/_routing.md` 경로 매핑)를 정합한다.

---

## ⏪ 사전 조건

- [ ] Phase 04 — ADR-027 확정 (`src/main` 포함 범위)

---

## 📝 작업 내용

- [ ] **범위 전수 확정 먼저** — `src/main` 직속에는 예시 6폴더(ipc/agents/fs/lsp/persistence/window) **외에도** `settings/` 폴더 + 직속 .ts 다수(`git.ts`·`multiStore.ts`·`prefs.ts`·`profile.ts`·`usage.ts`·`backend-status.ts`·`engine-*.ts` 등)가 있음. 직속 .ts·`settings/`의 이동/유지 방침을 ADR-027 범위에 맞춰 명시 (예: 직속 .ts는 도메인 폴더로 흡수할지 / 유지할지)
- [ ] `git mv`로 main 하위 모듈 폴더 번호접두 이동
- [ ] `src/main/index.ts` 진입점은 **이동 X** (electron-vite 고정) — 그 *하위 폴더만*
- [ ] main 내부 + preload의 import 경로 일괄 갱신
- [ ] `agents/`(agent-backend 도메인) 이동은 backend-contract 영향 — 신중히, reviewer 무조건
- [ ] **⚠️ hook 패턴 갱신 (결함1 — 영호 확정 harness 편집)**: `.claude/hooks/risk-detector.sh`의 리터럴 `*src/main/ipc/*`는 `ipc/`→`00.ipc/` rename 시 깨져 **trust-boundary 자동검출이 침묵**. 패턴을 `*src/main/*ipc*`(또는 동등)로 확장하거나 `ipc/`만 번호접두 예외. `.claude/hooks/**`=사용자 단독 통제 → 영호 확정.
- [ ] **문서 갱신**: `docs/ARCHITECTURE.md` 디렉토리 트리, `.claude/agents/_routing.md`·각 agent 정의의 경로 표현 (agent R/W 글롭 `src/main/**`는 불변 — 하위 rename 무영향)
- [ ] `.claude/**`·`.claude/hooks/**`·`docs/ARCHITECTURE.md` 변경분은 **영호 확정** (하네스/구조 = 사용자 통제)

---

## ✅ 완료 조건

- [ ] `npm run typecheck` 0 errors
- [ ] `npm run test` green (시작값 대비 비감소) · `npm run build` green
- [ ] 앱 실행 — IPC·에이전트 run·fs·git·lsp 동작 불변 (e2e smoke)
- [ ] **src/main 직속 파일 누락 0** — 이동 후 `src/main` 직속 .ts·`settings/`가 방침대로 처리됐고 미분류 0
- [ ] **trust-boundary 검출 생존 확인** — rename 후 `src/main/00.ipc/` 내 파일 편집 시 risk-detector가 여전히 trust-boundary 발동(hook 패턴 갱신이 유효한지 실증)
- [ ] `_routing.md`·`ARCHITECTURE.md` 경로 표현이 실제 트리와 정합 (깨진 참조 0)
- [ ] **영호 확정** (하네스 문서·hook 변경 = human-gate)

---

## 📚 학습 포인트

- **글롭 패턴의 안정성** — agent R/W가 `src/main/**`라 하위 폴더 rename은 권한 경계 안 깨짐. 와일드카드 설계의 이득.
- **코드-문서 정합** — 구조를 바꾸면 그 구조를 *서술한 문서*도 같이 바꿔야 드리프트 안 생김.

---

## ⚠️ 함정

- `index.ts` 진입점 이동 → 빌드 즉사. 하위 폴더만.
- `agents/` 이동 = backend-contract 깃발 — 어댑터 import 깨지면 전 엔진 영향. reviewer 무조건.
- 문서 갱신 누락 → ARCHITECTURE가 거짓말하는 드리프트. 같은 커밋에.

---

## 담당 SubAgent

> main-process (src/main/** 이동·import) → reviewer(backend 영향) → 영호(문서·하네스 확정).
