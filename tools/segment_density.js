/* tools/segment_density.js — 壓力段制密度量測（PLAN #150 · #151 · #152）
 *
 * 點解要呢個工具：
 *   批判分析（#148）實測出「有意義嘅能力提升平均 51 秒一次、各關平均長 80 秒」→
 *   玩家喺一關之內只改變得自己一次，等待被當成遊玩。壓力段制就係要
 *   **把取捨密度由 ~51 秒一次壓到 ~11 秒一次**。呢個數字唔可以靠感覺 → 必須實測。
 *
 * v0.41.0 #152：段長（segT）同 need 上限（cap）由**難度檔**決定 → 工具要逐檔量。
 *   段目標三檔由真 source 抽出（SEG_DIFFS），唔手抄、唔硬編碼。
 *
 * 量測六件事（全部由 index.html 真 source 抽出，唔手抄）：
 *   ① 段長        —— 每關嘅段長（驗收線 = segT + 最長波間隔，結構保證）
 *   ② 取捨密度    —— 段事件 / 分鐘 vs 舊基準 51 秒一次
 *   ③ 目標分佈    —— kill / clear / safe 三種目標嘅出現率（要夠平均，唔可以有死目標）
 *   ④ 清場可達性  —— 證明「只計雜魚」先係啱嘅判定（enemies.length 幾乎永遠達唔到）
 *   ⑤ 段內身體敵數分佈 —— 決定「擊殺 N 隻」嘅 N 上限（避免死目標）
 *   ⑥ need 規則   —— min(cap, base+段序, 本段第一波身體敵數) 嘅實際分佈 + 每隻幾多秒
 *
 * 用法：
 *   node tools/segment_density.js [index.html] [SEEDS] [SEG_T 覆寫] [cap 覆寫]
 *   （唔覆寫 = 逐檔量 SEG_DIFFS 三檔；覆寫 = 手動掃「段長 vs 密度 vs need」嘅取捨）
 *
 * ⚠️ 口徑說明（唔好亂改）：
 *   - 段邊界 = 關卡時間超過 segT 就喺嗰個波次開新段（真 code：tick() 內 segCfg().segT）
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
/* v0.41.0 #152：段目標難度三檔（真 source，唔手抄） */
const SEG_DIFFS      = obj(/const SEG_DIFFS = \[[\s\S]*?\n\];/, 'SEG_DIFFS');

const mulberry32  = eval('(' + grab(/function mulberry32\([\s\S]*?\n\}/) + ')');
const stageRngFor = eval('(' + grab(/function stageRngFor\([\s\S]*?\n\}/) + ')');
const pickChunkId = eval('(' + grab(/function pickChunkId\([\s\S]*?\n\}/) + ')');
/* stylePool() 會讀本關風格；本工具唔模擬風格（null = 唔加權，同 stylePool 嘅預設路徑一致） */
let stageStyle = null;
const stylePool   = eval('(' + grab(/function stylePool\([\s\S]*?\n\}/) + ')');
/* 敵配 roll（計每波真實雜魚數用） */
const ENEMY_ROLL     = obj(/const ENEMY_ROLL = \{[\s\S]*?\n\};/, 'ENEMY_ROLL');
const SPECIAL_TYPES  = eval('(' + stripSemi(grab(/const SPECIAL_TYPES = \[[^\]]*\];/).replace(/const\s+SPECIAL_TYPES\s*=\s*/, '')) + ')');
let runSeed = 0;
let enemyRoll = Object.create(null);
const poolEnemyTypes = eval('(' + grab(/function poolEnemyTypes\([\s\S]*?\n\}/) + ')');
const rollEnemyRoles = eval('(' + grab(/function rollEnemyRoles\([\s\S]*?\n\}/) + ')');
/* 身體敵（會生成 grunt 實體）嘅 spawn type；其餘（spray/aim/ring/meteor）只出彈幕 */
const BODY_TYPES = new Set(['grunt','dive','elite','sniper','shield','swarm','medic','chaser',
  'bomber','turret','splitter','rammer','lancer']);

