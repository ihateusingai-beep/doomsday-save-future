/* v0.27.0 元素層（形態 × 元素 兩層組合）回歸測試
 *
 * 設計前提（PLAN #100–#104）：
 *   ① 元素層 5 個元素（火／冰／雷／光／暗）× 3 級，每級一句話講得清
 *   ② 形態決定彈道、元素決定命中效果 —— 兩層正交，25 種配對零特判
 *   ③ 揀機揀基底元素（5 選 1），boss 後元素抉擇（3 選 1：升級基底／加副元素）
 *   ④ 統一入口 applyElementEffects()，基底 + 副效果疊加
 *
 * 測試方法：同 test_ships_v026.js 一致 —— 唔做 regex 結構檢查，
 * 真係把函數抽出嚟喺 stub 環境實際執行，然後斷言行為。
 */
const fs = require('fs');
const h = fs.readFileSync(__dirname + '/index.html', 'utf8');

let fails = 0;
function check(label, ok, extra) {
  if (!ok) fails++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (extra ? '  ' + extra : ''));
}

/* ---------- 工具 ---------- */
function extractFunction(name) {
  const marker = 'function ' + name + '(';
  const start = h.indexOf(marker);
  if (start < 0) throw new Error('搵唔到 function ' + name);
  const bodyStart = h.indexOf('{', start + marker.length);
  let depth = 0;
  for (let i = bodyStart; i < h.length; i++) {
    const c = h[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return h.slice(start, i + 1);
    }
  }
  throw new Error('括號唔平衡: ' + name);
}
function extractBlock(name) {
  const marker = 'const ' + name + ' = ';
  const start = h.indexOf(marker);
  if (start < 0) throw new Error('搵唔到 ' + name);
  let i = start + marker.length;
  while (i < h.length && h[i] !== '{' && h[i] !== '[') i++;
  const open = h[i];
  const close = open === '{' ? '}' : ']';
  let depth = 0, quote = '';
  for (let j = i; j < h.length; j++) {
    const c = h[j];
    if (quote) {
      if (c === quote && h[j - 1] !== '\\') quote = '';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return h.slice(i, j + 1);
    }
  }
  throw new Error('括號唔平衡: ' + name);
}
/* 把 function 原文包成可執行嘅 wrapper。
   ⚠️ 約定：**自身參數在前、注入依賴在後** —— makeFn('f',[a,b])(x, y, aVal, bVal)
   ⚠️ new Function 嘅外層呼叫只係注入依賴並「交返」內層函數，
      所以呢度要自己再 call 一次內層函數先會真正執行。 */
function makeFn(name, deps, consts) {
  const src = extractFunction(name);
  /* ⚠️ 元素常數（ELEM_*）係 module 層 const，抽出嚟嘅函數喺 stub 環境
     見唔到佢哋 —— 所以用 prelude 喺 Function body 頂部重新宣告。 */
  const prelude = (consts || [])
    .map(n => 'const ' + n + ' = ' + constNum(n) + ';').join('\n');
  const F = new Function(...deps, prelude + '\n' + src + '\nreturn ' + name + ';');
  return function (...callArgs) {
    const split = callArgs.length - deps.length;
    const own = callArgs.slice(0, split);
    const depVals = callArgs.slice(split);
    const inner = F(...depVals);
    return inner(...own);
  };
}
/* module 層所有 ELEM_* 常數名（元素機制全部靠佢哋） */
const ELEM_CONST_NAMES = [...new Set(
  [...h.matchAll(/^const (ELEM_[A-Z0-9_]+)\s*=/gm)].map(m => m[1]))];
function constNum(name) {
  const m = h.match(new RegExp('const\\s+' + name + '\\s*=\\s*([^;]+);'));
  if (!m) throw new Error('搵唔到 const ' + name);
  const n = Number(m[1].trim());
  if (isNaN(n)) throw new Error('const ' + name + ' 唔係數字');
  return n;
}

/* 專精倍率（v0.27.0 修正）：基底元素滿 L3 再升 → 該元素傷害 ×1.4。
   ⚠️ 原本 elementMaster 淨係寫入、淨係喺 HUD 顯示「+」—— 實際傷害冇加，
      等於卡面寫住「基底元素傷害 +40%」但實際唔係 = 死卡 + 呃玩家。 */
const elementMasterMul = makeFn('elementMasterMul', ['ship'], ELEM_CONST_NAMES);

/* ================================================================
 * 1. 元素表結構（5 個元素 × 3 級）
 * ================================================================ */
