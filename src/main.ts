import { createLegacyGame } from './legacyGame';
import { createPathwaysGame } from './pathways/createGame';
import './style.css';

// Explicit modes let both prototypes run side by side from the same checkout.
// The existing regression server uses the original game in development mode.
const pathways = import.meta.env.MODE === 'pathways';
document.title = pathways ? 'Друид — лесные тропы' : 'Друид — лесной лагерь';
if (pathways) document.getElementById('game')?.setAttribute('aria-label', 'Пробная лесная поляна: WASD — движение; выход на следующую поляну сверху');
export const game = pathways ? createPathwaysGame() : createLegacyGame();

// Vite заменяет старый экземпляр игры при обновлении исходников.
if (import.meta.hot) import.meta.hot.dispose(() => game.destroy(true));
