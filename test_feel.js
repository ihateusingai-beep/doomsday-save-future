/* v0.29.0 gamedev-feel 冒煙：trauma / hit-stop / tier / no-hitShake / hooks */
const fs = require('fs');
const h = fs.readFileSync(__dirname + '/index.html', 'utf8');
let fails = 0;
function check(label, ok, extra) {
  if (!ok) fails++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (extra ? '  ' + extra : ''));
}

console.log('=== v0.29.0 markers ===');
check('version string v0.29.0', h.includes('v0.29.0'));
check('no hitShake leftover', !/\bhitShake\b/.test(h));
check('addTrauma', h.includes('function addTrauma'));
check('hitStop', h.includes('function hitStop'));
check('pulseShip', h.includes('function pulseShip'));
check('updateCam', h.includes('function updateCam'));
check('cam trauma²', h.includes('cam.trauma * cam.trauma'));
check('FEEL tiers', h.includes('const FEEL = Object.freeze'));
check('REDUCED_MOTION', h.includes('REDUCED_MOTION'));
check('loop hit-stop gate', h.includes('nowMs < hitStopUntil'));
check('render uses cam.x/y', h.includes('const shakeX = cam.x') && h.includes('const shakeY = cam.y'));
check('no Math.random shake', !/Math\.random\(\)\s*-\s*0\.5\)\s*\*\s*4\s*\*\s*hitShake/.test(h));

console.log('=== FEEL table ===');
const feelSrc = h.match(/const FEEL = Object\.freeze\(\{[\s\S]*?\n\}\);/);
check('FEEL block extract', !!feelSrc);
const FEEL = feelSrc ? new Function('return ' + feelSrc[0].replace('const FEEL =', ''))() : {};
const need = ['graze','grazeFull','killGrunt','killElite','killBoss','hurt','hurtShield','bomb','die'];
for (const k of need) {
  check('FEEL.' + k, !!FEEL[k] && FEEL[k].trauma > 0, JSON.stringify(FEEL[k]));
}
check('killElite > killGrunt trauma', FEEL.killElite.trauma > FEEL.killGrunt.trauma);
check('killBoss > killElite trauma', FEEL.killBoss.trauma > FEEL.killElite.trauma);
check('bomb.stop >= 80', FEEL.bomb.stop >= 80);
check('die.stop >= bomb.stop', FEEL.die.stop >= FEEL.bomb.stop);

console.log('=== hooks wired ===');
check('damageShip → addTrauma', /function damageShip[\s\S]{0,400}addTrauma/.test(h));
check('tryBomb → hitStop', /function tryBomb[\s\S]{0,800}hitStop\(/.test(h));
check('killEnemy → tier', /function killEnemy[\s\S]{0,500}FEEL\.kill/.test(h));
check('doGraze → addTrauma', /function doGraze[\s\S]{0,400}addTrauma/.test(h));
check('i-frame blink', h.includes("Math.floor(performance.now() / 55)"));
check('shipPop scale', h.includes('2.1 * shipPop'));
check('spawnBoom power arg', /function spawnBoom\(x, y, power\)/.test(h));
check('__dsf exposes FEEL', /FEEL, cam, addTrauma/.test(h));

console.log('=== pure trauma math ===');
{
  const cam = { x: 0, y: 0, trauma: 0, decay: 2.2, max: 14 };
  function addTrauma(a) { cam.trauma = Math.min(1, cam.trauma + a); }
  function updateCam(dtMs) {
    if (cam.trauma <= 0) { cam.x = cam.y = 0; cam.trauma = 0; return; }
    cam.trauma = Math.max(0, cam.trauma - cam.decay * (dtMs / 1000));
    const s = cam.trauma * cam.trauma;
    const t = 1000 * 0.031;
    cam.x = cam.max * s * Math.sin(t * 1.7);
    cam.y = cam.max * s * Math.sin(t * 2.3);
  }
  addTrauma(0.5);
  check('addTrauma clamps later', (() => { addTrauma(0.9); return cam.trauma === 1; })());
  const x0 = cam.x;
  updateCam(16.67);
  check('updateCam decays trauma', cam.trauma < 1);
  check('offset uses trauma² (bounded)', Math.abs(cam.x) <= cam.max + 1e-9);
  let steps = 0;
  while (cam.trauma > 0 && steps < 500) { updateCam(16.67); steps++; }
  check('trauma returns to 0', cam.trauma === 0 && cam.x === 0 && cam.y === 0, 'steps=' + steps);
}

console.log('\n' + (fails ? fails + ' FAIL' : 'ALL PASS'));
process.exit(fails ? 1 : 0);
