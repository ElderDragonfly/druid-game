export interface CharacterDefinition {
  id: string;
  name: string;
  available: boolean;
}

// Порядок массива определяет порядок ячеек; новые персонажи добавляются здесь.
export const CHARACTERS: readonly CharacterDefinition[] = [
  { id: 'druid', name: 'Друид', available: true },
  { id: 'locked-1', name: 'Закрыто', available: false },
  { id: 'locked-2', name: 'Закрыто', available: false },
];
