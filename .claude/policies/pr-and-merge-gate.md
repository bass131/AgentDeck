# PR/머지 게이트 + admin bypass 예외 경로

> **헌법 참조**: 본 정책은 헌법(`../../CLAUDE.md`) "확신이 없을 때 / PR 게이트" 절에서 링크됩니다.
> 충돌 시 헌법이 이깁니다.

> **강제 출처 범례** (HR2 P06, 2026-07-25) — 규칙 옆 라벨은 **무엇이 그 규칙을 지키게 하는가**를 뜻합니다.
> `[기계: X]` = X가 **차단**한다(훅 `exit 2` 또는 `permissions`의 deny/ask) ·
> `[알림: X]` = X가 **환기만** 한다(advisory `exit 0` — 무시해도 그대로 진행된다) ·
> `[문서 규범]` = 훅에도 `permissions`에도 **없다**.
> ⚠️ `[문서 규범]`은 "기계가 안 받쳐주니 지워도 되는 문구"가 아니라 **그것이 유일한 방어선**이라는 뜻입니다.
> 전수 지도·판정 근거 = [`06-enforcement-labeling.md`](../../01_Phases/21_HR2-opus5-renewal/06-enforcement-labeling.md).

본 문서는 PR 생성 + 머지를 *비가역(irreversible) 깃발*로 정의하고, **사용자 명시 GO 게이트**를 의무화하며, 정상 경로가 막힐 때의 **합법 우회 경로 = admin bypass 예외 경로**를 박습니다.

> **💤 솔로 운영 정합 (휴면 배너)**: AgentDeck은 영호 + AI 솔로. CODEOWNERS가 단독 owner면 단독 owner PR은 *code-owner 리뷰가 스킵*되어 **normal merge로 통과**(admin 불요). 따라서 본 문서의 *CODEOWNERS 거절 → admin bypass* 머신 + "다른 팀원 ack 대기" 정상경로는 **현재 휴면(dormant)**입니다. **단, push/PR/머지 = 영호 명시 GO 게이트(§2~3)는 그대로 유효** — 휴면은 *CODEOWNERS 분기*에 한함. admin bypass 예외 경로(§4)는 미래 팀 재구성 시 부활(삭제하지 않고 보존).

---

## 1. 왜 게이트가 필요한가 — 세 안전망 동시 사고 학습

세 안전망(CODEOWNERS / hook / classifier)이 각자 *옳게* 작동해도, *합법 우회 경로*가 정책으로 박혀있지 않으면 (1) admin bypass가 *언제* 정당한지 / (2) 사용자 GO가 *어떻게* 표명되는지 / (3) 사유가 *어디에* 박히는지 모호해집니다. 본 정책으로 박음. (원천 학습: 세 안전망 동시 통과 머지 사고에서 "어떻게 정당했는지" 박힌 자산이 0이었던 전례.)

---

## 2. PR 생성/머지 = irreversible 깃발

[`grade-and-risk.md`](grade-and-risk.md) "irreversible" 깃발에 다음 포함:

- `gh pr create` — 외부 publication (PR body가 GitHub에 박힘)
- `gh pr merge` — 비가역 (main history 변경)
- `git push` / `npm run package` / `npm publish` — 외부 반영·릴리스

