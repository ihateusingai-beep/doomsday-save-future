/* v0.34.0 #126/#127/#128/#129 守門測試
 *
 * ① #126 emitWaveType 補返 splitter / rammer / lancer 三個 case
 *    （v3.11 #71 引入時漏咗 → 呢三種敵人由來冇出現過，S3/S4/S5 每局 17–19% 嘅波係空波）
 * ② #127 rollEnemyRoles 加「本關 pool 家族閘」→ 未教敵種唔准偷渡
 * ③ #128 S3 / S4 敵種攤分（延後教 chaser / bomber / medic / lancer）
 * ④ #129 波次強弱對比（實機已達標，本輪唔改 pool —— 守門只係記錄基線）
 *
 * ⚠️ 抽取真 source 用 direct eval + `eval('(' + expr + ')')` 形式
 *    （記憶 §5.1.1：direct eval 嘅 const 唔會漏出 scope，必須用括號包住物件字面量）。
 */
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const h = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const plan = fs.readFileSync(path.join(ROOT, 'PLAN.md'), 'utf8');

let fails = 0;
function check(name, ok, extra) {
  if (ok) console.log('  ✅ ' + name + (extra ? '  → ' + extra : ''));
  else { console.log('  ❌ ' + name + (extra ? '  → ' + extra : '')); fails++; }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

function grab(re) { const m = h.match(re); if (!m) { console.error('❌ 抽唔到: ' + re); process.exit(1); } return m[0]; }
function obj(re, name) {
  return eval('(' + grab(re).replace('const ' + name + ' =', '').replace(/;\s*$/, '') + ')');
}

/* ---------- 真資料 / 真 function ---------- */
const WAVE_CHUNKS = obj(/const WAVE_CHUNKS = \{[\s\S]*?\n\};/, 'WAVE_CHUNKS');
const STAGE_RAND  = obj(/const STAGE_RAND = \{[\s\S]*?\n\};/, 'STAGE_RAND');
const ENEMY_ROLL  = obj(/const ENEMY_ROLL = \{[\s\S]*?\n\};/, 'ENEMY_ROLL');
const SPECIAL_TYPES = eval('(' + grab(/const SPECIAL_TYPES = \[[^\]]*\];/).replace('const SPECIAL_TYPES =', '').replace(/;\s*$/, '') + ')');
const WAVE_TEMPLATES = obj(/const WAVE_TEMPLATES = \{[\s\S]*?\n\};/, 'WAVE_TEMPLATES');
const STAGE_TABLE = obj(/const STAGE_TABLE = \{[\s\S]*?\n\};/, 'STAGE_TABLE');

const mulberry32    = eval('(' + grab(/function mulberry32\([\s\S]*?\n\}/) + ')');
const stageRngFor   = eval('(' + grab(/function stageRngFor\([\s\S]*?\n\}/) + ')');
const pickChunkId   = eval('(' + grab(/function pickChunkId\([\s\S]*?\n\}/) + ')');
const stylePool     = eval('(' + grab(/function stylePool\([\s\S]*?\n\}/) + ')');
const assembleWaves = eval('(' + grab(/function assembleWaves\([\s\S]*?\n\}/) + ')');
const rollEnemyRoles = eval('(' + grab(/function rollEnemyRoles\([\s\S]*?\n\}/) + ')');
const poolEnemyTypes = eval('(' + grab(/function poolEnemyTypes\([\s\S]*?\n\}/) + ')');

const STAGE_ATS = {};
for (const k of Object.keys(WAVE_TEMPLATES)) STAGE_ATS[k] = WAVE_TEMPLATES[k].map(w => w.at);
let runSeed = 0, stageStyle = null, enemyRoll = Object.create(null);
const realLog = console.log, realWarn = console.warn;
let QUIET = false;
console.log = (...a) => { if (!QUIET) realLog(...a); };
console.warn = (...a) => { if (!QUIET) realWarn(...a); };

