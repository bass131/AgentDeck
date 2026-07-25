### ADR-038: 관리 구획(`98.Management`) 신설 + Harness OpenGate — 유지보수 창 원클릭 개폐

**결정(유지보수 창 2026-07-24, 영호)**: 최상위 폴더 `98.Management/`를 신설하고(CORE-08 ADR 선행 이행), 하위 `Harness_OpenGate/`에 유지보수 창 개폐 메커니즘을 둔다 — `OPEN-GATE.bat`/`CLOSE-GATE.bat`(canonical settings 교체 + `gate-open.flag` 생성/삭제) + supervisor-guard의 flag 판독(신선하면 전체 통과 + 원장 `open-gate` 기록, **TTL 4h** 초과 시 자동 재봉인). **실행 주체 = 영호 단독 — 에이전트에겐 deny**(settings `Edit(98.Management/Harness_OpenGate/**)` + shell-policy sealed 분류 + supervisor-guard의 `harness_opengate` 참조 Bash 전면 차단).

**이유**: 구 개폐 의식(영호가 settings.json deny 10줄 + supervisor-guard.sh를 손으로 편집 → 재봉인 시 역순 복원)은 사람 마찰이 커서 창 열기를 미루게 만든다 — 창을 안 열면 하네스 드리프트가 쌓인다(2026-07-18 스킬 정본 미반영 사건이 실례: 봉인에 막혀 메모리를 임시 정본으로 운용). 개폐 비용을 더블클릭 2회로 낮추되, **"스위치를 누르는 손은 영호"라는 불변식**은 기술로 보존한다 — 에이전트가 스스로 열 수 있는 봉인은 정의상 봉인이 아니다(드리프트한 세션·주입된 지시가 "일단 열고 진행"으로 흐르는 순간이 봉인의 존재 이유).

**대안과 트레이드오프**: (a) *현행 수동 의식 유지* — 추가 표면 0이나 마찰 존속(창 회피 → 드리프트). (b) *permission 층 폐지 + 훅 단독 봉인* — 토글이 flag 하나로 단순해지나 방어 계층 상실(훅 실패·미신뢰 시 무방비). (c) **채택: canonical 교체 방식** — settings 두 원본(`settings.SEALED.json`/`settings.OPEN.json`)을 bat이 통째로 복사, 두 방어 계층(permission deny + 훅) 모두 보존. 비용 = **canonical 동기화 규칙**(settings 영구 변경 시 두 원본 동시 수정 — 창 도중 `.claude/settings.json`만 고치면 CLOSE 때 소실) — settings 변경은 하네스 봉인 영역이라 빈도가 낮아 감수(영호 2026-07-24). JSON 파싱 재작성(PowerShell ConvertTo-Json)은 비ASCII 이스케이프·포맷 훼손으로 기각.

**위협 모델·한계(정직 선언)**: 본 게이트는 *성실한 에이전트의 실수·드리프트 방지* 모델 — 적대 봉쇄가 아니다. 알려진 잔여 구멍 = 에이전트가 bat 코드를 참고해 동일 동작의 자체 스크립트를 만드는 우회(영호 인지 2026-07-24). 방어는 쓰기 벡터 차단 + `harness_opengate` 참조 Bash 전면 차단까지이고, 그 너머는 기존 봉인과 동일한 **부분 보장**(denylist 무한 회피 불가 — Sol 재리뷰 2026-07-13 선례). 개방 중 통과 이력은 전량 `guard-blocks.log`에 `open-gate`로 남아 사후 감사 가능. hooks *구성*은 SEALED/OPEN 동일하므로 개폐에 `/hooks` 재신뢰 불요(신뢰=구성 기준, BL1 실측).

**파급**: `98.Management`는 코드·빌드와 무관한 *운영 구획*(ARCHITECTURE 디렉토리 지도의 앱 경계 밖 — 번호접두 컨벤션 ADR-027 준수, `99.Others` 앞 관리 슬롯). supervisor-guard에 ③ flag 절 추가, shell-policy sealed 확장(ADR-037 계열), settings deny 1줄 추가. 이후 유지보수 창은 훅 파일 수동 편집 없이 flag만으로 개폐된다(본 창이 마지막 수동 의식).

