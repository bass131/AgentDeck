// M09 G2 — 자격 없는 자식 환경. 명령 포트(템플릿의 검사 명령)와 작업 노드 세션이 이 환경으로 돈다.
// 변수만 빼는 것이 아니라 자격이 들어오는 길을 끊는다.
//   gh  — GH_TOKEN·GH_ENTERPRISE_TOKEN 자리에 가짜 값, GH_CONFIG_DIR은 빈 임시 폴더.
//         실측(2026-11-18, 이 기계): 빈 GH_CONFIG_DIR만 주면 `gh auth status`는 exit 1이지만 `gh auth token`은 keyring(Windows
//         자격 증명 관리자)에서 진짜 토큰을 낸다. 환경 토큰이 keyring보다 먼저 읽히므로 가짜 값을 두면 keyring을 읽지 않는다.
//   git — 시스템 설정(GIT_CONFIG_NOSYSTEM)과 전역 설정(빈 GIT_CONFIG_GLOBAL)을 끊고, 명령줄 설정(GIT_CONFIG_COUNT)으로
//         credential.helper를 빈값으로 리셋한다(작업 저장소 로컬 설정에 심은 도우미까지 지운다 — 명령줄 설정이 마지막에 읽힌다).
//         질의도 끊는다 — GIT_TERMINAL_PROMPT=0, core.askPass 빈값, askpass 변수 빼기, GCM은 비대화·빈 평문 저장소.
//   ssh — SSH 에이전트 변수를 빼고 GIT_SSH_COMMAND로 설정 파일·키·에이전트 없이 BatchMode로 돈다.
// 전역 설정을 끊으면 커밋 신원이 사라지므로 GIT_AUTHOR_*·GIT_COMMITTER_*를 넘겨받은 값으로 채운다.
//
// 한계(실측): 같은 OS 사용자로 도는 프로세스는 이 변수를 스스로 되돌릴 수 있다. 가짜 GH_TOKEN을 지우고 `gh auth token`을 부르거나
// `git credential-manager get`을 GCM 변수 없이 부르면 keyring의 자격을 읽는다. 이 환경은 실수와 순진한 사용을 막는 겹이고,
// 의도적인 세션을 막는 보증은 아니다(결과 보고에 공개한다).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const NO_CREDENTIAL_TOKEN = 'agentdeck-no-credential'

export interface GitIdentity { name: string; email: string }
export interface CredentialFreePaths {
  root: string
  // 빈 gh 설정 폴더
  ghConfigDir: string
  // 빈 git 전역 설정 파일
  gitGlobalConfig: string
  // 빈 폴더 — GCM 평문 저장소, 실행기 git의 hooksPath로 쓴다
  emptyDir: string
}
export interface CredentialFreeEnv {
  env: NodeJS.ProcessEnv
  paths: CredentialFreePaths
  dispose(): void
}

// 이름 그대로 빼는 변수(대소문자 무시). GIT_CONFIG_KEY_n·VALUE_n과 GCM_*·SSH_ASKPASS*는 꼴로 뺀다.
const DROP_NAMES = new Set([
  'GH_TOKEN', 'GITHUB_TOKEN', 'GH_ENTERPRISE_TOKEN', 'GITHUB_ENTERPRISE_TOKEN', 'GH_CONFIG_DIR', 'GH_HOST',
  'SSH_AUTH_SOCK', 'SSH_AGENT_PID', 'GIT_ASKPASS', 'GIT_SSH', 'GIT_SSH_COMMAND', 'GIT_SSH_VARIANT',
  'GIT_CONFIG', 'GIT_CONFIG_PARAMETERS', 'GIT_CONFIG_COUNT', 'GIT_CONFIG_SYSTEM', 'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM',
  'GIT_TERMINAL_PROMPT', 'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL',
  'ACTIONS_RUNTIME_TOKEN', 'ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'ACTIONS_ID_TOKEN_REQUEST_URL',
])
const DROP_PATTERNS = [/^GIT_CONFIG_(KEY|VALUE)_\d+$/, /^GCM_/, /^SSH_ASKPASS/]

function dropped(key: string): boolean {
  const k = key.toUpperCase()
  return DROP_NAMES.has(k) || DROP_PATTERNS.some((p) => p.test(k))
}

const slash = (p: string): string => p.replace(/\\/g, '/')

export function buildCredentialFreeEnv(
  base: NodeJS.ProcessEnv, paths: CredentialFreePaths, identity: GitIdentity | null,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [k, v] of Object.entries(base)) if (v !== undefined && !dropped(k)) env[k] = v
  const config: [string, string][] = [
    ['credential.helper', ''],
    ['core.askPass', ''],
    ['credential.interactive', 'never'],
  ]
  Object.assign(env, {
    GH_TOKEN: NO_CREDENTIAL_TOKEN,
    GH_ENTERPRISE_TOKEN: NO_CREDENTIAL_TOKEN,
    GH_CONFIG_DIR: paths.ghConfigDir,
    GH_PROMPT_DISABLED: '1',
    GH_NO_UPDATE_NOTIFIER: '1',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: paths.gitGlobalConfig,
    GIT_TERMINAL_PROMPT: '0',
    GCM_INTERACTIVE: 'never',
    GCM_CREDENTIAL_STORE: 'plaintext',
    GCM_PLAINTEXT_STORE_PATH: paths.emptyDir,
    SSH_ASKPASS_REQUIRE: 'never',
    GIT_SSH_COMMAND: `ssh -F none -o IdentitiesOnly=yes -o "IdentityFile=${slash(path.join(paths.emptyDir, 'no-key'))}" -o IdentityAgent=none -o BatchMode=yes -o PasswordAuthentication=no`,
    GIT_CONFIG_COUNT: String(config.length),
  })
  config.forEach(([k, v], i) => {
    env[`GIT_CONFIG_KEY_${i}`] = k
    env[`GIT_CONFIG_VALUE_${i}`] = v
  })
  if (identity) {
    env.GIT_AUTHOR_NAME = identity.name
    env.GIT_AUTHOR_EMAIL = identity.email
    env.GIT_COMMITTER_NAME = identity.name
    env.GIT_COMMITTER_EMAIL = identity.email
  }
  return env
}

// 임시 폴더(빈 gh 설정 폴더·빈 전역 설정 파일·빈 폴더)를 만들고 환경을 돌려준다. dispose가 폴더를 지운다.
export function createCredentialFreeEnv(
  base: NodeJS.ProcessEnv, identity: GitIdentity | null, tmpRoot: string = os.tmpdir(),
): CredentialFreeEnv {
  const root = fs.mkdtempSync(path.join(tmpRoot, 'agentdeck-nocred-'))
  const paths: CredentialFreePaths = {
    root,
    ghConfigDir: path.join(root, 'gh'),
    gitGlobalConfig: path.join(root, 'global.gitconfig'),
    emptyDir: path.join(root, 'empty'),
  }
  fs.mkdirSync(paths.ghConfigDir)
  fs.mkdirSync(paths.emptyDir)
  fs.writeFileSync(paths.gitGlobalConfig, '')
  return {
    env: buildCredentialFreeEnv(base, paths, identity),
    paths,
    dispose: () => { fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }) },
  }
}