/* 段目標池（有身體敵 / 純彈幕段）—— 由真 source 抽 */
const SEG_POOL_BODY   = eval('(' + grab(/const SEG_POOL_BODY\s*=\s*\[[^\]]*\]/).replace(/const\s+SEG_POOL_BODY\s*=\s*/, '') + ')');
const SEG_POOL_BULLET = eval('(' + grab(/const SEG_POOL_BULLET\s*=\s*\[[^\]]*\]/).replace(/const\s+SEG_POOL_BULLET\s*=\s*/, '') + ')');
const VIEW_H    = Number(cap(/const VIEW_H\s*=\s*(\d+)/));
const SEG_KEYS  = eval('(' + grab(/const SEG_KEYS\s*=\s*\[[^\]]*\]/).replace(/const\s+SEG_KEYS\s*=\s*/, '') + ')');
/* 段目標 stream 公式（由 source 抽，唔硬編碼） */
const sm = h.match(/stageRngFor\(runSeed,\s*(\d+)\s*\+\s*lastStage\s*\*\s*(\d+)\s*\+\s*segIndex\)/);
if (!sm) throw new Error('抽唔到段目標 rng stream 公式');
const SEG_BASE = Number(sm[1]), SEG_STAGE_MUL = Number(sm[2]);
/* need 曲線：min(segCfg().cap, base + segIndex, 本段第一波身體敵數) —— base 由 source 抽 */
const NEED_BASE = Number(cap(/Math\.min\(segCfg\(\)\.cap,\s*(\d+)\s*\+\s*segIndex/, 1));
/* v0.41.0 #152：預設檔 = source 入面 segDiffIdx 嘅初值（唔硬編碼） */
const DEFAULT_TIER = Number(cap(/let segDiffIdx\s*=\s*(\d+)/));

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

/* ---------- 所有段（真波次 + 真 roll + 時間制段界） ---------- */
function allSegments(segT) {
  const out = [];
  for (let seed = 1; seed <= SEEDS; seed++) {
    runSeed = seed;
    for (let sid = 1; sid <= 5; sid++) {
      const waves = assembleWaves(sid, seed);
      const rolls = rollEnemyRoles(sid, waves) || {};
      const perWave = waves.map((w, wi) => {
        const r = rolls[wi];
        let n = 0;
        for (const s of w.spawn) {
          if (!BODY_TYPES.has(s.type)) continue;
          n += Math.max(1, (s.count || 1) + (r ? r.add : 0));
        }
        return n;
      });
      let segStart = null, acc = 0, first = 0, segIdx = -1;
      const bounds = [];
      for (let i = 0; i < waves.length; i++) {
        if (segStart === null || waves[i].at - segStart > segT) {
          if (segStart !== null) { out.push({ seed, sid, segIdx, firstBody: first, totalBody: acc, dur: waves[i].at - segStart }); bounds.push(waves[i].at); }
          segStart = waves[i].at; acc = 0; first = perWave[i]; segIdx++;
        }
        acc += perWave[i];
      }
      if (segStart !== null) out.push({ seed, sid, segIdx, firstBody: first, totalBody: acc, dur: null });
    }
  }
  return out;
}

/* ---------- 量一檔（segT + cap） ---------- */
function runTier(label, segT, capN) {
  console.log('\n############ 檔位：' + label + '（segT ' + segT + 'ms · cap ' + capN + '）############');

  /* ================= ① 段長 ================= */
  console.log('=== ① 段長（每關）· 驗收線 = segT + 最長波間隔 ===');
  function segmentBounds(ats) {
    const bounds = [];
    let segStart = null;
    for (let i = 0; i < ats.length; i++) {
      if (segStart === null || ats[i] - segStart > segT) {
        segStart = ats[i];
        bounds.push({ wave: i, at: ats[i] });
      }
    }
    return bounds;
  }
  const stageInfo = {};
  let worstInterval = 0, worstWhere = '';
  let allIntervals = [];
  let minGap = Infinity, maxGap = 0;
  for (const sid of [1, 2, 3, 4, 5]) {
    const ats = STAGE_ATS[sid];
    for (let i = 1; i < ats.length; i++) {
      const gap = ats[i] - ats[i - 1];
      if (gap < minGap) minGap = gap;
      if (gap > maxGap) maxGap = gap;
    }
  }
  const LINE = segT + maxGap;   /* 結構保證：段長 ≤ segT + 最長波間隔 */
  for (const sid of [1, 2, 3, 4, 5]) {
    const ats = STAGE_ATS[sid];
    const bounds = segmentBounds(ats);
    const iv = [];
    for (let i = 1; i < bounds.length; i++) iv.push(bounds[i].at - bounds[i - 1].at);
    /* 尾段：最後一段開到 boss 出場（隊列清完之後最多等 segT 保險超時） */
    const lastBoundary = bounds[bounds.length - 1].at;
    const tailMin = ats[ats.length - 1] - lastBoundary;
    const tailMax = tailMin + segT;
    const segCount = bounds.length;
    stageInfo[sid] = { ats, bounds, iv, tailMin, tailMax, segCount, stageLen: ats[ats.length - 1] };
    allIntervals = allIntervals.concat(iv);
    const mx = Math.max.apply(null, iv.concat([tailMin]));
    if (mx > worstInterval) { worstInterval = mx; worstWhere = 'S' + sid; }
    console.log('  S' + sid + '  波 ' + ats.length + '  段 ' + segCount +
      '  段長 ' + iv.join('/') + '｜尾段 ' + tailMin + '~' + tailMax + 'ms' +
      '  最大 ' + mx + 'ms ' + (mx <= LINE ? '✓' : '✗'));
  }
  const avgInterval = allIntervals.reduce((a, b) => a + b, 0) / allIntervals.length;
  console.log('  → 全局最大段長 ' + worstInterval + 'ms（' + worstWhere + '）· 平均 ' +
    avgInterval.toFixed(0) + 'ms · 驗收線 ' + LINE + 'ms ' + (worstInterval <= LINE ? '✓ 達標' : '✗ 超標'));

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
  const realLog = console.log;
  console.log = () => {};   /* rollEnemyRoles 會 console.log 敵配 → 收埋 */
  const SEGS = allSegments(segT);
  console.log = realLog;
  const cnt = Object.create(null);
  for (const k of SEG_KEYS) cnt[k] = 0;
  let totalSeg = 0;
  for (const sg of SEGS) {
    const rng = stageRngFor(sg.seed, SEG_BASE + sg.sid * SEG_STAGE_MUL + sg.segIdx);
    const pool = sg.firstBody > 0 ? SEG_POOL_BODY : SEG_POOL_BULLET;
    cnt[pool[Math.floor(rng() * pool.length)]]++;
    totalSeg++;
  }
  for (const k of SEG_KEYS) {
    const pct = cnt[k] / totalSeg * 100;
    console.log('  ' + k.padEnd(6) + ' ' + String(cnt[k]).padStart(7) + '  ' + pct.toFixed(2) + '%  ' +
      (pct >= 25 && pct <= 45 ? '✓ 均衡' : '✗ 失衡'));
  }
  console.log('  → 總段數 ' + totalSeg + '（每局約 ' + (totalSeg / SEEDS).toFixed(1) + ' 段）');
  const noBody = SEGS.filter(sg => sg.firstBody === 0).length / SEGS.length * 100;
  console.log('  → ' + noBody.toFixed(1) + '% 嘅段第一波冇身體敵（純彈幕波）→ 派 {清場, 零傷}，唔派「擊殺」');

  /* ================= ④ 清場可達性 ================= */
  console.log('\n=== ④ 「清場」判定可達性（真波次 + 真速度推算）===');
  console.log('  真 chunk speed 範圍 ' + minChunkSpeed + '–' + maxChunkSpeed +
    ' · 詞綴彈速上限 ×' + affBulletSpdMax +
    ' · bulletSpdMul 範圍 ×' + fastestBulletMul + '–' + slowestBulletMul);
  console.log('  → 最快一粒敵彈都要 ' + fastestBulletMs.toFixed(0) +
    'ms 先離場（行 ' + BULLET_TRAVEL + 'px）');
  console.log('  波間隔範圍 ' + minGap + '–' + maxGap + 'ms');

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

  /* ================= ⑤ 段內身體敵數分佈 ================= */
  console.log('\n=== ⑤ 段內身體敵數分佈（決定「擊殺 N 隻」嘅 N）===');
  const segEnemies = SEGS.map(sg => sg.totalBody);
  const sorted = segEnemies.slice().sort((a, b) => a - b);
  const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  console.log('  樣本 ' + sorted.length + ' 段 · min ' + sorted[0] + ' · p5 ' + pct(0.05) +
    ' · p25 ' + pct(0.25) + ' · 中位 ' + pct(0.5) + ' · p75 ' + pct(0.75) +
    ' · p95 ' + pct(0.95) + ' · max ' + sorted[sorted.length - 1]);

  /* ---- ⑤b need 規則：need = min(cap, base+段序, 本段第一波身體敵數) ----
     段界時 waveQueue 已經組好（入關時 assembleWaves）+ enemyRoll 已经 roll 咗
     → 段界嗰刻已知第一波會有幾多隻身體敵 → need 用第一波敵人數做上限 = 保證可達。 */
  console.log('\n=== ⑤b need 規則（min(' + capN + ', ' + NEED_BASE + '+段序, 本段第一波身體敵數)）===');
  const fSorted = SEGS.map(sg => sg.firstBody).sort((a, b) => a - b);
  console.log('  第一波身體敵數：min ' + fSorted[0] + ' · p25 ' + fSorted[Math.floor(fSorted.length * 0.25)] +
    ' · 中位 ' + fSorted[Math.floor(fSorted.length * 0.5)] + ' · p75 ' + fSorted[Math.floor(fSorted.length * 0.75)] +
    ' · max ' + fSorted[fSorted.length - 1]);
  const zeroFirst = fSorted.filter(v => v === 0).length / fSorted.length * 100;
  console.log('  → ' + zeroFirst.toFixed(1) + '% 嘅段第一波冇身體敵（純彈幕波）→ 呢啲段唔派「擊殺」目標');
  {
    const hist = { '0': 0, '1': 0, '2': 0, '3': 0, '4+': 0 };
    let sumNeed = 0, nNeed = 0, sumRatio = 0, nRatio = 0;
    for (const sg of SEGS) {
      const need = Math.min(capN, NEED_BASE + sg.segIdx, sg.firstBody);
      if (need >= 4) hist['4+']++; else hist[String(need)]++;
      if (need >= 1) { sumNeed += need; nNeed++; }
      /* 每隻要幾多時間（段長 ÷ need）—— 學生嘅時間預算 */
      if (need >= 1 && sg.dur) { sumRatio += sg.dur / need; nRatio++; }
    }
    const n = SEGS.length;
    console.log('  need 分佈：' + Object.keys(hist).map(k =>
      k + '→' + (hist[k] / n * 100).toFixed(1) + '%').join('  ') +
      '  平均 need ' + (nNeed ? (sumNeed / nNeed).toFixed(1) : '-') +
      '  每隻要 ' + (nRatio ? (sumRatio / nRatio / 1000).toFixed(1) : '-') + ' 秒');
  }

  const okDist = SEG_KEYS.every(k => { const p = cnt[k] / totalSeg * 100; return p >= 25 && p <= 45; });
  const okInterval = worstInterval <= LINE;
  return {
    label, segT, capN, avgInterval, worstInterval, line: LINE, okInterval, okDist,
    totalSeg, perGame: totalSeg / SEEDS, density: OLD_BASELINE_S / (avgInterval / 1000),
    stageLens,
  };
}

/* ================= 跑檔 ================= */
const SEG_T_OVERRIDE = process.argv[4] ? Number(process.argv[4]) : null;
const CAP_OVERRIDE   = process.argv[5] ? Number(process.argv[5]) : null;

console.log('=== 壓力段密度量測（' + SEEDS + ' seeds × 5 關）· v0.41.0 #152 ===');
console.log('  段目標難度檔（由 index.html 真 source 抽出）：');
for (let i = 0; i < SEG_DIFFS.length; i++) {
  const d = SEG_DIFFS[i];
  console.log('    ' + i + ' = ' + d.name + ' · segT ' + d.segT + 'ms · cap ' + d.cap +
    (i === DEFAULT_TIER ? '   ← 預設' : ''));
}
console.log('  need base（段序起點）= ' + NEED_BASE + ' · 預設檔 index = ' + DEFAULT_TIER);

const results = [];
if (SEG_T_OVERRIDE) {
  const c = CAP_OVERRIDE !== null ? CAP_OVERRIDE
    : (SEG_DIFFS[DEFAULT_TIER] ? SEG_DIFFS[DEFAULT_TIER].cap : 4);
  results.push(runTier('自訂（覆寫）', SEG_T_OVERRIDE, c));
} else {
  for (let i = 0; i < SEG_DIFFS.length; i++) {
    const d = SEG_DIFFS[i];
    results.push(runTier(d.name, d.segT, d.cap));
  }
}

/* ================= 總結 ================= */
console.log('\n=== 總結（三檔對照）===');
console.log('  檔位      segT   cap   平均段長   最大段長   驗收線   段/局   密度     目標分佈');
for (const r of results) {
  console.log('  ' + r.label.padEnd(6) + '  ' + String(r.segT).padStart(5) + '  ' +
    String(r.capN).padStart(3) + '   ' + (r.avgInterval / 1000).toFixed(1) + ' 秒   ' +
    (r.worstInterval / 1000).toFixed(1) + ' 秒   ' + (r.line / 1000).toFixed(1) + ' 秒  ' +
    r.perGame.toFixed(1).padStart(5) + '  ' + r.density.toFixed(1) + '×  ' +
    (r.okDist ? '✓ 均衡' : '✗ 失衡'));
}
const okInterval = results.every(r => r.okInterval);
const okDist = results.every(r => r.okDist);
console.log('  段長 ≤ 驗收線（= segT + 最長波間隔）：' + (okInterval ? '✓' : '✗'));
console.log('  三種目標分佈 25–45%              ：' + (okDist ? '✓' : '✗'));
process.exit(okInterval && okDist ? 0 : 1);
