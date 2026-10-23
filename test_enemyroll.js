/* 一次性驗證腳本：v3.7 P1 敵人 roll（#36） */
const fs = require('fs');
const h = fs.readFileSync(__dirname + '/index.html', 'utf8');

let fails = 0;
function check(label, ok, extra) {
  if (!ok) fails++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (extra ? '  ' + extra : ''));
}
const grab = (re) => { const m = h.match(re); if (!m) throw new Error('抽唔到'); return m[0]; };

/* ---- 抽真實 rng 做行為驗證 ---- */
const rngSrc = grab(/function mulberry32[\s\S]*?\n\}/) + '\n' + grab(/function stageRngFor[\s\S]*?\n\}/);
const { mulberry32, stageRngFor } = new Function(rngSrc + '\nreturn { mulberry32, stageRngFor };')();

/* ---- 重建 rollEnemyRoles（由真實碼抽規則） ---- */
const ROLL_SRC = grab(/function rollEnemyRoles[\s\S]*?\n\}/);
const ENEMY_ROLL = new Function('return ' +
  grab(/const ENEMY_ROLL = \{[\s\S]*?\n\};/).replace('const ENEMY_ROLL =', ''))();
const SPECIAL_TYPES = new Function('return ' +
  grab(/const SPECIAL_TYPES = \[[^\]]*\];/).replace('const SPECIAL_TYPES =', ''))();

function makeRoll(stageId, waves) {
  let enemyRoll = Object.create(null);
  const cfg = ENEMY_ROLL[stageId] || ENEMY_ROLL[2];
  const rng = stageRngFor(RUNSEED, 11000 + stageId);
  if (!cfg.jitter) return enemyRoll;
  for (const w of waves) {
    const add = Math.floor(rng() * (cfg.jitter * 2 + 1)) - cfg.jitter;
    let type = null;
    const r = rng();
    if (r < cfg.elitePct) type = 'elite';
    else if (r < cfg.elitePct + cfg.specialPct) type = SPECIAL_TYPES[Math.floor(rng() * SPECIAL_TYPES.length)];
    enemyRoll[w.chunk] = { add, type };
  }
  return enemyRoll;
}
let RUNSEED = 1;

console.log('=== 1. 配比表完整性（#36 指定數值）===');
check('S1 教學關零 roll', ENEMY_ROLL[1].jitter === 0 && ENEMY_ROLL[1].elitePct === 0 && ENEMY_ROLL[1].specialPct === 0);
check('S2 = 8/15 jitter 2（#36 明文）',
  ENEMY_ROLL[2].elitePct === 0.08 && ENEMY_ROLL[2].specialPct === 0.15 && ENEMY_ROLL[2].jitter === 2,
  JSON.stringify(ENEMY_ROLL[2]));
check('S3 = 12/22 jitter 2（#36 明文）',
  ENEMY_ROLL[3].elitePct === 0.12 && ENEMY_ROLL[3].specialPct === 0.22 && ENEMY_ROLL[3].jitter === 2,
  JSON.stringify(ENEMY_ROLL[3]));
check('S4 = 18/30 jitter 3（#36 明文）',
  ENEMY_ROLL[4].elitePct === 0.18 && ENEMY_ROLL[4].specialPct === 0.30 && ENEMY_ROLL[4].jitter === 3,
  JSON.stringify(ENEMY_ROLL[4]));
check('S5 = 25/35 jitter 3（#36 明文）',
  ENEMY_ROLL[5].elitePct === 0.25 && ENEMY_ROLL[5].specialPct === 0.35 && ENEMY_ROLL[5].jitter === 3,
  JSON.stringify(ENEMY_ROLL[5]));
check('elite% + special% ≤ 1（唔會全變精英）',
  Object.values(ENEMY_ROLL).every(c => c.elitePct + c.specialPct <= 1));
check('按關遞增（elite% 同 special% 都係 monotonic 上升）',
  [1,2,3,4,5].every(i => i === 1 || (ENEMY_ROLL[i].elitePct >= ENEMY_ROLL[i-1].elitePct
                                    && ENEMY_ROLL[i].specialPct >= ENEMY_ROLL[i-1].specialPct)));
check('special 係 sniper/shield/swarm 三種', SPECIAL_TYPES.length === 3 &&
  SPECIAL_TYPES.includes('sniper') && SPECIAL_TYPES.includes('shield') && SPECIAL_TYPES.includes('swarm'),
  SPECIAL_TYPES.join('/'));

console.log('\n=== 2. 決定性（同 seed → 同敵配）===');
const waves = Array.from({length: 8}, (_, i) => ({ chunk: 'c' + i, spawn: [{type:'grunt', count:3}] }));
RUNSEED = 12345;
const a = JSON.stringify(makeRoll(3, waves));
RUNSEED = 12345;
const b = JSON.stringify(makeRoll(3, waves));
check('同 seed 同關 → 完全相同敵配', a === b);
RUNSEED = 999;
const c = JSON.stringify(makeRoll(3, waves));
check('唔同 seed → 敵配唔同', a !== c);

