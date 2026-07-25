/**
 * thinkingElapsed.ts — 사고(thinking) 경과 시간 파생 순수 함수 (TG1 P02).
 *
 * 배경(01.Phases/18_TG1-thinking-gui/02-thinking-elapsed-store.md): 한 줄 상태 라인에
 * "사고 중… N초" 표시를 얹으려면(렌더는 P04 몫) AppState.thinkingStartedAt(reducer/text.ts
 * handleThinking/handleThinkingDelta가 새 사고 블록이 열릴 때만 기록 — reducer/types.ts
 * AppState.thinkingStartedAt 주석 참조)로부터 "지금 몇 초 지났는가"를 계산하는 헬퍼가
 * 필요하다. 1초 인터벌 리렌더 설계 자체는 이 Phase 범위 밖(P04) — 여기선 순수 계산만.
 *
 * store/staleWatchdog.ts(isStaleNow/remainingStaleMs)와 동일한 설계 원칙을 따른다 —
 * nowMs를 인자로 주입받아 Date.now()를 직접 호출하지 않는다(테스트 결정론 확보).
 *
 * CRITICAL: 순수 함수 — window.api/fs/타이머/Date.now() 직접 호출 0.
 */

/**
 * computeThinkingElapsedSeconds — 사고 시작점(thinkingStartedAt)으로부터 nowMs 시점까지
 * 경과한 초(내림, floor)를 계산한다.
 *
 * thinkingStartedAt===null(현재 열린 사고 블록 없음) → null(판정 불가 — 표시 안 함).
 * nowMs가 thinkingStartedAt보다 앞서면(시계 역전 방어 — 서로 다른 소스에서 stamp된 값이
 * 섞일 가능성 대비) 음수 대신 0을 반환한다.
 *
 * 🟡2 봉합(reviewer): thinkingStartedAt<=0(epoch 1970 근방 — nowMs 미주입 구 호출부가
 * 남긴 값 또는 그 밖의 오염값)도 null과 동등 취급한다. reducer(text.ts)가 이제 nowMs
 * 미주입 시 0 대신 null을 기록하지만(1차 방어), 이 헬퍼 자체도 방어선을 갖춰 "약 55년
 * 경과" 같은 거대값이 어떤 경로로든 렌더에 노출되지 않도록 이중으로 막는다.
 */
export function computeThinkingElapsedSeconds(
  thinkingStartedAt: number | null,
  nowMs: number,
): number | null {
  if (thinkingStartedAt === null || thinkingStartedAt <= 0) return null
  const deltaMs = nowMs - thinkingStartedAt
  if (deltaMs <= 0) return 0
  return Math.floor(deltaMs / 1000)
}
