// Координаты меню независимы от размеров и физики игровой комнаты.
export const MENU_LAYOUT = {
  background: { x: 480, y: 320, width: 960, height: 540 },
  main: { x: 438, playY: 352, exitY: 426, width: 252, height: 58 },
  select: {
    panel: { x: 288, y: 358, width: 472, height: 368 },
    firstCardX: 152, cardStep: 136, cardY: 302, cardWidth: 116, cardHeight: 160,
    backX: 142, startX: 376, buttonY: 500,
    backgroundPixelScale: 2,
    preview: { x: 806, y: 390, scale: 2 },
  },
} as const;
