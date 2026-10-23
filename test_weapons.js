/* v3.10 武器 form + tag 冒煙 */
const fs = require('fs');
const h = fs.readFileSync(__dirname + '/index.html', 'utf8');
let fails = 0;
function check(label, ok, extra) {
  if (!ok) fails++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (extra ? '  ' + extra : ''));
}

const tblSrc = h.match(/const UPGRADES = \[[\s\S]*?\n\];/)[0].replace('const UPGRADES =', '');
const UPGRADES = new Function('return ' + tblSrc)();

console.log('=== pool ===');
check('強化池 = 26（17+5+4）', UPGRADES.length === 26, 'len=' + UPGRADES.length);
const forms = UPGRADES.filter(u => u.id.startsWith('form_'));
const tags = UPGRADES.filter(u => u.id.startsWith('tag_'));
check('形態卡 5', forms.length === 5, forms.map(u => u.id).join(','));
check('tag 卡 4', tags.length === 4, tags.map(u => u.id).join(','));
for (const u of forms.concat(tags)) {
  check(u.id + ' desc≤12', [...u.desc].length <= 12, u.desc);
  check(u.id + ' 有 cat', !!u.cat);
}

console.log('=== engine markers ===');
for (const k of [
  'function spawnPlayerShot', 'function tickPlayerBullets', 'function applyShotFormCosts',
  'function onPlayerBulletHit', 'shotForm', 'PLAYER_BULLET_CAP', 'MISSILE_CAP',
  "shotForm: 'bolt'", "form === 'rail'", "form === 'boomerang'", "form === 'missile'",
  "form === 'wave'", "form === 'laser'", 'tag_home', 'spawnSplitBolts', 'ricochetLeft',
]) {
  check(k, h.includes(k));
}

console.log('=== form costs pure ===');
function shipBase() {
  return { fireRate: 10, bulletSpd: 0.3, shotForm: 'bolt', shotTags: {} };
}
// extract applyShotFormCosts via eval of function text
const fn = h.match(/function applyShotFormCosts\(s\) \{[\s\S]*?\n\}/)[0];
eval(fn);
{
  let s = shipBase(); s.shotForm = 'rail'; applyShotFormCosts(s);
  check('rail fireRate×0.35', Math.abs(s.fireRate - 3.5) < 1e-9, s.fireRate);
}
{
  let s = shipBase(); s.shotForm = 'missile'; applyShotFormCosts(s);
  check('missile fireRate×0.55', Math.abs(s.fireRate - 5.5) < 1e-9, s.fireRate);
}
{
  let s = shipBase(); s.shotForm = 'boomerang'; applyShotFormCosts(s);
  check('boomerang fireRate×0.7', Math.abs(s.fireRate - 7) < 1e-9, s.fireRate);
}
{
  let s = shipBase(); s.shotForm = 'wave'; applyShotFormCosts(s);
  check('wave bulletSpd×0.9', Math.abs(s.bulletSpd - 0.27) < 1e-9, s.bulletSpd);
}

console.log('=== form mod sets shotForm ===');
for (const id of ['form_laser','form_rail','form_boom','form_miss','form_wave']) {
  const u = UPGRADES.find(x => x.id === id);
  const s = { shotForm: 'bolt', shotTags: { homing:0, split:0, slow:0, ricochet:0 } };
  u.mod(s, 1);
  check(id + ' → ' + s.shotForm, s.shotForm && s.shotForm !== 'bolt', s.shotForm);
}
{
  const s = { shotTags: { homing:0, split:0, slow:0, ricochet:0 } };
  UPGRADES.find(u => u.id === 'tag_home').mod(s, 2);
  UPGRADES.find(u => u.id === 'tag_split').mod(s, 1);
  check('homing stack 2', s.shotTags.homing === 2);
  check('split stack 1', s.shotTags.split === 1);
}

console.log('=== version ===');
check('v0.21.x', /v0\.21\.\d/.test(h));
check('互斥清 form_', /form_/.test(h) && /delete playerStacks\[id\]/.test(h));

console.log('\n' + (fails ? 'FAIL ' + fails : 'ALL PASS'));
process.exit(fails ? 1 : 0);
