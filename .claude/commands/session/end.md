---
description: Phase 완료 마감 절차 — commit + (선택)PR + work-pin 갱신 + CHANGELOG + 다음 액션 결정
---

사용자가 Phase 완료 마감을 요청. 헌법 "Phase 완료 시 세션 마감 권유"의 실행 커맨드.

---

### 이 커맨드의 역할

`-DONE.md` 박제 직후 호출 → commit + (선택)PR + work-pin 갱신 + 다음 액션까지 한 흐름. PR 누락 부담 자동화. work-pin이 단일 핸드오프.

> **루프 마감 경로 (loop-driven)**: 본 커맨드 = 작업 세션([`/session:start`](start.md))의 마감 축. PR 생성/머지는 **버킷 (c) 영호 GO 게이트 보존** ([`pr-and-merge-gate.md`](../../policies/pr-and-merge-gate.md)).

---

### 1. 사전 검증

#### 1-A. `-DONE.md` 박제 존재 확인 (등급별 분기)

| 등급 | -DONE.md | 5단계 보고 |
|---|---|---|
| 단순 | ❌ | ❌ |
| 보통 | ❌ | ❌ |
| 복잡 | ✅ | ✅ MD + HTML |
| 대규모 | ✅ | ✅ (+ 마일스톤 종합) |

**복잡/대규모인 경우만** -DONE.md 강제:
```bash
git status --porcelain | grep -E '\-DONE\.md$'
```
- 없음 → **STOP** (복잡/대규모만): "-DONE.md Write → phase-gate-validator 통과 필요. 단순/보통이면 commit message로 충분."

#### 1-B. 단순/보통 마감
work-pin 갱신 + commit message만으로 마감. 2~7단계 진행 (5단계 보고 스킵).

---

### 2. 다음 액션 방향

```
Phase 마감 진행. 마감 후:
  1. 계속 — 바로 다음 Phase 진입
  2. 종료 — 오늘 작업 끝
```
응답을 `next_action`(continue / stop)에 박음.

---

### 3. Commit 진행

#### 3-A. commit 메시지 초안 (등급별)

**복잡/대규모**:
```
Phase {NN} — {phase-name}: {1줄 요약}

- WORK-ID: {핀에서}
- 등급: {grade}
- 검증: {-DONE.md ✅ 조건 줄임 — typecheck/test/lint}
- 학습: {학습 키워드 줄임}
```
**단순/보통**: conventional commit (`feat:`/`fix:`/`docs:`/`refactor:`/`test:`) — 한 줄 요약 + 변경/검증.

#### 3-B. 미리보기 + 승인
"다음 commit 메시지로 박을게요: [메시지] / 수정 있으면 알려주세요."

#### 3-C. commit 실행
```bash
git add <변경 파일들>
git commit -m "<메시지>"
```

---

### 4. Push + PR 생성 (irreversible 깃발 — 사용자 명시 GO 게이트)

> **헌법 정합**: `git push`·`gh pr create/merge` = irreversible 깃발 ([`pr-and-merge-gate.md`](../../policies/pr-and-merge-gate.md)). AI 자율 진행 X. 모든 단계 *사용자 명시 GO*.

#### 4-A. 브랜치 확인
```bash
git rev-parse --abbrev-ref HEAD
```
- master면 → STOP: "feature/{slug} 브랜치로 옮기세요. git checkout -b feature/{slug}."

#### 4-B. push (GO 후)
```bash
git push -u origin <현재 브랜치>
```

#### 4-C. PR 제목/본문 초안
```
제목: Phase {NN} — {phase-name}: {1줄 요약}
본문:
  ## Summary — {목표 한 줄}
  ## 변경 — {파일 변경 요약}
  ## 검증 — [x] AC 체크박스 (typecheck/test/lint green)
  ## 관련 ADR — ADR-{NNN}
```
**PR body 안전 표현**: 보안 키워드 literal 박지 않기(`--admin`/`--force`/`rm -rf` → "관리자 우회"/"강제 push"/"재귀 삭제" 풀어쓰기).

#### 4-D. PR 생성 게이트 (AskUserQuestion)
AI가 `gh pr create` 호출 *직전* 명시 GO:
```
🚨 PR 생성 = irreversible 깃발
   브랜치: <현재> → master / 제목: <초안>
   진행 OK?  1. 진행  2. 사용자 직접 생성  3. 본문 수정  4. 중단
```

#### 4-E. 머지 게이트 (AskUserQuestion)
> 솔로 = 단독 owner → normal merge(admin 불요). admin bypass 머신은 휴면([`pr-and-merge-gate.md`](../../policies/pr-and-merge-gate.md) §4).

AI가 `gh pr merge` 호출 *직전* 명시 GO (정상 케이스도 게이트):
```
🚨 PR 머지 = irreversible (master history 변경)
   PR: #<번호> / 방식: <merge/squash/rebase>
   진행 OK?  1. 진행  2. 방식 변경  3. 중단
```

---

### 5. CHANGELOG 갱신 검토 (해당 시만)

본 Phase에서 헌법/ADR/하네스/공유 파일 변경 있었나:
```
헌법/ADR/하네스/공유 변경 있었어요? (CLAUDE.md, docs/ADR.md, .claude/, scripts/hooks/, src/shared/)
- 있으면 → .claude/CHANGELOG.md에 한 줄 추가하고 commit ([H]/[M]/[L])
- 없으면 → 스킵
```

---

### 6. 다음 액션 분기

- **continue** → 다음 Phase 진입
- **stop** → 오늘 마감. 다음 세션 `/session:start` → work-pin이 좌표 알려줌

---

### 7. work-pin 최신 확인

work-pin(`.claude/state/current-pin.txt`)이 방금 마감한 상태(완료 Phase + 다음 액션)를 반영하는지 확인. 작업 중 갱신했으면 이미 최신. 안 했으면 "현재 작업/다음 액션"만 갱신 (자동 X — 본인 결정 또는 명시 위임 시 AI).

**핵심**: work-pin이 *유일한* 세션 간 핸드오프 표면 → 마감 시점에 실제 상태 반영해야 다음 `/session:start` drift 게이트 통과. 핀 비대 주의(마감 이력은 CHANGELOG/-DONE.md로).

---

### 8. 마감 보고

```
─────────────────────────────────────────
🎯 Phase 마감 완료
─────────────────────────────────────────
📍 Phase: {NN} — {phase-name}  🏷️ 등급: {grade}
📝 commit: {hash}  🔗 PR: {url 또는 "로컬만"}
📋 work-pin: ✅ 최신  {CHANGELOG 갱신 있었으면: 📋 CHANGELOG 갱신}
➡️ 다음: {next_action 안내}
```

---

### 중요 원칙

- **막히면 STOP** — 그 자리에서 도움 요청, 무리한 추측 X.
- **PR/머지 = 영호 GO 게이트** — AI 자율 X (irreversible).
- **work-pin이 단일 핸드오프** — 마감 시점에 실제 상태 반영.
- 5단계 보고는 복잡 이상 -DONE.md에 박혀있으니 본 커맨드 끝에 별도 X.
