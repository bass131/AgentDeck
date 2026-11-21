// `npm run test:hooks`는 plain node 스크립트라 `it.fails`가 없다 — 못 고친 표면을 하드 게이트를 깨지 않고 Red로 기록하려고 기대-실패 플래그를 둔다.
// 플래그 항목은 실측이 기대와 다르면 통과(Red 관측)하고, 같으면 예상 밖 통과로 러너가 실패해 플래그 제거를 강제한다.

export function createRunner(title) {
  let passed = 0
  const failures = []
  const flags = []
  const stale = []

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
    check(label, cond, detail) {
      if (cond) ok(label)
      else bad(label, detail)
      return !!cond
    },

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
