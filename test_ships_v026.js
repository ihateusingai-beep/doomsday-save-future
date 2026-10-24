/* v0.26.0 新機種 / 通用技能 / 新敵人 回歸測試
 *
 * 設計前提（PLAN #93–#99）：
 *   ① 戰機由 3 架加到 5 架（D 蜂鳥 = 伴飛型 · E 旋風 = 散射型）
 *   ② 新增「通用技能層」：揀完機再 3 選 1，跨機體通用、每局一次
 *   ③ 能力掣由 2 個變 3 個（左 = 機體技能 / 中 = 通用技能 / 右 = 炸彈）
 *   ④ 揀機畫面改 2 行 × 3 列網格
 *   ⑤ 新敵人 4 種（醫護 / 追蹤 / 自爆 / 護罩炮台），只喺 S3–S5 出現
 *
 * 測試方法：唔做 regex 結構檢查（regex 捉唔到「靜靜消失」嘅 bug），
 * 係真係把函數抽出嚟，喺 stub 環境入面實際執行，然後斷言行為。
 */
const fs = require('fs');
const h = fs.readFileSync(__dirname + '/index.html', 'utf8');

let fails = 0;
function check(label, ok, extra) {
  if (!ok) fails++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (extra ? '  ' + extra : ''));
}

/* ---------- 工具：平衡括號掃描器，抽 function 原文 ---------- */
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
  /* 抽 module 層嘅 object / array literal（支援 Object.freeze({...}) 同裸 {...} / [...]） */
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
/* 抽 module 層所有 const 嘅 { name: 原始表達式 }，支援逗號分隔嘅多個宣告
   （例：`const GRUNT_HP = 8, GRUNT_SCORE = 100;`）*/
function constTable() {
  /* 支援兩種寫法：
     ① `const NAME = value;`
     ② `const A = 1, B = 2;`（逗號分隔嘅多個宣告）
     ⚠️ ② 嘅名喺「= 之後」，所以唔可以淨係靠 head 切名 ——
        要睇 body 嘅每個 segment 有冇 `name = value` 嘅形狀。 */
  const out = {};
  const re = /const\s+([A-Za-z_$][\w$]*)\s*=\s*([^;]+);/g;
  const PAIR = /^\s*([A-Za-z_$][\w$]*)\s*=(?!=)\s*([\s\S]+)$/;
  let m;
  while ((m = re.exec(h)) !== null) {
    const decl = m[0];
    const eq = decl.indexOf('=');
    const firstName = decl.slice(6, eq).trim();
    const body = decl.slice(eq + 1, decl.length - 1);
    const parts = splitTopLevel(body);
    const pairs = parts.map(p => {
      const mm = PAIR.exec(p);
      return mm ? { name: mm[1], value: mm[2].trim() } : null;
    });
    const hasNamed = pairs.some(p => p !== null);
    if (!hasNamed) {
      out[firstName] = body.trim();
    } else {
      out[firstName] = parts[0].trim();
      pairs.forEach(p => { if (p) out[p.name] = p.value; });
    }
  }
  return out;
}
/* 喺括號 / 引號以外嘅逗號切分 */
function splitTopLevel(s) {
  const parts = [];
  let depth = 0, quote = '', cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      cur += c;
      if (c === quote && s[i - 1] !== '\\') quote = '';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; cur += c; continue; }
    if (c === '(' || c === '[' || c === '{') depth++;
    if (c === ')' || c === ']' || c === '}') depth--;
    if (c === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += c;
  }
  parts.push(cur);
  return parts;
}
const CT = constTable();
function cval(name) {
  if (!(name in CT)) throw new Error('搵唔到 const ' + name);
  return new Function('return (' + CT[name] + ');')();
}

