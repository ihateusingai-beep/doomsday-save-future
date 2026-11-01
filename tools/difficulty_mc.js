/* tools/difficulty_mc.js — 確定性難度量測（PLAN #139 · 收 MECHANICS_REVIEW_v034.md #7 + #11）
 *
 * 點解要呢個工具：
 *   ① review §4 主張「S2–S5 波次強度係平板」係用一個**已遺失**嘅 mc_live.js 量嘅 → 絕對值無法重現。
 *   ② 實機 bot 逐關用時**方差 5.2×**（同版本同 seed 可差 5.2 倍）→ 完全唔可信做難度指標。
 *   ③ 實機畫面取樣（威脅 CV / 敵彈數）離散度可以好大 —— v0.35.0 實測：
 *      同版本重跑 S4「敵彈均」差 54.7%、S5 差 102.2% → **唔可以用嚟比版本**。
 *   ⇒ 所以難度指標改成**確定性統計**：直接行真 `assembleWaves()` + 真 `rollEnemyRoles()`，
 *      蒙地卡羅 N 局，逐波計組成 → **離散度近乎 0**（結果係可重現嘅純統計）。
 *
 * 用法：
 *   node tools/difficulty_mc.js <index.html> [RUNS]              # 單版本：逐關指標
 *   node tools/difficulty_mc.js <A.html> <B.html> [RUNS]          # 兩版本：逐關對比（變化率）
 *   node tools/difficulty_mc.js <A.html> <B.html> [RUNS] --per-wave  # 額外列出每波組成（逐波對比）
 *
 * ⚠️ 指標口徑：
 *   「敵身體數」= 會追人／有血嘅敵人（威脅本體）
 *   「投射物數」= 只發彈幕、冇血嘅敵人（grunt 類以外嘅純彈幕單位）
 *   「威脅血量」= 敵身體 × 血量（唔計投射物）→ 衡量「要幾耐先清得走」
 */
'use strict';
const fs = require('fs');
const path = require('path');

