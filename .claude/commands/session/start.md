---
description: 새 세션 시작 — git 안전 점검 + work-pin drift 확인 + CHANGELOG 최근 변경 확인
---

사용자가 새 세션을 시작했습니다. 매 시작 시 git 안전 + 작업 좌표(work-pin) 정합을 점검하는 커맨드. (work-pin은 `pin-injector.sh` 훅이 매 입력마다 자동 주입하므로 별도로 읽지 않음.)

> **세션 2종 (loop-driven)**: 본 커맨드 = **작업용(구현) 세션** 진입(루프 구동). 깊은 학습·점검은 짝 커맨드 [`/session:review`](review.md)(pull 세션) — 구현과 학습 분리 ([`loop-driver.md`](../../policies/loop-driver.md) §6).

**중요**: 이 커맨드는 `git pull`보다 **먼저** 호출돼야 합니다. 0단계에서 git 상태를 게이트로 점검하고, 안전 확인 후에만 `git pull` 안내.

---

### 0. Git 안전 점검 (게이트) — 가장 먼저

**왜**: "git pull → /session:start" 순서면 commit 안 한 변경이 있는 상태에서 충돌 → 패닉 → `git reset --hard` 잘못 치면 작업물 증발. 게이트가 그 위험을 사전에 잡음.

```bash
git status --porcelain=v1 --branch
```

판정 — 셋 중 하나:

#### (A) 클리어: feature/chore 브랜치 + uncommitted 변경 없음
→ 짧게 알리고 1단계 진행:
```
Git 상태 클리어 — [브랜치명] / 워킹 디렉토리 깨끗.
아침 첫 호출이면 git pull origin master 받으세요. (이미 받았으면 진행)
```

#### (B) master(main) 브랜치에 있음
→ **1단계 진입 금지**. STOP:
```
⚠️ STOP — master 브랜치에 있어요. 지금 작업하면 협업 룰 위반 + pull 충돌 위험.
  1) 어제 작업 브랜치 있으면 → git checkout {그-브랜치}
  2) 새 작업이면 → git pull origin master → git checkout -b feature/{slug}
해결 후 /session:start 다시 호출해주세요.
```

#### (C) feature/chore 브랜치 + uncommitted 변경 있음
→ STOP + 옵션 안내 (commit / stash / 일부만 분리). **절대 금지**: Claude가 `git reset --hard`·`git checkout .`·`git clean -fd` 자동 실행 X. 사용자가 "버려도 돼"라 해도 한 단계씩 안내만, 실행은 사용자가.

---

### 0-부수. work-pin drift 발견 게이트 — (A) 통과 후만

**왜**: work-pin "현재 작업/다음 액션"이 실제 git 진행 단계와 어긋난 채 박혀있을 수 있음(commit/push/PR 진행 후 갱신 누락). 본 게이트가 시작 시점에 stale 발견.

**핵심 정신**: *발견*만, *갱신은 본인 수동* (Hook is for alert, not action).

```bash
git log -3 --oneline
gh pr list --state all --head $(git branch --show-current) --limit 3
git status -sb
```

work-pin "현재 작업/다음 액션" 키워드 vs 실제 상태 **대략 매칭**:
- "commit 대기" ↔ 최근 commit가 그 작업이면 stale
- "push 대기" ↔ origin과 sync(ahead 0)면 stale
- "PR 생성/머지 대기" ↔ `gh pr list`에 PR 박혀있으면 stale

차이 있으면 STOP + work-pin 갱신 안내(자동 갱신 X). 사용자 명시 위임("drift 봉합해줘") 시 예외.

---

### 1. 작업 좌표 확인 (work-pin)

work-pin은 훅이 *매 입력마다 자동 주입*하므로 별도로 읽지 않음 — 이미 컨텍스트 상단에 있음. 톤은 `CLAUDE.md` "사용자 컨텍스트"(학부생 멘토링 / trade-off / 솔직함) + memory(자동 로드).

---

### 2. CHANGELOG 최근 변경 확인

`.claude/CHANGELOG.md` 최신 3~5줄 빠르게 훑음.

**왜**: 마지막 작업 이후 헌법/ADR/하네스/공유 파일 변경 가능성. 모르고 옛 결정 기반 작업하면 충돌.

**판정**: work-pin "마지막 갱신" 날짜보다 새로운 [H]/[M] 변경 → 명시 안내. [L]만/모두 옛것 → 인지만.

---

### 3. 짧은 인지 확인 응답

work-pin "현재 작업 / 다음 액션" 따라 **짧게** 응답:

```
Git 상태 클리어 — [브랜치명] / [pull 안내 또는 "이미 최신"]

- 현재 작업: [work-pin 현재 작업 한 줄]
- 다음 액션: [work-pin 다음 액션 한 줄]

이대로 [다음 액션 동사] 갈까요? 다른 거 먼저 할 거면 말해주세요.
```

[H]/[M] 변경 있으면 한 섹션 추가하고 "본인 작업과 관련 있나요?" 확인.

---

### 4. 사용자 응답 대기

GO 하면 작업 시작. 다른 거 하고 싶다면 그 방향으로.

---

### 5. 루프 기동 (GO 후) — loop-driven 진입

GO를 받았고 work-pin "현재 Phase"가 정의돼 모호함이 해결된 상태면 — **루프 구동 모드로 진입**한다 (헌법 "운영 모드" / [`loop-driver.md`](../../policies/loop-driver.md)).

- 사용자 GO는 **"방향이 맞나" 1회 확인**용. 그 후엔 매 스텝 "이거 할까요?"를 되묻지 않는다.
- 버킷 (a) 기계 판정은 자율 진행, **(c) 비가역·설계분기·trust-boundary + (b) ui-visual 육안에서만 멈춘다** (work-judge).
- 모호함이 도중 새로 드러나면 1회 확인 — Phase에서 이미 푼 건 재확인 X.
- 여러 Phase가 남았으면 게이트에 닿기 전까지 **연속 진행 후 묶어서 보고**(매 Phase마다 끊지 않음).

---

### 중요

- **0단계 게이트는 우회 금지** — "그냥 진행해"라 해도 (B)/(C)에서 1단계 진입 X. 작업물 유실 위험이 우선.
- work-pin "현재 작업"이 비었거나 오래됐으면(7일+) 재정렬 제안.
- 이 커맨드는 **상태 점검**이지 작업 실행 X. 묻지 않은 코드 변경 금지.
