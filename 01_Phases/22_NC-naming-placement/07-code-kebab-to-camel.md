---
owner: 영호
milestone: NC
phase: 07
title: 코드 kebab 13개 → camelCase
status: pending
grade: 대규모
risk: trust-boundary
loop_track: human-gate
estimated: 4~6h
domain: shared-ipc
summary: 02_Source에서 다수파 관례를 이탈한 kebab 파일 13개를 camelCase로 회수한다 — 그중 둘은 IPC 계약의 심장이라 참조가 345파일에 걸쳐 있다.
---

# Phase 07: 코드 kebab 13개 → camelCase

> **상태**: pending
> **마일스톤**: NC
> **등급**: 대규모 (risk: **trust-boundary** — CORE-04 IPC 계약 파일 포함)
> **담당**: `shared-ipc` + `main-process` + `agent-backend` / `reviewer`(Fable 5) 필수 / **브랜치 `chore/nc-naming-code` · PR ②**

---

## 🎯 목표

이 Phase가 끝나면 `02_Source` 의 `.ts` 파일명이 **단일 관례(camelCase)** 로 통일된다. 이것은 새 규칙 도입이 아니라 **다수파 승인 + 이탈자 13개 회수**다.

---

## ⏪ 사전 조건

- [ ] **Phase 03 완료** — `risk-detector.sh:26·:30` 이 `agent-events`·`ipc-contract` 를 **신·구 양쪽으로 인식**해야 한다. 이 Phase에는 창이 없어 훅을 고칠 수 없다
- [ ] **Phase 06 완료** — 봉인층 문서 8줄이 신·구 병기돼 있어야 한다. 이 Phase에는 창이 없어 `.claude/agents|policies|commands/**` 를 고칠 수 없다
- [ ] ⭐ **창 2 폐쇄 후 재봉인 실측 (V1·V2)** — 이 마일스톤의 전제(*"창 안의 green은 방어에 대해 아무것도 말하지 않는다"*)를 **창 2에도 적용**한다. 초안은 창 1에만 적용해 비대칭이었다:
  - `gate-open.flag` **부재**
  - `.claude/settings.json` ≡ `settings.SEALED.json`
  - **개명된 신 경로 1곳에서 canary 발화 프로브 green**
  - ⚠️ 근거: TTL 만료는 **훅 층만** 복귀시키고 permission deny는 열린 채로 둘 수 있다(`supervisor-guard.sh:64-68` HR2 실측). 이걸 확인하지 않으면 **마일스톤이 봉인 열린 채 종결**된다
- [ ] 브랜치 `chore/nc-naming-code` — ⚠️ **PR ① 머지 후 master 에서 딴다**(docs 브랜치에 스택하지 않는다). P06→P07 간선은 **데이터 의존이 아니라 운영 의존**(PR 위생 + Codex 배타 구간)이다
- [ ] ⭐ **Codex 세션 ①에서 스템 병행 수용이 끝났는지 확인** — `agentdeck-hook.mjs:439`·`:441` 이 `agent-events`·`ipc-contract` 문자열에 **직접 의존**하고, 미스하면 **빈 `flags` 를 반환해 경고가 아예 생성되지 않는다**(fail-open 침묵사). 고치지 않으면 `ipcContract.ts` 의 `shared-contract` 와 `agentEvents.ts` 의 `backend-contract` 경고가 **이후 모든 작업에서 영구히** 죽는다. Codex 테스트도 옛 `ipc-contract` 만 단언하므로 **테스트 green이 증거가 되지 못한다**
- [ ] **Codex 세션 ② 예약** — 커밋 전 `agentdeck-review` 교차 리뷰

---

## 📝 작업 내용

### 개명 13개 (Phase 02 매니페스트 = 이름 확정 목록)

| 현재 | 신 | 참조 규모 |
|---|---|---|
| `02_Source/shared/ipc-contract.ts` | `ipcContract.ts` | ⚠️ **196파일** |
| `02_Source/shared/agent-events.ts` | `agentEvents.ts` | ⚠️ **149파일** |
| `02_Source/shared/diff-types.ts` | `diffTypes.ts` | |
| `02_Source/shared/model-effort.ts` | `modelEffort.ts` | |
| `02_Source/main/00_ipc/agent-runs.ts` | `agentRuns.ts` | |
| `02_Source/main/00_ipc/engine-check-update.ts` | `engineCheckUpdate.ts` | |
| `02_Source/main/01_agents/claude-stream.ts` | `claudeStream.ts` | |
| `02_Source/main/01_agents/orchestration-meta.ts` | `orchestrationMeta.ts` | |
| `02_Source/main/01_agents/run-args.ts` | `runArgs.ts` | |
| `02_Source/main/05_settings/merge-slash-commands.ts` | `mergeSlashCommands.ts` | |
| `02_Source/main/backend-status.ts` | `backendStatus.ts` | |
| `02_Source/main/engine-state.ts` | `engineState.ts` | |
| `02_Source/main/engine-versions.ts` | `engineVersions.ts` | |

- [ ] `git mv` 로 13개 개명 (전부 대소문자 이상의 변경이라 `core.ignorecase` 함정에 걸리지 않는다)
- [ ] **import 문 419건 일괄 치환** — `from '.../kebab-name'` → `from '.../camelName'`
- [ ] **파생 테스트 파일도 stem 을 따라간다** — 소스 개명에 종속이며 독립 판정 대상이 아니다

