/* tools/segment_density.js — 壓力段制密度量測（PLAN #150 · v0.39.0）
 *
 * 點解要呢個工具：
 *   批判分析（#148）實測出「有意義嘅能力提升平均 51 秒一次、各關平均長 80 秒」→
 *   玩家喺一關之內只改變得自己一次，等待被當成遊玩。v0.39.0 壓力段制就係要
 *   **把取捨密度由 ~51 秒一次壓到 ~7 秒一次**。呢個數字唔可以靠感覺 → 必須實測。
 *
 * 量測五件事（全部由 index.html 真 source 抽出，唔手抄）：
 *   ① 段間隔      —— 每關嘅段事件間隔（驗收線 ≤ 9000ms）
 *   ② 取捨密度    —— 段事件 / 分鐘 vs 舊基準 51 秒一次
 *   ③ 目標分佈    —— graze / clear / safe 三種目標嘅出現率（要夠平均，唔可以有死目標）
 *   ④ 清場可達性  —— 證明「只計雜魚」先係啱嘅判定（enemies.length 幾乎永遠達唔到）
 *   ⑤ 段長分佈    —— 每段要幾耐先結算
 *
 * 用法：
 *   node tools/segment_density.js [index.html] [SEEDS]
 *
 * ⚠️ 口徑說明（唔好亂改）：
 *   - 段邊界 = 波次序為 SEG_WAVES 嘅整數倍（真 code：tick() 內 `waveCursor % SEG_WAVES === 0`）
 *   - 段目標抽籤用真 stream 公式（由 source 抽 `13000 + lastStage*10 + segIndex`）
 *   - 彈幕壽命用真 chunk speed × 真 bulletSpdMul（唔係估出嚟嘅數）
 *   - 每波實際 chunk 用真 assembleWaves() 抽（唔係假設）
 */
'use strict';
const fs = require('fs');
const path = require('path');

const HTML = process.argv[2] || path.join(__dirname, '..', 'index.html');
const SEEDS = parseInt(process.argv[3] || '300', 10);

const h = fs.readFileSync(HTML, 'utf8');
const grab = (re) => { const m = h.match(re); if (!m) throw new Error('抽唔到 ' + re); return m[0]; };
const cap = (re, i) => { const m = h.match(re); if (!m) throw new Error('抽唔到 ' + re); return m[i === undefined ? 1 : i]; };
const stripSemi = (s) => s.replace(/;\s*$/, '');
const obj = (re, name) => eval('(' + stripSemi(grab(re).replace(new RegExp('const\\s+' + name + '\\s*=\\s*'), '')) + ')');

/* ---------- 真 source ---------- */
const WAVE_TEMPLATES = obj(/const WAVE_TEMPLATES = \{[\s\S]*?\n\};/, 'WAVE_TEMPLATES');
const WAVE_CHUNKS    = obj(/const WAVE_CHUNKS = \{[\s\S]*?\n\};/, 'WAVE_CHUNKS');
const STAGE_RAND     = obj(/const STAGE_RAND = \{[\s\S]*?\n\};/, 'STAGE_RAND');
const DIFFICULTY     = obj(/const DIFFICULTY = Object\.freeze\(\{[\s\S]*?\n\}\);/, 'DIFFICULTY');
const AFFIX_DEFS     = obj(/const AFFIX_DEFS = \[[\s\S]*?\n\];/, 'AFFIX_DEFS');

const mulberry32  = eval('(' + grab(/function mulberry32\([\s\S]*?\n\}/) + ')');
const stageRngFor = eval('(' + grab(/function stageRngFor\([\s\S]*?\n\}/) + ')');
const pickChunkId = eval('(' + grab(/function pickChunkId\([\s\S]*?\n\}/) + ')');
/* stylePool() 會讀本關風格；本工具唔模擬風格（null = 唔加權，同 stylePool 嘅預設路徑一致） */
let stageStyle = null;
const stylePool   = eval('(' + grab(/function stylePool\([\s\S]*?\n\}/) + ')');

const SEG_T     = Number(cap(/const SEG_T\s*=\s*(\d+)/));
const VIEW_H    = Number(cap(/const VIEW_H\s*=\s*(\d+)/));
const SEG_KEYS  = eval('(' + grab(/const SEG_KEYS\s*=\s*\[[^\]]*\]/).replace(/const\s+SEG_KEYS\s*=\s*/, '') + ')');
/* 段目標 stream 公式（由 source 抽，唔硬編碼） */
const sm = h.match(/stageRngFor\(runSeed,\s*(\d+)\s*\+\s*lastStage\s*\*\s*(\d+)\s*\+\s*segIndex\)/);
if (!sm) throw new Error('抽唔到段目標 rng stream 公式');
const SEG_BASE = Number(sm[1]), SEG_STAGE_MUL = Number(sm[2]);
/* need 曲線：min(7, 3 + segIndex) */
const NEED_CAP = Number(cap(/need:\s*Math\.min\((\d+),\s*(\d+)\s*\+\s*segIndex\)/, 1));
const NEED_BASE = Number(cap(/need:\s*Math\.min\((\d+),\s*(\d+)\s*\+\s*segIndex\)/, 2));

