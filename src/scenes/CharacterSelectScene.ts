import Phaser from 'phaser';
import { CHARACTERS } from '../data/characters';
import { addSeatedDruid, DRUID_TEXTURES } from '../rendering/druidArt';
import { MenuButton } from '../ui/MenuButton';
import { MENU_LAYOUT } from '../ui/layout';
import { addCampBackground, addMenuHint, bindSceneKey } from '../ui/sceneHelpers';
import { SCENES } from './keys';

export class CharacterSelectScene extends Phaser.Scene {
  selectedId = CHARACTERS[0].id;
  private cards: MenuButton[] = [];

  constructor() { super(SCENES.characterSelect); }

  create() {
    this.selectedId = CHARACTERS[0].id;
    this.cards = [];
    const layout = MENU_LAYOUT.select;
    addCampBackground(this, 'selection-camp', layout.backgroundPixelScale);
    const p = layout.panel;
    this.add.rectangle(p.x, p.y, p.width, p.height, 0x0d1b14, 0.87).setStrokeStyle(1, 0x44563f);
    this.add.text(70, 125, 'Выбор персонажа', {
      fontFamily: 'Georgia, serif', fontSize: '28px', color: '#e0d9b8',
    });
    this.add.text(70, 193, 'Кто отправится в лес?', {
      fontFamily: 'Arial, sans-serif', fontSize: '14px', color: '#a1b39b',
    });

    CHARACTERS.forEach((character, index) => {
      const card = new MenuButton(this, layout.firstCardX + index * layout.cardStep, layout.cardY, {
        name: `character-${character.id}`, label: character.name, width: layout.cardWidth,
        height: layout.cardHeight, labelY: 59, fontSize: 17, enabled: character.available,
        onClick: () => {
          this.selectedId = character.id;
          this.cards.forEach((item, slot) => item.setSelected(CHARACTERS[slot].id === this.selectedId));
        },
      }).setSelected(index === 0);
      const portrait = this.add.image(0, -14, DRUID_TEXTURES.standing, 'figure');
      portrait.setScale(94 / portrait.height).setName(`portrait-${character.id}`);
      if (!character.available) portrait.setTint(0x1a231d).setAlpha(0.28);
      card.add(portrait);
      this.cards.push(card);
      if (!character.available) {
        // Закрытые ячейки показывают только силуэт и маленький замок.
        const lock = this.add.graphics().lineStyle(2, 0x879180).strokeRoundedRect(-5, -7, 10, 11, 4);
        lock.fillStyle(0x879180).fillRect(-8, 0, 16, 12).setPosition(0, 20);
        card.add(lock);
      }
    });

    this.add.text(70, 402, 'Друид', { fontFamily: 'Georgia, serif', fontSize: '22px', color: '#dccda9' });
    this.add.text(70, 435, 'Природная магия · 3 HP', { fontFamily: 'Arial, sans-serif', fontSize: '13px', color: '#9dae94' });
    const preview = layout.preview;
    addSeatedDruid(this, preview).setName('selected-character-preview');
    const back = () => this.scene.start(SCENES.mainMenu);
    const start = () => {
      const character = CHARACTERS.find(item => item.id === this.selectedId && item.available);
      if (character) this.scene.start(SCENES.room, { characterId: character.id });
    };
    new MenuButton(this, layout.backX, layout.buttonY, { name: 'back', label: 'Назад', width: 138, fontSize: 19, onClick: back });
    new MenuButton(this, layout.startX, layout.buttonY, { name: 'start-run', label: 'Начать', width: 236, fontSize: 22, onClick: start });
    bindSceneKey(this, 'keyup-ESC', back);
    bindSceneKey(this, 'keyup-ENTER', start);
    addMenuHint(this, 'Enter — начать · Esc — назад');
  }
}
