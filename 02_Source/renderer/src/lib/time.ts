/**
 * lib/time.ts — 시각 표시 포맷 헬퍼 (RS1 P04).
 *
 * 배경: `new Date().toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })`
 * 한 줄이 store 4곳(slices/runtime.ts 3곳 — 커맨드 카드 stamp·user 버블 stamp·구독 레이어
 * 로컬 nowTime / panelSession.ts 1곳)에 각각 복사돼 있었다. 포맷을 바꾸려면 4곳을 손으로
 * 맞춰야 했고 한 곳만 어긋나도 표면마다 시각 표기가 달라지는 구조라 단일 정의로 모은다.
 *
 * ⚠️ 이 함수는 **impure**(Date.now 계열 — 호출 시각에 의존)하다. 기존 관례를 그대로 지킨다:
 * reducer(순수 함수)에서 직접 호출 금지 — 구독/액션 레이어에서 stamp를 만들어 인자로
 * 넘기고, reducer는 받은 time만 쓴다(W7 관례). 그래야 리듀서가 같은 입력에 같은 출력을
 * 내는 성질이 유지돼 테스트가 시각에 흔들리지 않는다.
 *
 * CRITICAL: renderer untrusted — 이 모듈은 표준 Date만 쓴다(window.api/Node/fs 0).
 */

/**
 * nowTimeKo — 현재 시각을 한국어 로케일의 "오후 3:07" 형태로 반환한다.
 *
 * 원본 AgentCodeGUI session.ts L70-72 미러(hour: 'numeric' · minute: '2-digit').
 * 표시 전용 — 정렬·경과 계산에는 쓰지 않는다(그 용도는 epoch ms인 Date.now()를 따로 쓴다.
 * 이 문자열은 로케일 포맷이라 다시 숫자로 되돌릴 수 없다).
 *
 * @returns 예: "오후 3:07"
 */
export function nowTimeKo(): string {
  return new Date().toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })
}