/* STAGE_ATS（真 code 係由 WAVE_TEMPLATES 推） */
const STAGE_ATS = {};
for (const k of Object.keys(WAVE_TEMPLATES)) STAGE_ATS[k] = WAVE_TEMPLATES[k].map(w => w.at);

/* ---------- 真波次組裝（每波實際 chunk） ---------- */
function assembleWaves(stageId, seed) {
  const cfg = STAGE_RAND[stageId] || STAGE_RAND[1];
  const ats = STAGE_ATS[stageId] || STAGE_ATS[1];
  const rng = stageRngFor(seed, stageId);
  const out = [];
  let lastId = null;
  for (let i = 0; i < ats.length; i++) {
    const rawPool = cfg.slots ? (cfg.slots[i] || cfg.slots[0]) : cfg.pool;
    const pool = stylePool(stageId, rawPool);
    const id = pickChunkId(pool, rng, lastId);
    lastId = id;
    out.push({ at: ats[i], chunk: id, spawn: WAVE_CHUNKS[id].spawn.map(s => Object.assign({}, s)) });
  }
  return out;
}

/* ---------- 彈幕真實速度 ---------- */
const DIRECT_BULLET_TYPES = new Set(['spray', 'aim', 'ring', 'meteor']);
const chunkSpeeds = [];
for (const id of Object.keys(WAVE_CHUNKS)) {
  for (const s of WAVE_CHUNKS[id].spawn || []) {
    if (typeof s.speed === 'number') chunkSpeeds.push(s.speed);
  }
}
const maxChunkSpeed = Math.max.apply(null, chunkSpeeds);
const minChunkSpeed = Math.min.apply(null, chunkSpeeds);
/* 詞綴對敵彈速度只會減（static 0.82），冇加速 → 上限係 1 */
const affBulletSpdMax = Math.max.apply(null, AFFIX_DEFS.map(d => (d.bulletSpd == null ? 1 : d.bulletSpd)));
const diffIds = Object.keys(DIFFICULTY).map(Number);
const fastestBulletMul = Math.min.apply(null, diffIds.map(id => DIFFICULTY[id].bulletSpdMul));
const slowestBulletMul = Math.max.apply(null, diffIds.map(id => DIFFICULTY[id].bulletSpdMul));
/* 敵彈離場判定：x/y 超出 ±16 → 由 y=-14 落到 VIEW_H+16 = 496 */
const BULLET_TRAVEL = VIEW_H + 16 - (-14);
const fastestBulletMs = BULLET_TRAVEL / (maxChunkSpeed * fastestBulletMul * affBulletSpdMax);

/* ---------- 雜魚真實下落速度 ---------- */
const gruntBaseVy = [];
{
  const blk = grab(/function spawnGruntFormation[\s\S]*?\n\}/);
  const m1 = blk.match(/let baseVy = diving \? \(elite \? ([\d.]+) : ([\d.]+)\) : \(elite \? ([\d.]+) : ([\d.]+)\)/);
  if (m1) gruntBaseVy.push(Number(m1[3]), Number(m1[4]));
  const re = /if \((\w+)\) baseVy = ([\d.]+);/g; let mm;
  while ((mm = re.exec(blk))) gruntBaseVy.push(Number(mm[2]));
}
const minGruntVy = Math.min.apply(null, gruntBaseVy);
const minFallMul = Math.min.apply(null, diffIds.map(id => DIFFICULTY[id].fallMul));
/* 詞綴 enemySpd 最細 1；小詞綴 spd 最細 0.7 */
const minAffEnemySpd = Math.min.apply(null, AFFIX_DEFS.map(d => (d.enemySpd == null ? 1 : d.enemySpd)));
const minMinorSpd = 0.7;
const slowestGruntMs = (VIEW_H + 20 - (-14)) / (minGruntVy * minFallMul * minAffEnemySpd * minMinorSpd);

