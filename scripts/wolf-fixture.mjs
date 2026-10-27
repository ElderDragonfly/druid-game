/** Single-enemy scenarios isolate AI/art/physics; pack scenarios keep the full population. */
export async function isolateSingleWolf(page) {
  await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room');
    if(!s.world.wolves.length)throw new Error('Single-wolf fixture needs a non-empty seed');
    s.world.wolves.splice(1).forEach(wolf=>wolf.destroy());
    // The new room must not interfere with these single-wolf combat fixtures.
    for(const e of s.world.sprouts.enemies){e.setActive(false).setVelocity(0,0);e.body.enable=false;e.image.setVisible(false);e.shadow.setVisible(false);}
    for(const e of s.world.skeletons){e.setActive(false).setVisible(false).setVelocity(0,0);e.body.enable=false;e.shadow.setVisible(false);}
  });
  await page.waitForFunction(()=>{
    const s=window.__smokeGame.scene.getScene('Room');
    return s.physics.world.colliders.getActive().length===s.world.mice.length+4+(s.world.bear&&!s.world.bear.dying?2:0)+s.world.skeletons.filter(e=>!e.dying).length*2+s.world.sprouts.enemies.filter(e=>!e.dying).length*2;
  });
}