**위험도**: [H] — 봉인 개폐 경로 신설(하네스 통제 구조 변경). CHANGELOG [H] 기록 동반.

**관련**: ADR-037(봉인 확장) · CORE-08(새 최상위 폴더 ADR 선행) · CORE-11(사용자 단독 통제) · `.claude/policies/execution-owner.md`(잡무 기준 v1 — 같은 창의 짝 결정) · `98.Management/Harness_OpenGate/README.md`(운영 절차).

**현황(2026-07-24)**: 채택(영호 — "OpenGate는 Agent한테는 Deny"). 구현 = 본 창에서 설치, 첫 CLOSE 실행이 메커니즘의 첫 실증.

---

### 개정 1 (2026-07-25, HR2 P01 — 영호 승인): 방어 범위 축소 — *참조 Bash 전면 차단* → **실행·쓰기 벡터 차단**

**철회(supersede)**: 원 결정 `:3`과 위협 모델 `:9`가 선언한 방어 범위 중 다음을 축소한다.
> *"supervisor-guard의 `harness_opengate` **참조 Bash 전면 차단**"* / *"방어는 쓰기 벡터 차단 + `harness_opengate` 참조 Bash 전면 차단까지"*

**존치**: 실행 주체 = 영호 단독 · settings deny · shell-policy sealed 분류 · flag TTL 4h · 개방 이력 `guard-blocks.log` 기록 · 위협 모델(성실한 에이전트의 실수 방지, 적대 봉쇄 아님).

#### 축소 근거 — 전면 차단이 *추가로* 막는 것은 읽기 명령뿐이고, 그 읽기는 이미 열려 있다

현행 방어를 층별로 분해하면(실측 2026-07-25):

| 벡터 | 무엇이 막는가 | `supervisor-guard.sh:70-72`(전면 차단)의 기여 |
|---|---|---|
| flag·canonical **쓰기** | `shell-policy.mjs:223`(sealed 분류) + `:244`(`HARNESS_CANDIDATE_RE`) + settings deny | **중복** — 없어도 막힌다 |
| `.bat` **실행** | `:70-72` **단독** | ⭐ **핵심 — 반드시 유지** |
| 상태 **읽기 명령**(`git log`·`cat`·`head`) | `:70-72` | ⚠️ **달성되지 않는 방어** — 아래 |

⚠️ **읽기 차단은 방어로 성립하지 않는다.** `Read`·`Glob` 도구는 열려 있어 `gate-open.flag` 내용도 `OPEN-GATE.bat` 코드도 그대로 읽힌다. 그리고 **차단 메시지 자체가 그 경로를 안내한다** — *"에이전트는 Read/Glob 도구로 상태 확인만."* 즉 이 차단은 우회를 막는 것이 아니라 **같은 행위를 다른 도구로 하게 만들 뿐**이다.

동시에 부작용은 실재한다 — `*harness_opengate*`는 **부분 문자열 매칭**이라 `git log 98.Management/Harness_OpenGate/`처럼 명백한 읽기도, 심지어 그 이름을 **언급만 하는 명령**도 차단된다.

**대안과 트레이드오프**:
- (a) *현행 전면 차단 유지* — 추가 작업 0. 다만 위 표대로 **실질 방어 이득이 없는 마찰**이 남고, 봉인 상태에서 에이전트가 창 상태를 Bash로 확인할 수 없어 *"상태 읽기·개방 요청은 가능"* 이라는 운영 전제와 어긋난다.
- (b) *`:70-72` 제거* — 마찰은 사라지나 **`.bat` 실행 차단이 함께 사라진다.** 실행은 쓰기 동사가 없어 `shell-write` 판정에 걸리지 않으므로 **자기 개방 벡터가 열린다.** 기각.
- (c) **채택: 조건을 실행·쓰기 벡터로 좁힌다** — `harness_opengate` 참조 중 **실행(`.bat`·`cmd`·`start`·`powershell -File` 등)과 쓰기**만 차단하고, 읽기 전용 명령은 통과시킨다.

