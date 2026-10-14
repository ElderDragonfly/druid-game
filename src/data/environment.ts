import collection from '../../docs/art/forest-environment-v1/sprites.json';

export type EnvironmentKind = 'tree' | 'bush' | 'rock';
export interface EnvironmentVariant {
  id: string;
  texture: string;
  frame?: string;
  width: number; height: number;
  scale: number;
  anchorX: number; anchorY: number;
  bodyWidth: number; bodyHeight: number;
}

// Native PNGs retain the approved art. Physics uses only the base, not the canopy.
const treeBases: Record<string, { anchorX: number; width: number; height: number }> = {
  'tree-01-oak-large': { anchorX: 254.5, width: 64, height: 30 },
  'tree-02-oak-medium': { anchorX: 158.5, width: 58, height: 26 },
  'tree-03-oak-small': { anchorX: 122.5, width: 36, height: 20 },
  'tree-04-pine': { anchorX: 175, width: 56, height: 26 },
  'tree-05-sapling': { anchorX: 72, width: 30, height: 16 },
};

export const ENVIRONMENT_VARIANTS: Record<EnvironmentKind, readonly EnvironmentVariant[]> = {
  tree: collection.sprites.filter(sprite => sprite.category === 'tree').map(sprite => {
    const base = treeBases[sprite.id];
    return { id: sprite.id, texture: 'forest-trees', frame: sprite.id, width: sprite.width, height: sprite.height,
      scale: 0.5, anchorX: base.anchorX, anchorY: sprite.height - collection.padding,
      bodyWidth: base.width, bodyHeight: base.height };
  }),
  bush: Array.from({ length: 3 }, (_, variant) => ({
    id: `meadow-bush-${variant}`, texture: `meadow-bush-${variant}`,
    width: 28, height: 22, scale: 2.5, anchorX: 14, anchorY: 22, bodyWidth: 50, bodyHeight: 30,
  })),
  rock: collection.sprites.filter(sprite => sprite.category === 'rock').map(sprite => ({
    id: sprite.id, texture: 'forest-rocks', frame: sprite.id, width: sprite.width, height: sprite.height,
    scale: 0.5, anchorX: sprite.width / 2, anchorY: sprite.height - collection.padding,
    bodyWidth: Math.max(12, Math.round((sprite.width - collection.padding * 2) * 0.5 * 0.8)),
    bodyHeight: Math.max(8, Math.round((sprite.height - collection.padding * 2) * 0.5 * 0.35)),
  })),
};

export function environmentVariant(kind: EnvironmentKind, variant: number) {
  const result = ENVIRONMENT_VARIANTS[kind][variant];
  if (!result) throw new Error(`Unknown environment variant: ${kind}/${variant}`);
  return result;
}
