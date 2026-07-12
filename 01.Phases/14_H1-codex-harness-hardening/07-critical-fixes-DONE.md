---
summary: Codex 역할별 권한 경계, Claude coordinator 위임, 내장 파일 쓰기 봉인의 세 중요 결함을 테스트 우선으로 봉합했다.
phase: H1-critical-fixes-followup
work-id: ad-hoc-20260711-harness-critical-fixes
status: done
grade: 대규모
owner: youngho
gate_version: 1
report_html: 00.Documents/reports/H1-Codex하네스-치명결함-봉합.html
completed_at: 2026-07-11
---

# H1 Follow-up — Harness 중요 결함 3건 봉합 완료

## TL;DR

통과하던 기존 34개 검사가 놓친 권한·위임·봉인 결함 세 건을 현재 HEAD에서 다시 재현했다. 초기 실패 테스트 6건과 Reviewer 후속 회귀를 먼저 고정한 뒤 역할별 permission profile, 실제 allow/deny canary, Claude coordinator 도구, embedded write 탐지를 최소 수정해 Harness 38/38과 doctor live를 통과했다.

## 5단계 보고

- 🎯 **무엇을 만들었나** — Codex Worker 5개의 역할별 쓰기 경계와 16개 live boundary canary, Claude coordinator의 위임 도구, node·Deno·PowerShell 내장 파일 쓰기 봉인을 완성했다.
- 🤔 **왜 필요한가** — 기존 검사는 profile이 시작되는지만 확인해 교차 도메인 쓰기를 놓쳤고, Claude coordinator는 책임을 수행할 도구가 없었으며, 내장 파일 API는 Harness 봉인을 우회할 수 있었다.
- 🛠️ **어떻게 만들었나** — 공통 read-only 기반에서 역할별 정확한 하위 경로만 write로 열었다. Secretary는 운영 문서·로컬 Git과 build/E2E 출력(`out`·`artifacts`·`test-results`)만 쓴다. embedded write는 실제 runtime 실행 segment와 쓰기 API 또는 PowerShell cmdlet이 함께 나타날 때만 차단해 설명 텍스트·읽기 명령 오탐을 피했다.
- 🧪 **테스트 결과** — 초기 TDD RED 6건과 Reviewer 후속 RED를 확인한 뒤 Harness 38/38, doctor static/live, permission profile 7/7·경계 16/16·Hook 4/4·model 3/3, Bash Hook 구문 10/10을 통과했다.
- ➡️ **다음 스텝** — trusted 새 세션에서 actual custom profile label, Secretary git 동작, Claude coordinator → reviewer smoke를 확인한다. H3 Supervisor·Secretary 문서 드리프트는 다음 Harness 동기화 작업으로 남긴다.

## AC 검증 결과

```text
$ node --test .codex/harness-contract.test.mjs .claude/hooks/_lib/shell-policy.test.mjs
tests 14, pass 8, fail 6 — RED 재현

$ node --test .codex/hooks/agentdeck-hook.test.mjs .codex/harness-contract.test.mjs .claude/hooks/_lib/shell-policy.test.mjs .claude/hooks/_lib/done-report-policy.test.mjs
tests 38, pass 38, fail 0

$ node .codex/harness-doctor.mjs --live
STATIC: PASS
LIVE-CANARY: PASS — permission profiles 7/7, boundaries 16/16, hooks 4/4, models 3/3

$ bash -n <각 .claude/hooks/*.sh>
SH_SYNTAX_PASS=10

$ git diff --check
exit 0
```

## 결정 흐름

- 공통 workspace profile 유지 대 역할별 profile 분리 중, 선언과 실제 권한을 일치시키기 위해 역할별 분리를 선택했다. 단점은 profile 수와 live canary 시간이 늘어난다는 점이다.
- 실제 제품 경로 probe 대 격리 workspace root probe 중, 제품 파일을 건드리지 않는 저장소 형제 경로 canary를 선택했다.
- API 문자열만 검사 대 runtime과 API를 함께 검사 중, `echo` 같은 설명 텍스트 오탐을 피하려고 두 조건을 결합했다.
- Reviewer 후속에서 Node `-p/--print`·할당형 옵션과 PowerShell 내부 `ri/sc` 별칭까지 RED→GREEN으로 고정했고 최종 재검증 PASS를 받았다.

## 막혔던 지점

- OS 임시 폴더 canary는 공통 `:tmpdir` write에, 저장소 `artifacts/` canary는 Secretary의 E2E 출력 write에 포함돼 deny 검사가 무의미했다. 두 허용 영역 밖의 검증된 저장소 형제 경로로 옮겼다.
- sandbox 내부 PowerShell 재실행이 Windows 제한 토큰에서 `EPERM`을 냈다. 기존 doctor와 같은 단일 `cmd.exe` canary로 바꿨다.
- 기존 checkout의 일부 Claude Hook이 CRLF라 Bash 구문 검사가 실패했다. `.gitattributes` 계약대로 LF로 정규화해 10/10을 확인했다.

## 학습 일지 후보 키워드

- Codex permission profile 경로 우선순위
- 격리 workspace root allow/deny canary
- Claude coordinator Agent 도구와 재귀 차단
- embedded write 탐지와 false positive
- Windows restricted token과 Hook LF 줄바꿈
