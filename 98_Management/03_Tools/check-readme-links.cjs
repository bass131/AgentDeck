#!/usr/bin/env node
/**
 * check-readme-links.cjs — README.md의 내부 링크가 실제로 존재하는지 검사한다.
 *
 * 저장소 대문인 README가 없는 문서를 가리키는 사고는 조용히 남는다. 이 스크립트는 그 사고를
 * 기계 판정으로 바꾼다 — 깨진 링크가 하나라도 있으면 목록을 찍고 exit 1로 끝난다.
 *
 * 사용: node 98_Management/03_Tools/check-readme-links.cjs
 *
 * 검사 대상: 마크다운 링크 `[텍스트](타깃)`와 이미지 링크 `![대체텍스트](타깃)` 전부.
 * 검사 제외: 프로토콜 스킴이 붙은 외부 주소(http, https, mailto 등)와 `#`로 시작하는 순수 앵커.
 *
 * 종료 코드: 0 = 내부 링크 전부 실존, 1 = 깨진 링크 발견.
 *
 * 주의: 이 스크립트는 README.md를 읽기만 한다. 깨진 링크를 자동으로 고치지 않는다.
 */
'use strict';

const fs = require('fs');
const path = require('path');

// 저장소 루트는 훅이 주입하는 CLAUDE_PROJECT_DIR를 우선 쓰고, 없으면 실행 위치를 쓴다.
const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const README = path.join(ROOT, 'README.md');

// `![alt](target)`과 `[text](target)`을 한 번에 잡는다. 앞의 `!`는 있어도 없어도 된다.
// 타깃 뒤에 따라올 수 있는 제목 문자열(`(경로 "제목")`)은 버린다.
const LINK_RE = /!?\[[^\]]*\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g;

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

function main() {
  if (!fs.existsSync(README)) {
    console.error(`README.md를 찾지 못했다: ${README}`);
    process.exit(2);
  }

  const lines = fs.readFileSync(README, 'utf8').split(/\r?\n/);
  const broken = [];
  let checked = 0;

  // 줄 번호를 그대로 보고하기 위해 한 줄씩 훑는다.
  lines.forEach((line, index) => {
    LINK_RE.lastIndex = 0;
    let match;
    while ((match = LINK_RE.exec(line)) !== null) {
      const target = match[1];
      const absolute = resolveTarget(target);
      if (absolute === null) continue;

      checked++;
      if (!fs.existsSync(absolute)) {
        broken.push({ line: index + 1, target, absolute });
      }
    }
  });

  if (broken.length > 0) {
    console.error('README.md에서 깨진 내부 링크를 찾았다:');
    for (const item of broken) {
      console.error(`  README.md:${item.line}  ${item.target}  ->  ${item.absolute}`);
    }
    console.error(`요약: 내부 링크 ${checked}건 중 ${broken.length}건이 깨졌다.`);
    process.exit(1);
  }

  console.log(`OK: 내부 링크 ${checked}건 전부 실존`);
  process.exit(0);
}

main();
