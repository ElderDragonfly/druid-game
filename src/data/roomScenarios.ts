/** Scenario content is separate from the creatures' base combat statistics. */
export const ROOM_GRID = { columns: 3, rows: 3 } as const;
export type RoomScenarioId = 'empty' | 'wolves' | 'cleansing-tree';
export const ROOM_ASSIGNMENTS: readonly RoomScenarioId[] = [
  'empty', 'empty', 'empty',
  'empty', 'empty', 'empty',
  'empty', 'cleansing-tree', 'wolves',
];
export const ROOM_SCENARIOS = {
  wolves: { wolves: { min: 2, max: 3 }, logs: { min: 1, max: 2 }, mushrooms: { min: 0, max: 2 } },
  cleansing: { enemyCount: 3, interactionRadius: 44 },
  mushroomHealing: 1,
} as const;
