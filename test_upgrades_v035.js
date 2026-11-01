/* v0.35.0 #137：強化池守門升級 —— Tier 1 state 層 + Tier 2 行為層（情境矩陣）
 *
 * ⚠️ 為咗要點解有呢個檔（PLAN #137）：
 *   舊驗收標準「每個 mod() 寫入欄位都有 game logic 讀」喺 v0.34.0 實測**唔夠用** ——
 *   26/26 張卡全部通過，但其中 6 張喺特定情境下對玩家完全零效果
 *   （gun_2 / gun_3 / tag_rico / tag_home / tag_split / tag_slow）。
 *   ⇒ 守門要升級做 Tier 1（state）+ Tier 2（行為 × 情境矩陣）：
 *     {傳說級, 換機體, 同時持有, 形態覆蓋, 目標不存在}
 *   ⚠️ 每個情境要有對照組（傳說級零效果要同「乘法卡傳說級正常」比）。
 *
 * ⚠️ 注入方式（PLAN v0.27.1 教訓）：用 `eval` 返真函數 / 真資料表到本檔 scope，
 *    自由變數自然解析到、own arity 保持原樣 —— 唔用 `makeFn` wrapper、唔用 `new Function`
 *    綁 own args（會撞位）。只有「純 stub 依賴、冇 own args」嘅情況先用 new Function。
 *
 * 本檔全部行 index.html 真實路徑（真 UPGRADES 表 + 真 spawnPlayerShot），唔重寫 production 邏輯。
 */
const fs = require('fs');
const h = fs.readFileSync(__dirname + '/index.html', 'utf8');

let fails = 0;
function check(label, ok, extra) {
  if (!ok) fails++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (extra ? '  ' + extra : ''));
}

/* ---------- 抽出真代碼 ---------- */
function extractFunction(name) {
  const marker = 'function ' + name + '(';
  const start = h.indexOf(marker);
  if (start < 0) throw new Error('搵唔到 function ' + name);
  const bodyStart = h.indexOf('{', start + marker.length);
  let depth = 0;
  for (let i = bodyStart; i < h.length; i++) {
    if (h[i] === '{') depth++;
    else if (h[i] === '}') { depth--; if (depth === 0) return h.slice(start, i + 1); }
  }
  throw new Error('function ' + name + ' 括號唔啱');
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
    if (quote) { if (c === quote && h[j - 1] !== '\\') quote = ''; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) return h.slice(i, j + 1); }
  }
  throw new Error('block 唔平衡: ' + name);
}
function cval(name) {
  const m = h.match(new RegExp('const ' + name + '\\s*=\\s*([^;]+);'));
  if (!m) throw new Error('抽唔到 const ' + name);
  return new Function('return (' + m[1] + ');')();
}

/* ---- 真資料表（eval → 保持 arrow function 嘅 arity） ---- */
const UPGRADES = eval('(' + extractBlock('UPGRADES') + ')');
const SHIPS = eval('(' + extractBlock('SHIPS') + ')');

