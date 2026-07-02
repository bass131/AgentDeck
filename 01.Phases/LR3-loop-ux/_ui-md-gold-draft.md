---
owner: 영호 (AI 초안 — 확정·UI.md 반영은 영호 단독)
milestone: LR3
phase: 06
title: UI.md 팔레트 표 갱신 초안 — 금색(--gold) 토큰 완성(REPL 상태 표시등)
status: 초안 (영호 확정 대기 — UI.md 본문 미반영)
date: 2026-07-03 (2차 갱신: 영호 육안 게이트 조정 반영)
summary: 06-loop-gui-polish.md가 요구하는 "금색 토큰 = 안티슬롭 새 색 발명 금지의 명시적
  예외" 승인용 초안. 실제로는 완전히 새 HEX를 만들지 않고 이미 tokens.css에 있던
  `--gold`(Fable 5 모델 도트, #C98A3C/#D9A24C)를 재사용 — 짝 토큰(`--gold-soft`/
  `--gold-line`)만 신설해 REPL 상태 표시등에 두 번째 용도로 얹었다. 코드(tokens.css)는
  이미 구현·전체 게이트 green — 이 문서는 그 구현이 서 있는 *UI.md 서술*만의 확정 요청.
  **2026-07-03 육안 게이트에서 영호 조정 지시 2건 반영**: (1) 점등 의미 — 애초 "세션
  활동 중에만 점등"에서 **"토글 ON이면 활동 무관 상시 점등"**(기능 활성 표시등)으로
  단순화. (2) 연출 — 정적 배경/테두리 틴트에서 **은은한 금색 형광(fluorescent) pulse**로
  격상, 이는 UI.md §5 안티슬롭 "글로우 금지" 규칙의 **명시적 예외**(영호 지시, 이 버튼
  한정 — 새 색 발명은 아니고 기존 --gold 알파 파생이라 §1 "예외 아님" 논지는 유지).
---

# LR3 P06 — UI.md 팔레트 표 갱신 초안 (금색 토큰)

> **성격**: AI 초안. 헌법상 UI.md는 영호 단독 문서 → 이 문서는 *제안*이고, 최종 반영 여부·
> 문구는 영호가 확정한다. `02.Source/renderer/src/theme/tokens.css`는 이미 이 내용대로
> 구현·`npm run typecheck`/`test`/`lint` green — 이 문서는 그 구현을 UI.md 팔레트 표에
> 옮겨 적는 서술 승인 요청이다.

---

## §1. 왜 "새 색 발명"이 아니라 "기존 색 완성"인가

UI.md §5 안티슬롭 규칙은 임의 색 발명을 금지한다. 이번 작업이 그 규칙의 *예외*로 분류된
이유는 06-loop-gui-polish.md가 "REPL 버튼에 금색 이펙트"를 명시적으로 요구했기 때문이지만,
실제 구현은 **완전히 새로운 HEX를 만들지 않았다**:

- `tokens.css`에는 이미 `--gold`(라이트 `#C98A3C` / 다크 `#D9A24C`)가 있었다 —
  `lib/pickerOptions.ts`의 Fable 5 모델 옵션 도트 색으로 쓰이는 중(UI.md §1 "기능색"
  표에도 "Fable 5 모델 도트"로 이미 등재돼 있다).
- 이번에 한 일은 그 `--gold`를 **두 번째 용도**(REPL 상태 표시등)에 재사용하고, 배경/테두리
  틴트용 짝 토큰 `--gold-soft`/`--gold-line`을 신설한 것뿐이다 — `--accent`가
  `--accent-2`/`--accent-soft`/`--accent-line`을 갖고 `--warn`이 `--warn-soft`를 갖는
  기존 관례(패밀리 완성)를 그대로 따랐다.

그래도 "한 토큰이 두 가지 다른 의미(모델 식별 vs 세션 상태)로 쓰인다"는 점은 실측 확인이
필요해 이 초안을 통해 명시적으로 승인받으려 한다. 색상환상 accent(테라코타 `#D97757`)와
충분히 떨어져 있어(적주황 vs 황금색) 인접 배치돼도 경합하지 않는다 — Fable 5 도트가 이미
컴포저 모델 피커에서 accent 옆에 자리해 왔으므로 이 하모니는 검증된 조합이다.

---

## §2. UI.md §1 "기능색 (warm-harmonized)" 갱신안

**현재 UI.md 본문(37행)**:

> `--green #5E9968`(세이지, diff add/ok) · `--red #C25B4A`(벽돌, diff del/error) ·
> `--blue/--cyan #5E94BC`(더스티 블루) · `--yellow #C99A2E`(앰버, warn) ·
> `--running #5E94BC`(작업중) · `--violet #B07FA8` · `--teal #4F9E94` · `--rose #C2724E` ·
> `--gold #C98A3C`(Fable 5 도트). 각 `*-soft`/`*-gut`(diff 거터) 변형. 다크는 밝은 변형.

**제안 교체문(밑줄 없이 그대로 대체)**:

> `--green #5E9968`(세이지, diff add/ok) · `--red #C25B4A`(벽돌, diff del/error) ·
> `--blue/--cyan #5E94BC`(더스티 블루) · `--yellow #C99A2E`(앰버, warn) ·
> `--running #5E94BC`(작업중) · `--violet #B07FA8` · `--teal #4F9E94` · `--rose #C2724E` ·
> `--gold #C98A3C`(Fable 5 도트 + REPL 상태 표시등, LR3-06 — `--gold-soft`/`--gold-line`
> 배경·테두리 짝 동반, 글로우 금지·틴트만). 각 `*-soft`/`*-gut`(diff 거터) 변형. 다크는
> 밝은 변형.

