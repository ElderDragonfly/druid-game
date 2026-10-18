import Phaser from 'phaser';

/** Screen-space layer: the world freezes while this fade continues. */
export class DeathOverlay extends Phaser.GameObjects.Container {
  private readonly shade: Phaser.GameObjects.Rectangle;
  private readonly title: Phaser.GameObjects.Text;
  private readonly hint: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    super(scene,0,0);scene.add.existing(this);
    this.setName('death-overlay').setVisible(false);
    this.shade=scene.add.rectangle(0,0,1,1,0x000000).setOrigin(0).setAlpha(0);
    this.title=scene.add.text(0,0,'You dead',{
      fontFamily:'Georgia, serif',fontSize:'70px',color:'#a52b28',letterSpacing:6,
    }).setName('death-title').setOrigin(.5).setAlpha(0);
    this.hint=scene.add.text(0,0,'R — начать заново · Esc — в лагерь',{
      fontFamily:'Arial, sans-serif',fontSize:'16px',color:'#b4b0a6',
    }).setOrigin(.5).setAlpha(0);
    this.add([this.shade,this.title,this.hint]);
  }

  resize(width: number,height: number) {
    this.shade.setSize(width,height);
    this.title.setPosition(width/2,height/2).setFontSize(Math.min(70,width/9));
    this.hint.setPosition(width/2,height/2+80);
  }

  show() {
    if(this.visible)return;
    this.setVisible(true);
    this.scene.tweens.add({targets:this.shade,alpha:.85,duration:1300,ease:'Sine.easeOut'});
    this.scene.tweens.add({targets:this.title,alpha:1,delay:250,duration:1000,ease:'Sine.easeOut'});
    this.scene.tweens.add({targets:this.hint,alpha:1,delay:1100,duration:500});
  }
}
