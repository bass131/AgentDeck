// 「내 손이 필요한 일」 알림의 판단. app.js 「알림」 절이 쓰고, 설명은 docs/알림.md에 있다.
// 화면 요소와 소리가 없는 순수 함수라서 Node 시험(test/chime.test.mjs)이 그대로 불러 쓴다.
// 본보기는 C:\Dev\DawnHolder_Dashboard 의 web/public/decision-sound.js 다.
// app.js가 classic script라서 이 파일도 import·export 없이 전역 AgentDeckChime 하나에만 붙는다.
//
// 울림: 지금 보이는 hand 항목(fresh 필터 뒤)의 키 가운데 기억에 없는 키만 울린다. 한 키는 한 번만 울린다.
// 기억: 페이지 저장소(app.js가 넘긴 localStorage)의 ad-dash-chimed 에 최근 200개. 새로고침해도 다시 울리지 않는다.
// 저장소가 없거나 막히면 열려 있는 동안만 기억한다. 기억이 전혀 없을 때(첫 방문) 첫 스냅샷에 이미 있던 항목은 울리지 않는다.
(() => {
'use strict';
const RUNG_KEY = 'ad-dash-chimed';
const RUNG_MAX = 200;
const QUIET_AFTER_MIN = 5;
const newest = ids => ids.slice(-RUNG_MAX);

// 보이는 항목의 알림 키. 키가 없는 항목은 울림 대상이 아니다.
const handKeys = items => [...new Set((items || []).map(h => h && h.key).filter(k => typeof k === 'string' && k))];

// 스냅샷 한 번의 걸음. rung은 기억한 키(기억이 없으면 null), shown은 지금 보이는 키. 지금 울릴 키와 기억할 키를 준다.
function chimeStep(rung, shown) {
  const keys = [...new Set(shown || [])];
  if (rung == null) return { ring: [], rung: newest(keys) };
  const known = new Set(rung);
  const ring = keys.filter(k => !known.has(k));
  return { ring, rung: ring.length ? newest([...rung, ...ring]) : rung };
}

// 저장소에 기억한 키. 없거나 읽을 수 없거나 키 목록이 아니면 null이다.
function readRung(storage) {
  try {
    const raw = storage?.getItem(RUNG_KEY);
    if (raw == null) return null;
    const ids = JSON.parse(raw);
    return Array.isArray(ids) && ids.every(id => typeof id === 'string') ? ids : null;
  } catch { return null; }
}
function writeRung(storage, ids) { try { storage?.setItem(RUNG_KEY, JSON.stringify(ids)); } catch {} }

// 페이지의 기억. see(keys)가 지금 울릴 키를 준다. 저장소는 매번 다시 읽어, 같은 현황판의 다른 탭이 울린 키도 울린 것으로 친다.
// 빈 목록도 기억으로 남긴다. 그래야 빈 첫 스냅샷 뒤의 첫 항목이 「첫 스냅샷」으로 잘못 묻히지 않는다.
function createChimeMemory(storage) {
  let mine = null;
  return {
    see(keys) {
      const stored = readRung(storage);
      const rung = mine == null && stored == null ? null : [...new Set([...(stored ?? []), ...(mine ?? [])])];
      const step = chimeStep(rung, keys);
      if (rung == null || step.ring.length) writeRung(storage, step.rung);
      mine = step.rung;
      return step.ring;
    },
  };
}

// 탭 제목 배지. 보이는 항목이 N개면 「(N) 」, 그중 멈춤(level stop)이 있으면 「(!N) 」, 없으면 원래 제목이다.
function badgeTitle(base, items) {
  const n = (items || []).length;
  if (!n) return base;
  return `(${items.some(h => h && h.level === 'stop') ? '!' : ''}${n}) ${base}`;
}

// 응답 마침 뒤 조용한 분 수. quiet는 서버의 summary.activity.quiet({ at, after })다.
// after분(기본 5분)을 넘게 지났을 때만 지난 분 수를 준다. 꼭 after분이거나 그 전이면 null이다.
function quietMinutes(quiet, now) {
  const t = Date.parse(quiet?.at ?? '');
  if (!Number.isFinite(t)) return null;
  const after = Number.isFinite(quiet.after) ? quiet.after : QUIET_AFTER_MIN, gone = now - t;
  return gone > after * 60000 ? Math.floor(gone / 60000) : null;
}

globalThis.AgentDeckChime = Object.freeze({ RUNG_KEY, RUNG_MAX, QUIET_AFTER_MIN, handKeys, chimeStep, readRung, writeRung, createChimeMemory, badgeTitle, quietMinutes });
})();
