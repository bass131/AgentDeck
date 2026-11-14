const DEFAULT_FALLBACK = true

let replModeDefault: boolean = DEFAULT_FALLBACK

export function getReplModeDefault(): boolean {
  return replModeDefault
}

export function setReplModeDefault(v: boolean): void {
  replModeDefault = v
}

export function __resetReplModeDefaultForTests(): void {
  replModeDefault = DEFAULT_FALLBACK
}