### 팔레트 표(신규 행 — §1 "표면"·"강조색" 표와 같은 형식)

| 토큰 | 라이트 | 다크 | 용도 |
|---|---|---|---|
| `--gold` | `#C98A3C` | `#D9A24C` | Fable 5 모델 도트(기존) + REPL 상태 표시등(LR3-06 신규 용도) |
| `--gold-soft` | `#F1E2CD` | `rgba(217,162,76,0.16)` | REPL 표시등 점등 시 배경 틴트(신설) |
| `--gold-line` | `#E1BF93` | `rgba(217,162,76,0.36)` | REPL 표시등 점등 시 테두리(신설) |
| `--gold-glow-1` | `0.45` | `0.42` | 형광 pulse 저점 알파(신설, 2026-07-03 조정 — 5R "묻힘" 피드백으로 상향) — 숫자 값(색 아님), `oklch(from var(--gold) l c h / var(--gold-glow-1))`로 소비 |
| `--gold-glow-2` | `0.85` | `0.80` | 형광 pulse 고점 알파(신설, 2026-07-03 조정 — 5R 상향, UltraCode 코어와 동일 체급) — 라이트가 다크보다 높음(밝은 페이퍼 배경 보정) |

**후속 조정(4R~5R, 2026-07-03 — 영호 시안 `ScreenShot/버튼_개선안.png` 반영)**: 점등 시
배경은 soft 틴트가 아니라 **`--gold` 채움**(수직 그라데이션 곡면) + **네온 림**(채움보다
밝은 `oklch(from var(--gold) calc(l + 0.16) …)` 테두리) + 다층 bloom halo(코어/미드/와이드,
spread 포함)로 진화. 텍스트는 금색 위 대비를 위해 다크 잉크(`oklch(from var(--gold) 0.24
calc(c * 0.55) h)`, 대비 ≈8:1). 좌측에 아이콘 칩(`.toggle-chip`, `>_` 터미널 아이콘) 추가 —
UltraCode(`</>` 칩·어두운 보라 유리·라벤더 텍스트)와 대칭의 "네온 pill" 공통 문법.
soft/line 토큰은 stopped 배너 등 다른 gold 계열 표면에서 계속 사용.

라이트는 기존 accent-soft/accent-line·warn-soft와 동일하게 페이퍼 배경(`#FBF8F1`) 위
플랫 블렌드 HEX, 다크는 accent-soft/accent-line과 동일하게 반투명 rgba 오버레이 — 기존
토큰 관례(§1 "형태" 절 인접 항목들의 라이트=flat HEX/다크=rgba 패턴)를 그대로 따랐다.

---

## §3. 사용처 (참고 — 코드 실측, 2026-07-03 육안 게이트 조정 반영)

- `02.Source/renderer/src/components/01_conversation/Composer.css` `.repl-toggle.repl-lit` —
  배경 `--gold-soft` + 테두리 `--gold-line` + 라벨/배지 텍스트 `--gold`(정적 베이스) **+
  은은한 금색 형광 pulse**(`@keyframes repl-glow-pulse`, 2.6s ease-in-out infinite,
  `oklch(from var(--gold) l c h / alpha)`로 파생한 outer box-shadow만 애니메이션 — 새 색
  발명 0). `prefers-reduced-motion: reduce`에서는 애니메이션 없이 중간 강도 정적 글로우로
  폴백. UltraCode `.orch-toggle.orch-on`의 보라 flow+glow와 동일한 "안티슬롭 글로우 금지
  예외" 계열이지만 색(금색 vs 보라)과 애니메이션 성격(숨쉬기 vs 좌우 흐름)은 분리 — REPL은
  "지금 기능이 켜져 있음"을 알리는 표시등, UltraCode는 "특별 강조 pill"이라는 역할 차이를
  시각적으로도 유지.
- 점등 판정은 `lib/replIndicator.ts`의 `resolveReplLit(replMode)` — **영호 조정
  (2026-07-03)**: 애초 "세션 활동 중에만 점등"(isRunning || hasActiveLoop 대리)이었으나,
  "ON을 통해 기능이 활성화 되어 있으면 계속 점등"이라는 지시로 **replMode 토글 자체와
  동일 의미**로 단순화됐다 — activity 신호는 더 이상 관여하지 않음(항등 함수).

---

## §4. 승인 요청 사항 (영호 GO 필요 — human-visual)

1. **`--gold`를 REPL 상태 표시등에도 재사용**하는 것 승인 — 신규 HEX 발명이 아니라 기존
   토큰의 두 번째 용도 확장.
2. **`--gold-soft`/`--gold-line` 신설** 승인 — accent/warn과 동일 패밀리 완성 패턴.
3. **글로우 pulse 예외** 승인 — UI.md §5 안티슬롭 "글로우 금지" 규칙에 REPL 표시등
   한정 명시적 예외 등재(2026-07-03 영호 지시로 이미 구두 승인, 이 문서는 그 문구화).
4. 위 §2 갱신문·팔레트 표를 UI.md §1에 반영할지(반영 시 문구는 영호가 최종 조정 가능,
   이 초안은 출발점).

이 네 가지가 승인되면 코드는 이미 그 상태(tokens.css·Composer.css 구현·게이트 green)이므로
추가 작업 없이 UI.md 본문만 갱신하면 된다.
