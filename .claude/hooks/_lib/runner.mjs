// 자체 러너 공용 판정 헬퍼 — 기대-실패 플래그의 소유자 (M02 Phase 1 Step 8).
//
// 왜 필요한가: `npm run test:hooks`는 vitest가 아니라 plain node 스크립트라 `it.fails`가 없다.
// 그래서 「아직 못 고친 표면」을 하드 게이트를 깨지 않고 Red로 기록할 수단이 없었다.
//
// 플래그 의미론 ([USER] 2026-08-10 확정) —
//   플래그 항목은 실측이 기대 판정과 **다르면 통과**한다 (Red 관측 성공).
//   실측이 기대와 **같으면 러너 실패**다 — 예상 밖 통과이므로 플래그 제거를 강제한다.
//   요약 줄에 플래그 잔여 건수를 찍는다 — 잔여 0이 되는 시점이 동등성 증명 완료다.
//
// 사용법:
//   const r = createRunner('제목')
//   r.check('불리언 항목', cond, '실측 세부')
//   r.judge('판정 항목', actual, expected, { expectFail: true, note: '근거' })
//   process.exit(r.summary())

export function createRunner(title) {
  let passed = 0
  const failures = []
  const flags = [] // Red 관측에 성공한 플래그 항목 (잔여 = 수리 대상)
  const stale = [] // 예상 밖 통과 — 플래그를 제거해야 하는 항목

  const head = (label) => String(label).split(/\s/)[0]
  function ok(label) {
    passed++
    console.log(`  ok   ${label}`)
  }
  function bad(label, detail) {
    failures.push(label)
    console.error(`  FAIL ${label}${detail ? ' — ' + detail : ''}`)
  }

  return {
    // 보통 항목 — cond가 참이어야 통과
    check(label, cond, detail) {
      if (cond) ok(label)
      else bad(label, detail)
      return !!cond
    },

    // 판정 항목 — 기본은 actual === expected가 통과. opts.expectFail이면 의미가 뒤집힌다.
    judge(label, actual, expected, opts = {}) {
      const same = actual === expected
      const note = opts.note ? ` · ${opts.note}` : ''
      if (!opts.expectFail) {
        if (same) ok(`${label} → ${expected}${note}`)
        else bad(`${label} → 기대 ${expected} · 실측 ${actual}${note}`)
        return same
      }
      if (!same) {
        flags.push(label)
        ok(`${label} → 기대 ${expected} · 실측 ${actual} [기대-실패 · Red 관측]${note}`)
        return true
      }
      stale.push(label)
      bad(`${label} → 실측이 기대(${expected})와 일치한다 [기대-실패 플래그인데 예상 밖 통과 — 플래그를 제거하라]${note}`)
      return false
    },

    get counts() {
      return { passed, failed: failures.length, flags: flags.length, stale: stale.length }
    },

    // 요약을 찍고 프로세스 종료 코드를 돌려준다 (0 = 통과)
    summary() {
      console.log(`\n${title} — 통과 ${passed} · 실패 ${failures.length} · 기대-실패 플래그 잔여 ${flags.length}건`)
      if (flags.length) console.log(`  잔여 플래그(수리 대상): ${flags.map(head).join(' ')}`)
      if (stale.length) console.error(`  예상 밖 통과(플래그 제거 필요): ${stale.map(head).join(' ')}`)
      if (failures.length) {
        console.error(`\n${failures.length}건 실패`)
        return 1
      }
      console.log('전부 통과')
      return 0
    },
  }
}
