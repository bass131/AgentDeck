---
owner: 영호
milestone: HR2
phase: 08
title: git mv 폴더 개명 + 빌드 체인 7파일
status: pending
grade: 복잡
risk: harness, irreversible
loop_track: human-gate
estimated: 3~5h
domain: cross
summary: 최상위 5개 폴더를 언더스코어 프리픽스로 git mv하고 빌드 체인 7파일을 같은 커밋에서 보정한다.
---

# Phase 08: git mv 폴더 개명 + 빌드 체인 7파일

> **상태**: pending
> **마일스톤**: HR2
> **등급**: 복잡 (risk: harness · irreversible)
> **담당**: 메인 직접 (판단) + secretary (기계 실행)

---

## 🎯 목표

`00.Documents` · `01.Phases` · `02.Source` · `98.Management` · `99.Others`를 언더스코어 프리픽스로 개명하고, **같은 커밋에서** 빌드 체인이 새 경로를 가리키게 한다.

근거 = 영호 개발 성향 8(폴더 프리픽스 `00_Xx` — "점(.)이 파일 확장자와 혼동된다").

---

## ⏪ 사전 조건

- [ ] **P07 완료** — 훅·봉인 경로가 새 이름을 이미 인식하는 상태여야 한다(부트스트랩 자물쇠)
- [ ] **OpenGate 개방** — `98.Management/**`·`00.Documents/harness`·`adr`가 봉인 대상이고 이 Phase가 그 폴더들을 통째로 옮긴다(영호 단독 실행)
- [ ] 개명 매핑표 영호 확정 승인 (**P01의 ADR-028 개정에 박제된 표**를 정본으로 사용)
- [ ] `npm run dev`·Electron·에디터 watcher **전부 종료**(Windows 파일 잠금)
- [ ] baseline 게이트 4종 green 캡처(비교 기준)
- [ ] `*.tsbuildinfo` 2개 삭제(옛 소문자 경로 보유 — `"./02.source/shared/diff-types.ts"` 실측) + `node_modules/.vite` 삭제
- [ ] `git config core.ignorecase` = true 확인됨 → **매핑에 대소문자 전용 변경 금지**(있으면 `git mv -f` 2단계 필요)

---

## 📝 작업 내용

- [ ] `git mv`로 5개 폴더 개명 (이력 보존 — 선례 = 2026-07-11 `01.Phases` 하위 15종 리네임)
- [ ] **같은 커밋**에서 빌드 체인 보정:
  - `tsconfig.node.json` — `paths` `@shared/*` + `include` 8행
  - `tsconfig.web.json` — `paths` `@shared/*`·`@renderer/*` + `include` 8행
  - `electron.vite.config.ts` — **`__dirname` 6곳**(11·17·21·24·25·30행). electron-vite가 `__dirname`을 원본 config 파일 디렉터리 리터럴로 치환하므로 전부 보정
  - `vitest.config.ts:10` · `playwright.config.ts:14` · `.eslintrc.cjs:13` · `package.json:17-18`
- [ ] ⚠️ **행 번호는 참고값이다 — 실행 시 앵커 문구 grep으로 재확인**. 위 4건은 초안 대비 이미 1~2행씩 밀려 있었고(실측 2026-07-25 정정), P02·P03이 `execution-owner.md`·`CLAUDE.md`를 재편한 뒤에는 P06·P07의 인용도 함께 밀린다. **행 번호로 찾지 말고 문자열로 찾는다**
- [ ] `.gitignore:61-62` (`01.Phases/**/*.status.json`·`*.log`) — 현재 무시 중인 파일 0건이라 즉시 피해는 없지만, 방치하면 향후 work-run 산출물이 커밋에 섞인다
- [ ] **훅 주석·설명 문구의 옛 이름 갱신 (P07 이월)** — P07은 *동작 코드*만 신·구 병행(`[._]`)으로 넓혔고, **주석과 설명 문구는 개명 전이라 옛 이름이 맞아서** 손대지 않았다. 개명이 끝나는 이 Phase에서 새 이름으로 옮긴다:
  - `supervisor-guard.sh:7,13,16,20`(헤더 주석) · `tdd-guard.sh:11` · `convention-size-guard.sh:19` · `dangerous-cmd-guard.sh:7` · `shell-policy.mjs`의 Windows 경로 예시 주석
  - ⚠️ **동작 코드의 `[._]`는 그대로 둔다** — 개명 후에도 부분 롤백·이력 체크아웃에서 옛 이름이 되살아날 수 있고, 그때 봉인이 조용히 풀리는 것이 P07이 막은 사고다
  - `tdd-guard.sh`의 차단 메시지는 이미 `TESTS_REL` 변수라 **자동으로 맞는다**(하드코딩 없음)
