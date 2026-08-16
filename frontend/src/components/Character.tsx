import type { CharacterType } from '../types'

export const CHARACTER_INFO: Record<CharacterType, { emoji: string; label: string }> = {
  common: { emoji: '🦆', label: 'Pato comum' },
  rare: { emoji: '🦉', label: 'Coruja rara' },
  golden: { emoji: '🌟', label: 'Estrela dourada' },
  bomb: { emoji: '💣', label: 'Bomba perigosa' },
  clock: { emoji: '⏱️', label: 'Relógio, mais 3 segundos' },
}

export function Character({ type }: { type: CharacterType }) {
  const character = CHARACTER_INFO[type]
  return <span className={`character character--${type}`} role="img" aria-label={character.label}>{character.emoji}</span>
}
