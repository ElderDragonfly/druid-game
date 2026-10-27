import { BASE_MOVEMENT_SPEED } from '../data/movement';
import { onEntityDataChanged } from '../data/entityBalance';
import Phaser from 'phaser';
import { Druid } from '../entities/Druid';
import { CHARACTERS } from '../data/characters';
import { SCENES } from './keys';
import { bindSceneKey } from '../ui/sceneHelpers';
import { MeadowWorld } from '../world/MeadowWorld';
import { generateMeadow, MEADOW_WORLD, MEADOW_PIXEL_SCALE, type MeadowLayout } from '../world/meadowLayout';
import { EllipticalFollowCamera } from '../camera/EllipticalFollowCamera';
import { facingFromVector, type Facing, type MovementKeys } from '../input/EightWayFacing';
import { AcornAttack } from '../world/AcornAttack';
import { COMBAT_EVENTS } from '../combat/events';
import { DeathOverlay } from '../ui/DeathOverlay';
import { clearRun, saveRun } from '../persistence/runSave';
import type { RunSave } from '../persistence/snapshots';
import { menuMusic } from '../audio/MenuMusic';
import { HoldInteraction } from '../interaction/HoldInteraction';
import { HoldInteractionIndicator } from '../ui/HoldInteractionIndicator';
import { bushInSpawnRoom, bushVisualRect, generateBushes } from '../world/bushes';
import { ACTIVE_BUSH_VARIANT } from '../data/bushes';
import type { Rect } from '../world/geometry';
import { prepareWitchGrove, rectTouchesGroveClearing } from '../world/witchGrove';
import { invalidateLayoutCollisionRects } from '../world/collision';
import { WOLF } from '../data/wolf';
import { MOUSE } from '../data/mouse';
import { BEAR } from '../data/bear';
import { FOREST_INSECT } from '../data/forestInsect';
import { PickupFeedback } from '../rendering/PickupFeedback';

export class RoomScene extends Phaser.Scene {
  player!: Druid;
  get playerHealth() { return this.player.actorState.health; }
  characterId = CHARACTERS[0].id;
  layout!: MeadowLayout;
  world!: MeadowWorld;
  acorns!: AcornAttack;
  gameOver = false;
  private seed = 0;
  private movement!: MovementKeys;
  private attackKeys!: MovementKeys;
  private interactionKey!:Phaser.Input.Keyboard.Key;
  private readonly holdInteraction = new HoldInteraction();
  private holdIndicator!:HoldInteractionIndicator;
  private queuedAttack?: Facing;
  facing: Facing = 'down';
  private shadow!: Phaser.GameObjects.Image;
  private hud!: Phaser.GameObjects.Container;
  private hudCamera!: Phaser.Cameras.Scene2D.Camera;
  private cameraFollow!: EllipticalFollowCamera;
  private feetOffset = 0;
  private healthLabel!: Phaser.GameObjects.Text;
  private healthPanel!: Phaser.GameObjects.Rectangle;
  private hearts!: Phaser.GameObjects.Graphics;
  private deathOverlay!: DeathOverlay;
  private savedRun?: RunSave;
  private pickupFeedback!:PickupFeedback;

  constructor() { super(SCENES.room); }

  init(data: { characterId?: string; seed?: number; savedRun?: RunSave } = {}) {
    this.savedRun = data.savedRun;
    if (this.savedRun) data = { ...data, characterId: this.savedRun.characterId, seed: this.savedRun.layout.seed };
    this.characterId = (CHARACTERS.find(item => item.available && item.id === data.characterId) ?? CHARACTERS[0]).id;
    this.seed = data.seed ?? Math.floor(Math.random() * 0x100000000);
  }

