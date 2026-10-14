import conifers from '../../docs/art/conifer-trees-v1/sprites.json';

export type EnvironmentKind = 'tree';
export interface EnvironmentVariant {
  id: string;
  texture: string;
  frame?: string;
  width: number; height: number;
  scale: number;
  anchorX: number; anchorY: number;
  bodyWidth: number; bodyHeight: number;
}

// Archived sprites remain available independently of the active spawn pool.
export const ENVIRONMENT_VARIANTS: Record<EnvironmentKind, readonly EnvironmentVariant[]> = {
  tree: conifers.sprites.map(sprite => ({
    id: sprite.id, texture: 'forest-trees', frame: sprite.id, width: sprite.width, height: sprite.height,
    scale: conifers.scale, anchorX: sprite.anchorX, anchorY: sprite.anchorY,
    bodyWidth: Math.round(sprite.baseWidth * conifers.scale), bodyHeight: Math.round(sprite.baseHeight * conifers.scale),
  })),

};

// Empty while the new pine sprite is being reviewed. Use catalog IDs to re-enable trees.
export const TREE_SPAWN_POOL: readonly string[] = [];

export function environmentVariant(kind: EnvironmentKind, variant: number) {
  const result = ENVIRONMENT_VARIANTS[kind][variant];
  if (!result) throw new Error(`Unknown environment variant: ${kind}/${variant}`);
  return result;
}
