export const WITCH_CIRCLE = {
  roomId: 3, druidReferenceHeight: 96,
  radiusX: 72, radiusY: 48, clearingRadiusX: 96, clearingRadiusY: 64, centralHeight: 64,
  ringCount: { min: 12, max: 16 }, ringHeight: { min: 12, max: 18 },
  radialJitter: 5, holdDurationMs: 1000, interiorInset: .12,
  treeSpacing: 120, soilFeather: 5, soilExtent: 1.15,
} as const;