  create() {
    menuMusic(this.game).setInMenu(false);
    if (!this.savedRun) clearRun();
    this.physics.resume();
    this.gameOver = false;
    const character = CHARACTERS.find(item => item.id === this.characterId)!;
    const appearance = character.game ?? CHARACTERS[0].game!;
    const art = appearance.metrics;
    this.facing = 'down';
    this.queuedAttack = undefined;
    this.feetOffset = art.bodyCenterY + art.bodyHeight / 2;
    this.player = new Druid(this, character);
    this.holdInteraction.reset();
    this.holdIndicator=new HoldInteractionIndicator(this);
    this.shadow = this.add.image(0, 0, 'meadow-druid-shadow').setScale(MEADOW_PIXEL_SCALE).setAlpha(0.6);
    this.buildWorld();
    this.pickupFeedback=new PickupFeedback(this,this.player);
    this.hudCamera.ignore([this.pickupFeedback.icon,this.pickupFeedback.shine]);
    this.acorns = new AcornAttack(this,this.player,Math.random,(from,to)=>this.world.noticeProjectile(from,to));
    if (this.savedRun) this.acorns.restore(this.savedRun.shots);
    this.player.on(COMBAT_EVENTS.healthChanged,this.updateHealth,this);
    this.player.once(COMBAT_EVENTS.died,this.endGame,this);

    type StatKey='speed'|'attackRate'|'range'|'walkSpeed'|'runSpeed';
    const modifiers=new WeakMap<object,Map<StatKey,number>>();
    const rescale=(state:Partial<Record<StatKey,number>>,key:StatKey,before:number,after:number,unit=1)=>{
      let cached=modifiers.get(state);
      if(!cached){cached=new Map();modifiers.set(state,cached);}
      const factor=before>0 ? state[key]!/(before*unit) : cached.get(key)??1;
      cached.set(key,factor);state[key]=after*unit*factor;
    };
    const unsubscribeBalance = onEntityDataChanged((next, previous) => {
      if (this.gameOver) return;
      const adjustHealth = (state: { health: number; maxHealth: number }, maximum: number) => {
        if (state.health <= 0) return;
        state.health = Math.max(1, maximum - (state.maxHealth - state.health));
        state.maxHealth = maximum;
      };
      const p = this.player.actorState, before = previous.druid, after = next.druid;
      // Preserve instance modifiers; changing a baseline is not picking up an item.
      rescale(p,'speed',before.speed,after.speed,BASE_MOVEMENT_SPEED);
      rescale(p,'attackRate',before.attackRate,after.attackRate);
      rescale(p,'range',before.range,after.range);
      if (after.health !== before.health) adjustHealth(p, after.health);
      for (const wolf of this.world.wolves) {
        if (wolf.dying) continue;
        const state = wolf.actorState;
        rescale(state,'walkSpeed',previous.wolf.walkSpeed,next.wolf.walkSpeed,BASE_MOVEMENT_SPEED);
        rescale(state,'runSpeed',previous.wolf.runSpeed,next.wolf.runSpeed,BASE_MOVEMENT_SPEED);
        if (next.wolf.health !== previous.wolf.health) adjustHealth(state, next.wolf.health);
      }
      for (const mouse of this.world.mice) {
        rescale(mouse.actorState,'speed',previous.mouse.speed,next.mouse.speed);
        if (next.mouse.speed !== previous.mouse.speed) mouse.behavior.refreshRunLimit(mouse);
      }
      for(const enemy of this.world.cleansing?.enemies??[]) {
        if(enemy.dying)continue;
        const state=enemy.actorState;
        rescale(state,'walkSpeed',previous.forestInsect.walkSpeed,next.forestInsect.walkSpeed,BASE_MOVEMENT_SPEED);
        rescale(state,'runSpeed',previous.forestInsect.runSpeed,next.forestInsect.runSpeed,BASE_MOVEMENT_SPEED);
        if(next.forestInsect.health!==previous.forestInsect.health)adjustHealth(state,next.forestInsect.health);
      }
      const bear=this.world.bear;
      if(bear&&!bear.dying){
        rescale(bear.actorState,'walkSpeed',previous.bear.walkSpeed,next.bear.walkSpeed,BASE_MOVEMENT_SPEED);
        rescale(bear.actorState,'runSpeed',previous.bear.runSpeed,next.bear.runSpeed,BASE_MOVEMENT_SPEED);
        if(next.bear.health!==previous.bear.health)adjustHealth(bear.actorState,next.bear.health);
      }
      this.updateHealth();
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribeBalance);
    const keyboard = this.input.keyboard!;
    this.movement = keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W, down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A, right: Phaser.Input.Keyboard.KeyCodes.D,
    }) as typeof this.movement;
    this.attackKeys = keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.UP, down: Phaser.Input.Keyboard.KeyCodes.DOWN,
      left: Phaser.Input.Keyboard.KeyCodes.LEFT, right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
    }) as MovementKeys;
    this.interactionKey=keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    const handleKeyDown = (event: KeyboardEvent) => {
      if(this.gameOver)return;
      if (event.code === 'KeyE') {
        const canInteract=this.player.canStartAction;
        this.queuedAttack=undefined;
        this.player.setInteractionLocked(true);
        const point=(this.player.body as Phaser.Physics.Arcade.Body).center;
        if (!event.repeat&&canInteract&&!this.world.ritual?.canInteract(point)&&!this.world.cleansing?.tree.canInteract(point)&&!this.world.witchCircle?.canInteract(point)) this.world.collectMushroom(point);
        return;
      }
      if (!event.code.startsWith('Arrow') || event.repeat || !this.player.canStartAction) return;
      const arrows = this.attackKeys;
      this.queuedAttack = facingFromVector(Number(arrows.right.isDown) - Number(arrows.left.isDown),
        Number(arrows.down.isDown) - Number(arrows.up.isDown));
    };
    keyboard.on('keydown', handleKeyDown);
    // Arcade syncs sprite coordinates in post-update; sample grass after that sync.
    const updateGrass = (_time: number, delta: number) => {
      if(this.gameOver)return;
      this.player.syncCastVisual();
      this.world.update(delta);
      if(this.gameOver)return;
      const ritual=this.world.ritual;
      const tree=this.world.cleansing?.tree;
      const witchCircle=this.world.witchCircle;
      const available=!this.player.dead&&!this.player.hitReaction.active&&!this.player.casting.active;
      const point=(this.player.body as Phaser.Physics.Arcade.Body).center;
      const target=available?(ritual?.canInteract(point)?ritual:tree?.canInteract(point)?tree:witchCircle?.canInteract(point)?witchCircle:undefined):undefined;
      this.holdInteraction.update(delta,target,this.interactionKey.isDown);
      this.holdIndicator.updatePosition(this.player.x,this.player.getTopLeft().y,
        this.holdInteraction.visible || (available && this.world.canCollectMushroom(point)),this.holdInteraction.progress);
      this.acorns.update(delta);
      this.world.updateGrass(this.player.x, this.player.y + this.feetOffset, this.player.depth);
      this.pickupFeedback.update(delta);
    };
    this.events.on(Phaser.Scenes.Events.POST_UPDATE, updateGrass);
    bindSceneKey(this, 'keyup-ESC', () => this.leaveRun());
    bindSceneKey(this, 'keyup-R', () => this.scene.restart({ characterId: this.characterId }));
    const resetInput = () => {
      keyboard.resetKeys(); this.queuedAttack = undefined;
      this.player.setInteractionLocked(false);
      this.resetInteraction();
      if(this.gameOver)return;
      this.player.cancelHit(); this.player.cancelCast();
      this.player.setVelocity(0, 0); this.player.updateAppearance(true);
    };
    this.game.events.on(Phaser.Core.Events.BLUR, resetInput);
    const resize = () => this.resizeCameras();
    this.scale.on(Phaser.Scale.Events.RESIZE, resize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.acorns.destroy();
      this.holdInteraction.reset();
      this.events.off(Phaser.Scenes.Events.POST_UPDATE, updateGrass);
      this.game.events.off(Phaser.Core.Events.BLUR, resetInput);
      this.scale.off(Phaser.Scale.Events.RESIZE, resize);
      keyboard.off('keydown', handleKeyDown);
    });
  }

  update(_time: number, delta: number) {
    if(this.gameOver)return;
    const keys = this.movement;
    this.player.setInteractionLocked(this.interactionKey.isDown);
    const x = Number(keys.right.isDown) - Number(keys.left.isDown);
    const y = Number(keys.down.isDown) - Number(keys.up.isDown);
    const arrows = this.attackKeys;
    const attack = facingFromVector(Number(arrows.right.isDown) - Number(arrows.left.isDown),
      Number(arrows.down.isDown) - Number(arrows.up.isDown)) ?? this.queuedAttack;
    this.queuedAttack = undefined;
    this.player.updateCasting(delta, attack);
    this.player.move(x, y, facingFromVector(x, y) ?? this.player.actorState.facing);
    this.facing = this.player.actorState.facing;
    this.player.setDepth(this.player.y + 25);
    this.player.syncCastVisual();
    this.shadow.setPosition(this.player.x, this.player.y + 22).setDepth(this.player.y + 24);
    const center = this.cameraFollow.update(this.player.x, this.player.y, delta);
    this.cameras.main.centerOn(center.x, center.y);
  }

  private buildWorld() {
    this.layout = this.savedRun?.layout ?? generateMeadow(this.seed);
    const protectedActors: Rect[] = [];
    if (this.savedRun) {
      const { player, world } = this.savedRun, art = this.player.appearance.metrics;
      const footprint = (p: {x:number;y:number}, b: {width:number;height:number}) =>
        ({ x: p.x-b.width/2, y: p.y-b.height, width:b.width, height:b.height });
      protectedActors.push(footprint({x:player.x,y:player.y+art.bodyCenterY+art.bodyHeight/2},
        {width:art.bodyWidth,height:art.bodyHeight}));
      protectedActors.push(...world.wolves.filter(w=>w.state.health>0).map(w=>footprint(w,WOLF.body)),
        ...world.mice.map(m=>footprint(m,{width:MOUSE.bodyWidth,height:MOUSE.bodyHeight})),
        ...(world.cleansing?.enemies??[]).filter(e=>e.state.health>0).map(e=>footprint(e,FOREST_INSECT.body)));
      if(world.bear&&world.bear.state.health>0)protectedActors.push(footprint(world.bear,BEAR.body));
    }
    const groveChanged=prepareWitchGrove(this.layout,protectedActors);
    if (groveChanged || !this.layout.bushes || this.layout.bushes.some(bush => bush.variant!==ACTIVE_BUSH_VARIANT || !bushInSpawnRoom(this.layout, bush) ||
      rectTouchesGroveClearing(bushVisualRect(bush),this.layout.witchCircle!))) {
      this.layout.bushes = generateBushes(this.layout, protectedActors);
      if(this.savedRun)delete this.savedRun.world.bushTraps;
      invalidateLayoutCollisionRects(this.layout);
    }
    this.layout.counts.bushes = this.layout.bushes.length;
    // Keep generated/saved angles; mirrored log artwork is still disabled.
    this.layout.logs?.forEach(log => { log.flipX = false; });
    const { width, height, cameraRadiusX, cameraRadiusY, cameraResponseMs } = MEADOW_WORLD;
    this.physics.world.setBounds(0, 0, width, height);
    this.cameras.main.setBounds(0, 0, width, height);
    this.cameraFollow = new EllipticalFollowCamera(width, height, cameraRadiusX, cameraRadiusY, cameraResponseMs);
    if (this.savedRun) Object.assign(this.cameraFollow.center, this.savedRun.camera);
    this.world = new MeadowWorld(this, this.layout, this.savedRun?.world);
    this.world.bindPlayer(this.player);
    const position = this.layout.spawn;
    (this.player.body as Phaser.Physics.Arcade.Body).reset(position.x, position.y);
    if (this.savedRun) { this.player.restore(this.savedRun.player); this.facing = this.player.actorState.facing; }
    this.drawHud();
    // A separate unzoomed camera keeps HP attached to the screen.
    this.hudCamera = this.cameras.add(0, 0, this.scale.width, this.scale.height).setName('hud');
    this.cameras.main.ignore(this.hud);
    this.hudCamera.ignore(this.children.list.filter(object => object !== this.hud));
    this.resizeCameras();
  }

  private resizeCameras() {
    const { width, height } = this.scale;
    const zoom = Math.max(height / MEADOW_WORLD.viewHeight, width / MEADOW_WORLD.width);
    this.cameras.main.setSize(width, height).setZoom(zoom);
    this.cameraFollow.resize(width / zoom, height / zoom);
    const { x, y } = this.cameraFollow.center;
    this.cameras.main.centerOn(x, y);
    this.hudCamera.setSize(width, height);
    this.deathOverlay.resize(width,height);
  }

  private drawHud() {
    this.hud = this.add.container(0, 0).setDepth(100000);
    const panel = this.healthPanel = this.add.rectangle(16, 16, 176, 44, 0x132419, 0.85).setOrigin(0);
    this.healthLabel = this.add.text(28, 30, '', {
      fontFamily: 'Arial, sans-serif', fontSize: '14px', color: '#dfdfbd',
    }).setName('health-label');
    this.hearts = this.add.graphics();this.updateHealth();
    this.deathOverlay = new DeathOverlay(this);
    this.hud.add([panel, this.healthLabel, this.hearts, this.deathOverlay]);
  }

  private updateHealth() {
    this.healthLabel.setText(`HP ${this.playerHealth}/${this.player.actorState.maxHealth}`);
    this.healthPanel.setSize(Math.max(176, 104 + (this.player.actorState.maxHealth - 1) * 26), 44);
    this.hearts.clear();
    for(let i=0;i<this.player.actorState.maxHealth;i++) {
      const x=104+i*26;
      this.hearts.fillStyle(i<this.playerHealth?0xd98278:0x465140)
        .fillCircle(x-4,35,5).fillCircle(x+4,35,5).fillTriangle(x-9,36,x+9,36,x,47);
    }
  }

  private endGame() {
    if(this.gameOver)return;
    this.gameOver=true;this.queuedAttack=undefined;clearRun();
    this.resetInteraction();
    this.player.cancelCast();this.player.setVelocity(0,0);
    for(const wolf of this.world.wolves)wolf.setVelocity(0,0);
    for(const mouse of this.world.mice)mouse.setVelocity(0,0);
    this.world.bear?.setVelocity(0,0);
    for(const enemy of this.world.cleansing?.enemies??[])enemy.setVelocity(0,0);
    this.physics.pause();this.deathOverlay.show();
  }

  private leaveRun() {
    if (this.gameOver || this.player.dead) { this.scene.start(SCENES.characterSelect); return; }
    const persistent = saveRun({ version: 1, savedAt: Date.now(), characterId: this.characterId,
      layout: this.layout, player: this.player.snapshot(), camera: { ...this.cameraFollow.center },
      world: this.world.snapshot(), shots: this.acorns.snapshot() });
    this.input.keyboard?.resetKeys();
    this.scene.start(SCENES.mainMenu, { sessionOnlySave: !persistent });
  }

  private resetInteraction() {
    this.holdInteraction.reset();
    this.holdIndicator.setVisible(false);
  }
}