⚠️ **과속방지턱 가치에 대한 반론과 답** — *"읽기 명령 차단도 성실한 에이전트가 그 방향으로 흘러가는 것을 막는 방지턱 아닌가"* 는 타당한 지적이고 원 ADR의 위협 모델과도 맞다. 다만 방지턱이 성립하려면 **우회 경로가 눈에 덜 띄어야** 하는데, 여기서는 차단 메시지가 정식 대체 경로를 직접 알려준다. 방지턱이 아니라 **표지판**이다.

#### 이번 축소가 잔여 구멍을 넓히지 않는다는 근거

원 ADR `:9`가 정직하게 선언한 잔여 구멍 — *"에이전트가 bat 코드를 참고해 동일 동작의 자체 스크립트를 만드는 우회"* — 은 **그대로 남는다.** 그러나 이번 축소가 그 구멍을 **넓히지는 않는다**: bat 코드 읽기는 축소 이전에도 `Read` 도구로 가능했기 때문이다. 축소되는 것은 *이미 달성되지 않던 방어*뿐이다.

**⚠️ 완료 조건에 양방향 프로브를 요구한다**(P05·P11) — 한 방향만 보면 과차단이나 구멍 중 하나를 놓친다.
- 읽기(`git log <OpenGate 경로>`) → **통과**해야 한다
- `.bat` 실행 → 여전히 **차단**돼야 한다
- flag **쓰기**(리다이렉트·`tee`·`node -e` 내장 API) → 여전히 **차단**돼야 한다

**위험도**: [H] — 봉인 방어 범위 변경. 계약 축소이므로 **P05 코드 변경보다 본 개정이 선행**한다(순서가 곧 정당성).

**관련**: `.claude/hooks/supervisor-guard.sh:70-72`(대상) · `.claude/hooks/_lib/shell-policy.mjs:223,244`(중복 층) · `98.Management/Harness_OpenGate/README.md:36`(동반 갱신) · `01.Phases/21_HR2-opus5-renewal/05-hook-security.md`(구현).

**현황(2026-07-25)**: 채택. 구현 = HR2 P05(커밋 f2afa08), 검증 = P11 발화 프로브 ③④⑤.

---

### 보완 (2026-07-25, HR2 P05): `open-gate` 감사 라벨은 **선언만 됐고 작동한 적이 없다**

원 결정 `:9`는 위협 모델 완화의 *대가*로 이렇게 적었다 — *"개방 중 통과 이력은 전량 `guard-blocks.log`에 `open-gate`로 남아 사후 감사 가능."* **그 대가는 지불된 적이 없다.**

- **실측**: `grep -c "open-gate" .claude/state/guard-blocks.log` → **0건**. 실제로는 `notify`로 찍혀 있고, 그 라벨은 2,526건 중 하나라 개방 통과만 골라낼 수 없다.
- **원인**: `_lib/guard-log.mjs`의 `action === 'block' ? 'block' : 'notify'` 이분법이 `block` 아닌 **모든** 라벨을 뭉갰다. `supervisor-guard.sh:36`은 `open-gate`를 정확히 넘기고 있었다 — **훅은 처음부터 옳았고 로거가 삼켰다.**
- **조치**: 라벨 정규화를 allowlist(`LOG_ACTIONS = ['block','open-gate','notify']`)로 전환. 미등록 라벨은 `notify` 폴백. 라벨을 쓰는 훅과 이 목록은 **짝으로 갱신**한다(등재를 잊으면 폴백돼 눈에 띄지 않는다 — 지금 일어난 일이 정확히 그것이다). 전 훅 라벨 전수 확인 결과 사용 중인 라벨은 `block`·`notify`·`open-gate` 3종뿐으로 allowlist가 전부 커버한다.
- ⚠️ **소급 불가 — 소급하지 않는다.** 로테이션(`guard-blocks.log.1`)으로 옛 이력은 복원할 수 없고, 남아 있는 `notify` 항목에서 개방 통과분만 분리할 근거도 없다. **감사 가능 구간은 이 수정 시점 이후**이며, 그 이전 창의 통과 이력은 **감사 불가**로 남는다.
- **교훈**: 이분법 정규화는 새 값이 생길 때마다 **조용히** 삼킨다. 원장·로그의 라벨 집합은 allowlist로 두고, 계약 문서가 특정 라벨을 근거로 삼으면 **그 라벨의 존재를 회귀 테스트로 고정**한다(`guard-log.test.mjs` 3건 등재).
