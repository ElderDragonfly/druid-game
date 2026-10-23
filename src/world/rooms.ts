import { ROOM_ASSIGNMENTS, ROOM_GRID, type RoomScenarioId } from '../data/roomScenarios';
import { seededRandom } from './random';
import type { Rect } from './geometry';

export interface RoomPlan {
  id: number;
  scenario: RoomScenarioId;
  tree?: { x: number; y: number };
}
type WorldSize = { width: number; height: number };
export function roomBounds(world: WorldSize, id: number): Rect {
  const width = world.width / ROOM_GRID.columns, height = world.height / ROOM_GRID.rows;
  return { x: id % ROOM_GRID.columns * width, y: Math.floor(id / ROOM_GRID.columns) * height, width, height };
}
export function roomAt(world: WorldSize, point: { x: number; y: number }) {
  const column = Math.max(0, Math.min(ROOM_GRID.columns - 1, Math.floor(point.x / (world.width / ROOM_GRID.columns))));
  const row = Math.max(0, Math.min(ROOM_GRID.rows - 1, Math.floor(point.y / (world.height / ROOM_GRID.rows))));
  return row * ROOM_GRID.columns + column;
}
export function generateRooms(seed: number, world: WorldSize): RoomPlan[] {
  const random = seededRandom(seed ^ 0x524f4f4d);
  return ROOM_ASSIGNMENTS.map((scenario, id) => {
    const bounds = roomBounds(world, id);
    return { id, scenario, ...(scenario === 'cleansing-tree' ? { tree: {
      x: bounds.x + bounds.width / 2 + (random() * 2 - 1) * 220,
      y: bounds.y + bounds.height / 2 + (random() * 2 - 1) * 70,
    } } : {}) };
  });
}
/** A small plaza preserves the ritual tree's silhouette and spawn approaches. */
export function ritualTreeClearing(point: { x: number; y: number }): Rect {
  return { x: point.x - 170, y: point.y - 280, width: 340, height: 360 };
}
export function ritualTreeRect(point: { x: number; y: number }): Rect {
  return { x: point.x - 24, y: point.y - 22, width: 48, height: 22 };
}