/* ================= 1. 五架機定義完整 ================= */
console.log('=== 1. 五架機（#93）===');
{
  const src = extractBlock('SHIPS');
  const ids = [...src.matchAll(/id:'([A-E])'/g)].map(m => m[1]);
  check('五架機 A–E 齊全', ids.join('') === 'ABCDE', ids.join(','));
  check('每架機都有六軸（speed/shield/fireRate/bulletCount/bulletDmg/bulletSpd）',
    (src.match(/speed:/g) || []).length === 5 &&
    (src.match(/shield:/g) || []).length === 5 &&
    (src.match(/fireRate:/g) || []).length === 5 &&
    (src.match(/bulletCount:/g) || []).length === 5 &&
    (src.match(/bulletDmg:/g) || []).length === 5 &&
    (src.match(/bulletSpd:/g) || []).length === 5);
  check('每架機都有節奏 / 被動 / 技能 id / 技能名 / 技能圖示 / 冷卻',
    (src.match(/rhythm:'/g) || []).length === 5 &&
    (src.match(/perkName:'/g) || []).length === 5 &&
    (src.match(/skill:'/g) || []).length === 5 &&
    (src.match(/skillName:'/g) || []).length === 5 &&
    (src.match(/skillIcon:'icon_/g) || []).length === 5 &&
    (src.match(/skillCD:/g) || []).length === 5);
  check('機名：游隼 / 堡壘 / 熔爐 / 蜂鳥 / 旋風',
    /name:'游隼'/.test(src) && /name:'堡壘'/.test(src) && /name:'熔爐'/.test(src) &&
    /name:'蜂鳥'/.test(src) && /name:'旋風'/.test(src));
  check('D = 召回 / E = 收束',
    /skill:'recall'/.test(src) && /skill:'converge'/.test(src));
  /* 強化池維持 26 張、零新卡（#99） */
  const ups = extractBlock('UPGRADES');
  check('強化池仍然 26 張（零新卡）',
    (ups.match(/id:'/g) || []).length === 26, '→ ' + (ups.match(/id:'/g) || []).length);
  check('強化池冇混入通用技能（通用技能唔經 UPGRADES 池）',
    !/magnet|recover|overload/.test(ups));
}

/* ================= 2. D 機衛星（伴飛型） ================= */
console.log('\n=== 2. D 機衛星跟機 + 自動開火 ===');
{
  const SAT = {
    SAT_COUNT: cval('SAT_COUNT'),
    SAT_ORBIT_R: cval('SAT_ORBIT_R'),
    SAT_ORBIT_RY: cval('SAT_ORBIT_RY'),
    SAT_ORBIT_SPD: cval('SAT_ORBIT_SPD'),
    SAT_FOLLOW_K: cval('SAT_FOLLOW_K'),
    SAT_FIRE_MS: cval('SAT_FIRE_MS'),
    SAT_SPD_MUL: cval('SAT_SPD_MUL'),
  };
  const pushed = [];
  let nowMs = 0;
  const ship = {
    chassis: 'D', x: 160, y: 400, bulletSpd: 0.40,
    _sats: [{ x: 160, y: 400, fireCD: 99999 }, { x: 160, y: 400, fireCD: 99999 }],
    _satAngle: 0, _satRecallUntil: 0,
  };
  const src = extractFunction('tickSatellites');
  const fn = new Function(...Object.keys(SAT), 'ship', 'performance', 'pushPlayerBullet',
    src + '\nreturn tickSatellites;');
  const tick = fn(...Object.values(SAT), ship,
    { now: () => nowMs }, (b) => pushed.push(b));

  /* 跟機：位置會向目標移動（唔係瞬移） */
  ship._sats[0].x = 100;
  ship._sats[0].y = 300;
  tick(16);
  check('衛星向目標移動（有限速插值，唔係瞬移）',
    ship._sats[0].x !== 100 && ship._sats[0].y !== 300,
    '→ ' + ship._sats[0].x.toFixed(1) + ',' + ship._sats[0].y.toFixed(1));

  /* 未夠 1.1 秒唔會開火 */
  tick(16);
  check('未夠開火間隔唔會射', pushed.length === 0, '→ ' + pushed.length);

  /* 過咗 1.1 秒 → 兩粒衛星各射一發 */
  nowMs = 2000;
  ship._sats[0].fireCD = 0;
  ship._sats[1].fireCD = 0;
  tick(16);
  check('兩粒衛星都自動開火', pushed.length === 2, '→ ' + pushed.length);
  check('衛星彈帶 satId（俾「衛星齊射」分辨邊粒）',
    pushed.length === 2 && pushed[0].satId === 0 && pushed[1].satId === 1);
  check('衛星彈係普通彈（bolt），唔跟形態卡',
    pushed.length === 2 && pushed[0].form === 'bolt' && pushed[1].form === 'bolt');
  check('衛星彈向上飛', pushed.length === 2 && pushed[0].vy < 0 && pushed[0].vx === 0);
  check('衛星彈速 = 機身彈速 × 1.25',
    pushed.length === 2 && Math.abs(pushed[0].vy - (-0.40 * cval('SAT_SPD_MUL'))) < 1e-9,
    '→ ' + pushed[0].vy.toFixed(4));

  /* 召回：衛星收埋入艙 + 射速 ×2 */
  const pushed2 = [];
  nowMs = 5000;
  ship._satRecallUntil = 9000;         /* 召回中 */
  ship._sats[0].fireCD = 0;
  ship._sats[1].fireCD = 0;
  const tick2 = fn(...Object.values(SAT), ship,
    { now: () => nowMs }, (b) => pushed2.push(b));
  tick2(16);
  check('召回期間衛星都會開火（齊射模式）', pushed2.length === 2, '→ ' + pushed2.length);
  check('召回期間衛星射速 ×2（fireCD 一半）',
    Math.abs(ship._sats[0].fireCD - cval('SAT_FIRE_MS') / 2) < 1e-6,
    '→ ' + ship._sats[0].fireCD.toFixed(1));
  /* 收埋入艙係插值（唔係瞬移），所以要行夠多幀先會埋到機身 */
  for (let i = 0; i < 90; i++) tick2(16);
  check('召回期間衛星收埋喺機身',
    Math.abs(ship._sats[0].x - ship.x) < 1.5 && Math.abs(ship._sats[0].y - ship.y) < 1.5,
    '→ ' + ship._sats[0].x.toFixed(2) + ',' + ship._sats[0].y.toFixed(2));

  /* 唔係 D 機就完全唔郁 */
  const s2 = { chassis: 'A', x: 160, y: 400, _sats: [{ x: 0, y: 0, fireCD: 0 }], _satAngle: 0 };
  const pushed3 = [];
  const tick3 = fn(...Object.values(SAT), s2, { now: () => 0 }, (b) => pushed3.push(b));
  tick3(16);
  check('唔係 D 機就冇衛星（唔會誤觸）', pushed3.length === 0 && s2._sats[0].x === 0);
}

/* ================= 3. E 機散射 + 收束 ================= */
console.log('\n=== 3. E 機散射扇形 + 收束 ===');
{
  const SPREAD_ANGLE = cval('SPREAD_ANGLE');
  function runShot(shipObj, nowMs) {
    const pushed = [];
    const stubs = {
      ship: shipObj,
      performance: { now: () => nowMs || 0 },
      waveShotCount: 0,
      lootBulletDmg: () => 0,
      countPlayerBullets: () => 0,
      pushPlayerBullet: (b) => pushed.push(b),
      sfx: () => {},
      clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
      fireLaser: () => {},
      MISSILE_CAP: 8,
      gameClockMs: 1234,
      SALVO_EVERY: cval('SALVO_EVERY'),
      SALVO_N: cval('SALVO_N'),
      SALVO_ANGLE: cval('SALVO_ANGLE'),
      HEAVY_KNOCK: cval('HEAVY_KNOCK'),
      SPREAD_N: cval('SPREAD_N'),
      SPREAD_ANGLE: SPREAD_ANGLE,
      CONVERGE_DMG: cval('CONVERGE_DMG'),
      CONVERGE_SPD: cval('CONVERGE_SPD'),
      isConvergeActive: () => !!(shipObj.chassis === 'E' && shipObj._convergeUntil &&
                                nowMs < shipObj._convergeUntil),
    };
    const src = extractFunction('spawnPlayerShot');
    const fn = new Function(...Object.keys(stubs), src + '\nreturn spawnPlayerShot();');
    fn(...Object.values(stubs));
    return pushed;
  }
  const base = {
    chassis: 'E', x: 160, y: 400, bulletCount: 1, bulletDmg: 1, bulletSpd: 0.28,
    fireRate: 8, bombCD: 12000, pierce: 0, shotForm: 'bolt', shotTags: {},
    skillId: 'converge', skillCdBase: 9000, skillCdMul: 1,
    _burstCount: 0, _burstReady: false, _bulSpdMul: 1, _bulSpdMulUntil: 0,
    _convergeUntil: 0,
  };
  const o = runShot(Object.assign({}, base));
  check('E 機每一發都係 3 粒散射', o.length === 3, '→ ' + o.length);
  const angs = o.map(b => Math.atan2(b.vy, b.vx));
  check('中央彈正前（-90°）', Math.abs(angs[1] + Math.PI / 2) < 1e-9);
  check('左右彈各 ±14°',
    Math.abs((angs[0] - angs[1]) + SPREAD_ANGLE) < 1e-9 &&
    Math.abs((angs[2] - angs[1]) - SPREAD_ANGLE) < 1e-9,
    '→ ' + ((angs[0] - angs[1]) * 180 / Math.PI).toFixed(1) + '° / ' +
       ((angs[2] - angs[1]) * 180 / Math.PI).toFixed(1) + '°');
  check('E 機彈有 _groupHits（俾群傷被動用）',
    o.length === 3 && Array.isArray(o[0]._groupHits) && o[0]._groupHits.length === 0);

  /* 「多彈」強化卡喺 E 機仍然有效（唔會變死卡） */
  const o5 = runShot(Object.assign({}, base, { bulletCount: 5 }));
  check('多彈強化令 E 機散射變 5 粒', o5.length === 5, '→ ' + o5.length);

  /* 收束：4 秒內收成單中線，傷害 ×3、彈速 ×1.6 */
  const oc = runShot(Object.assign({}, base, { _convergeUntil: 5000 }), 1000);
  check('收束期間只剩 1 粒（中線）', oc.length === 1, '→ ' + oc.length);
  check('收束期間傷害 ×3', Math.abs(oc[0].dmg - 3) < 1e-9, '→ ' + oc[0].dmg);
  check('收束期間彈速 ×1.6',
    Math.abs(Math.abs(oc[0].vy) - 0.28 * cval('CONVERGE_SPD')) < 1e-9,
    '→ ' + Math.abs(oc[0].vy).toFixed(4));
  check('收束過期後回復散射',
    runShot(Object.assign({}, base, { _convergeUntil: 500 }), 1000).length === 3);
}

/* ================= 4. 三個被動 / 護盾真係有效果 ================= */
console.log('\n=== 4. 群傷 / 衛星齊射 / 炮台護盾（行為測試）===');
{
  /* --- E 機群傷 --- */
  const gSrc = extractFunction('applyGroupBonus');
  const gFn = new Function('GROUP_BONUS', 'spawnSparks', gSrc + '\nreturn applyGroupBonus;');
  const gBonus = gFn(cval('GROUP_BONUS'), () => {});
  const b = { _groupHits: [] };
  const e1 = { hp: 10, maxHp: 10, x: 0, y: 0 };
  gBonus(b, e1);
  check('第一隻命中：冇額外傷害', e1.hp === 10, '→ hp=' + e1.hp);
  const e2 = { hp: 10, maxHp: 10, x: 0, y: 0 };
  gBonus(b, e2);
  check('第二隻命中：額外 +1 傷', e2.hp === 9, '→ hp=' + e2.hp);
  check('第二隻命中：回溯補第一隻 +1', e1.hp === 9, '→ hp=' + e1.hp);
  const e3 = { hp: 10, maxHp: 10, x: 0, y: 0 };
  gBonus(b, e3);
  check('第三隻命中：之後嗰隻再 +1', e1.hp === 8 && e2.hp === 8, '→ ' + e1.hp + '/' + e2.hp);
  /* 唔會造成幽靈敵人（hp 跌到 0 但冇死亡分支） */
  const b2 = { _groupHits: [] };
  const tiny = { hp: 1, maxHp: 1, x: 0, y: 0 };
  gBonus(b2, tiny);
  const tiny2 = { hp: 5, maxHp: 5, x: 0, y: 0 };
  gBonus(b2, tiny2);
  check('回溯補傷害唔會令對方 hp ≤ 0（零幽靈敵人）', tiny.hp === 1, '→ hp=' + tiny.hp);
  /* 唔係 E 機嘅彈（_groupHits 係 null）唔會觸發 */
  const nb = { _groupHits: null };
  const ne = { hp: 10, maxHp: 10, x: 0, y: 0 };
  gBonus(nb, ne);
  check('非 E 機子彈唔會觸發群傷', ne.hp === 10, '→ hp=' + ne.hp);

  /* --- D 機衛星齊射 --- */
  const sSrc = extractFunction('applySatelliteBonus');
  /* gameClockMs 係 module 層 let（遊戲時間），要用 setter 推進時間 */
  const sMod = new Function('SAT_SPAN_MS', 'spawnSparks',
    'let gameClockMs = 0;' +
    'const setClock = (v) => { gameClockMs = v; };' +
    sSrc +
    '\nreturn { bonus: applySatelliteBonus, setClock };');
  const S = sMod(cval('SAT_SPAN_MS'), () => {});
  S.setClock(1000);
  const tgt = { hp: 10, maxHp: 10, x: 0, y: 0 };
  S.bonus({ satId: 0 }, tgt);
  check('第一粒衛星命中：冇額外傷害', tgt.hp === 10, '→ hp=' + tgt.hp);
  S.bonus({ satId: 1 }, tgt);
  check('第二粒衛星喺時間窗內命中：額外 +1', tgt.hp === 9, '→ hp=' + tgt.hp);
  /* 超出時間窗：遊戲時間推過 SAT_SPAN_MS */
  const tgt2 = { hp: 10, maxHp: 10, x: 0, y: 0 };
  S.setClock(1000);
  S.bonus({ satId: 0 }, tgt2);
  S.setClock(1000 + cval('SAT_SPAN_MS') + 100);   /* 超出時間窗 */
  S.bonus({ satId: 1 }, tgt2);
  check('超出時間窗：唔會加成', tgt2.hp === 10, '→ hp=' + tgt2.hp);
  const tgt3 = { hp: 10, maxHp: 10, x: 0, y: 0 };
  S.bonus({ satId: 0 }, tgt3);
  S.bonus({ satId: 0 }, tgt3);
  check('同一粒衛星重複命中唔會加成', tgt3.hp === 10, '→ hp=' + tgt3.hp);
  const plain = { hp: 10, maxHp: 10, x: 0, y: 0 };
  S.bonus({}, plain);
  check('普通子彈唔會觸發衛星齊射', plain.hp === 10);

  /* --- 炮台護盾 ---
     v0.27.0：applyTurretShield 改用 elementHitDamage()（光 L2 破盾 ×2），
     所以 stub 環境要提供呢個依賴。 */
  const tSrc = extractFunction('applyTurretShield');
  const tFn = new Function('spawnSparks', 'sfx', 'elementHitDamage',
    tSrc + '\nreturn applyTurretShield;');
  const tShield = tFn(() => {}, () => {}, (b) => (b && b.dmg) || 1);
  const turret = { turret: true, turretShield: 5, hp: 30, maxHp: 30, x: 0, y: 0 };
  const absorbed = tShield({ dmg: 2 }, turret);
  check('炮台護盾食傷害（回傳 true = 彈唔入肉）', absorbed === true);
  check('護盾值減 2', turret.turretShield === 3, '→ ' + turret.turretShield);
  const t2 = { turret: true, turretShield: 1, hp: 30, maxHp: 30, x: 0, y: 0 };
  tShield({ dmg: 5 }, t2);
  check('護盾打穿後歸零（唔會變負數）', t2.turretShield === 0, '→ ' + t2.turretShield);
  const t3 = { turret: true, turretShield: 0, hp: 30, maxHp: 30, x: 0, y: 0 };
  check('護盾冇咗之後唔再攔截', tShield({ dmg: 1 }, t3) === false);
  const notTurret = { turretShield: 9, hp: 10, maxHp: 10, x: 0, y: 0 };
  check('唔係炮台唔會攔截', tShield({ dmg: 1 }, notTurret) === false);
}

/* ================= 5. 通用技能層 ================= */
console.log('\n=== 5. 通用技能層（#94）===');
{
  const src = extractBlock('UNIVERSAL_SKILLS');
  check('3 個通用技能', (src.match(/id:'(magnet|recover|overload)'/g) || []).length === 3,
    '→ ' + (src.match(/id:'/g) || []).length);
  check('每個都有名 / 角色 / 圖示 / 冷卻 / 持續時間 / 說明',
    (src.match(/name:'/g) || []).length === 3 &&
    (src.match(/role:'/g) || []).length === 3 &&
    (src.match(/icon:'icon_/g) || []).length === 3 &&
    (src.match(/cd:/g) || []).length === 3 &&
    (src.match(/dur:/g) || []).length === 3 &&
    (src.match(/desc:'/g) || []).length === 3);
  check('三個冷卻唔同（12 / 10 / 15 秒）',
    /cd:12000/.test(src) && /cd:10000/.test(src) && /cd:15000/.test(src));
  check('每個說明都係一句話講得清（≤ 14 字，冇 em dash）',
    [...src.matchAll(/desc:'([^']*)'/g)].every(m => m[1].length <= 14 && !m[1].includes('—')),
    [...src.matchAll(/desc:'([^']*)'/g)].map(m => m[1]).join(' | '));

  /* 通用技能唔經 UPGRADES 池 */
  check('通用技能唔喺 UPGRADES 池（強化池維持 26 張）',
    !/magnet|recover|overload/.test(extractBlock('UPGRADES')));

  /* 磁力場：範圍內敵彈被吸住 */
  const mSrc = extractFunction('magnetSlowFactor');
  let active = false;
  const mFn = new Function('MAGNET_RADIUS', 'MAGNET_SLOW', 'isUniversalActive', 'ship',
    mSrc + '\nreturn magnetSlowFactor;');
  const ship = { x: 160, y: 400, universalId: 'magnet' };
  const mSlow = mFn(cval('MAGNET_RADIUS'), cval('MAGNET_SLOW'), () => active, ship);
  check('磁力場未開：速度係數 = 1', mSlow({ x: 160, y: 380 }) === 1);
  active = true;
  check('磁力場開咗 + 彈喺範圍內：速度大幅下降',
    mSlow({ x: 160, y: 380 }) === cval('MAGNET_SLOW'), '→ ' + mSlow({ x: 160, y: 380 }));
  check('磁力場開咗但彈喺範圍外：唔受影響',
    mSlow({ x: 20, y: 20 }) === 1);
  ship.universalId = 'recover';
  check('唔係磁力場就唔生效', mSlow({ x: 160, y: 380 }) === 1);

  /* tryUniversal：冷卻 + 效果窗口 */
  const tuSrc = extractFunction('tryUniversal');
  let cdUntil = 0, actUntil = 0, ts = 0, tsu = 0;
  const tuFn = new Function('isStage', 'fsm', 'ship', 'UNIVERSAL_SKILLS',
    'universalCdUntil', 'universalActiveUntil', 'skillTimeScale', 'skillTimeScaleUntil',
    'performance', 'sfx',
    tuSrc + '\nreturn { tryUniversal, getCd: () => universalCdUntil,' +
    ' getAct: () => universalActiveUntil, setAct: (v) => { universalActiveUntil = v; } };');
  const tu = tuFn(() => true, { cur: 'STAGE_1' }, ship, null, 0, 0, 1, 0,
    { now: () => ts }, () => {});
  /* UNIVERSAL_SKILLS 要真實資料 */
  const uSkills = new Function('return (' + extractBlock('UNIVERSAL_SKILLS') + ');')();
  const tu2 = tuFn(() => true, { cur: 'STAGE_1' }, ship, uSkills, 0, 0, 1, 0,
    { now: () => ts }, () => {});
  ship.universalId = 'magnet';
  const okMag = tu2.tryUniversal();
  check('按掣可以施放通用技能', okMag === true);
  check('施放後進入冷卻（12 秒）', tu2.getCd() === 12000, '→ ' + tu2.getCd());
  check('施放後有效果窗口（6 秒）', tu2.getAct() > 0, '→ ' + tu2.getAct());
  const before = tu2.getCd();
  check('冷卻中再撳唔會再施放', tu2.tryUniversal() === false && tu2.getCd() === before);
  /* 冇通用技能（未揀）→ 唔會 throw */
  ship.universalId = null;
  check('未揀通用技能時施放唔會 throw（回傳 false）', tu2.tryUniversal() === false);
}

/* ================= 6. 三個能力掣 + 揀機網格 ================= */
console.log('\n=== 6. 版面：三掣位 + 2×3 揀機網格 ===');
{
  const abSrc = extractFunction('abilityBtns');
  const shipsBlk = new Function('return (' + extractBlock('SHIPS') + ');')();
  const uBlk = new Function('return (' + extractBlock('UNIVERSAL_SKILLS') + ');')();
  const ship = { chassis: 'A', universalId: 'magnet' };
  const abFn = new Function('ship', 'SHIPS', 'UNIVERSAL_SKILLS', 'VIEW_W', 'VIEW_H',
    abSrc + '\nreturn abilityBtns;');
  const ab = abFn(ship, shipsBlk, uBlk, 320, 480)();
  check('三個掣：機體技能 / 通用技能 / 炸彈',
    !!ab.focus && !!ab.universal && !!ab.bomb);
  check('每個掣 64×64（觸控目標 ≥64×64）',
    ab.focus.w === 64 && ab.focus.h === 64 &&
    ab.universal.w === 64 && ab.universal.h === 64 &&
    ab.bomb.w === 64 && ab.bomb.h === 64);
  check('三掣 x = 8 / 128 / 248（完美對稱）',
    ab.focus.x === 8 && ab.universal.x === 128 && ab.bomb.x === 248,
    '→ ' + ab.focus.x + '/' + ab.universal.x + '/' + ab.bomb.x);
  check('三掣 y 相同', ab.focus.y === ab.universal.y && ab.universal.y === ab.bomb.y);
  check('三掣唔會互相重疊',
    ab.focus.x + ab.focus.w <= ab.universal.x &&
    ab.universal.x + ab.universal.w <= ab.bomb.x);
  check('通用技能掣顯示揀咗嘅技能名', ab.universal.label === '磁力場', '→ ' + ab.universal.label);

  /* 揀機網格：2 行 × 3 列 */
  const clSrc = extractFunction('shipCardsLayout');
  const clFn = new Function('VIEW_W', clSrc + '\nreturn shipCardsLayout;');
  const L = clFn(320)();
  check('卡 96×96', L.w === 96 && L.h === 96);
  check('3 列', L.cols === 3);
  const r0 = L.rect(0), r2 = L.rect(2), r3 = L.rect(3), r4 = L.rect(4);
  check('第 1 行同第 2 行 y 唔同', r0.y !== r3.y, '→ ' + r0.y + '/' + r3.y);
  check('第 3 張同第 4 張換行（2×3 網格）', r2.x !== r3.x);
  check('第 5 張仍然存在', !!L.rect(4) && L.rect(4).w === 96);
  check('卡唔會超出畫面', L.rect(4).x >= 0 && L.rect(2).x + 96 <= 320);

  /* hitShipCard：逐格對應 A–E */
  const hsSrc = extractFunction('hitShipCard');
  const idsSrc = h.match(/const SHIP_IDS = Object\.freeze\(\[([^\]]*)\]\);/)[1];
  const hsFn = new Function('shipCardsLayout', 'SHIP_IDS', 'VIEW_W',
    hsSrc + '\nreturn hitShipCard;');
  /* hitShipCard 內部係呼叫 shipCardsLayout()，所以要傳一個「函數」而唔係值 */
  const hit = hsFn(() => L, idsSrc.split(',').map(s => s.trim().replace(/'/g, '')), 320);
  const order = ['A', 'B', 'C', 'D', 'E'];
  let gridOk = true;
  for (let i = 0; i < 5; i++) {
    const r = L.rect(i);
    const got = hit(r.x + r.w / 2, r.y + r.h / 2);
    if (got !== order[i]) { gridOk = false; console.log('    格 ' + i + ' → ' + got); }
  }
  check('網格逐格對應 A→E', gridOk);
  /* 第 6 格（第二行第三欄）係空位，唔可以回傳機體 */
  const empty = L.rect(5);
  check('第 6 格係空位（唔會回傳機體 id）',
    hit(empty.x + empty.w / 2, empty.y + empty.h / 2) === null,
    '→ ' + hit(empty.x + empty.w / 2, empty.y + empty.h / 2));
}

/* ================= 7. 新敵人 4 種 ================= */
console.log('\n=== 7. 新敵人（#97）===');
{
  const src = extractFunction('spawnGruntFormation');
  check('4 種新敵人都有旗標', /const medic = type === 'medic'/.test(src) &&
    /const chaser = type === 'chaser'/.test(src) &&
    /const bomber = type === 'bomber'/.test(src) &&
    /const turret = type === 'turret'/.test(src));
  check('4 種新敵人都有生命 / 分數常數',
    cval('MEDIC_HP') > 0 && cval('CHASER_HP') > 0 &&
    cval('BOMBER_HP') > 0 && cval('TURRET_HP') > 0);
  check('炮台血厚（30）＋ 有護盾值', cval('TURRET_HP') === 30 && cval('TURRET_SHIELD') === 14);
  check('醫護唔攻擊（fireCD 唔會射）', /medic \? 999999/.test(src));
  check('炮台有獨立射擊冷卻', /turret \? 2400/.test(src));
  check('醫護治療間隔 / 範圍 / 治療量',
    cval('MEDIC_HEAL_MS') === 2500 && cval('MEDIC_HEAL_R') === 72 && cval('MEDIC_HEAL_AMT') === 2);
  check('追蹤型有轉向速率上限（唔會瞬移追）',
    cval('CHASER_TURN') > 0 && cval('CHASER_TURN') < 0.2);
  check('自爆型有觸發距離 + 環形彈數量',
    cval('BOMBER_TRIGGER_R') === 24 && cval('BOMBER_RING_N') === 10);
  check('4 種新敵人有專屬 sprite（唔重色舊 sprite）',
    /spr = 'medic'/.test(h) && /spr = 'chaser'/.test(h) &&
    /spr = 'bomber'/.test(h) && /spr = 'turret'/.test(h));
  check('4 種新敵人都有程序特徵（畫得明）',
    /if \(e\.medic\)/.test(h) && /if \(e\.chaser && ship\)/.test(h) &&
    /if \(e\.bomber && ship\)/.test(h) && /if \(e\.turret && e\.turretShield > 0\)/.test(h));
  check('自爆型會爆環形彈並消失',
    /BOMBER_RING_N/.test(h) && /e\._dead = true;/.test(h));

  /* 波次：4 種新敵人只喺 S3–S5 出現 */
  const chunks = new Function('return (' + extractBlock('WAVE_CHUNKS') + ');')();
  const rand = new Function('return (' + extractBlock('STAGE_RAND') + ');')();
  const NEW = ['medic', 'chaser', 'bomber', 'turret'];
  check('WAVE_CHUNKS 有新敵人 chunk',
    Object.keys(chunks).some(k => chunks[k].spawn.some(s => NEW.includes(s.type))));
  check('S1 / S2 pool 完全冇新敵人', (() => {
    for (const s of [1, 2]) {
      const ids = rand[s].pool || rand[s].slots.flat();
      for (const id of ids) {
        for (const sp of chunks[id].spawn) if (NEW.includes(sp.type)) return false;
      }
    }
    return true;
  })());
  check('S3 / S4 / S5 pool 有新敵人', [3, 4, 5].every(s => {
    const ids = rand[s].pool || rand[s].slots.flat();
    for (const id of ids) {
      for (const sp of chunks[id].spawn) if (NEW.includes(sp.type)) return true;
    }
    return false;
  }));
  check('所有 pool 引用嘅 chunk 都存在',
    [1, 2, 3, 4, 5].every(s => (rand[s].pool || rand[s].slots.flat())
      .every(id => !!chunks[id])));
}

/* ================= 8. 零死代碼 ================= */
console.log('\n=== 8. 零死代碼：新欄位全部有 game logic 讀 ===');
{
  const FIELDS = ['universalId', '_sats', '_satAngle', '_satRecallUntil', '_recoverUntil',
                  '_convergeUntil', 'satId', '_groupHits', 'turretShield', 'healCD',
                  'healFlash', 'universalCdUntil', 'universalActiveUntil'];
  const dead = FIELDS.filter(f => {
    const uses = (h.match(new RegExp('\\b' + f + '\\b', 'g')) || []).length;
    return uses < 2;
  });
  check('13 個新欄位全部有讀（定義 + 至少 1 次讀）', dead.length === 0, dead.join(','));
  /* 强化卡 / 装備語意冇被今次改動搞壞 */
  check('強化卡 focus_d 仍然係「專屬技能冷卻」', /id:'focus_d'/.test(h) &&
    /skillCdMul = Math\.max\(0\.4/.test(h));
  check('裝備 eco 仍然係 skillCdDelta', /skillCdDelta:-2000/.test(h));
  /* 通用技能層唔會令舊機制失效 */
  check('炸彈仍然係全機共用（唔喺 SHIPS）', !/bombCD/.test(extractBlock('SHIPS')));
  check('A/B/C 機制冇被今次改動影響',
    /ship\.chassis === 'A' \? 2 : 1/.test(h) &&
    /isOverheatActive\(\) \? 2 : 1/.test(h) &&
    /isOverheatActive\(\) \? 0\.6 : 1/.test(h));
}

/* ================= 9. 可讀性 / 版號 ================= */
console.log('\n=== 9. 可讀性 + 版號 ===');
{
  check('揀機畫面有 5 張卡（labels 有 A–E）',
    /id:'A', col:'#0ff'/.test(h) && /id:'E', col:'#f8a'/.test(h));
  check('通用技能畫面顯示名 / 角色 / 說明 / 冷卻',
    /ctx\.fillText\(u\.name/.test(h) && /ctx\.fillText\(u\.role/.test(h) &&
    /wrapText\(ctx, u\.desc/.test(h) && /冷卻 /.test(h));
  check('通用技能 icon 用圖集 sprite（零 emoji）', /drawIcon\(u\.icon/.test(h));
  check('三掣都顯示 icon + 名', /name: u \? u\.name : '通用'/.test(h) &&
    /name: c \? c\.skillName : '技能'/.test(h) && /name: '炸彈'/.test(h));
  check('冇 emoji 做 icon', !/icon:\s*'[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(h));
  check('玩家可見文字冇 em dash',
    ![...h.matchAll(/fillText\('([^']*)'/g)].some(m => m[1].includes('—')));
  const title = h.match(/末日救未來 (v[\d.]+) 已載入/);
  check('啟動日誌有版號', !!title, '→ ' + (title && title[1]));
  const num = title ? title[1].replace('v', '').split('.').map(Number) : [0, 0, 0];
  check('版號 >= v0.26.0', num[0] > 0 || num[1] > 26 || (num[1] === 26 && num[2] >= 0),
    '→ ' + (title && title[1]));
  const titleVer = h.match(/fillText\('(v[\d.]+) · /);
  check('標題畫面版號一致', !!titleVer && titleVer[1] === title[1],
    '→ ' + (titleVer && titleVer[1]));
}

console.log(fails === 0 ? '\n✅ 全部通過' : '\n❌ ' + fails + ' 項失敗');
process.exit(fails === 0 ? 0 : 1);