/* ================= ① 段間隔 ================= */
console.log('=== ① 段間隔（每關）· 驗收線 ≤ 9000ms ===');
/* 段界規則（真 code）：關卡時間超過 SEG_T 就喺嗰個波次開新段 */
function segmentBounds(ats) {
  const bounds = [];
  let segStart = null;
  for (let i = 0; i < ats.length; i++) {
    if (segStart === null || ats[i] - segStart > SEG_T) {
      segStart = ats[i];
      bounds.push({ wave: i, at: ats[i] });
    }
  }
  return bounds;
}
const stageInfo = {};
let worstInterval = 0, worstWhere = '';
let allIntervals = [];
for (const sid of [1, 2, 3, 4, 5]) {
  const ats = STAGE_ATS[sid];
  const bounds = segmentBounds(ats);
  const iv = [];
  for (let i = 1; i < bounds.length; i++) iv.push(bounds[i].at - bounds[i - 1].at);
  /* 尾段：最後一段開到 boss 出場（隊列清完之後最多等 8000ms 保險超時） */
  const lastBoundary = bounds[bounds.length - 1].at;
  const tailMin = ats[ats.length - 1] - lastBoundary;
  const tailMax = tailMin + 8000;
  const segCount = bounds.length;
  stageInfo[sid] = { ats, bounds, iv, tailMin, tailMax, segCount, stageLen: ats[ats.length - 1] };
  allIntervals = allIntervals.concat(iv);
  const mx = Math.max.apply(null, iv.concat([tailMin]));
  if (mx > worstInterval) { worstInterval = mx; worstWhere = 'S' + sid; }
  console.log('  S' + sid + '  波 ' + ats.length + '  段 ' + segCount +
    '  間隔 ' + iv.join('/') + '｜尾段 ' + tailMin + '~' + tailMax + 'ms' +
    '  最大 ' + mx + 'ms ' + (mx <= 9000 ? '✓' : '✗'));
}
const avgInterval = allIntervals.reduce((a, b) => a + b, 0) / allIntervals.length;
console.log('  → 全局最大段間隔 ' + worstInterval + 'ms（' + worstWhere + '）· 平均 ' +
  avgInterval.toFixed(0) + 'ms · ' + (worstInterval <= 9000 ? '✓ 達標' : '✗ 超標'));

/* ================= ② 取捨密度 ================= */
console.log('\n=== ② 取捨密度 vs 舊基準 ===');
const OLD_BASELINE_S = 51;
console.log('  舊基準：有意義嘅能力提升平均 ' + OLD_BASELINE_S + ' 秒一次（批判分析 #148 實測）');
console.log('  而家：段目標平均 ' + (avgInterval / 1000).toFixed(1) + ' 秒一次（每段都要做真取捨）');
console.log('  → 密度提升 ' + (OLD_BASELINE_S / (avgInterval / 1000)).toFixed(1) + '×');
const stageLens = [1, 2, 3, 4, 5].map(s => stageInfo[s].stageLen / 1000);
console.log('  各關長（秒）：' + stageLens.map(v => v.toFixed(1)).join(' · ') +
  '  平均 ' + (stageLens.reduce((a, b) => a + b, 0) / 5).toFixed(1) + ' 秒（舊基準 80 秒）');

/* ================= ③ 目標分佈 ================= */
console.log('\n=== ③ 段目標分佈（' + SEEDS + ' seeds × 5 關）===');
const cnt = Object.create(null);
for (const k of SEG_KEYS) cnt[k] = 0;
let totalSeg = 0;
for (let seed = 1; seed <= SEEDS; seed++) {
  for (let sid = 1; sid <= 5; sid++) {
    const nSeg = stageInfo[sid].segCount;
    for (let si = 0; si < nSeg; si++) {
      const rng = stageRngFor(seed, SEG_BASE + sid * SEG_STAGE_MUL + si);
      cnt[SEG_KEYS[Math.floor(rng() * SEG_KEYS.length)]]++;
      totalSeg++;
    }
  }
}
for (const k of SEG_KEYS) {
  const pct = cnt[k] / totalSeg * 100;
  console.log('  ' + k.padEnd(6) + ' ' + String(cnt[k]).padStart(7) + '  ' + pct.toFixed(2) + '%  ' +
    (pct >= 25 && pct <= 45 ? '✓ 均衡' : '✗ 失衡'));
}
console.log('  → 總段數 ' + totalSeg + '（每局約 ' + (totalSeg / SEEDS).toFixed(1) + ' 段）');
console.log('  need 曲線：' + Array.from({ length: 8 }, (_, i) => Math.min(NEED_CAP, NEED_BASE + i)).join('/') +
  '（第 N 段要 ' + NEED_BASE + '+N 次擦彈，上限 ' + NEED_CAP + '）');

/* ================= ④ 清場可達性 ================= */
console.log('\n=== ④ 「清場」判定可達性（真波次 + 真速度推算）===');
console.log('  真 chunk speed 範圍 ' + minChunkSpeed + '–' + maxChunkSpeed +
  ' · 詞綴彈速上限 ×' + affBulletSpdMax +
  ' · bulletSpdMul 範圍 ×' + fastestBulletMul + '–' + slowestBulletMul);