/* ---------- 抽出真代碼（每個版本喺自己 scope 跑，唔污染彼此） ---------- */
function harness(htmlPath, RUNS) {
  const h = fs.readFileSync(htmlPath, 'utf8');
  const grab = (re) => { const m = h.match(re); if (!m) throw new Error('抽唔到 ' + re + '（' + htmlPath + '）'); return m[0]; };
  const stripSemi = (s) => s.replace(/;\s*$/, '');
  const obj = (re, name) => eval('(' + stripSemi(grab(re).replace('const ' + name + ' =', '')) + ')');
  const fn = (re) => eval('(' + grab(re) + ')');

  const WAVE_TEMPLATES = obj(/const WAVE_TEMPLATES = \{[\s\S]*?\n\};/, 'WAVE_TEMPLATES');
  const STAGE_TABLE    = obj(/const STAGE_TABLE = \{[\s\S]*?\n\};/, 'STAGE_TABLE');
  const WAVE_CHUNKS    = obj(/const WAVE_CHUNKS = \{[\s\S]*?\n\};/, 'WAVE_CHUNKS');
  const STAGE_RAND     = obj(/const STAGE_RAND = \{[\s\S]*?\n\};/, 'STAGE_RAND');
  const ENEMY_ROLL     = obj(/const ENEMY_ROLL = \{[\s\S]*?\n\};/, 'ENEMY_ROLL');
  const SPECIAL_TYPES  = eval('(' + stripSemi(grab(/const SPECIAL_TYPES = \[[^\]]*\];/).replace('const SPECIAL_TYPES =', '')) + ')');

  /* STAGE_ATS：assembleWaves() 用（波次時間線，由 WAVE_TEMPLATES 推） */
  const STAGE_ATS = {};
  for (const k of Object.keys(WAVE_TEMPLATES)) STAGE_ATS[k] = WAVE_TEMPLATES[k].map(w => w.at);

  /* 各敵種血量（由真 source 常數抽，唔手抄） */
  const HP = {};
  let hm; const hre = /const ([A-Z]+)_HP\s*=\s*(\d+)/g;
  while ((hm = hre.exec(h))) HP[hm[1].toLowerCase()] = parseInt(hm[2], 10);

  const mulberry32     = fn(/function mulberry32\([\s\S]*?\n\}/);
  const stageRngFor    = fn(/function stageRngFor\([\s\S]*?\n\}/);
  const pickChunkId    = fn(/function pickChunkId\([\s\S]*?\n\}/);
  const stylePool      = fn(/function stylePool\([\s\S]*?\n\}/);
  const assembleWaves  = fn(/function assembleWaves\([\s\S]*?\n\}/);
  const rollEnemyRoles = fn(/function rollEnemyRoles\([\s\S]*?\n\}/);
  let poolEnemyTypes = null;
  const pm = h.match(/function poolEnemyTypes\([\s\S]*?\n\}/);
  if (pm) poolEnemyTypes = eval('(' + pm[0] + ')');

  /* emitWaveType switch 支援嘅 type（空波 bug 嘅守門：switch 冇 case → 0 隻） */
  const emitSrc = grab(/function emitWaveType\([\s\S]*?\n\}\n/);
  const EMITS = new Set();
  let mm; const cr = /case '([a-z_]+)':/g;
  while ((mm = cr.exec(emitSrc))) EMITS.add(mm[1]);
  const BODY = new Set(['grunt', 'dive', 'elite', 'sniper', 'shield', 'swarm', 'medic', 'chaser', 'bomber', 'turret', 'splitter', 'rammer', 'lancer']);
  const ROLL_ADD_OK = new Set([...BODY, 'spray']);

  /* roll key 慣例：v0.34.0 係 chunk id，v0.35.0 改成 wave index */
  const USE_WAVE_KEY = /enemyRoll\[wi\] = \{ add, type \};/.test(h);

  let runSeed = 0, stageStyle = null, enemyRoll = Object.create(null);
  const realLog = console.log, realWarn = console.warn;
  RUNS = RUNS || 600;
  console.log = () => {}; console.warn = () => {};

  const perStage = {};
  for (const sid of [1, 2, 3, 4, 5]) {
    let waves = 0, body = 0, proj = 0, threatHp = 0, wavesWithEmpty = 0;
    const typeCount = Object.create(null);
    let uniqPerRun = 0;
    let dupPairs = 0, dupSame = 0;
    const perWave = [];

    for (let r = 0; r < RUNS; r++) {
      const seed = 1000 + r * 7;
      runSeed = seed; stageStyle = null; enemyRoll = Object.create(null);
      const wv = assembleWaves(sid, seed);
      rollEnemyRoles(sid, wv);
      const sigs = [];
      const comps = new Set();     /* 每局內嘅敵配集合（唔理 chunk id）→ 波次之間嘅變化度 */
      let runBody = 0, runProj = 0, runHp = 0, runEmpty = 0;

      for (let i = 0; i < wv.length; i++) {
        const w = wv[i];
        const key = USE_WAVE_KEY ? i : w.chunk;
        const roll = enemyRoll[key] || null;
        const list = [];
        let wb = 0, wp = 0, whp = 0, empty = 0;
        for (const sp of w.spawn) {
          const isForm = BODY.has(sp.type);
          const t = (isForm && roll && roll.type) ? roll.type : sp.type;
          if (!EMITS.has(t)) { empty++; continue; }          /* switch 冇 case → 呢個 spawn 唔會出場 */
          let c = sp.count || 1;
          if (roll && ROLL_ADD_OK.has(sp.type)) c = Math.max(1, c + roll.add);
          list.push(t + 'x' + c);
          typeCount[t] = (typeCount[t] || 0) + c;
          const hp = isForm ? (sp.hp || HP[t] || 0) : 0;
          if (hp) { wb += c; whp += c * hp; } else { wp += c; }
        }
        list.sort();
        sigs.push(w.chunk + '{' + list.join(',') + '}');
        comps.add(list.join(','));
        runBody += wb; runProj += wp; runHp += whp;
        if (list.length === 0) { runEmpty++; empty = 1; }
        perWave.push({ chunk: w.chunk, list: list.join(','), body: wb, proj: wp, hp: whp, empty: empty });
      }
      for (let i = 0; i < wv.length; i++) {
        for (let j = i + 1; j < wv.length; j++) {
          if (wv[i].chunk !== wv[j].chunk) continue;
          dupPairs++;
          if (sigs[i] === sigs[j]) dupSame++;
        }
      }
      waves += wv.length; body += runBody; proj += runProj; threatHp += runHp;
      wavesWithEmpty += runEmpty;
      uniqPerRun += comps.size / wv.length;
    }

    const totalTypes = Object.values(typeCount).reduce((a, b) => a + b, 0) || 1;
    perStage[sid] = {
      waves: waves / RUNS,
      bodyPerWave: body / Math.max(1, waves),
      projPerWave: proj / Math.max(1, waves),
      hpPerWave: threatHp / Math.max(1, waves),
      emptyWavePct: wavesWithEmpty / Math.max(1, waves) * 100,
      typeShare: Object.fromEntries(Object.entries(typeCount)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => [k, +(v / totalTypes * 100).toFixed(1)])),
      uniqWavePct: uniqPerRun / RUNS * 100,
      dupPairSamePct: dupPairs ? dupSame / dupPairs * 100 : 0,
      perWave,
    };
  }
  console.log = realLog; console.warn = realWarn;
  return perStage;
}

