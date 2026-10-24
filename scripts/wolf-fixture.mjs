/** Single-enemy scenarios isolate AI/art/physics; pack scenarios keep the full population. */
export async function isolateSingleWolf(page) {
  await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room');
    if(!s.world.wolves.length)throw new Error('Single-wolf fixture needs a non-empty seed');
    s.world.wolves.splice(1).forEach(wolf=>wolf.destroy());
  });
  await page.waitForFunction(()=>{
    const s=window.__smokeGame.scene.getScene('Room');
    return s.physics.world.colliders.getActive().length===s.world.mice.length+4+(s.world.bear&&!s.world.bear.dying?2:0);
  });
}
