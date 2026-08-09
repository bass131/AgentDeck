export const PERM_CARD = '.perm-card'

export const PERM_CARD_OPT = '.perm-card-opt'

export type PermChoice = 'allow' | 'allow_always' | 'deny'

export function permChoiceSelector(choice: PermChoice): string {
  return `${PERM_CARD_OPT}[data-perm-choice="${choice}"]`
}
