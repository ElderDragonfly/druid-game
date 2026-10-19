import Phaser from 'phaser';
import ogg from '../../docs/audio/forest-camp-v1/forest-camp-loop.ogg';
import mp3 from '../../docs/audio/forest-camp-v1/forest-camp-loop.mp3';

export const MENU_MUSIC = { key: 'forest-camp-music', urls: [ogg, mp3] };
const PREFERENCE_KEY = 'druid-game.music-enabled.v1';
type Track = Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound | Phaser.Sound.NoAudioSound;
const controllers = new WeakMap<Phaser.Game, MenuMusic>();

/** One track belongs to the game, so changing menu scenes never restarts it. */
export class MenuMusic extends Phaser.Events.EventEmitter {
  readonly track: Track;
  enabled = true;
  private inMenu = false;

  constructor(game: Phaser.Game) {
    super();
    try { this.enabled = localStorage.getItem(PREFERENCE_KEY) !== 'false'; } catch { /* Session preference still works. */ }
    this.track = game.sound.add(MENU_MUSIC.key, { loop: true, volume: .8 }) as Track;
    const unlock = () => this.sync();
    game.sound.on(Phaser.Sound.Events.UNLOCKED, unlock);
    game.events.once(Phaser.Core.Events.DESTROY, () => {
      game.sound.off(Phaser.Sound.Events.UNLOCKED, unlock);
      this.removeAllListeners();
    });
  }

  setInMenu(value: boolean) { this.inMenu = value; this.sync(); }

  toggle() {
    this.enabled = !this.enabled;
    try { localStorage.setItem(PREFERENCE_KEY, String(this.enabled)); } catch { /* No storage must not break audio. */ }
    this.sync(); this.emit('changed');
  }

  private sync() {
    if (!this.inMenu || !this.enabled) { if (this.track.isPlaying) this.track.pause(); return; }
    if (this.track.manager.locked || this.track.isPlaying) return;
    if (this.track.isPaused) this.track.resume();
    else this.track.play();
  }
}

export function menuMusic(game: Phaser.Game) {
  let music = controllers.get(game);
  if (!music) { music = new MenuMusic(game); controllers.set(game, music); }
  return music;
}