/* ---------- 真 spawnPlayerShot 嘅 stub 環境（純依賴、冇 own args） ---------- */
function runShot(shipObj) {
  const pushed = [];
  const stubs = {
    ship: shipObj,
    performance: { now: () => 0 },
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
    MAX_BULLETS: cval('MAX_BULLETS'),
    RICOCHET_MAX_VX: cval('RICOCHET_MAX_VX'),
    SPREAD_ANGLE: cval('SPREAD_ANGLE'),
    VIEW_W: cval('VIEW_W'),
    VIEW_H: cval('VIEW_H'),
    CONVERGE_DMG: cval('CONVERGE_DMG'),
    CONVERGE_SPD: cval('CONVERGE_SPD'),
    isConvergeActive: () => false,
  };
  const src = extractFunction('spawnPlayerShot');
  const fn = new Function(...Object.keys(stubs), src + '\nreturn spawnPlayerShot();');
  fn(...Object.values(stubs));
  return pushed;
}
/* 乾淨機體狀態（自然彈數 = 機體 base；E 機自然彈數 = SPREAD_N，由真代碼分支決定） */
function mkShip(ch) {
  return Object.assign({}, SHIPS[ch], {
    chassis: ch,
    x: 160, y: 400, hp: 4, maxHp: 4, shield: 0, fireRate: 10, bulletDmg: 1,
    bulletBonus: 0,
    shotForm: 'bolt', shotTags: { homing: 0, split: 0, slow: 0, ricochet: 0 },
    _burstCount: 0, _burstReady: false, _holdMs: 0, _ramp: 0,
    _lastFireGameMs: 0, _lastShotAt: 0,
    _bulSpdMulUntil: 0, _overheatUntil: 0, _bulwarkUntil: 0,
    _groupHits: null, pierce: 0, formDmgMul: 1,
  });
}
/* 套用真 mod（n = 疊加級數） */
function applyMods(ship, list) {
  for (const [id, n] of list) {
    const u = UPGRADES.find(x => x.id === id);
    if (!u) throw new Error('搵唔到卡 ' + id);
    u.mod(ship, n);
  }
  return ship;
}
function baseShipState() {
  return {
    maxHp: 4, shield: 1, speed: 3.4, fireRate: 10, bulletCount: 1, bulletBonus: 0,
    bulletDmg: 1, bulletSpd: 0.40, bombCD: 12000, skillCdMul: 1, pierce: 0,
    grazeMult: 1, resurrect: 0, masterStacks: 0, shotForm: 'bolt',
    shotTags: { homing: 0, split: 0, slow: 0, ricochet: 0 },
  };
}
const CHARS = ['A', 'B', 'C', 'D', 'E'];

/* ============================================================
 * 1. Tier 1（state 層）：26 張卡每張都要改到 ship 嘅某個欄位
 * ============================================================ */
console.log('=== 1. Tier 1 state 層：26 張卡都要有 state 變化 ===');
{
  const before = baseShipState();
  const noChange = [];
  for (const u of UPGRADES) {
    const s = baseShipState();
    u.mod(s, 1);
    if (JSON.stringify(s) === JSON.stringify(before)) noChange.push(u.id);
  }
  check('26 張卡全部改到 ship 狀態（Tier 1 零死卡）', noChange.length === 0, noChange.join(','));
  check('強化池仍然 26 張（零新卡 / 零刪卡）', UPGRADES.length === 26, '= ' + UPGRADES.length);
}

/* ============================================================
 * 2. Tier 2（行為層 · 傳說級）：入咗逆轉候選池嘅卡，傳說級必須有實際變化
 * ============================================================ */
