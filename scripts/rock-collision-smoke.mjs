/** Rocks use one shared physical/navigation/projectile footprint. */
export async function testRockCollisions(page,ok){
  ok(await page.evaluate(async()=>{
    const {applySkeletonClearing}=await import('/src/rendering/skeletonClearing.ts');
    const width=1024,height=576,pixels=new Uint8ClampedArray(width*height*4),grassHeights=new Uint8Array(width*height);
    for(let i=0;i<width*height;i++){
      const v=i%2?25:0;pixels.set([40+v,95+v,30+v,255],i*4);grassHeights[i]=i%9;
    }
    applySkeletonClearing({width,height,pixels,grassHeights},{width:3840,height:2160,seed:0});
    let green=0,brown=0;
    for(let y=30;y<400;y++)for(let x=30;x<850;x++){
      const i=(y*width+x)*4;if(pixels[i+1]>pixels[i])green++;else brown++;
    }
    return grassHeights.every((v,i)=>v===i%9)&&brown/(green+brown)>.65&&green/(green+brown)>.02&&
      pixels[0]!==pixels[4]&&pixels[1]!==pixels[5];
  }),'Сухая подстилка сохраняет рисунок травинок и всю маску перекрытия сапог; коричневая трава преобладает, зелёные островки остаются');
  ok(await page.evaluate(async()=>{
    const s=window.__smokeGame.scene.getScene('Room');
    const {rockCollisionRect}=await import('/src/world/roomRocks.ts');
    const {layoutCollisionRects}=await import('/src/world/collision.ts');
    const {WolfNavigation}=await import('/src/world/WolfNavigation.ts');
    const {mouseCanStand}=await import('/src/behavior/MouseWander.ts');
    const rocks=s.layout.bones.filter(b=>b.kind==='rock'),rects=layoutCollisionRects(s.layout);
    for(const p of rocks){
      const r=rockCollisionRect(p),center={x:r.x+r.width/2,y:r.y+r.height/2};
      const object=s.world.obstacles.getChildren().find(o=>o.getData('kind')==='rock'&&Math.abs(o.body.x-r.x)<.01&&Math.abs(o.body.y-r.y)<.01);
      if(!object||!object.body.enable||Math.abs(object.body.width-r.width)>.01||Math.abs(object.body.height-r.height)>.01||
        !rects.some(a=>a.x===r.x&&a.y===r.y&&a.width===r.width&&a.height===r.height)||mouseCanStand(s.layout,center))return false;
      for(const size of [{width:20,height:25},{width:54,height:18},{width:32,height:18},{width:96,height:28},{width:28,height:18},{width:26,height:16}]){
        const nav=new WolfNavigation(s.layout,size);
        if(nav.canStand(center))return false;
        const points=[];
        for(const radius of [70,110,160,220])for(let i=0;i<16;i++){
          const a=i*Math.PI/8,q={x:p.x+Math.cos(a)*radius,y:p.y+Math.sin(a)*radius};
          if(nav.canStand(q))points.push(q);
        }
        const left=points.find(q=>q.x<p.x-40),right=points.find(q=>q.x>p.x+40);
        if(!left||!right||!nav.route(left,right).length)return false;
      }
    }
    return rocks.length>=8&&rocks.length<=12;
  }),'Все 8–12 камней имеют одинаковые границы в физике и навигации; друид, все виды врагов и мыши обходят их');
  ok(await page.evaluate(async()=>{
    const s=window.__smokeGame.scene.getScene('Room');s.physics.pause();
    const {rockCollisionRect}=await import('/src/world/roomRocks.ts');
    const {AcornProjectile}=await import('/src/entities/AcornProjectile.ts');
    for(const rock of s.layout.bones.filter(b=>b.kind==='rock')){
      const r=rockCollisionRect(rock),shot=new AcornProjectile(s,s.player,r.x-12,r.y+r.height/2,{x:1,y:0});
      s.acorns.shots.push(shot);shot.body.reset(r.x+r.width+12,r.y+r.height/2);shot.body.updateFromGameObject();s.acorns.update(0);
      if(s.acorns.shots.includes(shot))return false;
    }
    return true;
  }),'Настоящие желуди поглощаются всеми камнями');
  ok(await page.evaluate(async()=>{
    const s=window.__smokeGame.scene.getScene('Room');
    const {prepareSkeletonRoom}=await import('/src/world/skeletonRoom.ts');
    const {rockCollisionRect}=await import('/src/world/roomRocks.ts');
    const {overlaps}=await import('/src/world/geometry.ts');
    const copy=structuredClone(s.layout),rock=copy.bones.find(b=>b.kind==='rock');
    const r=rockCollisionRect(rock),actor={...r},position={x:rock.x,y:rock.y},before=copy.bones.length;
    const touching=structuredClone(s.layout),unchanged=JSON.stringify(touching.bones);
    prepareSkeletonRoom(touching,[{x:r.x+r.width,y:r.y,width:20,height:25}]);
    if(JSON.stringify(touching.bones)!==unchanged)return false;
    prepareSkeletonRoom(copy,[actor]);
    return copy.bones.length===before&&(rock.x!==position.x||rock.y!==position.y)&&
      !copy.bones.filter(b=>b.kind==='rock').some(b=>overlaps(rockCollisionRect(b),actor,4));
  }),'Старый сейв с персонажем внутри проходимого прежде камня переносит только камень, сохраняя акторов и количество декораций');
}
