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
/* ⚠️ v0.33.0 #123：applyShotFormCosts() 依賴 FORM_DPS_MUL 表（形態卡 DPS 帶）
   → 表一齊 eval 返去測試檔 scope（AI_INSTRUCTIONS.md §5.1.1）。
   ⚠️ 用「攞走 const 前綴 → eval 成物件字面量表達式」，
      唔可以直接 eval('const ...') —— direct eval 嘅 const 係 eval 自己 scope，唔會漏出嚟。 */
const FORM_DPS_MUL = eval('(' + h.match(/const FORM_DPS_MUL = \{[\s\S]*?\n\};/)[0].replace(/^const FORM_DPS_MUL = /, '').replace(/;\s*$/, '') + ')');
const fn = h.match(/function applyShotFormCosts\(s\) \{[\s\S]*?\n\}/)[0];
eval(fn);
{
  let s = shipBase(); s.shotForm = 'rail'; applyShotFormCosts(s);
  check('rail fireRate×0.35', Math.abs(s.fireRate - 3.5) < 1e-9, s.fireRate);
}
{
  let s = shipBase(); s.shotForm = 'missile'; applyShotFormCosts(s);
  /* v0.28.0：0.55 → 0.10。迴力鏢 / 導彈之前對 boss 係 0 傷害（死卡），
     原本嘅乘數從來冇對住真實 DPS 驗過；修正咗「命中唔死 + 射程 + 巡航加速」之後
     佢哋會必定命中 boss（實測 16.94 / 18.48 HP/s），比其他形態卡強 5–6 倍 →
     要重訂射速代價，令 5 張形態卡落喺同一個 DPS 帶（≈ 3.4 HP/s）。 */
  check('missile fireRate×0.07（v0.28.0 重訂）', Math.abs(s.fireRate - 0.7) < 1e-9, s.fireRate);
}
{
  let s = shipBase(); s.shotForm = 'boomerang'; applyShotFormCosts(s);
  check('boomerang fireRate×0.15（v0.28.0 重訂）', Math.abs(s.fireRate - 1.5) < 1e-9, s.fireRate);
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

console.log('\n=== rail 光束命中判定（v0.27.3 死卡修正）===');
/* ⚠️ 真實個案（v0.27.3 實機驗證撞到）：form_rail 嘅光束**畫到畫面頂**
   （render: moveTo(b.x, b.y) → lineTo(b.x, 8)），但命中判定用 |b.y - e.y| < hh，
   而 rail 子彈**唔會郁**（tickPlayerBullets 淨係 life -= dtMs）→ b.y 永遠停喺機身
   → 光束只打中貼住機身嘅敵人 = **死卡**。
   實機後果：揀咗 form_rail 之後幾乎打唔到嘢 → boss 永遠唔死 → 死鎖（STAGE_3 卡死 200+ 秒）。 */
{
  const fnSrc = h.match(/function playerBulletHits\(b, e, halfW\) \{[\s\S]*?\n\}/);
  check('有 playerBulletHits() 命中判定 helper（可測）', !!fnSrc);
  if (fnSrc) {
    eval(fnSrc[0]);
    const rail = { form: 'rail', x: 160, y: 388 };   // 光束柱 x=160，由機身 y=388 向上
    check('rail 打中同一柱、喺機身上方嘅遠處敵人（畫面頂）',
      playerBulletHits(rail, { x: 162, y: 30, kind: 'grunt' }, 8) === true);
    check('rail 打中同一柱、中段敵人',
      playerBulletHits(rail, { x: 158, y: 200, kind: 'grunt' }, 8) === true);
    check('rail 唔打中唔同柱嘅敵人',
      playerBulletHits(rail, { x: 40, y: 30, kind: 'grunt' }, 8) === false);
    check('rail 唔打中機身以下嘅敵人',
      playerBulletHits(rail, { x: 160, y: 460, kind: 'grunt' }, 8) === false);
    check('rail 打中 boss（同一柱、喺機身上方）',
      playerBulletHits(rail, { x: 161, y: 40, kind: 'spiral' }, 12) === true);

    /* 對照組：普通彈 / laser 嘅判定唔可以變 */
    const bolt = { form: 'bolt', x: 160, y: 300 };
    check('普通彈：打中附近敵人', playerBulletHits(bolt, { x: 162, y: 302 }, 8) === true);
    check('普通彈：唔打中遠處敵人', playerBulletHits(bolt, { x: 162, y: 30 }, 8) === false);
    const laser = { form: 'laser', x: 160, y: 300 };
    check('laser：打中附近敵人', playerBulletHits(laser, { x: 162, y: 302 }, 8) === true);
    check('laser：唔打中遠處敵人（由 laserTick 自己處理）',
      playerBulletHits(laser, { x: 162, y: 30 }, 8) === false);
  }
}

/* ==== v0.28.0 形態卡死卡修正（PLAN #111 / #112）====
   實機逐張形態卡強制掃描發現：form_boom / form_miss 兩張卡 boss 血量 **0 跌幅**
   （揀咗就卡死關卡）。根因 = ① 彈體「命中即刪彈」→ 返程/追擊根本唔存在
   ② 迴力鏢射程唔夠（最高只飞到 y≈158，boss 喺 y=51–109）③ 慢速彈體每幀改追最近雜魚。
   呢度用**行為測試**（抽出真函數喺 stub 環境實際執行）鎖住修正。 */
console.log('=== v0.28.0 形態卡死卡修正 ===');

/* --- helper 存在 + 行為 --- */
const survSrc = h.match(/function bulletSurvivesHit\(b\) \{[\s\S]*?\n\}/);
check('有 bulletSurvivesHit() helper（可測）', !!survSrc);
if (survSrc) eval(survSrc[0]);
check('rail 命中唔死', bulletSurvivesHit({ form: 'rail' }) === true);
check('boomerang 命中唔死', bulletSurvivesHit({ form: 'boomerang' }) === true);
check('missile 命中唔死', bulletSurvivesHit({ form: 'missile' }) === true);
check('普通彈命中會死', bulletSurvivesHit({ form: 'bolt' }) === false);
check('wave 命中會死', bulletSurvivesHit({ form: 'wave' }) === false);
check('冇 form 命中會死', bulletSurvivesHit({}) === false);
check('null 安全', bulletSurvivesHit(null) === false);

/* --- bossOrNearest：有 boss 就要鎖 boss --- */
let enemies = [];
const nearSrc = h.match(/function nearestEnemy\(x, y\) \{[\s\S]*?\n\}/);
const bossSrc = h.match(/function bossOrNearest\(x, y\) \{[\s\S]*?\n\}/);
check('有 bossOrNearest() helper（可測）', !!bossSrc);
if (nearSrc) eval(nearSrc[0]);
if (bossSrc) eval(bossSrc[0]);
enemies = [{ kind: 'spiral', x: 200, y: 80 }, { kind: 'grunt', x: 100, y: 300 }];
check('場上有 boss → 鎖 boss（唔係最近嘅雜魚）',
  bossOrNearest(0, 0) && bossOrNearest(0, 0).kind === 'spiral');
enemies = [{ kind: 'grunt', x: 100, y: 300 }, { kind: 'grunt', x: 110, y: 310 }];
check('冇 boss → 追最近敵人',
  bossOrNearest(0, 0) && bossOrNearest(0, 0).kind === 'grunt');
enemies = [];

/* --- onPlayerBulletHit：命中唔死（stub 依賴，eval 到 module scope） --- */
const applyElementEffects = () => {};
const spawnSplitBolts = () => {};
const spawnMissileBurst = () => {};
const hitSrc = h.match(/function onPlayerBulletHit\(b, e\) \{[\s\S]*?\n\}/);
check('有 onPlayerBulletHit()（可測）', !!hitSrc);
if (hitSrc) eval(hitSrc[0]);
check('迴力鏢命中唔死（返程先存在 → PLAN #69）',
  onPlayerBulletHit({ form: 'boomerang', pierceLeft: 0, tags: {} }, { hp: 10 }) === false);
check('導彈命中唔死（穿過雜魚繼續追 → PLAN #112）',
  onPlayerBulletHit({ form: 'missile', pierceLeft: 0, tags: {} }, { hp: 10 }) === false);
check('光束命中唔死',
  onPlayerBulletHit({ form: 'rail', pierceLeft: 0, tags: {} }, { hp: 10 }) === false);
check('普通彈命中會刪彈（對照組）',
  onPlayerBulletHit({ form: 'bolt', pierceLeft: 0, tags: {} }, { hp: 10 }) === true);
check('普通彈有貫穿剩餘就唔刪（對照組）',
  onPlayerBulletHit({ form: 'bolt', pierceLeft: 1, tags: {} }, { hp: 10 }) === false);

/* --- 結構守門：射程 / _hitSet / 追蹤目標 --- */
check('迴力鏢 maxLife = 1800（原本 1000 → 飛唔到 boss 高度）',
  /form === 'boomerang'[\s\S]{0,420}?life = maxLife = 1800/.test(h));
check('迴力鏢轉向條件改成「飛到畫面頂 y < 40 先轉」（原本生命過半 → 只到 y≈158）',
  /b\.y < 40 \|\| b\.life < b\.maxLife \* 0\.25/.test(h));
check('迴力鏢 / 導彈 spawn 就初始化 _hitSet（同一目標只打一次）',
  /_hitSet: \(form === 'boomerang' \|\| form === 'missile'\) \? \[\] : null/.test(h));
check('追蹤目標用 bossOrNearest（boss 優先，唔係每幀改追最近雜魚）',
  /isTrackForm \? bossOrNearest\(b\.x, b\.y\) : nearestEnemy\(b\.x, b\.y\)/.test(h));
check('迴力鏢出程（phase 0）都有追蹤，返程唔追',
  /b\.form === 'boomerang' && b\.phase === 0/.test(h));
check('護盾 / 護罩炮台擋唔死「命中唔死」嘅彈體',
  /else if \(!bulletSurvivesHit\(b\)\) \{\s*bullets\.splice\(i, 1\);/.test(h) &&
  (h.match(/!bulletSurvivesHit\(b\)/g) || []).length >= 2);

/* --- 導彈爆散碎屑唔打 boss（v0.28.0：碎屑喺 boss 身上爆開 → 下一幀即刻再打中 boss，
       `Math.max(1, dmg×0.4)` 又令每粒最少 1 傷 → 每發實際 2.2 + 3 = 5.2 傷，
       實測 DPS 8.84 HP/s，比其他形態卡強 5 倍）。同「連鎖閃電唔打 boss」一致。 --- */
check('導彈爆散碎屑帶 noBoss 標記', /noBoss: true/.test(h));
check('碰撞迴圈：noBoss 碎屑撞 boss 會跳過',
  /if \(b\.noBoss && e\.kind === 'spiral'\) continue;/.test(h));
{
  const burstSrc = h.match(/function spawnMissileBurst\(src\) \{[\s\S]*?\n\}/);
  check('有 spawnMissileBurst()（可測）', !!burstSrc);
  if (burstSrc) {
    const pushed = [];
    const bullets = [];
    const pushPlayerBullet = b => pushed.push(b);
    const MISSILE_BURST_CAP = 6, MISSILE_BURST_N = 3, MISSILE_BURST_DMG = 0.4;

    /* ⚠️ 用括號包住再 eval → 函式表達式（自我命名），唔會同上面嘅 stub 撞名 */
    const genBurst = eval('(' + burstSrc[0] + ')');
    genBurst({ x: 160, y: 80, dmg: 2.2 });
    check('爆散生 3 粒', pushed.length === 3, '→ ' + pushed.length);
    check('每粒都帶 noBoss（唔打 boss）', pushed.every(b => b.noBoss === true));
    check('每粒最少 1 傷（Math.max(1, …) 令碎屑對 boss 唔會變 0）',
      pushed.every(b => b.dmg === 1), pushed.map(b => b.dmg).join(','));
  }
}

console.log('=== version ===');
check('v0.21.x', /v0\.21\.\d/.test(h));
check('互斥清 form_', /form_/.test(h) && /delete playerStacks\[id\]/.test(h));

console.log('\n' + (fails ? 'FAIL ' + fails : 'ALL PASS'));
process.exit(fails ? 1 : 0);