console.log('\n=== 2. Tier 2 傳說級：入咗候選池嘅卡升級後必須有實際變化 ===');
{
  /* v0.35.0 #133 嘅排除清單（傳說級候選池） */
  const deadLegendary = (u) => u.id.indexOf('form_') === 0 || u.id === 'gun_2' || u.id === 'gun_3';
  const candidates = UPGRADES.filter(u => !deadLegendary(u));

  /* ① state 層：候選池內每張卡「再多行一次 mod」都要有差異 */
  const zeroEffect = [];
  for (const u of candidates) {
    const once = baseShipState(); u.mod(once, 1);
    const twice = baseShipState(); u.mod(twice, 1); u.mod(twice, 1);   /* 傳說級 = 再行一次 mod */
    if (JSON.stringify(once) === JSON.stringify(twice)) zeroEffect.push(u.id);
  }
  check('★ 傳說級候選池內全部卡升級都有效果（零效果卡已排除）', zeroEffect.length === 0, zeroEffect.join(','));

  /* ② 對照組 A：form_* 係「值寫死」→ 傳說級 100% 零效果（排除理由成立） */
  const forms = UPGRADES.filter(u => u.id.indexOf('form_') === 0);
  const formStillZero = [];
  for (const u of forms) {
    const once = baseShipState(); u.mod(once, 1);
    const twice = baseShipState(); u.mod(twice, 1); u.mod(twice, 1);
    if (JSON.stringify(once) !== JSON.stringify(twice)) formStillZero.push(u.id);
  }
  check('對照組 A：form_* 傳說級必然零效果（值寫死）', formStillZero.length === 0,
    formStillZero.join(',') + ' / 共 ' + forms.length);

  /* ③ 對照組 B：gun_2 / gun_3 唔係「值一樣」，但係「加法型 + 封頂 → 飽和風險」
     ⇒ 用**真彈數**證明：至少一個情境下傳說級撞正（所以唔應該入候選池） */
  const satCases = [];
  for (const id of ['gun_2', 'gun_3']) {
    for (const ch of CHARS) {
      for (const stacks of [1, 2, 3]) {
        const plain = runShot(applyMods(mkShip(ch), [[id, stacks]])).length;
        const leg = runShot(applyMods(mkShip(ch), [[id, stacks], [id, 1]])).length;  /* 傳說級 = 再行一次 mod */
        if (plain === leg) satCases.push(ch + '/' + id + '×' + stacks + '(' + plain + ')');
      }
    }
  }
  check('對照組 B：gun_2 / gun_3 傳說級確實有飽和情境（排除理由成立）', satCases.length > 0,
    satCases.length + ' 個撞正情境，例：' + satCases.slice(0, 3).join(' '));

  /* ④ 逆轉候選池行為斷言 */
  const playerStacks = Object.create(null);
  const legendary = Object.create(null);
  playerStacks.form_rail = 1; playerStacks.gun_2 = 1; playerStacks.gun_3 = 1; playerStacks.shd_s = 1;
  const boFn = eval('(' + extractFunction('buildReverseOffer') + ')');
  let leak = 0, shortOut = 0;
  for (let i = 0; i < 1000; i++) {
    const ids = boFn().map(u => u.id);
    if (ids.length !== 3) shortOut++;
    if (ids.some(id => deadLegendary(UPGRADES.find(u => u.id === id)))) leak++;
  }
  check('★ buildReverseOffer 1000 次抽樣零零效果卡', leak === 0, leak + ' 次違例');
  check('★ 排除後候選仍然每次 3 張（唔會抽乾）', shortOut === 0, shortOut + ' 次唔夠 3 張');
}

/* ============================================================
 * 3. Tier 2（行為層 · 彈數）：多彈卡喺每架機體都要真係多彈
 * ============================================================ */
console.log('\n=== 3. Tier 2 彈數：多彈卡喺 5 架機體都要真係有效 ===');
{
  const MAX = cval('MAX_BULLETS');
  const rows = {};
  const dead = [];
  for (const ch of CHARS) {
    const nat = runShot(mkShip(ch)).length;
    const g2 = runShot(applyMods(mkShip(ch), [['gun_2', 1]])).length;
    const g3 = runShot(applyMods(mkShip(ch), [['gun_3', 1]])).length;
    const both = runShot(applyMods(mkShip(ch), [['gun_2', 1], ['gun_3', 1]])).length;
    const g2L = runShot(applyMods(mkShip(ch), [['gun_2', 1], ['gun_2', 1]])).length;
    const g3L = runShot(applyMods(mkShip(ch), [['gun_3', 1], ['gun_3', 1]])).length;
    rows[ch] = { nat, g2, g3, both, g2L, g3L };
    /* ① 單卡：一定要真係多過自然彈數（修正前 E 機 gun_2 = 3 粒 = 死卡） */
    if (g2 <= nat) dead.push(ch + ' 機 gun_2 零效果（' + nat + '→' + g2 + '）');
    if (g3 <= g2) dead.push(ch + ' 機 gun_3 零效果（' + g2 + '→' + g3 + '）');
    /* ② 同時持有：兩張卡都要有貢獻（唔可以互相吃掉） */
    if (both <= g3) dead.push(ch + ' 機 gun_2 被 gun_3 吃掉（' + g3 + '→' + both + '）');
    if (both <= g2) dead.push(ch + ' 機 gun_3 被 gun_2 吃掉（' + g2 + '→' + both + '）');
    /* ③ 傳說級（1 級疊加）：一定要有差異 */
    if (g2L === g2) dead.push(ch + ' 機 gun_2 傳說級撞正（' + g2 + '→' + g2L + '）');
    if (g3L === g3) dead.push(ch + ' 機 gun_3 傳說級撞正（' + g3 + '→' + g3L + '）');
    console.log('    ' + ch + ' 機：無卡 ' + nat + ' 粒 → gun_2 ' + g2 + ' 粒 → gun_3 ' + g3 +
      ' 粒 → 兩張 ' + both + ' 粒（傳說：gun_2 ' + g2L + ' / gun_3 ' + g3L + '）');
  }
  check('★ 多彈卡喺 5 架機體 × {單卡, 同時持有, 傳說級} 全部真係有效', dead.length === 0, dead.join(' / '));

  /* ④ 上限：加成型永遠唔會爆 */
  const over = runShot(applyMods(mkShip('A'), [['gun_2', 9], ['gun_3', 9]])).length;
  check('★ 有效彈數永遠 ≤ MAX_BULLETS(' + MAX + ')', over <= MAX, '→ ' + over);

  /* ⑤ 對照組：冇卡時唔會多彈（確認上面嘅增幅真係卡帶嚟，唔係 harness 問題） */
  const plainA = runShot(mkShip('A')).length;
  check('對照組：A 機冇卡 → 1 粒（增幅真係來自卡）', plainA === 1, '→ ' + plainA);
}

