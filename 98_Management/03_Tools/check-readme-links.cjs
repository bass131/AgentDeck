#!/usr/bin/env node
/**
 * check-readme-links.cjs — README.md의 내부 링크가 실제로 존재하는지 검사한다.
 *
 * 저장소 대문인 README가 없는 문서를 가리키는 사고는 조용히 남는다. 이 스크립트는 그 사고를
 * 기계 판정으로 바꾼다 — 깨진 링크가 하나라도 있으면 목록을 찍고 exit 1로 끝난다.
 *
 * 사용: node 98_Management/03_Tools/check-readme-links.cjs
 *
 * 검사 대상:
 *   ① 인라인 링크 `[텍스트](타깃)`와 이미지 링크 `![대체텍스트](타깃)`.
 *      타깃은 공백을 품을 수 있고(`(내 문서.md)`), 각괄호로 감쌀 수 있으며(`(<내 문서.md>)`),
 *      뒤에 제목(`(경로 "제목")`)이 붙을 수 있다.
 *   ② reference-style 링크 `[텍스트][라벨]`·`[라벨][]`와 그 정의 `[라벨]: 경로`.
 *      축약형 `[라벨]` 단독은 대상이 아니다 — 한국어 본문의 대괄호 강조와 구별할 수 없어
 *      오탐이 대량으로 난다. 쓰이지 않은 정의도 검사하지 않는다 (집계 축은 「사용처」다).
 *
 * 검사 제외: 프로토콜 스킴이 붙은 외부 주소(http, https, mailto 등)와 `#`로 시작하는 순수 앵커.
 *
 * 반려 사유는 넷이다 — `부재`, `대소문자 불일치`, `저장소 밖`, `참조 정의 없음`.
 *   대소문자는 실제 디렉터리 항목과 한 조각씩 대조한다. Windows의 `fs.existsSync`는 대소문자를
 *   가리지 않아 `Plan.md`와 `plan.md`를 같은 것으로 보고, 그 링크는 대소문자를 가리는 배포
 *   환경에서만 깨진다 — 여기서 잡지 않으면 아무 데서도 안 잡힌다.
 *   저장소 밖 경로(`../옆저장소/x.md`)는 실존해도 반려한다 — README의 내부 링크가 아니고,
 *   저장소를 클론한 사람에게는 없는 파일이다.
 *
 * 종료 코드: 0 = 내부 링크 전부 실존, 1 = 깨진 링크 발견, 2 = README.md 부재.
 *
 * 주의: 이 스크립트는 README.md를 읽기만 한다. 깨진 링크를 자동으로 고치지 않는다.
 */
'use strict';

const fs = require('fs');
const path = require('path');

// 저장소 루트는 훅이 주입하는 CLAUDE_PROJECT_DIR를 우선 쓰고, 없으면 실행 위치를 쓴다.
const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const README = path.join(ROOT, 'README.md');

// 인라인 링크 — 닫는 괄호까지를 통째로 잡고 타깃 해석은 parseDestination이 맡는다.
// 종전 정규식은 `([^)\s]+)`라 공백 든 타깃을 아예 못 잡았고, 그 링크는 집계에서 조용히 빠졌다.
const INLINE_RE = /!?\[[^\]]*\]\(([^)]*)\)/g;
// reference-style 사용처 — `[텍스트][라벨]`과 축약 `[라벨][]`
const REF_USE_RE = /!?\[([^\]]*)\]\[([^\]]*)\]/g;
// reference-style 정의 — 줄 머리의 `[라벨]: 타깃 "제목"`
const REF_DEF_RE = /^ {0,3}\[([^\]]+)\]:\s*(.+?)\s*$/;

/** 링크 타깃이 외부 주소인지 판정한다 — `http://`, `mailto:`처럼 스킴이 붙은 것 전부. */
function isExternal(target) {
  return /^[A-Za-z][A-Za-z0-9+.-]*:/.test(target);
}

/** `%20` 같은 URL 인코딩을 푼다. 잘못된 인코딩이면 원문을 그대로 돌려준다. */
function decodeTarget(target) {
  try {
    return decodeURIComponent(target);
  } catch (err) {
    return target;
  }
}

/**
 * 괄호 안(또는 정의 줄 뒤)의 원문에서 타깃만 떼어낸다.
 * `<경로>` 각괄호형, `경로 "제목"` 제목형, 공백 든 맨 경로를 모두 받는다.
 */
