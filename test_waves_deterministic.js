/* 確定性波次守門（PLAN #139 · 收 MECHANICS_REVIEW_v034.md #7 + #11）
 *
 * ⚠️ 點解要有呢個檔：
 *   ① 實機 bot 逐關用時**方差 5.2×**（同版本同 seed 可差 5.2 倍）→ 做唔到難度指標
 *   ② 實機畫面取樣（威脅 CV / 敵彈數）離散度更大 —— v0.35.0 實測同版本重跑
 *      S4「敵彈均」差 54.7%、S5 差 102.2% → **唔可以用嚟比版本**
 *   ③ 所以改用**確定性統計**：直接行真 `assembleWaves()` + 真 `rollEnemyRoles()`，
 *      蒙地卡羅 N 局 → 結果係純統計、離散度近乎 0 → 可以做守門線。
 *
 * 本檔守住三條**唔會受噪聲影響**嘅 invariant：
 *   A. 空波率 = 0%（v0.34.0 #126：splitter / rammer / lancer 冇 switch case → 生成 0 隻）
 *   B. 同一關內重複 chunk 嘅波對，敵配**唔可以全部一樣**（v0.35.0 #131：per-wave roll）
 *   C. 每關至少有一對「重複 chunk 但敵配唔同」嘅波對（證明 per-wave roll 真係生效）
 */
const path = require('path');
const { harness } = require('./tools/difficulty_mc.js');

const HTML = path.join(__dirname, 'index.html');
const RUNS = 400;

let fails = 0;
function check(label, ok, extra) {
  if (!ok) fails++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (extra ? '  ' + extra : ''));
}

const h = harness(HTML, RUNS);
console.log('=== 確定性波次守門（蒙地卡羅 ' + RUNS + ' 局 × 5 關 · 真 assembleWaves + 真 rollEnemyRoles）===');

/* ---------- A. 空波率 = 0%（#126 修正守住） ---------- */
console.log('\n--- A. 空波率（每波都要有敵人出場）---');
for (const sid of [1, 2, 3, 4, 5]) {
  check('★ S' + sid + ' 空波率 = 0%', h[sid].emptyWavePct === 0, h[sid].emptyWavePct.toFixed(3) + '%');
}

/* ---------- B + C. 重複 chunk 嘅波對，敵配唔可以全部一樣（#131） ---------- */
console.log('\n--- B/C. 重複 chunk 波對嘅敵配獨立性（#131 per-wave roll）---');
for (const sid of [1, 2, 3, 4, 5]) {
  const same = h[sid].dupPairSamePct;
  /* S1 教學關唔 roll（ENEMY_ROLL[1].jitter = 0）→ 重複 chunk 出兩次同一組敵人係刻意設計 */
  if (sid === 1) {
    check('S1（教學關唔 roll）重複 chunk 敵配相同 = 100%（刻意設計）', same === 100, same.toFixed(1) + '%');
  } else {
    check('★ S' + sid + ' 重複 chunk 波對：敵配唔會全部一樣（< 100%）', same < 100, same.toFixed(1) + '%');
    /* ⚠️ v0.45 #156：波次 ×3.7（7 → 26-32）· 「獨有敵配 / 波數」呢個**比例**會被稀釋
     *    （波數多過敵配空間 ⇒ 比例必然跌，唔代表變化度變差）⇒ 改用**絕對值**守住真正嘅意圖：
     *      S2 5.63 → 12.01 · S3 7.03 → 17.55 · S4 7.04 → 20.04 · S5 10.14 → 25.10 個/局
     *    比例只留一個好鬆嘅地板（防離譜收窄 pool），唔再當主要守門。*/
    const OLD_BASE = { 2: 5.63, 3: 7.03, 4: 7.04, 5: 10.14 };
    check('★ S' + sid + ' 每局獨有敵配數 ≥ 舊基線（v0.43：' + OLD_BASE[sid] + ' · 變化度絕對值唔可以跌）',
      h[sid].uniqComps >= OLD_BASE[sid], h[sid].uniqComps.toFixed(2) + ' 個/局');
    check('★ S' + sid + ' 波次間敵配多樣度 ≥ 25%（比例地板 · 唔係主要守門）',
      h[sid].uniqWavePct >= 25, h[sid].uniqWavePct.toFixed(1) + '%');
  }
}

/* ---------- D. 強度指標合理範圍（防止日後改 pool 改到離譜） ---------- */
console.log('\n--- D. 強度指標範圍（防離譜改動）---');
const LIMITS = {
  1: { body: [1.5, 3.5], hp: [12, 30] },
  2: { body: [0.8, 2.5], hp: [10, 22] },
  3: { body: [1.0, 2.5], hp: [14, 26] },
  4: { body: [2.0, 4.5], hp: [32, 58] },
  5: { body: [2.0, 4.5], hp: [30, 55] },
};
for (const sid of [1, 2, 3, 4, 5]) {
  const L = LIMITS[sid];
  check('S' + sid + ' 身體數/波 ∈ [' + L.body[0] + ', ' + L.body[1] + ']',
    h[sid].bodyPerWave >= L.body[0] && h[sid].bodyPerWave <= L.body[1], '= ' + h[sid].bodyPerWave.toFixed(2));
  check('S' + sid + ' 威脅血量/波 ∈ [' + L.hp[0] + ', ' + L.hp[1] + ']',
    h[sid].hpPerWave >= L.hp[0] && h[sid].hpPerWave <= L.hp[1], '= ' + h[sid].hpPerWave.toFixed(1));
}

/* ---------- E. 確定性自檢：同參數跑兩次，結果必須一模一樣 ---------- */
console.log('\n--- E. 工具本身嘅確定性（同參數跑兩次要一模一樣）---');
{
  const h2 = harness(HTML, 200);
  const h3 = harness(HTML, 200);
  let same = true;
  for (const sid of [1, 2, 3, 4, 5]) {
    for (const k of ['bodyPerWave', 'projPerWave', 'hpPerWave', 'dupPairSamePct', 'uniqWavePct']) {
      if (Math.abs(h2[sid][k] - h3[sid][k]) > 1e-9) same = false;
    }
  }
  check('★ 同一參數兩次跑，結果完全一致（離散度 = 0）', same);
}

console.log('\n' + (fails === 0 ? '✅ 全部通過' : '❌ ' + fails + ' 項失敗'));
process.exit(fails === 0 ? 0 : 1);
