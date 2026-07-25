---
owner: 영호
milestone: HR2
phase: 09
title: 대량 경로 치환 — import 814건 + 런타임 리터럴
status: pending
grade: 대규모
loop_track: human-gate
estimated: 5~8h
domain: cross
summary: git mv가 손대지 않는 테스트 상대 import 814건·런타임 경로 리터럴·정본 문서 5종을 전수 치환해 회귀 게이트를 green으로 되돌린다.
---

# Phase 09: 대량 경로 치환 — import 814건 + 런타임 리터럴 + 정본 문서

> **상태**: pending
> **마일스톤**: HR2
> **등급**: 대규모
> **담당**: **qa**(테스트 814건) + **메인 직접**(하네스·정본 문서) + secretary(게이트·커밋·diff 대조) — 영역별 분리, 아래 「담당」 절 참조

---

## 🎯 목표

P08이 남긴 red를 green으로 되돌린다. **`git mv`는 폴더만 옮기고 파일 내용은 하나도 고치지 않는다** — 실측상 추적 파일 698개·3,111줄에 옛 프리픽스가 박혀 있고, 그중 테스트 상대 import만 **814건 / 434파일**이다.

**원칙 재정의**: *"산문(`-DONE.md`·CHANGELOG·ADR 서술)은 미수정, **코드·설정·훅·경로 리터럴은 예외 없이 전수 수정**"*. 2026-07-11 선례는 이 구분 없이 "소급 미수정"만 적용해 **e2e 4곳에 유령 경로**를 남겼다(실측 #8).

---

## ⏪ 사전 조건

- [ ] P08 완료 (폴더가 새 이름으로 존재)
- [ ] P08의 red 사유가 커밋에 기록돼 있음
- [ ] **OpenGate 개방** — 이 Phase는 `.claude/policies/**`·`.claude/agents/**`·`00.Documents/harness/**`(`conformance-check.mjs`·`core-manifest.json`·`CORE.md`)·`CLAUDE.md`를 고친다. **전부 봉인 안**이다(영호 단독 실행)

---

## 📝 작업 내용

- [ ] **테스트 상대 import 814건 / 434파일** 일괄 치환 (`../../../02.Source/` → 새 이름 형태)
  - 예: `99.Others/tests/agents/abort.test.ts:8` `import { getBackend } from '../../../02.Source/main/01_agents/registry'`
  - (별칭 `@shared`·`@renderer`로 이관하면 재발 방지가 되지만 **별도 리팩터로 분리** — 이번 범위 밖)
- [ ] **런타임 경로 리터럴 3자 동기** (안 고치면 `npm run test` red 지속):
  - `00.Documents/harness/conformance-check.mjs:37` (`const manifestRel = '00.Documents/harness/core-manifest.json'`)
  - `00.Documents/harness/core-manifest.json:4,44,45`
  - `99.Others/tests/harness-conformance.test.ts:27,75,81,83,122`
- [ ] **e2e 유령 경로 4곳 동반 정정** (2026-07-11 선례가 남긴 잠복 버그 — 이번에 같이 닫는다):
  - `99.Others/tests/e2e/bf3-p06-permission-card-shots.e2e.ts:43` (`'01.Phases','BF3-backlog-sweep','ScreenShot'` → 현재 `07_BF3-backlog-sweep`)
  - `99.Others/tests/e2e/lr2-03-loop-gui-screens.e2e.ts:42,44` (`'LR2-loop-replmode'`·`'LR3-loop-ux'`)
  - `99.Others/tests/e2e/lr3-p04-wakeup-banner.e2e.ts:19` (`'LR3-loop-ux'`)
- [ ] ⚠️ **정본 문서 5종 — 아무 Phase도 소유하지 않던 사각지대** (실측 2026-07-25). "산문은 미수정" 원칙의 그늘에 들어가 조용히 방치될 자리들인데, **전부 산문이 아니라 살아 있는 지시문·명세**다:

  | 파일 | 옛 이름 | 왜 산문이 아닌가 |
  |---|---|---|
  | `CLAUDE.md` | **20줄** | P02는 `:56`(모델)만, P06은 CORE-13만 소유. 문서 지도·디렉토리 표·명령어 경로는 무주공산 |
  | `AGENTS.md` | 3줄 (`:4,33,44`) | `:44`가 `agentdeck-rescue`의 쓰기 범위 = **Codex 권한 명세**. P10은 `.codex/**`만 열거하고 AGENTS.md는 그 밖이라 **양쪽 사각지대** |
  | `00.Documents/ARCHITECTURE.md` | 6줄 | CORE-08 판정의 근거 문서. 개명 후 **존재하지 않는 디렉토리 트리**를 서술하게 된다 |
  | `00.Documents/harness/CORE.md:28` | 1줄 | CORE-04 본문의 `02.Source/shared`. ⚠️ **조항 본문 변경**이라 `CORE.md:6` 개정 규칙(조항 버전 상향 + `core-manifest.json` + 양 어댑터 3점 동기)이 따라붙을 수 있다 |
  | `README.md` | 8줄 | `00.Documents/assets/*.png` 이미지 링크 — **GitHub에서 배너·스크린샷이 전부 깨진다** |

- [ ] ⚠️ **CORE.md 조항 버전 방침을 *미리* 정한다** — "경로 표기만 바뀐 것"이 조항 버전 상향 대상인지 아닌지를 P09 착수 전에 결정하고 기록한다. 안 정하면 conformance 판정이 애매해진다(P06이 CORE-13에 하는 절차와 짝지어 판단)
- [ ] **`.claude/**` 살아 있는 지시문 — 약 28개** (실측: `.claude` 내 옛 이름 보유 추적 파일 39개, 훅 11개는 P07 소관이므로 제외). agents 10 · policies 10 · commands 4 · skills 2 · templates 1 · CHANGELOG · `state/current-pin.txt`
  - ⚠️ 특히 `.claude/templates/done-md-template.md` · `.claude/commands/**` · `work-plan|work-run/SKILL.md`는 **에이전트가 다음 산출물을 어디에 쓸지** 지시하는 파일이다. 놓치면 P11 프로브 ⑦(옛 폴더 재생성 0)이 **사후에** 터진다
- [ ] **저장소 밖 3곳** (git mv가 절대 못 잡음):
  - `~/.claude/skills/Report-YYH-Style/SKILL.md:275`
  - 메모리 `reports-location-convention.md:3,10,12`
  - 메모리 `verify-fixes-empirically.md:21`

---

## ✅ 완료 조건

- [ ] `npm run test` **green** (P08의 red 해소)
- [ ] `npm run typecheck` 0 · `npm run lint` 0 · `npm run build` 성공
- [ ] e2e 최소 1본 PASS
- [ ] `grep -rn "00\.Documents\|01\.Phases\|02\.Source\|98\.Management\|99\.Others"` 결과가 **산문 문서에만** 남아 있음 — 코드·설정·훅·경로 리터럴에는 **0건**
- [ ] 치환 전후 `git diff --stat` 대조로 의도치 않은 파일 변경 0 확인
- [ ] 저장소 밖 3곳 갱신 완료
- [ ] **정본 문서 5종 갱신 완료** — `CLAUDE.md`·`AGENTS.md`·`ARCHITECTURE.md`·`CORE.md:28`·`README.md`. README는 **GitHub 렌더링에서 이미지 8개가 실제로 보이는지** 육안 확인
- [ ] CORE.md 조항 버전 방침이 기록됨 (상향했으면 `core-manifest.json`·`AGENTS.md` 3점 동기 + conformance green)
- [ ] reviewer 스킵 사유가 `-DONE.md`에 명시됨

---

## 📚 학습 포인트

- **기계 치환의 경계** — `sed`로 일괄 치환하면 빠르지만 문자열이 우연히 일치하는 곳까지 바꾼다. 산문/코드 구분이 곧 안전선이다.
- **유령 경로** — `mkdirSync(recursive: true)`는 없는 폴더를 만들어 준다. 그래서 잘못된 경로도 **에러 없이** 동작하고, 결과물만 엉뚱한 데 쌓인다. 조용한 실패의 전형.
- **저장소 밖 자산** — 글로벌 스킬·메모리는 git이 추적하지 않지만 매 세션 주입된다. 저장소만 고치면 다음 세션이 옛 경로로 유도한다.

---

## ⚠️ 함정

- **`git add .` 류로 한 번에 커밋** — CORE-07 금지. 명시 파일만 스테이징.
- **산문까지 치환** — `-DONE.md`·CHANGELOG의 과거 기록은 그대로 둔다(git 추적성 보존).
- **한 번에 814건 치환 후 확인** — 실패 시 원인 격리가 불가능하다. **secretary 위임 단위로 쪼개고** 각 단위마다 `git diff --stat` 대조.
- **e2e 유령 경로를 "원래 그랬으니 놔두기"** — 그게 선례가 남긴 실패다. 이번에 닫는다.

---

## 담당 — ⚠️ 영역별 분리 (secretary 단독 위임 금지)

초안은 전체를 `secretary`에 위임했으나 **그건 secretary가 거부할 브리프**다. `.claude/agents/secretary.md`의 Off-limits가 `99.Others/tests/**` 편집을 명시적으로 금지하고(qa 몫), *"위반 시 작업 거부하고 보고"*가 Hard rule이다. 근거였던 "execution-owner 1축 NO"도 성립하지 않는다 — `execution-owner.md:37`이 **[예외] 절로 선을 그어 뒀다**:

> *"앱 코드·테스트 — `02.Source/**` = 도메인 Worker, `99.Others/tests/**` = qa **전임**. 비용 축이 아니라 규율 축이라 **판정표 적용 대상이 아니다**."*

그리고 `:74`: *"유지보수 창(하네스)은 본 판정표의 예외 — 메인이 편집·커밋 전부 직접(CORE-11)."*

| 영역 | 담당 | 근거 |
|---|---|---|
| 테스트 import 814건 + e2e 유령 경로 4곳 (`99.Others/tests/**`) | **qa** | execution-owner `:37` 예외 — qa 전임 |
| `.claude/**` · `00.Documents/harness/**` · `CLAUDE.md` · ADR | **메인 직접** | CORE-11 (유지보수 창 = 영호 단독 통제 대행) |
| `AGENTS.md` · `ARCHITECTURE.md` · `README.md` | **메인 직접** | 정본 문서 = 판단이 살아 있는 산출물 |
| `02.Source/**` 내부 경로 문자열 | 도메인 Worker **또는 명시적 미수정 선언** | 규율 축 |
| 회귀 게이트 실행 · `git diff --stat` 대조 · 커밋 실행 | **secretary** | 판단 종료 후 기계 실행 |

**reviewer**: 등급은 대규모지만 내용이 rename 치환뿐이라 `review-tiering.md:38`("주석/오타/rename만 → 스킵")에 해당한다. **스킵하되 그 사유를 -DONE.md에 기록**한다(무언의 생략과 구분).
