import collection from '../../docs/art/forest-environment-v1/sprites.json';
import conifers from '../../docs/art/conifer-trees-v1/sprites.json';

export type EnvironmentKind = 'tree' | 'rock';
export interface EnvironmentVariant {
  id: string;
  texture: string;
  frame?: string;
  width: number; height: number;
  scale: number;
  anchorX: number; anchorY: number;
  bodyWidth: number; bodyHeight: number;
}

// Trees use only the four upright sprites from the latest reference.
export const ENVIRONMENT_VARIANTS: Record<EnvironmentKind, readonly EnvironmentVariant[]> = {
  tree: conifers.sprites.map(sprite => ({
    id: sprite.id, texture: 'forest-trees', frame: sprite.id, width: sprite.width, height: sprite.height,
    scale: conifers.scale, anchorX: sprite.anchorX, anchorY: sprite.anchorY,
    bodyWidth: Math.round(sprite.baseWidth * conifers.scale), bodyHeight: Math.round(sprite.baseHeight * conifers.scale),
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
