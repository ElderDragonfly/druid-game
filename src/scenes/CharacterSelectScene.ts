import Phaser from 'phaser';
import { addSelectionCampPlate } from '../rendering/selectionCampArt';
import { CHARACTERS } from '../data/characters';
import { MenuButton } from '../ui/MenuButton';
import { MENU_LAYOUT } from '../ui/layout';
import { addCampBackground, addMenuHint, bindSceneKey } from '../ui/sceneHelpers';
import { SCENES } from './keys';

export class CharacterSelectScene extends Phaser.Scene {
  selectedId = CHARACTERS[0].id;
  private cards: MenuButton[] = [];
  private campProps: Phaser.GameObjects.Image[] = [];
  private campPreview!: Phaser.GameObjects.Image;
  private nameLabel!: Phaser.GameObjects.Text;
  private descriptionLabel!: Phaser.GameObjects.Text;

  constructor() { super(SCENES.characterSelect); }

  create() {
    this.selectedId = CHARACTERS[0].id;
    this.cards = [];
    this.campProps = [];
    const layout = MENU_LAYOUT.select;
    addCampBackground(this, 'selection-camp', layout.backgroundPixelScale);
    addSelectionCampPlate(this);
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
        onClick: () => { this.chooseCharacter(character.id); },
      }).setData('characterId', character.id);
      const portrait = this.add.image(0, -14, character.portrait.texture, character.portrait.frame);
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

    this.nameLabel = this.add.text(70, 402, '', { fontFamily: 'Georgia, serif', fontSize: '22px', color: '#dccda9' });
    this.descriptionLabel = this.add.text(70, 435, '', { fontFamily: 'Arial, sans-serif', fontSize: '13px', color: '#9dae94' });
    const preview = layout.preview;
    this.campPreview = this.add.image(preview.x, preview.seatY, CHARACTERS[0].camp!.texture)
      .setName('selected-character-preview').setDepth(2);
    this.chooseCharacter(this.selectedId);
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

  chooseCharacter(id: string) {
    const character = CHARACTERS.find(item => item.id === id && item.available && item.camp);
    if (!character?.camp) return false;
    this.selectedId = character.id;
    this.cards.forEach(card => card.setSelected(card.getData('characterId') === character.id));
    const position = character.camp.position ?? { x: MENU_LAYOUT.select.preview.x, y: MENU_LAYOUT.select.preview.seatY };
    this.campPreview.setTexture(character.camp.texture).setOrigin(character.camp.originX, character.camp.originY)
      .setScale(character.camp.scale).setPosition(position.x, position.y).setData('characterId', character.id);
    this.campProps.forEach(prop => prop.destroy());
    this.campProps = (character.camp.props ?? []).map((prop, index) => this.add.image(
      prop.position?.x ?? position.x, prop.position?.y ?? position.y, prop.texture)
      .setOrigin(prop.originX ?? character.camp!.originX, prop.originY ?? character.camp!.originY)
      .setScale(prop.scale ?? character.camp!.scale).setDepth(1)
      .setName(`selected-character-prop-${index}`).setData('characterId', character.id));
    this.nameLabel.setText(character.name);
    this.descriptionLabel.setText(character.description);
    return true;
  }
}
