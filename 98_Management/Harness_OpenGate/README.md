# Harness_OpenGate — 유지보수 창 개폐 (ADR-038)

> **실행 주체 = 영호 단독.** 에이전트는 본 폴더에 대해 읽기(Read/Glob)만 가능 — 쓰기·Bash 접근은
> 봉인(settings deny + supervisor-guard + shell-policy)으로 차단된다. 이 불변식이 무너지면
> 봉인은 정의상 소멸한다(잠긴 문 옆의 열쇠).

## 무엇인가

하네스(헌법·훅·정책·ADR·의미 정본) 유지보수 창을 열고 닫는 **원클릭 토글**.
구 방식(영호가 settings.json deny 10줄 + supervisor-guard를 손으로 편집)의 사람 마찰을 제거한다 —
마찰이 크면 창을 안 열게 되고, 창을 안 열면 하네스가 부패한다.

## 사용법 (영호)

| 동작 | 실행 | 효과 |
|---|---|---|
| **열기** | `OPEN-GATE.bat` 더블클릭 | `.claude/settings.json` ← `settings.OPEN.json`(하네스 deny 해제) + `gate-open.flag`(epoch초) 생성 → supervisor-guard가 flag를 읽고 전체 통과(원장에 `open-gate` 기록) |
| **닫기** | `CLOSE-GATE.bat` 더블클릭 | `.claude/settings.json` ← `settings.SEALED.json`(봉인 복원) + flag 삭제 |

- **TTL 7시간** — flag가 7시간 지나면 훅이 자동으로 봉인 분기로 복귀한다(닫기 망각 안전망).
  만료 후엔 CLOSE로 정리하고 필요 시 재오픈.
  > ⚠️ **만료가 되돌리는 것은 훅 층뿐이다**(ADR-038 개정 3, 2026-07-26). `.claude/settings.json`의
  > permission deny는 `CLOSE-GATE.bat`을 눌러야 봉인판으로 돌아간다 — 즉 TTL이 지나면 2층 방어가
  > **1층으로 줄어든 채** 유지된다. 자동 복원을 만들지 않는 이유는, 그러려면 에이전트나 훅이 봉인
  > 파일을 써야 하는데 그 순간 "스스로 봉인을 조작한다"가 되어 이 장치의 존재 이유와 충돌하기
  > 때문이다. 그러므로 **닫는 것은 끝까지 사람의 일**이다.
  > 2026-07-25(HR2 P05)에 4시간에서 늘렸다. 12 Phase짜리 창이 중간에 만료되면
  > 에이전트는 스스로 재오픈할 수 없어(설계상 deny) 작업이 사람을 기다리며 멈춘다.
  > 대가는 닫기를 잊었을 때의 노출 시간이 그만큼 길어지는 것 — 근거는 ADR-038 개정 2.
- hooks *구성*은 SEALED/OPEN 동일 → 개폐 시 `/hooks` 재신뢰 불요(신뢰는 구성 기준 — BL1 실측).
- 닫은 뒤 의식: ① 봉인 프로브(에이전트가 봉인 경로 쓰기 시도 → 차단 확인) ② CHANGELOG `[H]` 기록 ③ `/hooks` 상태 확인.

## Canonical 동기화 규칙 (중요)

`settings.SEALED.json` / `settings.OPEN.json`은 **원본(canonical)**이고 `.claude/settings.json`은 사본이다.
settings에 *영구* 변경(권한 추가 등)을 할 때는 **두 canonical을 함께 수정**해야 한다 —
canonical만이 진실이고, CLOSE 실행 시 SEALED가 `.claude/settings.json`을 덮어쓴다.
(창 도중 `.claude/settings.json`만 고치면 CLOSE 때 소실된다.)

## 위협 모델 (정직한 한계 선언)

- 이 게이트는 **성실한 에이전트의 실수·드리프트 방지** 모델이다 — 적대적 에이전트의 완전 봉쇄가 아니다.
- 알려진 잔여 구멍: 에이전트가 본 bat 코드를 읽고 *같은 동작을 하는 자체 스크립트*를 만들어 우회하는 경로.
  방어는 flag·canonical 경로의 **쓰기 벡터** 차단(sealed 분류) + OpenGate 스크립트의 **실행 벡터** 차단까지 —
  그 너머는 기존 봉인과 동일한 **부분 보장 선언**(denylist 무한 회피 불가, Sol 재리뷰 2026-07-13 선례).
  > **개정 1 (2026-07-25, HR2 P01·P05)** — 옛 표기는 *"`harness_opengate` 참조 Bash 전면 차단"* 이었다.
  > 부분문자열 매칭이라 `ls`·`cat`·`echo` 같은 **언급·읽기까지** 막았는데, 읽기는 `Read`·`Glob` 도구가 열려 있어
  > 애초에 달성되지 않는 방어였고 차단 메시지가 대체 경로를 직접 안내해 방지턱이 아니라 **표지판**이었다.
  > 지금은 실행 위치 토큰이 OpenGate 스크립트이거나 실행기(`cmd`/`start`/`bash`/`powershell` 등)의 인자로
  > 지목된 경우만 차단한다. 근거·트레이드오프 = ADR-038 개정 1.
- 감사 흔적: 개방 통과는 `.claude/state/guard-blocks.log`에 `open-gate`로 남는다.
  > ⚠️ **2026-07-25 이전 이력은 감사 불가.** 로거의 라벨 이분법이 `open-gate`를 `notify`로 뭉개고 있었고
  > (실측: `grep -c open-gate` → 0건), 로테이션으로 옛 이력은 복원할 수 없다. **감사 가능 구간은 그 수정 이후**다.
  > 상세 = ADR-038 「보완」 절.

## 관련

- `00_Documents/adr/ADR-038-management-opengate.md` — 결정·트레이드오프
- `.claude/hooks/supervisor-guard.sh` ③ — flag 판독·TTL·원장 기록
- `.claude/hooks/_lib/shell-policy.mjs` — sealed 분류(`98.management/harness_opengate`)