module.exports = { harness };

/* ---------- CLI（只有直接行先執行；被 require 唔會跑） ---------- */
if (require.main === module) {
const argv = process.argv.slice(2).filter(a => a !== '--per-wave');
const RUNS = parseInt(argv[argv.length - 1] && /^\d+$/.test(argv[argv.length - 1]) ? argv.pop() : '600', 10);
const paths = argv.filter(a => a !== '0');
const PER_WAVE = process.argv.includes('--per-wave');

if (!paths.length) {
  console.error('用法：node tools/difficulty_mc.js <index.html> [RUNS]\n       node tools/difficulty_mc.js <A.html> <B.html> [RUNS] [--per-wave]');
  process.exit(1);
}

const label = (p) => path.basename(p);
const A = harness(paths[0]);
const B = paths[1] ? harness(paths[1]) : null;

console.log('確定性難度量測（蒙地卡羅 ' + RUNS + ' 局 × 5 關 · 真 assembleWaves() + 真 rollEnemyRoles()）');
console.log('  A = ' + label(paths[0]));
if (B) console.log('  B = ' + label(paths[1]));

const rows = [
  ['身體數/波', 'bodyPerWave', 2],
  ['投射物/波', 'projPerWave', 2],
  ['威脅血量/波', 'hpPerWave', 1],
  ['空波率%', 'emptyWavePct', 2],
  ['波次間敵配多樣度%', 'uniqWavePct', 1],
  ['重複波對相同%', 'dupPairSamePct', 2],
];
const pad = (s, n) => String(s).padStart(n);
console.log('\n關 | 指標              | ' + pad(label(paths[0]), 12) + (B ? ' | ' + pad(label(paths[1]), 12) + ' | 變化' : ''));
console.log('---|-------------------|' + (B ? '------------|------------|---------' : '------------'));
for (const sid of [1, 2, 3, 4, 5]) {
  for (const [name, key, dec] of rows) {
    const a = A[sid][key];
    const aTxt = pad(a.toFixed(dec), 12);
    if (!B) { console.log(' S' + sid + ' | ' + name.padEnd(17) + ' | ' + aTxt); continue; }
    const b = B[sid][key];
    const d = a ? ((b - a) / a * 100) : 0;
    console.log(' S' + sid + ' | ' + name.padEnd(17) + ' | ' + aTxt + ' | ' + pad(b.toFixed(dec), 12) +
      ' | ' + (d >= 0 ? '+' : '') + d.toFixed(1) + '%');
  }
  console.log('---|-------------------|' + (B ? '------------|------------|---------' : '------------'));
}

console.log('\n敵種分布（%）');
for (const sid of [1, 2, 3, 4, 5]) {
  const a = Object.entries(A[sid].typeShare).map(([k, v]) => k + ' ' + v + '%');
  console.log('  S' + sid + '  ' + label(paths[0]) + ': ' + a.join(' · '));
  if (B) {
    const b = Object.entries(B[sid].typeShare).map(([k, v]) => k + ' ' + v + '%');
    console.log('  S' + sid + '  ' + label(paths[1]) + ': ' + b.join(' · '));
  }
}

if (PER_WAVE) {
  console.log('\n每波組成（第一局 · seed 1000）');
  for (const sid of [1, 2, 3, 4, 5]) {
    console.log('  S' + sid + '  ' + label(paths[0]));
    for (const w of A[sid].perWave.slice(0, 12)) {
      console.log('     ' + w.chunk.padEnd(14) + (w.empty ? '【空波】' : w.list) +
        '  身體' + w.body + ' 投射' + w.proj + ' 血' + w.hp);
    }
    if (B) {
      console.log('  S' + sid + '  ' + label(paths[1]));
      for (const w of B[sid].perWave.slice(0, 12)) {
        console.log('     ' + w.chunk.padEnd(14) + (w.empty ? '【空波】' : w.list) +
          '  身體' + w.body + ' 投射' + w.proj + ' 血' + w.hp);
      }
    }
  }
}
}
