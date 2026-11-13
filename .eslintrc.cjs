/* eslint 8 classic config (package.json에 type:module 없음 → .cjs 불필요하나 명시적 안전). */

// 프로세스 경계 (M05 G2) — 금지 트리 이름마다 상대 경로 꼴과 별칭 꼴을 함께 막는다.
// eslint 8.57의 no-restricted-imports에는 regex 옵션이 없어 gitignore식 group을 쓴다.
// `**/../<트리>`는 「`..` 바로 뒤에 트리 이름」만 잡는다 — 깊이 무관(`../../main/x`)으로 걸리고,
// `./sub/main/x`·`../sibling/main/x`처럼 우연히 이름이 같은 하위 폴더는 걸리지 않는다 (stdin 실측).
// `**/00_Source/<트리>`는 소스 루트를 경유하는 상대 경로(`../../../../00_Source/main/x`)를 잡는다 — G2 검수 중요 1.
function boundary(...trees) {
  const group = trees.flatMap((t) => [`**/../${t}`, `**/../${t}/**`, `**/00_Source/${t}`, `**/00_Source/${t}/**`, `@${t}`, `@${t}/**`])
  return {
    'no-restricted-imports': ['error', {
      patterns: [{ group, message: `프로세스 경계: 이 트리에서 ${trees.join('·')} 트리를 import하지 않는다 (M05 G2).` }]
    }]
  }
}

module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true }
  },
  plugins: ['@typescript-eslint', 'react-hooks'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  env: { node: true, browser: true, es2022: true },
  ignorePatterns: ['out/', 'dist/', 'node_modules/', '99_Others/scripts/', '*.config.ts', '*.cjs'],
  overrides: [
    { files: ['02_Project/01_TestCode/**'], rules: { 'no-empty': 'off' } },
    { files: ['02_Project/00_Source/renderer/**'], rules: boundary('main', 'preload') },
    // 예외 한 파일: window.api 전역 타입의 다리 — G2 결정 대장 [USER] 2026-11-14. preload만 풀고 main은 계속 막는다
    { files: ['02_Project/00_Source/renderer/src/env.d.ts'], rules: boundary('main') },
    { files: ['02_Project/00_Source/shared/**'], rules: boundary('main', 'preload', 'renderer') },
    { files: ['02_Project/00_Source/main/**'], rules: boundary('renderer', 'preload') },
    { files: ['02_Project/00_Source/preload/**'], rules: boundary('renderer') }
  ],
  rules: {
    'no-empty': ['error', { allowEmptyCatch: true }],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn'
  }
}