/* ============================================================
 * 4. Tier 2（行為層 · tag_rico）：彈牆 tag 令彈丸真係有橫向速度
 * ============================================================ */
console.log('\n=== 4. Tier 2 彈牆 tag：直上彈丸必須有橫向速度去到牆 ===');
{
  const mk = (tags) => Object.assign(mkShip('A'), { shotTags: Object.assign({ homing: 0, split: 0, slow: 0, ricochet: 0 }, tags) });
  const plain = runShot(mk({}))[0];
  const rico = runShot(mk({ ricochet: 1 }))[0];
  check('★ 冇彈牆 tag 嘅彈丸 |vx| ≈ 0（直上）', Math.abs(plain.vx) < 1e-6, '|vx|=' + Math.abs(plain.vx));
  check('★ 有彈牆 tag 嘅彈丸 |vx| ≥ 0.01（真係有橫向速度）',
    Math.abs(rico.vx) >= 0.01, '|vx|=' + Math.abs(rico.vx));
  check('★ 彈牆 tag 令 ricochetLeft 有值（可以真係反彈）',
    (rico.ricochetLeft || 0) >= 1, 'ricochetLeft=' + rico.ricochetLeft);
  /* 對照組：機身越靠牆，需要嘅橫向速度越細（按距離反推） */
  const nearWall = runShot(Object.assign(mk({ ricochet: 1 }), { x: 20 }))[0];
  check('★ 機身靠牆時橫向速度更細（按實際距離反推，唔係亂加固定值）',
    Math.abs(nearWall.vx) < Math.abs(rico.vx),
    '靠牆 |vx|=' + Math.abs(nearWall.vx).toFixed(4) + ' vs 居中 |vx|=' + Math.abs(rico.vx).toFixed(4));
}

/* ============================================================
 * 5. Tier 2（形態覆蓋 + 目標不存在）：雷射唔產生子彈 → tag 卡唔應該同雷射一齊出現
 * ============================================================ */