function parseDestination(rawInside) {
  const s = String(rawInside).trim();
  if (s === '') return '';
  if (s.startsWith('<')) {
    const close = s.indexOf('>');
    if (close !== -1) return s.slice(1, close).trim();
    return s.slice(1).trim();
  }
  // 제목은 따옴표 세 종이 쓰인다. 제목만 떼고 앞의 경로는 공백째 남긴다.
  const title = s.match(/\s+(?:"[^"]*"|'[^']*'|\([^)]*\))$/);
  return (title ? s.slice(0, title.index) : s).trim();
}

/**
 * 링크 타깃을 검사할 절대 경로로 바꾼다.
 * 검사 대상이 아니면 null을 돌려준다 — 외부 주소, 순수 앵커, 앵커만 남은 빈 경로가 그렇다.
 */
function resolveTarget(target) {
  if (!target || target.startsWith('#')) return null;
  if (isExternal(target)) return null;

  // `문서.md#절` 형태에서 `#` 뒤는 문서 안의 위치이므로 경로 판정에서 잘라낸다.
  const hashAt = target.indexOf('#');
  const rawPath = hashAt === -1 ? target : target.slice(0, hashAt);
  if (!rawPath) return null;

  const decoded = decodeTarget(rawPath);
  // 상대 경로든 `/`로 시작하는 루트-절대 경로든 모두 저장소 루트를 기준으로 푼다.
  const relative = decoded.startsWith('/') ? decoded.slice(1) : decoded;
  return path.resolve(ROOT, relative);
}

/**
 * 절대 경로가 저장소 안에 있고 실제로 그 대소문자로 존재하는지 한 조각씩 대조한다.
 * 돌려주는 값은 `{ ok: true }` 또는 `{ ok: false, why, hint }`다.
 */
function verifyPath(absolute) {
  const rel = path.relative(ROOT, absolute);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return { ok: false, why: '저장소 밖', hint: absolute };
  }
  const segments = rel.split(path.sep).filter((s) => s !== '');
  let cursor = ROOT;
  for (const segment of segments) {
    let entries;
    try {
      entries = fs.readdirSync(cursor);
    } catch (err) {
      return { ok: false, why: '부재', hint: path.relative(ROOT, cursor) || '.' };
    }
    if (entries.includes(segment)) {
      cursor = path.join(cursor, segment);
      continue;
    }
    const insensitive = entries.find((e) => e.toLowerCase() === segment.toLowerCase());
    if (insensitive) {
      return { ok: false, why: '대소문자 불일치', hint: path.join(path.relative(ROOT, cursor), insensitive) };
    }
    return { ok: false, why: '부재', hint: path.relative(ROOT, absolute) };
  }
  return { ok: true };
}

/** reference-style 정의를 라벨 → 타깃 표로 모은다. 라벨 대조는 대소문자를 가리지 않는다 (CommonMark). */
function collectDefinitions(lines) {
  const map = new Map();
  lines.forEach((line) => {
    const m = line.match(REF_DEF_RE);
    if (!m) return;
    const label = m[1].trim().toLowerCase().replace(/\s+/g, ' ');
    if (!map.has(label)) map.set(label, parseDestination(m[2]));
  });
  return map;
}

function main() {
  if (!fs.existsSync(README)) {
    console.error(`README.md를 찾지 못했다: ${README}`);
    process.exit(2);
  }

  const lines = fs.readFileSync(README, 'utf8').split(/\r?\n/);
  const definitions = collectDefinitions(lines);
  const broken = [];
  let checked = 0;

  // 타깃 1건을 검사한다 — 집계에 넣고, 깨졌으면 사유와 함께 담는다.
  function inspect(lineNo, target, note) {
    const absolute = resolveTarget(target);
    if (absolute === null) return;
    checked++;
    const verdict = verifyPath(absolute);
    if (!verdict.ok) broken.push({ line: lineNo, target, why: verdict.why, hint: verdict.hint, note });
  }

  // 줄 번호를 그대로 보고하기 위해 한 줄씩 훑는다.
  lines.forEach((line, index) => {
    const lineNo = index + 1;
    if (REF_DEF_RE.test(line)) return; // 정의 줄 자체는 사용처가 아니다 — 집계는 사용처에서 한다

    INLINE_RE.lastIndex = 0;
    let match;
    while ((match = INLINE_RE.exec(line)) !== null) {
      inspect(lineNo, parseDestination(match[1]), null);
    }

    REF_USE_RE.lastIndex = 0;
    while ((match = REF_USE_RE.exec(line)) !== null) {
      const label = (match[2].trim() || match[1].trim()).toLowerCase().replace(/\s+/g, ' ');
      if (label === '') continue;
      if (!definitions.has(label)) {
        checked++;
        broken.push({ line: lineNo, target: `[${label}]`, why: '참조 정의 없음', hint: '정의 줄 `[라벨]: 경로`가 없다', note: 'reference' });
        continue;
      }
      inspect(lineNo, definitions.get(label), `reference [${label}]`);
    }
  });

  if (broken.length > 0) {
    console.error('README.md에서 깨진 내부 링크를 찾았다:');
    for (const item of broken) {
      const note = item.note ? ` (${item.note})` : '';
      console.error(`  README.md:${item.line}  ${item.target}${note}  ->  ${item.why}: ${item.hint}`);
    }
    console.error(`요약: 내부 링크 ${checked}건 중 ${broken.length}건이 깨졌다.`);
    process.exit(1);
  }

  console.log(`OK: 내부 링크 ${checked}건 전부 실존`);
  process.exit(0);
}

main();
