---
owner: 영호
milestone: BL1
phase: 06-hook-robustness-window
title: "[유지보수 창] 훅 견고성 3건 — || true·fail-closed·exit code 테스트"
status: done
grade: 복잡 (자동 상향: 보통 + harness)
loop_track: human-gate
estimated: 2~3h
domain: cross
work-id: bl1-backlog-closeout
completed_at: 2026-07-13
commit: e0a064b
gate_version: 1
report_html: 00.Documents/reports/BL1-P06-훅-견고성.html
summary: HR1 P06 reviewer minor 1~3 봉합 — 훅 안전망 자체의 fail-open 3경로(emit_system_message 알림 사망 전파 / shell-policy.mjs 판정기 사망 시 dangerous-cmd-guard·supervisor-guard 통과)를 fail-closed(exit 2·복구 안내)로 전환 + 크래시 주입 exit code 회귀 테스트 13종 신설. 영호 유지보수 창(CORE-11).
---

# Phase 06 — [유지보수 창] 훅 견고성 3건 완료 박제

**소요 시간**: 유지보수 창 개방 하 메인 직접 수술(CORE-11 대행 — Worker 위임 금지)

> **전용 보고서**: HTML 발표 자산 = frontmatter `report_html` 참조(`00.Documents/reports/BL1-P06-훅-견고성.html`). BL1 마일스톤 종합 보고 시점에 본 Phase 보고를 종합에 편입한다.

## TL;DR

훅은 하네스의 안전망인데, 그 안전망 자체가 판정기(`shell-policy.mjs`) 크래시 앞에서 조용히 열리는(fail-open) 경로 3건을 봉합했다(HR1 P06 reviewer minor 1~3). (1) `hook-common.sh`의 `emit_system_message`에 `|| true` — 알림 실패가 경고 훅·감사 원장을 통째로 죽이던 경로 차단. (2) `dangerous-cmd-guard.sh`(exit 1 통과)·`supervisor-guard.sh`(봉인 통과)가 판정기 사망 시 통과시키던 경로를 `exit 2` fail-closed로 전환(복구 안내 stderr 동반). (3) 그 exit code 계약을 지키는 크래시 주입 회귀 테스트 13종(`_lib/hook-exit.test.mjs`) 신설. 핵심 함정은 *빈 문자열 ≠ "sealed"* — 판정기가 죽어 빈 문자열을 반환하면 supervisor-guard가 봉인을 조용히 열었다. RED 4건으로 fail-open을 실증한 뒤 GREEN 13/13. 게이트 전부 green, 봉인 복구 프로브 2/2. 커밋 `e0a064b`·CHANGELOG `8309cf9`.

## 5단계 보고

- 🎯 **무엇을 만들었나** — 훅 안전망 자체의 fail-open 3경로를 fail-closed로 전환했다. `hook-common.sh` `emit_system_message` `|| true`(알림 사망 격리), `dangerous-cmd-guard.sh`·`supervisor-guard.sh`의 판정기 사망 시 `exit 2` fail-closed(복구 안내 stderr), 그 계약을 고정하는 회귀 테스트 13종(`_lib/hook-exit.test.mjs`) 신설. 변경 4파일(hook-common.sh·dangerous-cmd-guard.sh·supervisor-guard.sh + 신규 테스트).

- 🤔 **왜 필요한가** — 보안·거버넌스 게이트의 원칙은 fail-closed다. 판정 불능이면 막아야지 통과시키면 안 된다. 크래시 주입 테스트를 먼저 작성해 RED 4건으로 fail-open을 실증했다. 핵심 함정: shell-policy 판정기가 죽어 빈 문자열을 반환하면 supervisor-guard가 그 빈 문자열을 "sealed 아님"으로 읽어 하네스 봉인이 조용히 열렸다 — 빈 문자열 ≠ "sealed"인데 코드가 그렇게 취급했다. 안전망이 자기 크래시에 무방비였던 셈.

- 🛠️ **어떻게 만들었나** — (1) `emit_system_message`에 `|| true`로 알림 방출 실패를 상위 훅 로직·원장 기록에서 격리. (2) 판정기 사망 감지 시 `exit 2` fail-closed + 복구 방법 stderr 안내. (3) 회귀 테스트는 `os.tmpdir()` 샌드박스에 훅을 복사하고 판정기에 구문 오류를 주입해 exit code를 관측(H1 doctor self-clean 샌드박스 관례 계승). RED 4 → GREEN 13/13. 대안이었던 "문서 규칙으로만 fail-closed 요구"는 강제력 0이라 기각 — 코드·테스트로 못 박음.

- 🧪 **테스트 결과** — `node --test _lib/*.test.mjs` 36/36 pass(신규 hook-exit 13 포함) · `bash -n *.sh` 10/10 · `npx vitest run harness-conformance` 12/12 · `conformance-check.mjs` 13/13 PASS(exit 0). 라이브 차단 프로브(`rm -rf` 발화 + 감사 원장 기록) 확인, 봉인 복구 프로브 2종(Edit→settings deny 차단 / Bash 우회쓰기→수정된 supervisor-guard 라이브 차단) 2/2. 커밋 `e0a064b`, CHANGELOG `8309cf9`.

- ➡️ **다음 스텝** — 범위 밖 관찰 2건을 백로그 후보로 존치: `parse_hook_payload` 크래시 시 `eval ''` fail-open / `shell_tokens` 0토큰 통과(기존 semantics). 둘 다 이번 3경로와 별개 표면이라 별건. BL1 그룹 A(하네스) 종결, 남은 것은 P03 육안 게이트뿐. 영호 잔여 액션 = `/hooks` 재신뢰 여부(설정 다이제스트 불변 실측 시 불요).

## AC 검증 결과

Phase 완료조건을 실제로 실행한 명령과 결과:

```text
$ node --test .claude/hooks/_lib/*.test.mjs
pass 36 · fail 0

$ cd .claude/hooks && for f in *.sh; do bash -n "$f"; done
10/10 ok (fail 0)

$ npx vitest run 99.Others/tests/harness-conformance.test.ts
Test Files 1 passed · Tests 12 passed

$ node 00.Documents/harness/conformance-check.mjs
CONFORMANCE: PASS — 13/13 조항 (exit 0)
```

- 크래시 주입 회귀 RED 4 → GREEN 13/13 실증.
- 라이브 차단 프로브(`rm -rf`) 발화 + 원장 기록 · 봉인 복구 프로브 2/2.

## 학습 일지 후보 키워드

- 안전망의 fail-open — 게이트는 판정 불능 시 fail-closed가 원칙
- 빈 문자열 ≠ "sealed" — 크래시 반환값을 정상 신호로 오독하는 함정
- 크래시 주입 테스트로 fail-open을 RED 실증 후 봉합
- os.tmpdir 샌드박스 + 구문오류 주입(H1 doctor self-clean 관례)
- 신뢰 표면 = 훅 설정(다이제스트)이지 스크립트 본문 아님