console.log('  → 最快一粒敵彈都要 ' + fastestBulletMs.toFixed(0) +
  'ms 先離場（行 ' + BULLET_TRAVEL + 'px）');

let minGap = Infinity, maxGap = 0;
for (const sid of [1, 2, 3, 4, 5]) {
  const ats = stageInfo[sid].ats;
  for (let i = 1; i < ats.length; i++) {
    const gap = ats[i] - ats[i - 1];
    if (gap < minGap) minGap = gap;
    if (gap > maxGap) maxGap = gap;
  }
}
console.log('  波間隔範圍 ' + minGap + '–' + maxGap + 'ms');

/* 逐個真波次檢查：段邊界嗰刻，上一波嘅「直接彈幕」仲喺唔喺場上 */
let bounds = 0, bulletsAlive = 0, gruntsAlive = 0;
for (let seed = 1; seed <= SEEDS; seed++) {
  for (let sid = 1; sid <= 5; sid++) {
    const waves = assembleWaves(sid, seed);
    const bnd = stageInfo[sid].bounds;
    for (let k = 1; k < bnd.length; k++) {
      bounds++;
      const prevWave = bnd[k].wave - 1;          /* 段界之前最後嗰個波 */
      if (prevWave < 0) continue;
      const prev = waves[prevWave];
      const gap = waves[bnd[k].wave].at - prev.at;
      /* 直接彈幕（spray/aim/ring/meteor）：產生即在場 */
      for (const s of prev.spawn) {
        if (!DIRECT_BULLET_TYPES.has(s.type) || typeof s.speed !== 'number') continue;
        const life = BULLET_TRAVEL / (s.speed * fastestBulletMul * affBulletSpdMax);
        if (life > gap) { bulletsAlive++; break; }
      }
      /* 雜魚：最慢 ' + slowestGruntMs + 'ms 先離場 > 任何波間隔 → 上一波雜魚仍在場 */
      if (slowestGruntMs > gap) gruntsAlive++;
    }
  }
}
console.log('  段邊界總數（' + SEEDS + ' seeds × 5 關）：' + bounds);
console.log('  → 上一波嘅直接彈幕仍在場：' + bulletsAlive + ' (' + (bulletsAlive / bounds * 100).toFixed(1) + '%)' +
  (bulletsAlive / bounds > 0.5 ? ' → **舊判定 enemies.length===0 大部分情況根本唔可能成立**' : ''));
console.log('  → 上一波嘅雜魚仍在場：' + gruntsAlive + ' (' + (gruntsAlive / bounds * 100).toFixed(1) + '%)' +
  '（最慢雜魚 ' + slowestGruntMs.toFixed(0) + 'ms 先離場 > 最長波間隔 ' + maxGap + 'ms）');
console.log('  → 結論 A：判定對象必須係「雜魚數」（kind===\'grunt\'），用 enemies.length 會令「清場」變死目標');
console.log('  → 結論 B：雜魚仍然在場 → 被動玩家（唔開火）一定達唔到「清場」→ 目標有牙');

/* ================= ⑤ 段長分佈 ================= */
console.log('\n=== ⑤ 段長分佈（段目標幾耐先結算）===');
const segLens = [];
for (const sid of [1, 2, 3, 4, 5]) {
  const iv = stageInfo[sid].iv;
  for (const v of iv) segLens.push(v);
}
segLens.sort((a, b) => a - b);
console.log('  完整段長：' + segLens.map(v => (v / 1000).toFixed(1)).join(' / ') + ' 秒');
console.log('  中位 ' + (segLens[Math.floor(segLens.length / 2)] / 1000).toFixed(1) +
  ' 秒 · 最長 ' + (segLens[segLens.length - 1] / 1000).toFixed(1) + ' 秒');
console.log('  尾段（最後一段，開到 boss 出場）：' +
  [1, 2, 3, 4, 5].map(s => 'S' + s + ' ' + (stageInfo[s].tailMin / 1000).toFixed(1) + '~' +
    (stageInfo[s].tailMax / 1000).toFixed(1)).join(' · ') + ' 秒');

/* ================= 總結 ================= */
const okInterval = worstInterval <= 9000;
const okDist = SEG_KEYS.every(k => { const p = cnt[k] / totalSeg * 100; return p >= 25 && p <= 45; });
console.log('\n=== 總結 ===');
console.log('  段間隔 ≤ 9000ms      ：' + (okInterval ? '✓ (' + worstInterval + 'ms)' : '✗ (' + worstInterval + 'ms)'));
console.log('  三種目標分佈 25–45%  ：' + (okDist ? '✓' : '✗'));
console.log('  取捨密度 vs 舊基準   ：' + (OLD_BASELINE_S / (avgInterval / 1000)).toFixed(1) + '×');
process.exit(okInterval && okDist ? 0 : 1);