- [ ] **최상위 개명 항법 노트 신설 — 경로 = `01_Phases/INDEX.md`에 §섹션 추가**(2026-07-11 리네임도 거기 기록돼 있어 자연스럽다). `git mv`의 이력 보존은 **파일 단위 `--follow` 한정**이고 디렉토리 로그·blame 연속성은 끊긴다(실측: 디렉토리 로그 1커밋) — 옛→새 매핑표와 "이 시점 이전 로그는 옛 경로로 조회" 안내를 남긴다

---

## ✅ 완료 조건

- [ ] 5개 폴더가 새 이름으로 존재, 옛 이름 폴더 **0개**
- [ ] `git status`에 rename으로 인식됨(delete+add가 아님)
- [ ] `npm run typecheck` 0 · `npm run build` 성공 · `npm run lint` 0
- [ ] ⚠️ `npm run test`는 이 Phase에서 **red 허용** — import 814건이 P09 대상이라 여기서는 green이 될 수 없다. red 사유를 커밋 메시지에 명시
- [ ] **red 구간 인수인계** — work-pin에 *"P09 미완 = `npm run test` red가 정상"* 1줄. P08·P09는 **같은 창에서 연속 실행**을 권고한다(세션이 끊기면 다음 세션이 red를 사고로 오인한다)
- [ ] `01_Phases/INDEX.md`에 개명 항법 §섹션 존재
- [ ] **발화 프로브** — 새 경로에서 봉인 Edit 차단 확인(P07이 제대로 됐는지 여기서 재확인)

---

## 📚 학습 포인트

- **git은 rename을 저장하지 않는다** — 조회 시 유사도로 탐지할 뿐이고, `--follow`는 단일 파일에만 동작한다. "git mv면 이력이 보존된다"는 절반만 참이다.
- **`core.ignorecase`** — Windows/macOS 기본 true. 대소문자만 바꾸는 rename은 git이 인식하지 못해 2단계 우회가 필요하다. 이번 매핑(`.`→`_`)은 해당 없음.
- **red를 허용하는 Phase** — 중간 상태가 불가피하면 red를 숨기지 않고 사유와 함께 남긴다. 조용한 green보다 정직한 red가 낫다.

---

## ⚠️ 함정

- **P07 없이 진행** — 창이 안 열리고 봉인이 조용히 풀린다.
- **watcher를 켠 채 `git mv`** — Windows 파일 잠금으로 부분 실패하면 절반만 옮겨진 상태가 된다.
- **tsbuildinfo를 안 지우기** — 옛 소문자 경로를 들고 있어 typecheck가 stale 판정을 할 수 있다(`--composite false`라 실제 소비 여부는 미확인 → 안전하게 삭제).
- **`npm run test` green을 억지로 맞추려 하기** — P09의 일이다. 여기서 무리하면 치환이 반쪽 난다.

---

## 담당 SubAgent

**메인 직접**(매핑 확정·항법 노트 = 판단) + **secretary**(git mv 실행·커밋 = 판단 종료 후 기계 실행). ⚠️ 파괴 작업이므로 **이름 확정 목록**을 브리프에 명시(메모리 「파괴 작업은 이름 확정 목록 + 위임 분리」).