> **강제 출처** `[기계: dangerous-cmd-guard 축② + settings ask 6줄]` — 2층이다(2026-07-26 개정 v2 · 2026-07-29 개정 v3, CORE-06).
>
> **1층 = 훅**(`.claude/hooks/dangerous-cmd-guard.sh` → `shell-policy.mjs` `irreversible` 모드). 위 명령을 에이전트가 부르면 **실행 직전 사람 승인 다이얼로그를 강제**한다(exit 0 + `permissionDecision: "ask"` — CORE-06 v3). 영호가 거부하면 실행되지 않고, ask JSON 생성이 실패하면 구 v2 semantics(exit 2 차단)로 폴백한다(fail-closed). 구 v2(2026-07-26~29)는 항상 exit 2 차단 + 영호 `! <명령>` 직접 실행이었다 — 완화 근거·전제 해소 기록 = CORE.md CORE-06 v3 개정 블록. 판정은 토큰 구조로 하므로 `git -C . push`·`env git push`·`x && git push`·`cmd /c git push` 같은 우회 변형도 따라간다.
>
> **2층 = `permissions.ask` 6줄**(`Bash(git push*)`·`Bash(gh pr create*)`·`Bash(gh pr merge*)`·`Bash(gh release*)`·`Bash(npm run package*)`·`Bash(npm publish*)`). 훅이 먼저 자르므로 평소엔 발화하지 않지만, **훅이 죽었을 때 받는 층**이라 존치한다 — "안 쓰이니 정리하자"의 대상이 아니다.
>
> ⚠️ **왜 2층이 됐나**: 옛 문장은 `ask` 6줄을 *"사람 게이트가 기계로 받쳐지는 유일한 지점"* 이라 적었는데, 그 유일한 층이 **세션 권한 모드 하나로 통째로 죽는다**는 것이 실측됐다(2026-07-26 `git push` 2회 연속 무프롬프트). 같은 모드에서 CORE-11(봉인)이 멀쩡했던 이유가 deny + `supervisor-guard` 2층이었으므로, 같은 구조를 여기에도 세웠다.
>
> ⚠️ 새 비가역 명령을 도입하면 **두 곳 모두** 갱신해야 한다 — `shell-policy.mjs`의 `irreversibleSegmentReason`(+ `shell-policy.test.mjs`)과, `settings.SEALED.json`/`settings.OPEN.json` **양쪽**의 `ask` 매처(canonical 동기화 — ADR-038).

따라서 *위험 깃발 자동 검출* → **사용자 명시 GO 게이트 의무**:

```
🚨 PR <생성/머지> = irreversible 깃발
   사유: <정상 경로 / admin bypass / 시급 봉합 등>
   진행 OK?
     1. 진행 (정상 경로)
     2. admin bypass (예외 경로 — 사유 박음)  [솔로 휴면]
     3. 중단
```

AI는 이 게이트를 통과한 뒤 **명령을 호출**한다 — 실행 직전 훅이 승인 다이얼로그를 강제하고, 영호가 승인해야 실행된다(CORE-06 v3). 다이얼로그 없이 통과하면 사고다(훅 사망 신호 — 즉시 중단·보고).

---

## 3. 정상 경로

```
[작업 완료]
   ├─ /session:end (또는 본인 결정)
   ├─ commit                       ← AI 실행 (allow)
   ├─ push                         ← ⚠️ AI 호출 → **훅 ask 다이얼로그 → 영호 승인 시 실행**
   ├─ gh pr create                 ← ⚠️ 동일 (훅 축② ask — CORE-06 v3)
   │   ├─ AskUserQuestion 게이트 — 사용자 명시 GO(내용 확인)
   │   ├─ PR body에 보안 키워드 literal 박지 않음 (풀어쓰기)
   │   └─ classifier 통과
   ├─ reviewer 자동 호출 (조건부) — review-tiering.md
   ├─ CODEOWNERS 승인 (자동)
   │   ├─ 단독 owner → 즉시 통과 (normal merge)
   │   └─ 공유 owner → 다른 합류자 ack 대기  [솔로 휴면]
   ├─ gh pr merge                  ← ⚠️ 동일
   │   └─ AskUserQuestion 게이트 — 사용자 명시 GO + 머지 방식
   └─ /session:end 마무리
```

---

## 4. 예외 경로 — admin bypass  [솔로 휴면, 미래 부활]

### 4-A. 언제 정당한가

다음 *셋 다* 충족 시 admin bypass가 합법:

1. **사유 박힘** — 다음 중 하나:
   - **단독 통제 영역**: 하네스(`.claude/`·`.claude/hooks/`)·문서 단독 통제
   - **자동 빌드 산출물 매칭**: 본인 변경 X인데 CODEOWNERS 매칭 (빌드 부산물)
   - **시급한 봉합**: 안전망 무력화 사고 즉시 봉합
2. **사용자 명시 GO** — AskUserQuestion으로 사유 표시 후 사용자가 "admin bypass" 선택
3. **work-pin/PR body에 사유 박음** — 추적 가능

셋 중 하나라도 빠지면 **불법** — 정상 경로 사용.

### 4-B. PR body 안전 표현

admin bypass keyword를 *literal*로 박지 않기 (classifier가 *bypass 정상화*로 분류 + 모방용 노출 위험):

| ❌ literal (classifier 거절) | ✅ 풀어쓰기 (안전) |
|---|---|
| `gh pr merge --admin` | "관리자 우회 머지 (admin bypass)" |
| `--admin` 옵션 사용 | "예외 경로 머지" |