console.log('\n=== 1. 元素表：5 個元素 × 3 級 ===');
const ELEMENTS = eval('(' + extractBlock('ELEMENTS') + ')');
const ELEMENT_IDS = eval('(' + extractBlock('ELEMENT_IDS') + ')');
{
  check('元素數 == 5', ELEMENT_IDS.length === 5, '→ ' + ELEMENT_IDS.join(', '));
  check('ELEMENT_IDS 冇重複', new Set(ELEMENT_IDS).size === ELEMENT_IDS.length);
  const bad = [];
  for (const id of ELEMENT_IDS) {
    const e = ELEMENTS[id];
    if (!e) { bad.push(id + '(缺)'); continue; }
    if (!e.name) bad.push(id + '(冇名)');
    if (!e.tag) bad.push(id + '(冇一句話)');
    if (!Array.isArray(e.lv) || e.lv.length !== 3) bad.push(id + '(級數)');
    if (!/^#[0-9a-f]{6}$/i.test(e.color || '')) bad.push(id + '(色)');
    if (!e.sprite || !e.hit) bad.push(id + '(sprite)');
  }
  check('每個元素都有 名 / 一句話 / 3 級效果 / 合法色 / sprite', bad.length === 0, bad.join(', '));
  check('ELEMENT_MAX_LV == 3', constNum('ELEMENT_MAX_LV') === 3);
  const longLv = [];
  for (const id of ELEMENT_IDS) {
    ELEMENTS[id].lv.forEach((s, i) => { if (s.length > 24) longLv.push(id + 'LV' + (i + 1)); });
  }
  check('每級效果一句話 ≤ 24 字（白板學生 3 秒讀得明）', longLv.length === 0, longLv.join(', '));
}

/* ================================================================
 * 2. hasElementLevel：基底 + 副 都要計
 * ================================================================ */
console.log('\n=== 2. hasElementLevel（基底 A + 副 B 都計）===');
const hasElementLevel = makeFn('hasElementLevel', ['ship']);
{
  const ship = { elementA: 'fire', elementALv: 2, elementB: 'ice', elementBLv: 1 };
  check('基底 fire 達到 LV2 → true', hasElementLevel('fire', 2, ship) === true);
  check('基底 fire 唔達到 LV3 → false', hasElementLevel('fire', 3, ship) === false);
  check('副元素 ice 達到 LV1 → true', hasElementLevel('ice', 1, ship) === true);
  check('副元素 ice 唔達到 LV2 → false', hasElementLevel('ice', 2, ship) === false);
  check('冇嘅元素 → false', hasElementLevel('light', 1, ship) === false);
  const empty = { elementA: null, elementALv: 1, elementB: null };
  check('未揀元素 → 全部 false', hasElementLevel('fire', 1, empty) === false);
}

/* ================================================================
 * 3. elementHitDamage：光 L2 破盾 / 暗 L2 加深 / 冰 L2 易碎
 * ================================================================ */
console.log('\n=== 3. elementHitDamage（傷害倍率）===');
/* ⚠️ elementHitDamage 內部會叫 hasElementLevel(id, lv)，
   所以注入嘅係一個「讀住 curShip」嘅 lambda（每次測試前改 curShip）。 */
let curShip = null;
const hasEl = (id, lv) => hasElementLevel(id, lv, curShip);
const masterMul = (id) => elementMasterMul(id, curShip);
const elementHitDamage = makeFn('elementHitDamage',
  ['hasElementLevel', 'elementMasterMul'], ELEM_CONST_NAMES);
{
  const shipFire = { elementA: 'fire', elementALv: 3, elementB: null };
  curShip = shipFire;
  check('冇元素效果 → 原始傷害', elementHitDamage({ dmg: 3 }, {}, hasEl, masterMul) === 3);

  const shipLight = { elementA: 'light', elementALv: 2, elementB: null };
  curShip = shipLight;
  const turret = { turret: true, turretShield: 10 };
  check('光 LV2：對有護罩敵人 ×2', elementHitDamage({ dmg: 3 }, turret, hasEl, masterMul) === 6);
  check('光 LV2：冇護罩就唔加成',
        elementHitDamage({ dmg: 3 }, { turret: true, turretShield: 0 }, hasEl, masterMul) === 3);

  const shipDark = { elementA: 'dark', elementALv: 2, elementB: null };
  curShip = shipDark;
  check('暗 LV2：被標記目標 ×1.25',
        Math.abs(elementHitDamage({ dmg: 4 }, { markT: 100 }, hasEl, masterMul) - 5) < 1e-9);
  check('暗 LV2：未標記唔加成', elementHitDamage({ dmg: 4 }, {}, hasEl, masterMul) === 4);

  const shipIce = { elementA: 'ice', elementALv: 2, elementB: null };
  curShip = shipIce;
  check('冰 LV2：易碎目標 ×1.25',
        Math.abs(elementHitDamage({ dmg: 4 }, { shatter: true }, hasEl, masterMul) - 5) < 1e-9);
  check('冰 LV2：非易碎唔加成', elementHitDamage({ dmg: 4 }, {}, hasEl, masterMul) === 4);

  const shipSub = { elementA: 'fire', elementALv: 1, elementB: 'light', elementBLv: 2 };
  curShip = shipSub;
  check('副元素 LV2 嘅光 L2 一樣生效', elementHitDamage({ dmg: 2 }, turret, hasEl, masterMul) === 4);

  /* --- 專精：基底元素 +40%（v0.27.0 修正嘅死卡） --- */
  curShip = { elementA: 'light', elementALv: 3, elementB: null, elementMaster: true };
  check('專精光：破盾 ×2 再 ×1.4',
        Math.abs(elementHitDamage({ dmg: 3 }, turret, hasEl, masterMul) - 8.4) < 1e-9,
        '→ ' + elementHitDamage({ dmg: 3 }, turret, hasEl, masterMul));
  curShip = { elementA: 'fire', elementALv: 3, elementB: 'light', elementBLv: 2, elementMaster: true };
  check('專精只加基底（副元素唔受影響）',
        elementHitDamage({ dmg: 2 }, turret, hasEl, masterMul) === 4);
}

/* ================================================================
 * 4. applyOneElement：每個元素每級嘅行為
 * ================================================================ */
console.log('\n=== 4. applyOneElement（5 元素 × 3 級）===');
const AOE_DEPS = ['enemies', 'spawnEmber', 'spawnFrost', 'spawnArc', 'spawnGlow', 'spawnShade',
                   'chainLightning', 'lightBurst', 'triggerScreenFx', 'elementMasterMul'];
{
  const AOE = makeFn('applyOneElement', AOE_DEPS, ELEM_CONST_NAMES);
  const noop = () => {};
  const mk = () => ({ x: 0, y: 0, hp: 10, kind: 'grunt', _dead: false });
  /* ⚠️ 統一用一隻未專精嘅船，否則專精倍率會污染下面嘅傷害數字 */
  curShip = { elementA: 'fire', elementALv: 1, elementB: null, elementMaster: false };

  /* --- 火 --- */
  let t = mk();
  AOE('fire', 1, t, { dmg: 2, pierceLeft: 0 }, [], noop, noop, noop, noop, noop, noop, noop, noop, masterMul);
  check('火 LV1：施加灼燒', t.burnT > 0, '→ burnT=' + t.burnT);
  check('火 LV1：灼燒傷害 = 1', t.burnDmg === 1, '→ ' + t.burnDmg);
  check('火 LV1：唔會爆炸', !t.burnBoom);

  const near = mk(); near.x = 20;
  const far = mk(); far.x = 400;
  const t2 = mk();
  AOE('fire', 2, t2, { dmg: 2, pierceLeft: 0 }, [near, far], noop, noop, noop, noop, noop, noop, noop, noop, masterMul);
  check('火 LV2：灼燒傷害 = 1.5', t2.burnDmg === 1.5, '→ ' + t2.burnDmg);
  check('火 LV2：蔓延到相鄰敵人', near.burnT > 0, '→ burnT=' + near.burnT);
  check('火 LV2：唔會蔓延到遠處敵人', !far.burnT);

  const t3 = mk();
  AOE('fire', 3, t3, { dmg: 2, pierceLeft: 0 }, [], noop, noop, noop, noop, noop, noop, noop, noop, masterMul);
  check('火 LV3：標記燒死會爆炸', t3.burnBoom === true);

  /* --- 冰 --- */
  const i1 = mk();
  AOE('ice', 1, i1, { dmg: 2, pierceLeft: 0 }, [], noop, noop, noop, noop, noop, noop, noop, noop, masterMul);
  check('冰 LV1：緩速 ×0.6', i1.slowMul === 0.6, '→ ' + i1.slowMul);
  check('冰 LV1：唔會易碎', !i1.shatter);
  check('冰 LV1：唔會凍結', !i1.freezeT);

  const i2 = mk();
  AOE('ice', 2, i2, { dmg: 2, pierceLeft: 0 }, [], noop, noop, noop, noop, noop, noop, noop, noop, masterMul);
  check('冰 LV2：緩速 ×0.4', i2.slowMul === 0.4, '→ ' + i2.slowMul);
  check('冰 LV2：易碎', i2.shatter === true);

  const i3 = mk();
  AOE('ice', 3, i3, { dmg: 2, pierceLeft: 0 }, [], noop, noop, noop, noop, noop, noop, noop, noop, masterMul);
  check('冰 LV3：凍結', i3.freezeT > 0, '→ ' + i3.freezeT);

  /* --- 雷 --- */
  let chainArgs = null;
  const chainStub = (from, depth, dmg) => { chainArgs = { depth, dmg }; };
  const r1 = mk();
  AOE('lightning', 1, r1, { dmg: 4, pierceLeft: 0 }, [], noop, noop, noop, noop, noop, chainStub, noop, noop, masterMul);
  check('雷 LV1：唔會麻痺', !r1.stunT);
  /* 用真 chainStub 注入再跑一次 */
  AOE('lightning', 1, r1, { dmg: 4, pierceLeft: 0 }, [], noop, noop, noop, noop, noop, chainStub, noop, noop, masterMul);
  check('雷 LV1：觸發連鎖', !!chainArgs, chainArgs ? 'depth=' + chainArgs.depth : '');
  check('雷 LV1：連鎖深度 = 1', chainArgs && chainArgs.depth === 1);
  check('雷 LV1：連鎖傷害 = 原始 × 0.6', chainArgs && Math.abs(chainArgs.dmg - 2.4) < 1e-9);

  const r3 = mk();
  AOE('lightning', 3, r3, { dmg: 4, pierceLeft: 0 }, [], noop, noop, noop, noop, noop, chainStub, noop, noop, masterMul);
  check('雷 LV3：連鎖深度 = 3', chainArgs && chainArgs.depth === 3);
  check('雷 LV3：麻痺', r3.stunT > 0, '→ ' + r3.stunT);

  /* --- 光 --- */
  const bullet = { dmg: 2, pierceLeft: 0 };
  const g1 = mk();
  AOE('light', 1, g1, bullet, [], noop, noop, noop, noop, noop, noop, noop, noop, masterMul);
  check('光 LV1：穿透 +1', bullet.pierceLeft === 1, '→ ' + bullet.pierceLeft);
  let burstCalled = false;
  const g3 = { dmg: 2, pierceLeft: 0 };
  AOE('light', 3, g3, { dmg: 2, pierceLeft: 0 }, [], noop, noop, noop, noop, noop, noop,
      () => { burstCalled = true; }, noop, masterMul);
  check('光 LV3：觸發光爆', burstCalled);

  /* --- 暗 --- */
  const d1 = mk();
  AOE('dark', 1, d1, { dmg: 2, pierceLeft: 0 }, [], noop, noop, noop, noop, noop, noop, noop, noop, masterMul);
  check('暗 LV1：施加吞噬標記', d1.markT > 0, '→ ' + d1.markT);
  check('暗 LV1：唔會爆發', !d1.darkBoom);
  const d3 = mk();
  AOE('dark', 3, d3, { dmg: 2, pierceLeft: 0 }, [], noop, noop, noop, noop, noop, noop, noop, noop, masterMul);
  check('暗 LV3：標記死亡會爆發', d3.darkBoom === true);
}

/* ================================================================
 * 5. applyElementEffects：基底 + 副 疊加
 * ================================================================ */
console.log('\n=== 5. applyElementEffects（基底 + 副 疊加）===');
const applyElementEffects = makeFn('applyElementEffects', ['ship', 'applyOneElement']);
{
  const seen = [];
  const spy = (id, lv) => { seen.push(id + ':' + lv); };
  const ship = { elementA: 'fire', elementALv: 2, elementB: 'ice', elementBLv: 1 };
  applyElementEffects({ x: 0, y: 0 }, { x: 0, y: 0 }, ship, spy);
  check('基底先跑、副元素後跑',
        seen.length === 2 && seen[0] === 'fire:2' && seen[1] === 'ice:1', seen.join(' → '));
  const seen2 = [];
  applyElementEffects({ x: 0, y: 0 }, { x: 0, y: 0 },
    { elementA: 'fire', elementALv: 1, elementB: null }, (id) => seen2.push(id));
  check('冇副元素就只跑基底', seen2.length === 1 && seen2[0] === 'fire');
  const seen3 = [];
  applyElementEffects({ x: 0, y: 0 }, { x: 0, y: 0 },
    { elementA: null, elementB: null }, (id) => seen3.push(id));
  check('未揀元素 → 冇任何效果', seen3.length === 0);
}

/* ================================================================
 * 6. chainLightning：連鎖傷鄰敵、唔打 boss
 * ================================================================ */
console.log('\n=== 6. chainLightning（連鎖）===');
const chainLightning = makeFn('chainLightning',
  ['enemies', 'spawnArc', 'screenFlash', 'killEnemy', 'triggerScreenFx'], ELEM_CONST_NAMES);
{
  const near = { x: 30, y: 0, hp: 5, kind: 'grunt', _dead: false };
  const boss = { x: 40, y: 0, hp: 100, kind: 'spiral', _dead: false };
  const from = { x: 0, y: 0, hp: 10, kind: 'grunt', _dead: false };
  let killed = 0;
  chainLightning(from, 1, 6, [near, boss, from], () => {}, () => {},
    (e) => { killed++; return 'grunt'; }, () => {});
  check('連鎖打中最近嘅雜魚', near.hp < 5, '→ hp=' + near.hp);
  check('連鎖唔打 boss', boss.hp === 100, '→ hp=' + boss.hp);
  check('連鎖擊殺時叫 killEnemy', killed === 1);
}

/* ================================================================
 * 7. lightBurst / elementBoom：全場 + 範圍，唔打 boss
 * ================================================================ */
console.log('\n=== 7. lightBurst / elementBoom ===');
const lightBurst = makeFn('lightBurst',
  ['enemies', 'spawnGlow', 'killEnemy', 'triggerScreenFx', 'elementMasterMul'], ELEM_CONST_NAMES);
{
  const g1 = { x: 0, y: 0, hp: 10, kind: 'grunt', _dead: false };
  const boss = { x: 0, y: 0, hp: 100, kind: 'spiral', _dead: false };
  curShip = { elementA: 'light', elementALv: 3, elementB: null, elementMaster: false };
  lightBurst([g1, boss], () => {}, () => {}, () => {}, masterMul);
  check('光爆令全場雜魚受傷', g1.hp < 10, '→ hp=' + g1.hp);
  check('光爆唔打 boss', boss.hp === 100);
  check('未專精：光爆傷害 = 1', Math.abs((10 - g1.hp) - 1) < 1e-9, '→ ' + (10 - g1.hp));

  const g2 = { x: 0, y: 0, hp: 10, kind: 'grunt', _dead: false };
  curShip = { elementA: 'light', elementALv: 3, elementB: null, elementMaster: true };
  lightBurst([g2], () => {}, () => {}, () => {}, masterMul);
  check('專精光：光爆傷害 ×1.4', Math.abs((10 - g2.hp) - 1.4) < 1e-9, '→ ' + (10 - g2.hp));
}
const elementBoom = makeFn('elementBoom',
  ['enemies', 'spawnBoom', 'screenFlash', 'spawnEmber', 'spawnShade', 'killEnemy',
   'triggerScreenFx', 'elementBurstDepth'], ELEM_CONST_NAMES);
{
  const near = { x: 20, y: 0, hp: 10, kind: 'grunt', _dead: false };
  const far = { x: 400, y: 0, hp: 10, kind: 'grunt', _dead: false };
  const boss = { x: 10, y: 0, hp: 100, kind: 'spiral', _dead: false };
  elementBoom(0, 0, 70, 3, 'fire', [near, far, boss], () => {}, () => {}, () => {},
    () => {}, () => {}, () => {}, 0);
  check('爆發打中範圍內敵人', near.hp < 10, '→ hp=' + near.hp);
  check('爆發唔打範圍外敵人', far.hp === 10);
  check('爆發唔打 boss', boss.hp === 100);
}

/* ================================================================
 * 8. elementTick：灼燒 DoT
 * ================================================================ */
console.log('\n=== 8. elementTick（灼燒 DoT）===');
const elementTick = makeFn('elementTick', ['enemies', 'spawnEmber', 'killEnemy'], ELEM_CONST_NAMES);
{
  const t = { x: 0, y: 0, hp: 10, kind: 'grunt', _dead: false, burnT: 2000, burnDmg: 1 };
  elementTick(1000, [t], () => {}, () => {});
  check('灼燒每秒扣 1 血', t.hp === 9, '→ hp=' + t.hp);
  const t2 = { x: 0, y: 0, hp: 10, kind: 'grunt', _dead: false, burnT: 2000, burnDmg: 1.5 };
  elementTick(2000, [t2], () => {}, () => {});
  check('灼燒 L2 傷害 1.5/秒', Math.abs(t2.hp - 7) < 1e-9, '→ hp=' + t2.hp);
  const t3 = { x: 0, y: 0, hp: 10, kind: 'grunt', _dead: false, burnT: 2000, burnDmg: 1 };
  elementTick(3000, [t3], () => {}, () => {});
  check('灼燒時間到就唔再扣血', t3.burnT <= 0, '→ burnT=' + t3.burnT);
  const boss = { x: 0, y: 0, hp: 100, kind: 'spiral', _dead: false, burnT: 2000, burnDmg: 1 };
  elementTick(1000, [boss], () => {}, () => {});
  check('灼燒唔打 boss（避免 boss 血負但唔死）', boss.hp === 100, '→ hp=' + boss.hp);
}

/* ================================================================
 * 9. boss 後元素抉擇：候選結構 + 應用
 * ================================================================ */
console.log('\n=== 9. 元素抉擇（boss 後 3 選 1）===');
const buildElemChoiceOffer = makeFn('buildElemChoiceOffer', ['ship', 'ELEMENT_IDS', 'ELEMENT_MAX_LV'], ELEM_CONST_NAMES);
{
  const ship = { elementA: 'fire', elementALv: 1, elementB: null, elementBLv: 1 };
  const offer = buildElemChoiceOffer(ship, ELEMENT_IDS, 3);
  check('候選 = 3 張卡', offer.length === 3, '→ ' + offer.length);
  check('卡 1 = 基底升級', offer[0].kind === 'base' && offer[0].elemId === 'fire');
  check('卡 1 等級 = 基底 +1', offer[0].lv === 2, '→ ' + offer[0].lv);
  check('卡 2、3 = 副元素選項', offer[1].kind === 'sub' && offer[2].kind === 'sub');
  check('副元素唔會係基底本身', offer[1].elemId !== 'fire' && offer[2].elemId !== 'fire');
  check('兩個副元素候選唔同', offer[1].elemId !== offer[2].elemId);

  const shipMax = { elementA: 'fire', elementALv: 3, elementB: null, elementBLv: 1 };
  check('基底滿 L3 → 卡 1 標記為專精', buildElemChoiceOffer(shipMax, ELEMENT_IDS, 3)[0].master === true);

  /* ⚠️ 已攞咗「專精」之後，基底卡再出現就係死卡（揀咗都冇任何效果） */
  const shipMastered = { elementA: 'fire', elementALv: 3, elementB: 'ice', elementBLv: 1, elementMaster: true };
  const offerM = buildElemChoiceOffer(shipMastered, ELEMENT_IDS, 3);
  check('已專精 → 唔再出基底卡（免得揀咗冇效果）',
        offerM.every(c => c.kind !== 'base'), '→ ' + offerM.map(c => c.kind).join(','));
  check('已專精 → 仍然有 3 張卡可以揀', offerM.length === 3, '→ ' + offerM.length);
  check('已專精 → 3 張全部係副元素卡', offerM.every(c => c.kind === 'sub'));
  check('已專精 → 副元素卡唔會係基底本身', offerM.every(c => c.elemId !== 'fire'));

  const shipSub = { elementA: 'fire', elementALv: 1, elementB: 'ice', elementBLv: 1 };
  let foundUpgrade = false, foundSwitch = false;
  for (let i = 0; i < 60; i++) {
    for (const c of buildElemChoiceOffer(shipSub, ELEMENT_IDS, 3)) {
      if (c.kind !== 'sub') continue;
      if (c.elemId === 'ice' && c.upgrade && c.lv === 2) foundUpgrade = true;
      if (c.elemId !== 'ice' && c.switcher && c.lv === 1) foundSwitch = true;
    }
  }
  check('已有副元素 → 對應候選係「升級 LV2」', foundUpgrade);
  check('已有副元素 → 其他候選標記「轉職」', foundSwitch);
}
const applyPickedElemChoice = makeFn('applyPickedElemChoice',
  ['ship', 'elemChoiceOffer', 'ELEMENTS', 'ELEMENT_MAX_LV', 'sfx', 'advanceStage'],
  ELEM_CONST_NAMES);
{
  const ship = { elementA: 'fire', elementALv: 1, elementB: null, elementBLv: 1, elementMaster: false };
  let offer = [
    { kind: 'base', elemId: 'fire', lv: 2 },
    { kind: 'sub', elemId: 'ice', lv: 1 },
    { kind: 'sub', elemId: 'light', lv: 1 },
  ];
  applyPickedElemChoice(0, ship, offer, ELEMENTS, 3, () => {}, () => {});
  check('揀基底卡 → 基底升級', ship.elementALv === 2 && ship.elementB === null);

  offer = [
    { kind: 'base', elemId: 'fire', lv: 3 },
    { kind: 'sub', elemId: 'ice', lv: 1 },
    { kind: 'sub', elemId: 'light', lv: 1 },
  ];
  applyPickedElemChoice(1, ship, offer, ELEMENTS, 3, () => {}, () => {});
  check('揀副元素卡 → 加入副元素 LV1', ship.elementB === 'ice' && ship.elementBLv === 1);

  offer = [
    { kind: 'base', elemId: 'fire', lv: 3 },
    { kind: 'sub', elemId: 'ice', lv: 2, upgrade: true },
    { kind: 'sub', elemId: 'light', lv: 1 },
  ];
  applyPickedElemChoice(1, ship, offer, ELEMENTS, 3, () => {}, () => {});
  check('再揀同一副元素 → 升級 LV2', ship.elementB === 'ice' && ship.elementBLv === 2);

  offer = [
    { kind: 'base', elemId: 'fire', lv: 3 },
    { kind: 'sub', elemId: 'ice', lv: 2, upgrade: true },
    { kind: 'sub', elemId: 'light', lv: 1, switcher: true },
  ];
  applyPickedElemChoice(2, ship, offer, ELEMENTS, 3, () => {}, () => {});
  check('揀另一個副元素 → 轉職（舊副移除）', ship.elementB === 'light' && ship.elementBLv === 1);

  const shipMax = { elementA: 'fire', elementALv: 3, elementB: null, elementBLv: 1, elementMaster: false };
  offer = [{ kind: 'base', elemId: 'fire', lv: 4, master: true }];
  applyPickedElemChoice(0, shipMax, offer, ELEMENTS, 3, () => {}, () => {});
  check('基底滿級再升 → 專精', shipMax.elementMaster === true);
}

/* ================================================================
 * 10. 揀元素畫面：2 行 × 3 列網格
 * ================================================================ */
console.log('\n=== 10. 揀元素畫面網格 ===');
const elementCardsLayout = makeFn('elementCardsLayout', ['VIEW_W', 'VIEW_H']);
{
  const L = elementCardsLayout(320, 480);
  check('卡闊 96', L.w === 96, '→ ' + L.w);
  check('卡高 108', L.h === 108, '→ ' + L.h);
  check('3 列', L.cols === 3);
  const r0 = L.rect(0), r4 = L.rect(4);
  check('第 1 張卡喺左上', r0.x < 100 && r0.y < 120, '→ ' + r0.x + ',' + r0.y);
  check('第 5 張卡喺第二行', r4.y > r0.y + 60, '→ ' + r4.y);
  const r2 = L.rect(2), r3 = L.rect(3);
  check('第 3 張卡喺第一行最右', r2.y === r0.y && r2.x > r0.x);
  check('第 4 張卡喺第二行最左', r3.y > r0.y && r3.x === r0.x);
  check('卡唔會超出畫面', L.rect(2).x + L.w <= 320 && L.rect(4).y + L.h <= 480);
  check('觸控目標 ≥ 64×64（PLAN #20）', L.w >= 64 && L.h >= 64, '→ ' + L.w + '×' + L.h);
}
const hitElementCard = makeFn('hitElementCard', ['elementOffer', 'elementCardsLayout']);
  /* hitElementCard 內部叫 elementCardsLayout()（無參數）→ 注入固定尺寸版 */
  const fixedLayout = () => elementCardsLayout(320, 480);
{
  const L = elementCardsLayout(320, 480);
  const offer = ELEMENT_IDS.slice();
  const r = L.rect(2);
  check('撳第 3 張卡 → 索引 2', hitElementCard(r.x + 40, r.y + 40, offer, fixedLayout) === 2);
  check('撳第 6 格（第 2 行第 3 欄）→ 冇命中',
        hitElementCard(L.rect(5).x + 40, L.rect(5).y + 40, offer, fixedLayout) === -1);
  check('撳空白 → 冇命中', hitElementCard(5, 5, offer, fixedLayout) === -1);
}

/* ================================================================
 * 11. 流程接線
 * ================================================================ */
console.log('\n=== 11. 流程接線 ===');
{
  check('STATE 有 ELEMENT_PICK', /ELEMENT_PICK:\s*'ELEMENT_PICK'/.test(h));
  check('STATE 有 ELEM_CHOICE', /ELEM_CHOICE:\s*'ELEM_CHOICE'/.test(h));
  check('揀機完之後去 ELEMENT_PICK（唔係直接入關）', /fsm\.set\(STATE\.ELEMENT_PICK\)/.test(h));
  check('揀完元素去 SKILL_PICK', /fsm\.set\(STATE\.SKILL_PICK\)/.test(h));
  check('boss 後經 ELEM_CHOICE 先入下一關', /fsm\.set\(STATE\.ELEM_CHOICE\)/.test(h));
  check('advanceStage 有 ELEM_CHOICE 分支', /fsm\.cur === STATE\.ELEM_CHOICE/.test(h));
  check('ELEMENT_PICK 有 onStateEnter 分支', /s === STATE\.ELEMENT_PICK/.test(h));
  check('ELEM_CHOICE 有 onStateEnter 分支', /s === STATE\.ELEM_CHOICE/.test(h));
  check('鍵盤 1–5 揀元素',
        /STATE\.ELEMENT_PICK[\s\S]{0,220}k >= '1' && k <= '5'/.test(h));
  check('揀機 fallback 明確設預設元素（唔係靜靜哋 null）', /ship\.elementA = 'fire'/.test(h));
  const upCount = (h.match(/\{ id:'[a-z0-9_]+',\s*cat:/g) || []).length;
  check('強化池仍然 26 張（零新卡）', upCount === 26, '→ ' + upCount);
  const formCount = (h.match(/\{ id:'form_[a-z]+'/g) || []).length;
  check('形態卡仍然 5 張（零新卡）', formCount === 5, '→ ' + formCount);
  const tagCount = (h.match(/\{ id:'tag_[a-z]+'/g) || []).length;
  check('tag 仍然 4 個（零新卡）', tagCount === 4, '→ ' + tagCount);
}

/* ================================================================
 * 12. 零死卡：每個元素欄位都有 game logic 讀
 * ================================================================ */
console.log('\n=== 12. 零死卡檢查（元素欄位必須有讀）===');
{
  const fields = ['burnT', 'burnDmg', 'burnBoom', 'shatter', 'freezeT', 'stunT',
                  'markT', 'darkBoom', 'slowMul', 'elementMaster'];
  const unread = [];
  for (const f of fields) {
    const n = (h.match(new RegExp('\\b' + f + '\\b', 'g')) || []).length;
    if (n < 2) unread.push(f + '(只出現 ' + n + ' 次)');
  }
  check('所有元素欄位都有讀', unread.length === 0, unread.join(', '));
  const seg = extractFunction('applyOneElement');
  const missing = [];
  for (const id of ELEMENT_IDS) {
    if (seg.indexOf("case '" + id + "':") < 0) missing.push(id);
  }
  check('每個元素都有對應分支（零死元素）', missing.length === 0, missing.join(', '));
}

/* ================================================================
 * 13. VFX：染色 + 粒子 + 屏幕效果
 * ================================================================ */
console.log('\n=== 13. VFX 重做 ===');
{
  check('有彈藥染色（offscreen tint）', /function getTintedSprite\(/.test(h));
  check('染色唔用 ctx.filter（低 FPS 裝置會慢）', !/ctx\.filter\s*=/.test(h));
  check('染色有快取（唔會每幀重建 canvas）', /const tintCache = new Map\(\)/.test(h));
  check('有元素粒子 ember', /function spawnEmber\(/.test(h));
  check('有元素粒子 frost', /function spawnFrost\(/.test(h));
  check('有元素粒子 arc', /function spawnArc\(/.test(h));
  check('有元素粒子 glow', /function spawnGlow\(/.test(h));
  check('有元素粒子 shade', /function spawnShade\(/.test(h));
  check('有拖尾（trail particle）', /kind: 'trail'/.test(h));
  check('有屏幕效果 drawScreenFx', /function drawScreenFx\(/.test(h));
  check('屏幕效果有節流冷卻', /screenFxCd/.test(h));
  check('粒子有總量上限（唔會拖死低 FPS 裝置）', /const PARTICLE_CAP =/.test(h));
  const need = ['bullet_fire', 'bullet_ice', 'bullet_bolt', 'bullet_light', 'bullet_dark',
                'hit_fire', 'hit_ice', 'hit_bolt', 'hit_light', 'hit_dark',
                'p_ember', 'p_frost', 'p_arc'];
  check('13 個新 sprite 名全部喺 sheet 座標表',
        need.every(n => h.indexOf(n + ': {') > 0),
        need.filter(n => h.indexOf(n + ': {') < 0).join(', '));
  check('玩家子彈繪製行經染色版', /drawPlayerBulletSprite\(/.test(h));
  check('HUD 有元素 chip', /元素 chip/.test(h));
  check('畫面有 drawScreenFx 呼叫', /drawScreenFx\(\);/.test(h));
}

/* ================================================================
 * 14. 強化池 / 形態 / tag 完全不受影響（PLAN #101）
 * ================================================================ */
console.log('\n=== 14. 舊系統零影響 ===');
{
  check('SHIPS 仍然 5 架', (h.match(/^  [A-E]: \{/gm) || []).length === 5);
  check('通用技能仍然 3 個', (h.match(/^  (magnet|recover|overload): \{/gm) || []).length === 3);
  check('shotForm 仍然 6 種（bolt + 5 形態）',
        ["'bolt'", "'laser'", "'rail'", "'boomerang'", "'missile'", "'wave'"]
          .every(f => h.indexOf(f) > 0));
  check('元素唔會改動形態卡定義（形態無關原則 #92）',
        /id:'form_laser'[\s\S]{0,120}shotForm = 'laser'/.test(h));
}

/* ================================================================
 * 15. 專精（基底元素滿 L3 → 該元素傷害 +40%）
 *     ⚠️ v0.27.0 修正：原本 elementMaster 淨係寫入唔讀 —— 死卡
 * ================================================================ */
console.log('\n=== 15. 專精 +40%（零死卡）===');
{
  const plain = { elementA: 'fire', elementALv: 3, elementB: null, elementMaster: false };
  check('未專精 → 倍率 1', elementMasterMul('fire', plain) === 1);

  const master = { elementA: 'fire', elementALv: 3, elementB: null, elementMaster: true };
  check('已專精 + 基底係火 → 倍率 1.4',
        Math.abs(elementMasterMul('fire', master) - 1.4) < 1e-9);
  check('已專精但查嘅係副元素 → 倍率 1（專精只適用基底）',
        elementMasterMul('ice', master) === 1);
  check('冇船 → 倍率 1', elementMasterMul('fire', null) === 1);

  /* ⚠️ 每個元素傷害出口都要行過 elementMasterMul —— 漏一個就係「卡面寫 +40% 但實際冇加」 */
  const exits = ['elementHitDamage', 'applyOneElement', 'lightBurst', 'killEnemy'];
  const missing = exits.filter(fn => extractFunction(fn).indexOf('elementMasterMul') < 0);
  check('4 個元素傷害出口全部接上專精倍率', missing.length === 0, missing.join(', '));

  /* 灼燒 DoT：專精火 → 傷害 ×1.4 */
  const AOE = makeFn('applyOneElement', AOE_DEPS, ELEM_CONST_NAMES);
  const noop = () => {};
  curShip = { elementA: 'fire', elementALv: 3, elementB: null, elementMaster: true };
  const burn = { x: 0, y: 0, hp: 10, kind: 'grunt', _dead: false };
  AOE('fire', 1, burn, { dmg: 2, pierceLeft: 0 }, [], noop, noop, noop, noop, noop, noop,
      noop, noop, noop, (id) => elementMasterMul(id, curShip));
  check('專精火：灼燒傷害 1 → 1.4', Math.abs(burn.burnDmg - 1.4) < 1e-9, '→ ' + burn.burnDmg);

  curShip = { elementA: 'fire', elementALv: 3, elementB: null, elementMaster: false };
  const burn2 = { x: 0, y: 0, hp: 10, kind: 'grunt', _dead: false };
  AOE('fire', 1, burn2, { dmg: 2, pierceLeft: 0 }, [], noop, noop, noop, noop, noop, noop,
      noop, noop, noop, (id) => elementMasterMul(id, curShip));
  check('未專精：灼燒傷害維持 1', burn2.burnDmg === 1, '→ ' + burn2.burnDmg);

  /* 卡面文字：專精卡唔可以寫錯等級（原本會顯示「LV4」） */
  check('卡面等級用 Math.min 夾上限（專精唔會顯示 LV4）',
        /e\.name \+ ' LV' \+ Math\.min\(c\.lv, ELEMENT_MAX_LV\)/.test(h));
  check('專精卡效果說明寫明 +40%', /基底元素傷害 \+40%/.test(h));
}

/* ---------- 總結 ---------- */
console.log('\n' + (fails === 0 ? '=== 全部通過 ===' : '=== ' + fails + ' 項失敗 ==='));
process.exit(fails === 0 ? 0 : 1);