console.log('\n=== 5. Tier 2 形態覆蓋：雷射 ↔ tag 互斥 ===');
{
  const seenUpgradeIds = new Set();
  const playerStacks = Object.create(null);
  const isOffenseStyleCard = eval('(' + extractFunction('isOffenseStyleCard') + ')');
  const isPlayStyleCard = eval('(' + extractFunction('isPlayStyleCard') + ')');
  const upgradeWeight = eval('(' + extractFunction('upgradeWeight') + ')');
  const pickWeightedIndex = eval('(' + extractFunction('pickWeightedIndex') + ')');
  const hasFormCard = eval('(' + extractFunction('hasFormCard') + ')');
  const gen = eval('(' + extractFunction('generateChoiceOffer') + ')');

  /* ① 雷射唔產生子彈（實機：0 粒玩家子彈）→ 持有雷射時唔應該再出 tag 卡 */
  playerStacks.form_laser = 1;
  let tagLeak = 0;
  for (let i = 0; i < 1000; i++) {
    if (gen().some(u => u.id.indexOf('tag_') === 0)) tagLeak++;
  }
  check('★ 持有雷射形態 → 1000 次抽卡零 tag 卡（tag 喺雷射下零效果）', tagLeak === 0, tagLeak + ' 次漏出');

  /* ② 對照：持有任意 tag 卡 → 唔應該再出雷射 */
  delete playerStacks.form_laser;
  playerStacks.tag_home = 1;
  let laserLeak = 0;
  for (let i = 0; i < 1000; i++) {
    if (gen().some(u => u.id === 'form_laser')) laserLeak++;
  }
  check('★ 持有 tag 卡 → 1000 次抽卡零雷射卡', laserLeak === 0, laserLeak + ' 次漏出');

  /* ③ 對照組：乜都冇持有時，tag 卡同雷射卡仍然會出現（唔係「永遠唔出」） */
  for (const k of Object.keys(playerStacks)) delete playerStacks[k];
  let tagSeen = 0, laserSeen = 0;
  for (let i = 0; i < 1000; i++) {
    const ids = gen().map(u => u.id);
    if (ids.some(x => x.indexOf('tag_') === 0)) tagSeen++;
    if (ids.some(x => x === 'form_laser')) laserSeen++;
  }
  check('對照組：冇持有時 tag 卡同雷射卡仍然會出現', tagSeen > 0 && laserSeen > 0,
    'tag ' + tagSeen + '/1000 · laser ' + laserSeen + '/1000');
  /* ③b 每次仍然有 3 張（互斥唔會令池抽乾） */
  playerStacks.form_laser = 1;
  let shortOut = 0;
  for (let i = 0; i < 1000; i++) if (gen().length !== 3) shortOut++;
  check('★ 互斥後候選仍然每次 3 張（唔會抽乾）', shortOut === 0, shortOut + ' 次唔夠 3 張');
}

/* ============================================================
 * 6. Tier 2（enemyRoll wave index）：同一關重複 chunk 唔再共用 roll
 * ============================================================ */
console.log('\n=== 6. Tier 2 enemyRoll：key 係 wave index（每波獨立 roll）===');
{
  check('enemyRoll 用 wave index 做 key', /enemyRoll\[wi\] = \{ add, type \};/.test(h));
  check('enemyRollFor 收 waveIdx', /function enemyRollFor\(waveIdx\)/.test(h));
  check('emitWaveType 收 waveIdx', /function emitWaveType\(s, stageId, waveIdx\)/.test(h));
  check('tick 傳 waveCursor（唔再傳 chunk id）',
    /emitWaveType\(s, lastStage, waveCursor\)/.test(h) && !/emitWaveType\(s, lastStage, w\.chunk\)/.test(h));
}

/* ============================================================
 * 7. 版本 + PLAN 條目（v0.35.0 守門）
 * ============================================================ */
console.log('\n=== 7. 版本 + PLAN 條目 ===');
{
  const m = h.match(/末日救未來 v(\d+)\.(\d+)\.(\d+) 已載入/);
  const ver = m ? [+m[1], +m[2], +m[3]] : null;
  check('版本號可解析', !!ver, ver ? ver.join('.') : '搵唔到');
  /* ⚠️ 用 >= 唔用 exact-equal（記憶 §3）：改版號唔應該令呢個檔爆 */
  check('★ version >= v0.35.0', !!ver && (ver[0] > 0 || ver[1] > 35 || (ver[1] === 35 && ver[2] >= 0)),
    ver ? ver.join('.') : '—');
  const title = h.match(/fillText\('(v\d+\.\d+\.\d+)[^']*'/);
  check('標題畫面顯示同版號一致', !!title && !!ver && title[1].replace(/^v/, '') === ver.join('.'),
    title ? title[1] : '—');
  const plan = fs.readFileSync(__dirname + '/PLAN.md', 'utf8');
  check('PLAN 改動紀錄有 v0.35.0', /\*\*v0\.35\.0/.test(plan));
  for (const n of [131, 132, 133, 134, 135, 136, 137, 138]) {
    check('PLAN 有 #' + n + ' 條目', new RegExp('\\| ' + n + ' \\|').test(plan));
  }
}

console.log('\n' + (fails === 0 ? '✅ 全部通過' : '❌ ' + fails + ' 項失敗'));
process.exit(fails === 0 ? 0 : 1);