### 손대지 않는 것 (명시)

- [ ] ❌ **`.tsx` 4개는 개명 대상 0개** — export 실측 결과 전부 현행이 원리에 맞다
  - `icons.tsx` = 주인공 없는 아이콘 모음 → 소문자 유지
  - `resizableModal.tsx`·`zoom.tsx` = 주 export가 훅(`useResizableModal`·`useZoom`) → camel 유지
  - `main.tsx` = **export 0, Vite 진입점 계약**(`index.html:15` 하드코딩). 대소문자 전용 개명이라 **Windows에선 dev·typecheck가 green으로 남고 Linux CI에서만 터진다**
- [ ] ❌ 모듈 폴더(`02_Source/{main,preload,renderer,shared}`) — ADR-027·028 명시 제외

---

## ✅ 완료 조건

- [ ] **게이트 G1·G4·G5·G6 green** (정본 = `_milestone-plan.md` 「🧪 회귀 게이트 정본」). G2는 P05 이후 **신 경로**로 실행
- [ ] `git grep -cE "from '[^']*/(ipc-contract|agent-events|diff-types|model-effort|agent-runs|engine-check-update|claude-stream|orchestration-meta|run-args|merge-slash-commands|backend-status|engine-state|engine-versions)'"` **0건** — ⚠️ **import 경로 문맥 한정**(`from '…'`). 산문·주석·로그 메시지의 같은 문자열은 대상이 아니다
- [ ] ⭐ **`risk-detector` 라이브 발화 확인 — 픽스처와 분리한다.** 개명 편집 중 실제 guard 로그에 backend-contract·shared-contract 깃발 기록이 남는지 확인. **픽스처 green ≠ 라이브 발화**(HR2 교훈: 판정은 로그로)
- [ ] **V4 매니페스트 목록 대조** — 13건 **전부** 개명됨. 12건이면 실패다
- [ ] `.tsx` 4개 **미변경** 확인 (`git diff --stat` 에 부재)
- [ ] `reviewer`(Fable 5) 통과 + **Codex `agentdeck-review` 교차 리뷰 회수**

---

## 📚 학습 포인트

- **파일명은 `import` 문에 노출되는 공개 인터페이스다** — C#의 `using System.IO`는 네임스페이스라 파일명과 무관하지만, JS/TS는 **경로가 곧 코드에 박힌다.** 그래서 파일명 선택이 스타일 문제가 아니라 가독성 계약이 된다.
- **PascalCase의 의미** — JS/TS에서 대문자 시작은 *"이건 값이 아니라 타입/클래스/컴포넌트다"* 라는 신호다. 함수 모음을 `Git.ts` 로 두면 잘못된 신호를 준다. (C#은 "public이면 Pascal", JS/TS는 "타입이면 Pascal" — 기준 자체가 다르다.)
- **파생 종속** — 테스트 파일명이 소스 stem을 따라가는 구조에서는, 테스트 451개가 "개명 대상"이 아니라 "소스를 따라가는 것"이다. 이 구분을 못 하면 규모를 20배 과대평가하게 된다.

---

## ⚠️ 함정

- **Phase 03 없이 이 Phase에 들어오는 것** — `risk-detector.sh` 가 `agent-events`·`ipc-contract` 를 **파일명 리터럴**로 매칭한다. 개명만 하면 backend-contract 깃발이 조용히 죽고, **이 Phase에는 창이 없어 훅을 고칠 수 없다.**
- **`.tsx` 를 "일관성"으로 밀어버리는 것** — 특히 `main.tsx`. Windows 파일시스템이 대소문자를 무시해 **이 머신에선 전부 green으로 남고 다른 머신·Linux CI에서만 터진다.** 멀티머신 운용에서 최악의 잠복 결함이다.
- **일괄 치환의 과적중** — `agent-events` 라는 문자열이 import 경로가 아닌 곳(문서 산문·주석·로그 메시지)에도 있다. **경로 리터럴만** 치환한다.
- **`ipcContract`·`agentEvents` 는 CORE-04의 심장** — `trust-boundary` 깃발이므로 `reviewer` 호출이 **무조건**이고, 사람 GO 없이 커밋하지 않는다.

---

## 담당 SubAgent

**`shared-ipc`**(`02_Source/shared` 4건) + **`main-process`**(`02_Source/main` 하위) + **`agent-backend`**(`01_agents` 하위) — 전부 `02_Source/**` 라 도메인 Worker 영역이 맞다.
**`qa`** — 파생 테스트 파일의 stem 개명(`99_Others/tests/**` = qa의 쓰기 범위).
**`reviewer`(Fable 5) 필수** / **Codex `agentdeck-review`** 교차.

> ⚠️ 이 Phase는 **`.claude/**` 를 일절 건드리지 않는다** — 창이 없기도 하고, 필요한 갱신은 P03(훅)·P06(봉인층 문서)이 이미 끝냈어야 한다. 여기서 `.claude/` 를 고쳐야 할 상황이 오면 **그것은 P03·P06이 빠뜨렸다는 신호**이고, 진행이 아니라 보고 대상이다.
