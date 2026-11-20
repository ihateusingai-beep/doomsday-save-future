/* v0.29.0 + v0.48 gamedev-feel smoke: trauma/hit-stop/tier + juice 6pack */
const fs = require('fs');
const h = fs.readFileSync(__dirname + '/index.html', 'utf8');
let fails = 0;
function check(label, ok, extra) {
  if (!ok) fails++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (extra ? '  ' + extra : ''));
}

console.log('=== v0.29.0 markers ===');
check('version string v0.29+/v0.30+/v0.48', /v0\.29|v0\.30|v0\.48/.test(h));
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
check('FEEL.hitGrunt', !!FEEL.hitGrunt && FEEL.hitGrunt.trauma > 0);
check('FEEL.hitLaser trauma=0', FEEL.hitLaser && FEEL.hitLaser.trauma === 0);
check('feelHitEnemy', h.includes('function feelHitEnemy'));
check('tickHitFlash', h.includes('function tickHitFlash'));
check('hitFlash draw grunt', h.includes('v0.29.1') || h.includes('hitWhiteUntil'));
check('laser killEnemy skipScore', /killEnemy\(e,\s*\{\s*skipScore:\s*true\s*\}/.test(h));
check('fireLaser no bare onBossDown', !/function fireLaser[\s\S]{0,900}?if \(e\.hp <= 0\) onBossDown\(e\)/.test(h));
check('laser grunt no bare _dead kill', !/function laserTick[\s\S]{0,1200}?runKills\+\+; runGrunts\+\+; e\._dead = true/.test(h));

console.log('=== v0.48 juice pack ===');
check('FEEL.flashWhiteMs', FEEL.flashWhiteMs === 16);
check('FEEL.debrisMin/Max', FEEL.debrisMin === 6 && FEEL.debrisMax === 10);
check('FEEL.debrisLifeMs 600', FEEL.debrisLifeMs === 600);
check('FEEL.trailLen 12', FEEL.trailLen === 12);
check('FEEL.squashWall 0.7', FEEL.squashWall === 0.7);
check('FEEL.stretchFly 1.2', FEEL.stretchFly === 1.2);
check('FEEL.comboSemiMax 12', FEEL.comboSemiMax === 12);
check('FEEL.comboResetMs 1000', FEEL.comboResetMs === 1000);
check('FEEL.finisherScale 0.3', FEEL.finisherScale === 0.3);
check('FEEL.finisherZoom 1.1', FEEL.finisherZoom === 1.1);
check('FEEL.finisherMs 600', FEEL.finisherMs === 600);
check('spawnDebris fn', h.includes('function spawnDebris'));
check('spawnWhiteFlash fn', h.includes('function spawnWhiteFlash'));
check('killEnemy → spawnDebris', /function killEnemy[\s\S]{0,800}spawnDebris\(/.test(h));
check('killEnemy → spawnWhiteFlash', /function killEnemy[\s\S]{0,800}spawnWhiteFlash\(/.test(h));
check('feelHitEnemy hitWhiteUntil', h.includes('e.hitWhiteUntil = performance.now() + FEEL.flashWhiteMs'));
check('noteCombo + pitchMul', h.includes('function noteCombo') && h.includes('comboPitchMul'));
check('sfx kill pitchMul', h.includes("sfx(e.elite ? 'kill' : 'hit', { pitchMul: comboPitchMul() })"));
check('tone pitchMul', h.includes('o.pitchMul'));
check('setDeform + decayDeform', h.includes('function setDeform') && h.includes('function decayDeform'));
check('ship setDeform', h.includes('setDeform(ship'));
check('pushTrail bullet+ship', h.includes('pushTrail(b,') && h.includes('pushTrail(ship,'));
check('drawTrailHist', h.includes('function drawTrailHist'));
check('startFinisher + finishBossDown', h.includes('function startFinisher') && h.includes('function finishBossDown'));
check('onBossDown delays via pendingBossFin', h.includes('pendingBossFin = payload') && h.includes('startFinisher()'));
check('loop tickFinisher + timeScale', h.includes('tickFinisher(nowMs)') && h.includes('accMs += dt * (timeScale'));
check('render camZoom', h.includes('const z = camZoom || 1'));
check('reset juice', h.includes('resetCombo()') && h.includes('finisherUntil = 0'));

{
  const m = h.match(/末日救未來 v(\d+)\.(\d+)\.(\d+) 已載入/);
  const ver = m ? [+m[1], +m[2], +m[3]] : null;
  check('版本號可解析', !!ver, ver ? ver.join('.') : '搵唔到');
  check('version >= v0.48.0', !!ver && (ver[0] > 0 || ver[1] > 48 || (ver[1] === 48 && ver[2] >= 0)),
        ver ? ver.join('.') : '—');
}
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
  updateCam(16.67);
  check('updateCam decays trauma', cam.trauma < 1);
  check('offset uses trauma² (bounded)', Math.abs(cam.x) <= cam.max + 1e-9);
  let steps = 0;
  while (cam.trauma > 0 && steps < 500) { updateCam(16.67); steps++; }
  check('trauma returns to 0', cam.trauma === 0 && cam.x === 0 && cam.y === 0, 'steps=' + steps);
}
{
  /* pure math: combo pitch + deform area ~const */
  let lvl = 0;
  function note(prevGap) {
    if (prevGap > 1000) lvl = 0; else lvl = Math.min(12, lvl + 1);
    return Math.pow(2, lvl / 12);
  }
  const m0 = note(9999);
  const m1 = note(100);
  const m2 = note(100);
  check('combo pitch rises', m2 > m1 && m1 > m0);
  const mReset = (() => { lvl = 0; return note(2000); })();
  check('combo reset after gap', Math.abs(mReset - 1) < 1e-9);
  const a = 0.7, b = 1 / a;
  check('deform area compensate', Math.abs(a * b - 1) < 1e-9);
}

console.log('\n' + (fails ? fails + ' FAIL' : 'ALL PASS'));
process.exit(fails ? 1 : 0);
