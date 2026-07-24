### ADR-038: 관리 구획(`98.Management`) 신설 + Harness OpenGate — 유지보수 창 원클릭 개폐

**결정(유지보수 창 2026-07-24, 영호)**: 최상위 폴더 `98.Management/`를 신설하고(CORE-08 ADR 선행 이행), 하위 `Harness_OpenGate/`에 유지보수 창 개폐 메커니즘을 둔다 — `OPEN-GATE.bat`/`CLOSE-GATE.bat`(canonical settings 교체 + `gate-open.flag` 생성/삭제) + supervisor-guard의 flag 판독(신선하면 전체 통과 + 원장 `open-gate` 기록, **TTL 4h** 초과 시 자동 재봉인). **실행 주체 = 영호 단독 — 에이전트에겐 deny**(settings `Edit(98.Management/Harness_OpenGate/**)` + shell-policy sealed 분류 + supervisor-guard의 `harness_opengate` 참조 Bash 전면 차단).

**이유**: 구 개폐 의식(영호가 settings.json deny 10줄 + supervisor-guard.sh를 손으로 편집 → 재봉인 시 역순 복원)은 사람 마찰이 커서 창 열기를 미루게 만든다 — 창을 안 열면 하네스 드리프트가 쌓인다(2026-07-18 스킬 정본 미반영 사건이 실례: 봉인에 막혀 메모리를 임시 정본으로 운용). 개폐 비용을 더블클릭 2회로 낮추되, **"스위치를 누르는 손은 영호"라는 불변식**은 기술로 보존한다 — 에이전트가 스스로 열 수 있는 봉인은 정의상 봉인이 아니다(드리프트한 세션·주입된 지시가 "일단 열고 진행"으로 흐르는 순간이 봉인의 존재 이유).

**대안과 트레이드오프**: (a) *현행 수동 의식 유지* — 추가 표면 0이나 마찰 존속(창 회피 → 드리프트). (b) *permission 층 폐지 + 훅 단독 봉인* — 토글이 flag 하나로 단순해지나 방어 계층 상실(훅 실패·미신뢰 시 무방비). (c) **채택: canonical 교체 방식** — settings 두 원본(`settings.SEALED.json`/`settings.OPEN.json`)을 bat이 통째로 복사, 두 방어 계층(permission deny + 훅) 모두 보존. 비용 = **canonical 동기화 규칙**(settings 영구 변경 시 두 원본 동시 수정 — 창 도중 `.claude/settings.json`만 고치면 CLOSE 때 소실) — settings 변경은 하네스 봉인 영역이라 빈도가 낮아 감수(영호 2026-07-24). JSON 파싱 재작성(PowerShell ConvertTo-Json)은 비ASCII 이스케이프·포맷 훼손으로 기각.

**위협 모델·한계(정직 선언)**: 본 게이트는 *성실한 에이전트의 실수·드리프트 방지* 모델 — 적대 봉쇄가 아니다. 알려진 잔여 구멍 = 에이전트가 bat 코드를 참고해 동일 동작의 자체 스크립트를 만드는 우회(영호 인지 2026-07-24). 방어는 쓰기 벡터 차단 + `harness_opengate` 참조 Bash 전면 차단까지이고, 그 너머는 기존 봉인과 동일한 **부분 보장**(denylist 무한 회피 불가 — Sol 재리뷰 2026-07-13 선례). 개방 중 통과 이력은 전량 `guard-blocks.log`에 `open-gate`로 남아 사후 감사 가능. hooks *구성*은 SEALED/OPEN 동일하므로 개폐에 `/hooks` 재신뢰 불요(신뢰=구성 기준, BL1 실측).

**파급**: `98.Management`는 코드·빌드와 무관한 *운영 구획*(ARCHITECTURE 디렉토리 지도의 앱 경계 밖 — 번호접두 컨벤션 ADR-027 준수, `99.Others` 앞 관리 슬롯). supervisor-guard에 ③ flag 절 추가, shell-policy sealed 확장(ADR-037 계열), settings deny 1줄 추가. 이후 유지보수 창은 훅 파일 수동 편집 없이 flag만으로 개폐된다(본 창이 마지막 수동 의식).

**위험도**: [H] — 봉인 개폐 경로 신설(하네스 통제 구조 변경). CHANGELOG [H] 기록 동반.

**관련**: ADR-037(봉인 확장) · CORE-08(새 최상위 폴더 ADR 선행) · CORE-11(사용자 단독 통제) · `.claude/policies/execution-owner.md`(잡무 기준 v1 — 같은 창의 짝 결정) · `98.Management/Harness_OpenGate/README.md`(운영 절차).

**현황(2026-07-24)**: 채택(영호 — "OpenGate는 Agent한테는 Deny"). 구현 = 본 창에서 설치, 첫 CLOSE 실행이 메커니즘의 첫 실증.
