import type Phaser from 'phaser';
import { ROOM_SCENARIOS } from '../data/roomScenarios';
import { FOREST_INSECT } from '../data/forestInsect';
import { ForestInsect } from '../entities/ForestInsect';
import type { Druid } from '../entities/Druid';
import type { CleansingSave } from '../persistence/snapshots';
import { CleansingTree } from './CleansingTree';
import { WolfNavigation, type WolfPoint } from './WolfNavigation';
import type { MeadowLayout } from './meadowLayout';
import { roomBounds, type RoomPlan } from './rooms';
import { seededRandom } from './random';

export function cleansingEnemySpawns(layout:MeadowLayout,room:RoomPlan,navigation:WolfNavigation,player:WolfPoint):WolfPoint[] {
  const random=seededRandom(layout.seed^0x424c4947^room.id),bounds=roomBounds(layout,room.id),points:WolfPoint[]=[];
  const rotation=random()*Math.PI*2;
  for(let index=0;index<ROOM_SCENARIOS.cleansing.enemyCount;index++) {
    const crown={x:room.tree!.x+(index-1)*36,y:room.tree!.y-150};
    for(let attempt=0;attempt<1024;attempt++) {
      const angle=rotation+index*Math.PI*2/ROOM_SCENARIOS.cleansing.enemyCount+(random()-.5)*1.2;
      const radius=.7+random()*.3;
      const p={x:room.tree!.x+Math.cos(angle)*bounds.width*.375*radius,
        y:room.tree!.y+Math.sin(angle)*bounds.height*.375*radius};
      if(p.x<bounds.x+48||p.x>bounds.x+bounds.width-48||p.y<bounds.y+48||p.y>bounds.y+bounds.height-48)continue;
      if(Math.hypot(p.x-player.x,p.y-player.y)<90||points.some(q=>Math.hypot(q.x-p.x,q.y-p.y)<100))continue;
      if(navigation.canStand(p)&&navigation.route(crown,p).length){points.push(p);break;}
    }
  }
  if(points.length!==ROOM_SCENARIOS.cleansing.enemyCount)throw new Error('Не удалось разместить врагов очищения');
  return points;
}
export class CleansingEncounter {
  readonly tree:CleansingTree;
  readonly enemies:ForestInsect[]=[];
  private readonly navigation:WolfNavigation;
  constructor(private scene:Phaser.Scene,private layout:MeadowLayout,private room:RoomPlan,
    private obstacles:Phaser.Physics.Arcade.StaticGroup,private player:Druid,saved?:CleansingSave,
    private readonly onSpawn:(enemy:ForestInsect)=>void=()=>{}) {
    this.navigation=new WolfNavigation(layout,FOREST_INSECT.body);
    this.tree=new CleansingTree(scene,room,saved?.status??'dormant',()=>this.start(),saved?.cleansingElapsed);
    for(const [index,state] of (saved?.enemies??[]).entries()) {
      const enemy=this.create(state,index);enemy.restore(state);
    }
  }
  private create(point:WolfPoint,index:number) {
    const enemy=new ForestInsect(this.scene,this.navigation,this.obstacles,this.player,point,index+1);
    this.enemies.push(enemy);this.onSpawn(enemy);return enemy;
  }
  private start() {
    const p=this.player.body as Phaser.Physics.Arcade.Body;
    const points=cleansingEnemySpawns(this.layout,this.room,this.navigation,{x:p.center.x,y:p.bottom});
    points.forEach((point,index)=>{
      const crown={x:this.room.tree!.x+(index-1)*36,y:this.room.tree!.y-150};
      this.create(crown,index).launch(point,this.room.tree!.y+1);
    });
  }
  update(delta:number) {
    for(const enemy of this.enemies){if(this.player.dead)break;enemy.updateBehavior(delta);}
    if(this.tree.status==='active'&&this.enemies.length&&this.enemies.every(enemy=>enemy.deathFinished))this.tree.cleanse();
    this.tree.update(delta);
  }
  snapshot():CleansingSave{return {roomId:this.room.id,status:this.tree.status,enemies:this.enemies.map(enemy=>enemy.snapshot()),cleansingElapsed:this.tree.cleansingElapsed};}
  destroy(){this.tree.destroy();this.enemies.forEach(enemy=>enemy.destroy());}
}
