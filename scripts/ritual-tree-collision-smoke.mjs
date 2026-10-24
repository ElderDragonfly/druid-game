/** The lawn is walkable and interactive; only the projected trunk blocks. */
export async function testRitualTreeCollision(page,ok) {
  const tree=await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room'),t=s.layout.rooms[7].tree;
    s.world.wolves.forEach(e=>{e.setActive(false).setVelocity(0,0);e.body.enable=false;});
    s.player.cancelCast();s.player.cancelHit();s.physics.resume();
    s.player.body.reset(t.x-70,t.y-20);s.player.body.updateFromGameObject();return t;
  });
  await page.keyboard.down('d');await page.waitForTimeout(950);await page.keyboard.up('d');
  ok(await page.evaluate(tree=>{
    const s=window.__smokeGame.scene.getScene('Room'),p=s.player;
    return p.x>tree.x+45&&Math.abs(p.y-tree.y+20)<2&&s.world.cleansing.tree.canInteract(p.body.center);
  },tree),'Друид проходит по нижней зелёной лужайке через всю ширину дерева и может удерживать там E');
  await page.evaluate(tree=>{const s=window.__smokeGame.scene.getScene('Room');s.player.body.reset(tree.x,tree.y+70);s.player.body.updateFromGameObject();},tree);
  await page.keyboard.down('w');await page.waitForTimeout(1000);await page.keyboard.up('w');
  ok(await page.evaluate(tree=>{
    const s=window.__smokeGame.scene.getScene('Room'),b=s.player.body;
    const trunk=s.world.obstacles.getChildren().find(o=>o.name==='cleansing-tree-collider').body;
    return b.top>=trunk.bottom-.1&&b.top-trunk.bottom<2&&s.player.y<tree.y+5;
  },tree),'Подход снизу останавливается у ствола, без невидимой преграды перед лужайкой');
  await page.evaluate(tree=>{const s=window.__smokeGame.scene.getScene('Room');s.physics.pause();s.player.body.reset(tree.x+65,tree.y-20);s.player.body.updateFromGameObject();},tree);
}