/* ---------- ① emitWaveType 有冇三個 case ---------- */
section('1. #126 emitWaveType 補返三個 case');
{
  const emitSrc = grab(/function emitWaveType\([\s\S]*?\n\}\n/);
  for (const t of ['splitter', 'rammer', 'lancer']) {
    check('emitWaveType 有 case \'' + t + '\'', emitSrc.includes("case '" + t + "':"));
  }
  /* ⚠️ 呢三個 type 嘅 game logic 必須仍然存在（唔係只補空殼） */
  check('splitter 死亡裂散射彈邏輯喺度', /spawnSplitterChildren/.test(h));
  check('rammer 預警加速撞邏輯喺度', /e\.rammer && e\.ramWarnMs === 0/.test(h));
  check('lancer 垂直光束邏輯喺度', /if \(e\.lancer\)/.test(h));
  check('三個 sprite 喺圖集入面', /splitter: \{ x:/.test(h) && /rammer: \{ x:/.test(h) && /lancer: \{ x:/.test(h));
}

section('2. #127 poolEnemyTypes 攤平正確（唔可以用 chunk id 前綴）');
{
  const t1 = poolEnemyTypes(1), t2 = poolEnemyTypes(2),
        t3 = poolEnemyTypes(3), t4 = poolEnemyTypes(4), t5 = poolEnemyTypes(5);
  /* ⚠️ 攤平正確性：sp_2 個前綴係 sp_（彈幕）但 type 係 splitter；ln_1 前綴 ln_ */
  check('S3 pool type 集合含 splitter（sp_2 唔係 spray）', t3.has('splitter'));
  check('S3 pool type 集合含 rammer（ram_1 前綴 ram）', t3.has('rammer'));
  check('S2 pool type 集合含 spray（sp_s 真係彈幕）', t2.has('spray'));
  check('S2 pool type 集合含 ring（rg_s）', t2.has('ring'));
  /* ⚠️ 唔好綁死具體 pool 組成（記憶 §3）→ 只斷 invariant */
  check('S1 pool type 集合 = grunt / spray / aim（教學關）',
    t1.has('grunt') && t1.has('spray') && t1.has('aim') && t1.size === 3, [...t1].sort().join(','));
  check('S2 pool type 集合唔含 elite / shield / swarm / sniper（#127 閘嘅依據）',
    !t2.has('elite') && !t2.has('shield') && !t2.has('swarm') && !t2.has('sniper'), [...t2].sort().join(','));
  check('★ S3 pool 唔含 chaser / bomber / medic（#128 攤分咗三種難教嘅）',
    !t3.has('chaser') && !t3.has('bomber') && !t3.has('medic'), [...t3].sort().join(','));
  check('★ S3 pool 唔含 sniper（延後到 S5，#128 ③）', !t3.has('sniper'));
  check('★ S3 pool 含 turret（PLAN #97 invariant）', t3.has('turret'));
  check('★ S3 pool 含 dive（大氣層 = 俯衝雜魚，關卡主題）', t3.has('dive'));
  check('★ S4 pool 唔含 chaser / bomber / medic（#128 攤分咗三種難教嘅）',
    !t4.has('chaser') && !t4.has('bomber') && !t4.has('medic'), [...t4].sort().join(','));
  check('★ S4 pool 只教 elite + shield 兩種新敵（#128）', t4.has('elite') && t4.has('shield'));
  check('★ S5 pool 收晒 swarm / sniper / lancer / chaser / bomber / medic',
    t5.has('swarm') && t5.has('sniper') && t5.has('lancer') && t5.has('chaser') &&
    t5.has('bomber') && t5.has('medic'), [...t5].sort().join(','));
}

/* ---------- ③ 蒙地卡羅：未教敵種 + 新敵種驗收線 ---------- */
section('3. #127 / #128 蒙地卡羅實測（1200 局）');
const FORMATION = new Set(['grunt', 'dive', 'elite', 'sniper', 'shield', 'swarm',
  'medic', 'chaser', 'bomber', 'turret', 'splitter', 'rammer', 'lancer']);
const ROLL_ADD_OK = new Set([...FORMATION, 'spray']);
function waveEnemies(wave, roll) {
  const out = [];
  for (const s of wave.spawn) {
    const isForm = FORMATION.has(s.type);
    const t = (isForm && roll && roll.type) ? roll.type : s.type;
    let c = s.count || 1;
    if (roll && ROLL_ADD_OK.has(s.type)) c = Math.max(1, c + roll.add);
    out.push({ type: t, count: c });
  }
  return out;
}
const RUNS = 1200;
const untaught = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
const newCount = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
for (let run = 0; run < RUNS; run++) {
  const seed = (run * 2654435761) >>> 0;
  const seen = new Set();
  for (const sid of [1, 2, 3, 4, 5]) {
    runSeed = seed;
    QUIET = true;
    const waves = assembleWaves(sid, seed);
    const roll = rollEnemyRoles(sid, waves);
    QUIET = false;
    const taught = poolEnemyTypes(sid);
    for (const w of waves) {
      const r = roll[w.chunk] || null;
      let bad = 0;
      for (const e of waveEnemies(w, r)) {
        if (!FORMATION.has(e.type)) continue;
        if (!seen.has(e.type)) { seen.add(e.type); newCount[sid]++; }
        if (!taught.has(e.type)) bad++;
      }
      if (bad > 0) untaught[sid]++;
    }
  }
}
for (const sid of [1, 2, 3, 4, 5]) {
  const u = untaught[sid] / (RUNS * STAGE_TABLE[sid].waveCount);
  check('★ S' + sid + ' 未教敵種佔比 = 0', u === 0, (u * 100).toFixed(2) + '%');
}
check('★ S1 每局新敵種 = 1', newCount[1] === RUNS, (newCount[1] / RUNS).toFixed(3));
check('★ S2 每局新敵種 = 0', newCount[2] === 0, (newCount[2] / RUNS).toFixed(3));
check('★ S3 每局新敵種 ≤ 2.5', newCount[3] / RUNS <= 2.5, (newCount[3] / RUNS).toFixed(3));
check('★ S4 每局新敵種 ≤ 3', newCount[4] / RUNS <= 3, (newCount[4] / RUNS).toFixed(3));

/* ---------- ④ pool 靜態檢查 ---------- */
section('4. #128 pool 攤分靜態檢查');
{
  const p3 = STAGE_RAND[3].pool, p4 = STAGE_RAND[4].pool;
  /* 推走：冇 telegraph 或零戰術價值嘅新敵 → 延後到後面嘅關卡先教 */
  for (const id of ['ch_1', 'bm_1', 'md_1']) check('S3 pool 已移除 ' + id, !p3.includes(id));
  for (const id of ['bm_1', 'md_gr', 'ch_1', 'ch_2']) check('S4 pool 已移除 ' + id, !p4.includes(id));
  /* 保留：#72 要 S3 有 ≥3 個 v3.11 新敵人 chunk */
  check('S3 pool 有 3 個 v3.11 新敵人 chunk', p3.filter(id => /^(sp_2|ram_|ln_|mix_sp_ram)/.test(id)).length >= 3,
    p3.filter(id => /^(sp_2|ram_|ln_|mix_sp_ram)/.test(id)).join(','));
  /* 保留：#97 要 S3–S5 pool 有 v0.26.0 新敵人 */
  const V026 = ['medic', 'chaser', 'bomber', 'turret'];
  for (const sid of [3, 4, 5]) {
    const pool = STAGE_RAND[sid].pool;
    const has = pool.some(id => WAVE_CHUNKS[id].spawn.some(s => V026.includes(s.type)));
    check('★ S' + sid + ' pool 有 v0.26.0 新敵人（PLAN #97 invariant）', has);
  }
  /* 教學遞增：S4 只教 elite + shield 兩種新敵 → 負荷集中去終關 */
  check('S4 pool 有 turret（v0.26.0 教學價值最高嗰種）', p4.includes('tu_1') || p4.includes('tu_gr'));
  check('★ S3 pool 長度 ∈ [14, 24]（PLAN #72 invariant）', p3.length >= 14 && p3.length <= 24, String(p3.length));
  check('★ S4 pool 長度 ∈ [14, 24]', p4.length >= 14 && p4.length <= 24, String(p4.length));
  check('★ S5 pool 長度 ∈ [14, 24]', STAGE_RAND[5].pool.length >= 14 && STAGE_RAND[5].pool.length <= 24, String(STAGE_RAND[5].pool.length));
  let allExist = true;
  for (const sid of [1, 2, 3, 4, 5]) {
    const cfg = STAGE_RAND[sid];
    const ids = cfg.slots ? cfg.slots.flat() : cfg.pool;
    for (const id of ids) if (!WAVE_CHUNKS[id]) { allExist = false; console.log('     缺 chunk: S' + sid + ' ' + id); }
  }
  check('★ 所有 pool chunk id 都存在於 WAVE_CHUNKS', allExist);
  /* ⚠️ 每個 pool chunk 都要真係會生成敵人（唔准空波） */
  const emitSrc = grab(/function emitWaveType\([\s\S]*?\n\}\n/);
  const EMITS = new Set(); let m; const cre = /case '([a-z_]+)':/g;
  while ((m = cre.exec(emitSrc))) EMITS.add(m[1]);
  let noEmpty = true;
  for (const sid of [1, 2, 3, 4, 5]) {
    const cfg = STAGE_RAND[sid];
    const ids = cfg.slots ? cfg.slots.flat() : cfg.pool;
    for (const id of ids) {
      const ch = WAVE_CHUNKS[id];
      if (ch && ch.spawn.every(s => !EMITS.has(s.type))) { noEmpty = false; console.log('     空波 chunk: S' + sid + ' ' + id); }
    }
  }
  check('★ 冇任何 pool chunk 係空波（#126 守門）', noEmpty);
}

/* ---------- ⑤ PLAN 條目 + 版本 ---------- */
section('5. PLAN 條目 + 版本號');
{
  const vm = h.match(/末日救未來 v(\d+)\.(\d+)\.(\d+) 已載入/);
  const ver = vm ? [+vm[1], +vm[2], +vm[3]] : null;
  check('版本號可解析', !!ver, ver ? ver.join('.') : '—');
  check('★ version >= v0.34.0', !!ver && (ver[0] > 0 || ver[1] > 34 || (ver[1] === 34 && ver[2] >= 0)),
    ver ? ver.join('.') : '—');
  check('PLAN 有 #126 空波修正', /\| 126 \|.*splitter/.test(plan));
  check('PLAN 有 #127 pool 家族閘', /\| 127 \|.*pool 家族閘/.test(plan));
  check('PLAN 有 #128 敵種攤分', /\| 128 \|.*敵種攤分/.test(plan));
  check('PLAN 有 #129 強弱對比', /\| 129 \|.*強弱對比/.test(plan));
  check('PLAN 有 #130 版號', /\| 130 \|.*v0\.34\.0/.test(plan));
  check('PLAN 改動紀錄有 v0.34.0', /\*\*v0\.34\.0/.test(plan));
}

/* ---------- ⑥ 實機：三種敵人真係出场 ---------- */
section('6. 實機驗證：三種敵人真係生成（Playwright WebKit）');
(async () => {
  const pw = require('/Users/kencheng/.npm/_npx/9833c18b2d85bc59/node_modules/playwright');
  const browser = await pw.webkit.launch();
  const ctx = await browser.newContext({ viewport: { width: 834, height: 1194 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  await page.goto('file://' + path.join(ROOT, 'index.html') + '?god=1&seed=42');
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    runSeed = 42; lastStage = 3;
    const probe = (t, c) => {
      enemies.length = 0;
      emitWaveType({ type: t, count: c }, 3, 'sp_2');
      const n = enemies.length;
      enemies.length = 0;
      return n;
    };
    return { grunt: probe('grunt', 2), splitter: probe('splitter', 2), rammer: probe('rammer', 1), lancer: probe('lancer', 1) };
  });
  check('★ 實機 grunt 生成 2 隻（對照組）', r.grunt === 2, String(r.grunt));
  check('★ 實機 splitter 生成 2 隻', r.splitter === 2, String(r.splitter));
  check('★ 實機 rammer 生成 1 隻', r.rammer === 1, String(r.rammer));
  check('★ 實機 lancer 生成 1 隻', r.lancer === 1, String(r.lancer));
  check('零 page error', errs.length === 0, errs.join(' | ') || '零');
  await browser.close();

  console.log('\n' + (fails ? fails + ' FAIL' : 'ALL PASS'));
  process.exit(fails ? 1 : 0);
})();
