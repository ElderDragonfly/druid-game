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

// Trees use only the four upright sprites from the latest reference.
export const ENVIRONMENT_VARIANTS: Record<EnvironmentKind, readonly EnvironmentVariant[]> = {
  tree: conifers.sprites.map(sprite => ({
    id: sprite.id, texture: 'forest-trees', frame: sprite.id, width: sprite.width, height: sprite.height,
    scale: conifers.scale, anchorX: sprite.anchorX, anchorY: sprite.anchorY,
    bodyWidth: Math.round(sprite.baseWidth * conifers.scale), bodyHeight: Math.round(sprite.baseHeight * conifers.scale),
  })),

};

export function environmentVariant(kind: EnvironmentKind, variant: number) {
  const result = ENVIRONMENT_VARIANTS[kind][variant];
  if (!result) throw new Error(`Unknown environment variant: ${kind}/${variant}`);
  return result;
}