commit message도 동일.

---

## 5. 보안 hook + settings 정합

> ⚠️ **2026-07-26 정정**: 이 절은 오래도록 *"`dangerous-cmd-guard.sh`의 admin bypass 패턴"* 과 *"hook은 literal 매칭"* 을 서술했지만 **둘 다 실재하지 않았다**(`grep -rn "admin" .claude/hooks/` → 0건). 훅은 admin 전용 패턴을 가진 적이 없고, 판정은 literal이 아니라 **토큰 구조**다(따옴표·세그먼트·전역 옵션·중첩 셸을 구조화한다 — `shell-policy.mjs`). 아래는 현행 실측 기준 서술이다.

**1층 = 훅**(`dangerous-cmd-guard.sh`). 2축으로 판정한다.

- 축① 파괴(CORE-07) — `rm -rf`·`reset --hard`·`clean -fd`·**force push**. 기본 차단이며 승인으로 풀리지 않는다. 정말 필요하면 외부 셸에서.
- 축② 비가역(CORE-06 v3) — `push`·`gh pr create/merge`·`gh release`·`npm publish`·`npm run package`. 에이전트 호출 시 훅이 사람 승인(ask)을 강제하고, 거부되면 실행되지 않는다(구 v2 = 항상 차단 + 영호 `!` 직접).

**2층 = `permissions.ask` 매처**(훅 사망 시 대비, 존치):

```jsonc
// .claude/settings.json
"permissions": {
  "ask": [
    "Bash(gh pr merge*)",   // 머지 = 사용자 확인
    "Bash(gh pr create*)"   // PR 생성 = 사용자 확인
  ]
}
```

훅은 *토큰 구조 판정*, settings는 *권한 매처* — 자리도 성질도 다르다. **양쪽 다 작동해야 하며, 위층이 죽어도 아래층이 남는 것이 설계 의도다.**

### 5.1 loop-driven 운영에서의 보존

루프 엔진이 작업을 자율 구동해도 **PR 생성/머지 사람 게이트는 절대 약화 X** — PR 생성/머지는 [`work-judge.md`](work-judge.md) 버킷 (c, 판단·비가역)라 *신뢰 졸업 불가*([`review-throughput.md`](review-throughput.md)). 무인 commit allow를 올리더라도 **훅 축②와 `ask` 매처(pr create/merge)는 둘 다 그대로 보존** — git diff로 기계 검증. 무인 commit 전면 승격은 v2 defer.

---

## 6. 변경 시 동기화 책임

본 정책 수정 시 *반드시* 함께 갱신:

- [`../../CLAUDE.md`](../../CLAUDE.md) "확신이 없을 때 / PR 게이트" 절
- [`grade-and-risk.md`](grade-and-risk.md) (irreversible 깃발 명세)
- [`../commands/session/end.md`](../commands/session/end.md) (PR 생성 게이트 절차)
- [`../../.claude/hooks/dangerous-cmd-guard.sh`](../../.claude/hooks/dangerous-cmd-guard.sh) (**축① 파괴 + 축② 비가역 차단 = 1층**. ⚠️ admin bypass 패턴은 실재하지 않는다 — §5 정정 참조)
- [`../../.claude/hooks/_lib/shell-policy.mjs`](../../.claude/hooks/_lib/shell-policy.mjs) `irreversibleCommandReason` (판정 본문 — 새 비가역 명령은 여기 등재)
- [`../../.claude/settings.json`](../../.claude/settings.json) `permissions.ask` 매처 (**2층** — 훅 사망 시 대비, 존치)
- [`work-judge.md`](work-judge.md) · [`review-throughput.md`](review-throughput.md) · [`loop-driver.md`](loop-driver.md) (PR 게이트 = 버킷 c 졸업 불가)

---

## 갱신 이력

- 2026-06-26 — AgentDeck 이식 (ClaudeDev → manifest 기반). 솔로 정합(CODEOWNERS 단독→admin bypass/팀 ack 머신 **휴면 배너로 보존**, GO 게이트 유효 — manifest §5.5-3), 게임 참조(Shared.dll/98_Shared→02_Source/shared) 정리, ClaudeDev 사고 케이스(PR #42/#43) 교훈만 축약, irreversible에 npm package/publish 추가. PR/머지 GO 게이트·admin bypass 예외 경로 골격은 그대로(휴면).