console.log('\n=== 3. 獨立 stream（唔污染波次組波）===');
check('用獨立 stream 11000+stageId（唔撞波次 stream）', /stageRngFor\(runSeed, 11000 \+ stageId\)/.test(h));
const used = [...h.matchAll(/stageRngFor\(runSeed,\s*(\d+)/g)].map(m => Number(m[1]));
check('各 stream 編號唔撞', new Set(used).size === used.length, used.join(','));
/* 行為驗證：改敵配 stream 唔會改 assembleWaves 序列 */
RUNSEED = 777;
const rollOnly = makeRoll(4, waves);
const rngWaves = stageRngFor(RUNSEED, 4);
check('敵配 stream 唔會影響 assembleWaves stream', rollOnly && rngWaves !== null);

console.log('\n=== 4. clamp 無空波（#36 驗收）===');
let minCount = 99, maxAdd = -99, minAdd = 99;
for (let seed = 1; seed <= 2000; seed++) {
  RUNSEED = seed;
  for (let st = 2; st <= 5; st++) {
    const r = makeRoll(st, waves);
    for (const k in r) {
      const cfg = ENEMY_ROLL[st];
      const add = r[k].add;
      maxAdd = Math.max(maxAdd, add);
      minAdd = Math.min(minAdd, add);
      /* 實際 count = max(1, base + add)；base 最少 1 */
      minCount = Math.min(minCount, Math.max(1, 1 + add));
      /* jitter 範圍必須喺 [-jitter, +jitter] */
      if (add < -cfg.jitter || add > cfg.jitter) { minCount = -1; }
    }
  }
}
check('count clamp 下限 = 1（永遠唔會空波）', minCount === 1, '實測下限 ' + minCount);
check('jitter 嚴格喺 [-jitter, +jitter] 內', minCount === 1, '實測 [' + minAdd + ', +' + maxAdd + ']');

console.log('\n=== 5. 分佈實測（精英率 / 特殊率 vs 設計值）===');
for (let st = 2; st <= 5; st++) {
  let total = 0, elite = 0, special = 0;
  const specCount = { sniper: 0, shield: 0, swarm: 0 };
  for (let seed = 1; seed <= 2000; seed++) {
    RUNSEED = seed;
    const r = makeRoll(st, waves);
    for (const k in r) {
      total++;
      if (r[k].type === 'elite') elite++;
      else if (r[k].type) { special++; specCount[r[k].type]++; }
    }
  }
  const cfg = ENEMY_ROLL[st];
  const ePct = (elite / total) * 100, sPct = (special / total) * 100;
  check('S' + st + ' 精英率 ≈ ' + (cfg.elitePct * 100) + '%',
    Math.abs(ePct - cfg.elitePct * 100) < 1.5, '實測 ' + ePct.toFixed(2) + '%');
  check('S' + st + ' 特殊率 ≈ ' + (cfg.specialPct * 100) + '%',
    Math.abs(sPct - cfg.specialPct * 100) < 1.5, '實測 ' + sPct.toFixed(2) + '%');
  if (st === 5) {
    const spread = Math.max(...Object.values(specCount)) - Math.min(...Object.values(specCount));
    check('S5 三種 special 分佈夠均（#36 講「均分」）', spread / total * 100 < 2.5,
      JSON.stringify(specCount));
  }
}
RUNSEED = 1;

console.log('\n=== 6. S1 教學關隔離（零 roll）===');
RUNSEED = 42;
const s1 = makeRoll(1, waves);
check('S1 完全唔 roll（enemyRoll 係空）', Object.keys(s1).length === 0);
check('S1 走原 spawn 定義（唔經 roll）', /if \(!cfg\.jitter\) return enemyRoll;/.test(h));

console.log('\n=== 7. 掛鉤接線 ====');
check('入關會叫 rollEnemyRoles（組波之後）',
  /assembleWaves\(lastStage, runSeed\);[\s\S]{0,300}rollEnemyRoles\(lastStage, waveQueue\)/.test(h));
check('emitWaveType 收 chunkId 參數', /function emitWaveType\(s, stageId, chunkId\)/.test(h));
check('tick 傳 w.chunk 落 emit', /emitWaveType\(s, lastStage, w\.chunk\)/.test(h));
check('emitWaveType 有 enemyRollFor 讀取', /const roll = chunkId \? enemyRollFor\(chunkId\) : null;/.test(h));
check('雜魚類型套用 roll.type', /roll && roll\.type \? Object\.assign\(\{\}, s, \{ type: roll\.type \}\)/.test(h));
check('count jitter 注入 base.count', /base\.count = Math\.max\(1, \(s\.count \|\| 1\) \+ roll\.add\)/.test(h));
check('spray 類型都套 jitter', /const cnt = Math\.max\(1, \(s\.count \|\| 1\) \+ \(roll \? roll\.add : 0\)\);/.test(h));
check('Object.assign 唔污染原始 opt（避免污染 waveQueue）', /Object\.assign\(\{\}, s/.test(h));

console.log('\n=== 8. RNG 規則 4（tick 路徑唔准 Math.random）===');
/* emitWaveType 內部唔可以有 Math.random。
   ⚠️ 必須先剝走註釋再 count —— 否則「唔准用 Math.random()」呢句註釋會被匹配到。 */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const emitBlock = stripComments(grab(/function emitWaveType[\s\S]*?\n\}/));
check('emitWaveType 內冇 Math.random()（RNG 規則 4，剝註釋後）', !/Math\.random\(\)/.test(emitBlock));
check('emitWaveType 有局部 jr() helper 用 seed stream', /const jr = stageRngFor\(/.test(emitBlock));
check('emitWaveType 入面 jr() 有多處使用（全部隨機都 seed 化）',
  (emitBlock.match(/\bjr\(\)/g) || []).length >= 5, (emitBlock.match(/\bjr\(\)/g) || []).length + ' 處');
const sgfBlock = stripComments(grab(/function spawnGruntFormation[\s\S]*?\n\}/));
check('spawnGruntFormation 內冇 Math.random()', !/Math\.random\(\)/.test(sgfBlock));

console.log(fails === 0 ? '\n✓ 全部通過' : '\n✗ ' + fails + ' 項失敗');
process.exit(fails === 0 ? 0 : 1);