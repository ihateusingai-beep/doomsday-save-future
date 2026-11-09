/* v0.41.0 守門：壓力段制（PLAN #150 + #151 + #152）
 *
 * 背景：批判分析（#148）實測「有意義嘅能力提升平均 51 秒一次、各關平均長 80 秒」→
 * 玩家喺一關之內只改變得自己一次，等待被當成遊玩。v0.39.0 引入壓力段：
 * 每個段目標（擊殺 N 隻 / 清場 / 零傷），達標即刻改變下一段條件。
 *
 * v0.40.0（#151）：段目標「擦彈」→「擊殺 N 隻」——用戶實測回饋「擦彈對學生太難」
 * （擦彈要主動靠近子彈 20px，對低耐性學生反直覺 + N 曲線超出能力）。
 * ⚠️ 「擊殺」need **必須用本段第一波嘅身體敵數做上限** —— 實測 30% 嘅段第一波
 *    係純彈幕波（零身體敵）→ 固定 N 就係死目標（重蹈 v0.39.0「清場」覆轍）。
 *
 * v0.41.0（#152）：用戶實測回饋「7.5 秒打中 4 隻嘅速率仍然未校準，時間太短」→
 *    ① 段長加到 ~11 秒 ② 段目標難度三檔（簡單／標準／硬），老師喺設定面板揀。
 *    ⚠️ 三檔數值全部實測（tools/segment_density.js）：段長 = segT + 最長波間隔。
 *    ⚠️ 簡單檔刻意**唔**靠加時間做難度 —— 加時間會令「零傷」目標更難（同「簡單」相反）。
 *
 * ⚠️ **結構斷言一定要喺「剝走註解」嘅 source 度做**（假守門陷阱：命中註解 = 假通過）。
 * ⚠️ **數「某 token 出現幾多次」要數成個 pattern**。
 * ⚠️ 本檔係**結構 + 行為**守門；密度數字（段長 / 目標分佈 / 清場可達性）
 *    由 `tools/segment_density.js` 量測（真 source 抽出嚟跑），唔喺呢度重做。
 * ⚠️ 最後一節做**還原驗證**（mutation test）：改壞 source → 守門必須變紅 → 還原，
 *    證明呢啲斷言唔係 vacuous。
 */
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, 'index.html');
const h = fs.readFileSync(SRC, 'utf8');

let fails = 0;
function check(label, ok, extra) {
  if (!ok) fails++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (extra ? '  ' + extra : ''));
}

/* 剝走註解嘅 source —— 結構斷言一定要喺真 code 度做 */
function stripComments(src) {
  let out = '', inC = false;
  for (const line of src.split('\n')) {
    const t = line.trim();
    if (inC) { if (t.indexOf('*/') >= 0) inC = false; out += '\n'; continue; }
    if (t.startsWith('/*')) { if (t.indexOf('*/') < 0) inC = true; out += '\n'; continue; }
    if (t.startsWith('//')) { out += '\n'; continue; }
    out += line.replace(/\/\*.*?\*\//g, '') + '\n';
  }
  return out;
}

/* ---------- 抽出真 source 片段 ---------- */
function block(src, re) {
  const m = src.match(re);
  if (!m) throw new Error('抽唔到 ' + re);
  return m[0];
}
const code = stripComments(h);
const tickBlk  = block(code, /function tick\(dtMs\) \{[\s\S]*?\n\}/);
const startBlk = block(code, /function startSegment\([\s\S]*?\n\}/);
const settleBlk= block(code, /function settleSegment\(\) \{[\s\S]*?\n\}/);
const chipBlk  = block(code, /function drawSegmentChip\(\) \{[\s\S]*?\n\}/);
const countBlk = block(code, /function segGruntCount\(\) \{[\s\S]*?\n\}/);
const bodyBlk  = block(code, /function segBodyN\([\s\S]*?\n\}/);
const loadBlk  = block(code, /function loadSegDiff\(\) \{[\s\S]*?\n\}/);
const setBlk   = block(code, /function setSegDiff\(i\) \{[\s\S]*?\n\}/);
const cfgBlk   = block(code, /function segCfg\(\)[^\n]*/);
const panelBtnsBlk = block(code, /function audioPanelBtns\(p\) \{[\s\S]*?\n\}/);
const drawUiBlk    = block(code, /function drawAudioUi\(\) \{[\s\S]*?\n\}/);
const tapBlk       = block(code, /function handleAudioPanelTap\([\s\S]*?\n\}/);

/* SEG_DIFFS 真表（由 source 抽，唔手抄） */
const diffsM = code.match(/const SEG_DIFFS = \[([\s\S]*?)\n\];/);
if (!diffsM) throw new Error('抽唔到 SEG_DIFFS');
const SEG_DIFFS = eval('[' + diffsM[1] + ']');

/* ============================================================
 * 1. 段劃分：時間制（關卡時間 > segCfg().segT 就開新段）
 * ============================================================ */
console.log('=== 1. 段劃分（時間制 · 段長 = segT + 最長波間隔）===');
check('★ SEG_DIFFS 有三檔（簡單／標準／硬）', SEG_DIFFS.length === 3,
  SEG_DIFFS.map(d => d.name).join('/'));
check('★ 每檔都有 segT + cap', SEG_DIFFS.every(d => typeof d.segT === 'number' && typeof d.cap === 'number'));
check('★ 難度單調（cap：簡單 ≤ 標準 ≤ 硬）',
  SEG_DIFFS[0].cap <= SEG_DIFFS[1].cap && SEG_DIFFS[1].cap <= SEG_DIFFS[2].cap,
  SEG_DIFFS.map(d => d.cap).join(' ≤ '));
check('★ 難度單調（段長：簡單 ≥ 標準 ≥ 硬）',
  SEG_DIFFS[0].segT >= SEG_DIFFS[1].segT && SEG_DIFFS[1].segT >= SEG_DIFFS[2].segT,
  SEG_DIFFS.map(d => d.segT).join(' ≥ '));
check('★ 簡單檔學生唔使打超過 2 隻（cap ≤ 2）', SEG_DIFFS[0].cap <= 2, String(SEG_DIFFS[0].cap));
check('★ 硬檔有挑戰（cap ≥ 4）', SEG_DIFFS[2].cap >= 4, String(SEG_DIFFS[2].cap));
check('★ 三檔唔會冇分別（難度掣一定要有用）',
  new Set(SEG_DIFFS.map(d => d.cap + '/' + d.segT)).size === 3,
  SEG_DIFFS.map(d => d.cap + '/' + d.segT).join(' · '));
check('★ 段界條件跟難度檔（segCfg().segT，唔係寫死常數）',
  /stageMs - segStartAt > segCfg\(\)\.segT\)/.test(tickBlk));
check('★ 已經冇用住舊嘅波數取模規則（waveCursor % SEG_WAVES）',
  !/waveCursor\s*%\s*SEG_WAVES/.test(code));
check('★ 已經冇舊嘅 SEG_T 常數（v0.41.0 改成檔位制）', !/const SEG_T\s*=/.test(code));
check('★ segStartAt 變數存在', /let segStartAt\s*=\s*0;/.test(code));
check('★ startSegment 記錄段起點', /segStartAt = nowMs;/.test(startBlk));
check('★ segIndex 單調遞增（segIndex++）', /segIndex\+\+;/.test(startBlk));
check('★ startSegment 收 waveIdx（要用第一波內容計 need）',
  /function startSegment\(nowMs, waveIdx\)/.test(startBlk));
check('★ tick 傳 waveCursor 落 startSegment', /startSegment\(stageMs, waveCursor\)/.test(tickBlk));
check('★ segCfg() 讀 SEG_DIFFS[segDiffIdx]',
  /return SEG_DIFFS\[segDiffIdx\];/.test(cfgBlk));
check('★ segDiffIdx 預設 = 1（標準檔）', /let segDiffIdx\s*=\s*1;/.test(code));

/* ============================================================
 * 2. 觸發點順序：settle 一定要喺 spawn 之前
 * ============================================================ */
console.log('\n=== 2. 觸發點順序（settle → start → spawn）===');
{
  const iSettle = tickBlk.indexOf('settleSegment(); startSegment(stageMs, waveCursor);');
  const iEmit   = tickBlk.indexOf('emitWaveType(');
  check('★ 段界代碼存在', iSettle >= 0);
  check('★ settle/start 喺 emitWaveType（生成敵人）之前',
    iSettle >= 0 && iEmit >= 0 && iSettle < iEmit,
    'settle@' + iSettle + ' emit@' + iEmit);
  check('★ boss 出場前都會結算最後一段（尾段唔會漏）',
    /settleSegment\(\);\s*\n\s*segGoal = null;/.test(tickBlk));
  check('★ boss 期間唔會再有段目標（segGoal 清走 → drawSegmentChip 直接 return）',
    /if \(!ship \|\| !isStage\(fsm\.cur\) \|\| !segGoal\) return;/.test(chipBlk));
}

/* ============================================================
 * 3. 三種段目標（v0.40.0：擊殺 / 清場 / 零傷）
 * ============================================================ */
console.log('\n=== 3. 三種段目標（擊殺 / 清場 / 零傷）===');
check('★ SEG_KEYS 定義咗三種（v0.40.0 已移除 graze）',
  /const SEG_KEYS\s*=\s*\['kill', 'clear', 'safe'\]/.test(code));
check('★ 已經冇擦彈做段目標（用戶回饋：擦彈對學生太難）',
  !/SEG_KEYS[^;]*graze/.test(code) && !/g\.key === 'graze'/.test(code));
check('★ 擊殺目標用段內增量（runGrunts − 段開始時嘅基準）',
  /runGrunts - segKillBase/.test(settleBlk) && /segKillBase = runGrunts;/.test(startBlk));
check('★ 零傷目標判定（segHurt）', /!segHurt/.test(settleBlk));
check('★ 清場目標判定（只計雜魚）',
  /ok = gr === 0;/.test(settleBlk) && /kind === 'grunt'/.test(countBlk));
check('★ 清場唔可以用 enemies.length（會連敵彈都計 → 永遠達唔到）',
  !/enemies\.length === 0/.test(settleBlk));
check('★ 零傷只喺真扣血嗰刻成立（擋盾唔算）',
  /ship\.hp -= \(n \|\| 1\);[\s\S]{0,80}segHurt = true;/.test(code));

/* ============================================================
 * 4. 「擊殺」目標嘅可達性（need 上限 + 目標池）
 * ============================================================ */
console.log('\n=== 4. 「擊殺 N 隻」可達性（need 上限跟難度檔 + 目標池）===');
check('★ need 上限跟難度檔（segCfg().cap）',
  /need: key === 'kill' \? Math\.min\(segCfg\(\)\.cap, 2 \+ segIndex, bn\) : 0/.test(startBlk));
check('★ need 唔可以寫死上限（要跟檔）', !/Math\.min\(4,/.test(startBlk));
check('★ 有 segBodyN() 幫手計第一波身體敵數', /function segBodyN\(waveIdx\)/.test(code));
check('★ 身體敵判定用「冇 speed 嘅 spawn」（13 種身體敵 vs 4 種純彈幕）',
  /s\.speed == null/.test(bodyBlk));
check('★ segBodyN 會套用敵配 roll jitter（唔可以只用 base count）',
  /enemyRollFor\(waveIdx\)/.test(bodyBlk) && /r \? r\.add : 0/.test(bodyBlk));
check('★ 純彈幕段唔派「擊殺」（30% 嘅段零身體敵 → 派咗就係死目標）',
  /bn > 0 \? SEG_POOL_BODY : SEG_POOL_BULLET/.test(startBlk));
{
  const poolB = code.match(/const SEG_POOL_BODY\s*=\s*\[([^\]]*)\]/);
  const poolU = code.match(/const SEG_POOL_BULLET\s*=\s*\[([^\]]*)\]/);
  const b = poolB ? poolB[1].match(/'([a-z]+)'/g).map(x => x.replace(/'/g, '')) : [];
  const u = poolU ? poolU[1].match(/'([a-z]+)'/g).map(x => x.replace(/'/g, '')) : [];
  check('★ SEG_POOL_BULLET 一定冇 kill', u.indexOf('kill') < 0, u.join('/'));
  check('★ SEG_POOL_BODY 有 kill 且權重 ×2（保持三種目標大致均衡）',
    b.filter(x => x === 'kill').length === 2, b.join('/'));
  check('★ 三種目標都有出現過（kill/clear/safe）',
    b.indexOf('kill') >= 0 && b.indexOf('clear') >= 0 && b.indexOf('safe') >= 0);
}
/* 行為層：抽真 segBodyN 出嚟，用假 waveQueue 驗算 */
{
  let waveQueue = [];
  let rollStub = {};
  function enemyRollFor(wi) { return rollStub[wi]; }
  const segBodyN = eval('(' + bodyBlk + ')');
  waveQueue = [{ spawn: [{ type: 'grunt', count: 3 }, { type: 'spray', count: 8, speed: 0.08 }] }];
  rollStub = {};
  check('★ segBodyN：彈幕唔算入去（grunt 3 隻 + spray 8 粒 → 得 3）', segBodyN(0) === 3, segBodyN(0) + '');
  rollStub = { 0: { add: -2 } };
  check('★ segBodyN：套用 roll jitter（add −2 → 1 隻）', segBodyN(0) === 1, segBodyN(0) + '');
  rollStub = { 0: { add: 2 } };
  check('★ segBodyN：jitter 可以加（add +2 → 5 隻）', segBodyN(0) === 5, segBodyN(0) + '');
  waveQueue = [{ spawn: [{ type: 'spray', count: 8, speed: 0.08 }] }];
  rollStub = {};
  check('★ segBodyN：純彈幕波 → 0（→ 唔派「擊殺」）', segBodyN(0) === 0, segBodyN(0) + '');
}
/* 行為層：抽真 need 表達式出嚟，驗三檔嘅 need 唔會超過檔位上限 */
{
  const needM = code.match(/need: key === 'kill' \? ([^:]+?) : 0/);
  if (!needM) { check('★ 抽到 need 表達式', false); }
  else {
    /* ⚠️ source 嘅表達式會叫 segCfg() → 傳入嘅必須係**函數**（stub），唔係物件 */
    const needFn = eval('(function(segIndex, bn, segCfg){ return ' + needM[1] + '; })');
    const cfgOf = (d) => () => d;
    check('★ need = min(cap, 2+段序, 第一波身體敵數)（三檔都要跟自己個 cap）',
      SEG_DIFFS.every(d => {
        const cfg = cfgOf(d);
        return needFn(0, 99, cfg) === Math.min(d.cap, 2, 99) &&
               needFn(5, 99, cfg) === Math.min(d.cap, 7, 99) &&
               needFn(0, 1, cfg) === 1;
      }));
    check('★ 簡單檔 need 永遠 ≤2（學生唔使打 3 隻以上）',
      needFn(5, 99, cfgOf(SEG_DIFFS[0])) <= 2, String(needFn(5, 99, cfgOf(SEG_DIFFS[0]))));
    check('★ 硬檔 need 可以去到 4+（有挑戰）',
      needFn(5, 99, cfgOf(SEG_DIFFS[2])) >= 4, String(needFn(5, 99, cfgOf(SEG_DIFFS[2]))));
    check('★ need 唔會超過本段第一波身體敵數（保證可達）',
      needFn(5, 3, cfgOf(SEG_DIFFS[2])) === 3, String(needFn(5, 3, cfgOf(SEG_DIFFS[2]))));
  }
}

/* ============================================================
 * 5. 回饋只作用於下一段（唔會累積失控）
 * ============================================================ */
console.log('\n=== 5. 回饋作用域（下一段 · 段結束即清）===');
check('★ 敵血乘數：掛上後即清（segNextHp → segActiveHp → 歸 1）',
  /segActiveHp = segNextHp;\s*segNextHp = 1;/.test(startBlk));
check('★ 敵彈速度乘數：掛上後即清',
  /segActiveSpd = segNextSpd;\s*segNextSpd = 1;/.test(startBlk));
check('★ 達標派發嘅乘數只作用下一段（0.8）',
  /segNextSpd = 0\.8;/.test(settleBlk) && /segNextHp = 0\.8;/.test(settleBlk));
check('★ 失敗會清走未派發嘅乘數', /segNextHp = 1; segNextSpd = 1;/.test(settleBlk));
check('★ 敵彈速度乘數只加喺敵方彈速（bulletSpeedMul），唔影響玩家子彈',
  /function bulletSpeedMul\(\) \{ return D\(\)\.bulletSpdMul \* affBulletSpd \* segActiveSpd; \}/.test(code));
check('★ 敵血乘數只加喺雜魚 hpRaw（唔影響 boss 血量）',
  /const hpRaw = baseHp \* d\.hpMul \* affEnemyHp \* styEnemyHp \* \(minor \? minor\.hp : 1\) \* segActiveHp;/.test(code));

/* ============================================================
 * 6. 失敗唔懲罰（受眾係低耐性學生）
 * ============================================================ */
console.log('\n=== 6. 失敗唔懲罰 ===');
{
  const failBlk = settleBlk.slice(settleBlk.lastIndexOf('} else {'));
  check('★ 失敗分支唔會扣血', !/hp\s*-=/.test(failBlk));
  check('★ 失敗分支唔會扣分', !/runScore\s*-=/.test(failBlk));
  check('★ 失敗只係清連鎖倍率 + 出提示', /segChain = 0;/.test(failBlk));
  check('★ 失敗有畀玩家見到嘅提示', /segMsg = '未達標/.test(failBlk));
}

/* ============================================================
 * 7. 零傷獎勵唔可以無限疊盾
 * ============================================================ */
console.log('\n=== 7. 零傷獎勵：盾封頂 ===');
check('★ 達標加盾有上限（ship.shield < 5）',
  /g\.key === 'safe' && ship && ship\.shield < 5\) ship\.shield \+= 1;/.test(settleBlk));
check('★ 唔係無條件加盾', !/ship\.shield \+= 1;/.test(settleBlk.replace(/ship\.shield < 5\) ship\.shield \+= 1;/, '')));

/* ============================================================
 * 8. 段目標 chip 可見性（12px · 唔用 9px）
 * ============================================================ */
console.log('\n=== 8. 段目標 chip（可見性）===');
check('★ chip 字級係 12px（唔係 9px — 4K 白板 9px 睇唔到）',
  /ctx\.font = '12px monospace';/.test(chipBlk) && !/ctx\.font = '9px/.test(chipBlk));
check('★ chip 有進度條（擊殺目標要睇到進度）', /fillRect\(x \+ 62, y \+ 14/.test(chipBlk));
check('★ chip 顯示「擊殺 X/Y」', /label = '擊殺 ' \+ got \+ '\/' \+ g\.need;/.test(chipBlk));
check('★ chip 顯示清場剩幾多隻', /'清場 剩'/.test(chipBlk));
check('★ 上浮訊息用 14px', /ctx\.font = '14px monospace';/.test(chipBlk));
check('★ drawSegmentChip 有喺 render 內被呼叫', /drawSegmentChip\(\);/.test(code));

/* ============================================================
 * 9. 玩家可見字串：禁 em dash
 * ============================================================ */
console.log('\n=== 9. 玩家可見字串（禁 em dash）===');
{
  const vis = [
    /segMsg = '([^']*)'/, /label = '([^']*)'/, /label = gr \? '([^']*)' : '([^']*)'/,
    /fillText\('段目標難度'/, /fillText\(SEG_DIFFS\[segDiffIdx\]\.name/,
  ];
  let bad = [];
  for (const re of vis) {
    const m = h.match(re);
    if (m) for (const g of m.slice(1)) if (g && g.indexOf('—') >= 0) bad.push(g);
  }
  check('★ 段目標相關字串冇 em dash（—）', bad.length === 0, bad.join(' | '));
  const diffNames = SEG_DIFFS.map(d => d.name);
  check('★ 三個檔名都係中文（白板學生 3 秒讀得明）',
    diffNames.every(n => /^[一-鿿]+$/.test(n)), diffNames.join('/'));
}

/* ============================================================
 * 10. RNG stream 唔撞（實際 stream id 範圍，唔係字面前綴）
 * ============================================================ */
console.log('\n=== 10. RNG stream 獨立性 ===');
function streamCheck(c) {
  /* ⚠️ 段目標 stream 要喺 startSegment() 入面抽 —— 唔用全檔 first-match，
     因為 v0.42.0 加咗答題 stream（14000 + lastStage * 10 + segIndex），
     同一個 pattern → 全檔 first-match 會隨住函數擺位靜靜驗錯嘢。 */
  /* ⚠️ 一定要喺**傳入嘅 c** 抽 block —— 唔可以用模組層級嘅 startBlk／quizBlk，
     否則 mutation test 改壞 source 都影響唔到呢個檢查（→ 守門變 vacuous）。 */
  const segBlk = block(c, /function startSegment\([\s\S]*?\n\}/);
  const qBlk   = block(c, /function pickQuizQuestion\(\) \{[\s\S]*?\n\}/);
  const segM = segBlk.match(/stageRngFor\(runSeed,\s*(\d+)\s*\+\s*lastStage\s*\*\s*(\d+)\s*\+\s*segIndex\)/);
  if (!segM) return { ok: false, info: '抽唔到段目標 stream 公式' };
  const segBase = Number(segM[1]), segMul = Number(segM[2]);
  const others = [];
  const re = /stageRngFor\(runSeed,\s*(\d+)\s*\+\s*(lastStage|stageId)\)/g;
  let mm; while ((mm = re.exec(c))) others.push({ base: Number(mm[1]) });
  const segLo = segBase + 1 * segMul + 0, segHi = segBase + 5 * segMul + 5;
  const overlap = [];
  for (const o of others) {
    const lo = o.base + 1, hi = o.base + 5;
    if (!(segHi < lo || segLo > hi)) overlap.push(o.base + ' (' + lo + '-' + hi + ')');
  }
  let ok = overlap.length === 0 && segBase !== 9000 && segBase !== 11000 &&
           segBase !== 7000 && segBase !== 12000 && segBase !== 5000;
  let info = '段 ' + segLo + '-' + segHi + ' · 其他 ' + others.map(o => o.base).join(',') +
             (overlap.length ? ' · 撞：' + overlap.join('/') : '');
  /* v0.42.0 #153：答題 stream（14000 區段）· 一定要喺 pickQuizQuestion() 入面抽 */
  const quizM = qBlk.match(/stageRngFor\(runSeed,\s*(\d+)\s*\+\s*lastStage\s*\*\s*(\d+)\s*\+\s*segIndex\)/);
  if (!quizM) return { ok: false, info: info + ' · 抽唔到答題 stream 公式' };
  const qBase = Number(quizM[1]), qMul = Number(quizM[2]);
  const qLo = qBase + 1 * qMul + 0, qHi = qBase + 5 * qMul + 5;
  const qOverlap = [];
  if (!(qHi < segLo || qLo > segHi)) qOverlap.push('段 ' + segLo + '-' + segHi);
  for (const o of others) {
    const lo = o.base + 1, hi = o.base + 5;
    if (!(qHi < lo || qLo > hi)) qOverlap.push(o.base + ' (' + lo + '-' + hi + ')');
  }
  if (qOverlap.length) ok = false;
  if (qBase === segBase) ok = false;
  info += ' · 答題 ' + qLo + '-' + qHi +
          (qOverlap.length ? ' · 撞：' + qOverlap.join('/') : ' · 唔撞');
  return { ok: ok, info: info };
}
{
  const sc = streamCheck(code);
  check('★ 段目標 stream 範圍唔撞其他任何 stream（實際 id 範圍，唔係字面前綴）', sc.ok, sc.info);
}

/* ============================================================
 * 11. 段目標難度三檔：持久化 + 設定面板掣（v0.41.0 #152）
 * ============================================================ */
console.log('\n=== 11. 段目標難度三檔（持久化 + 設定面板）===');
check('★ LS_SEG_DIFF key 存在', /const LS_SEG_DIFF = 'dsf\.segDiff';/.test(code));
check('★ 開機會讀檔（loadSegDiff）', /loadSegDiff\(\);/.test(code));
check('★ loadSegDiff 用 parseInt + isNaN（lsRead 分唔到「未設定」同「簡單(0)」）',
  /parseInt\(localStorage\.getItem\(LS_SEG_DIFF\), 10\)/.test(loadBlk) &&
  /!isNaN\(v\)/.test(loadBlk));
check('★ loadSegDiff 會擋掉越界值', /v >= 0 && v < SEG_DIFFS\.length/.test(loadBlk));
check('★ setSegDiff 會寫入 localStorage', /lsWrite\(LS_SEG_DIFF, segDiffIdx\)/.test(setBlk));
check('★ setSegDiff 三檔循環（唔會越界）',
  /segDiffIdx = \(i \+ SEG_DIFFS\.length\) % SEG_DIFFS\.length;/.test(setBlk));
/* 行為層：真 loadSegDiff（用假 localStorage） */
{
  /* ⚠️ LS_SEG_DIFF 由 source 抽（唔手抄）→ 注入 scope，否則 ReferenceError 會被 try/catch 吞走 */
  const KEY = (code.match(/const LS_SEG_DIFF = '([^']+)'/) || [, ''])[1];
  const mk = (raw) => {
    const fakeLS = { getItem: (k) => (raw === null ? null : raw) };
    const fn = new Function('SEG_DIFFS', 'localStorage', 'LS_SEG_DIFF',
      'let segDiffIdx = 1;\n' + loadBlk + '\nloadSegDiff(); return segDiffIdx;');
    return fn(SEG_DIFFS, fakeLS, KEY);
  };
  check('★ 行為層：存「0」（簡單）讀得返', mk('0') === 0, String(mk('0')));
  check('★ 行為層：存「2」（硬）讀得返', mk('2') === 2, String(mk('2')));
  check('★ 行為層：未設定過 → 保持預設 1（標準，唔會誤讀成簡單）', mk(null) === 1, String(mk(null)));
  check('★ 行為層：亂值 → 保持預設 1', mk('abc') === 1, String(mk('abc')));
  check('★ 行為層：越界值（9）→ 保持預設 1', mk('9') === 1, String(mk('9')));
}
/* 行為層：真 setSegDiff 循環 */
{
  const KEY = (code.match(/const LS_SEG_DIFF = '([^']+)'/) || [, ''])[1];
  const written = [];
  const fn = new Function('SEG_DIFFS', 'lsWrite', 'audioOn', 'sfx', 'LS_SEG_DIFF',
    'let segDiffIdx = 1;\n' + setBlk +
    '\nreturn { get: () => segDiffIdx, set: (i) => setSegDiff(i) };');
  const api = fn(SEG_DIFFS, (k, v) => written.push([k, v]), false, () => {}, KEY);
  api.set(0); const a = api.get();
  api.set(-1); const b = api.get();
  api.set(3); const c = api.get();
  check('★ 行為層：三檔循環（0 → 0 / −1 → 2 / 3 → 0）',
    a === 0 && b === 2 && c === 0, a + '/' + b + '/' + c);
  check('★ 行為層：每次切換都寫入 dsf.segDiff',
    written.length === 3 && written.every(w => w[0] === 'dsf.segDiff'), JSON.stringify(written));
}
/* 設定面板掣 */
check('★ 面板有 segMinus / segPlus 兩個掣',
  /segMinus:\{/.test(panelBtnsBlk) && /segPlus: \{/.test(panelBtnsBlk));
check('★ 面板掣 ≥56px（智慧白板觸控門檻）',
  /segMinus:\{ x: p\.x \+ 18,\s*y: p\.y \+ 262, w: 56, h: 56 \}/.test(panelBtnsBlk) &&
  /segPlus: \{ x: p\.x \+ p\.w - 74, y: p\.y \+ 262, w: 56, h: 56 \}/.test(panelBtnsBlk));
check('★ 面板加高咗（248 → 336）俾新一行用', /const w = 252, h = 336;/.test(code));
check('★ 面板標題改咗做「設定」（唔止音效）', /fillText\('設定'/.test(drawUiBlk));
check('★ 面板畫「段目標難度」同當前檔名',
  /fillText\('段目標難度'/.test(drawUiBlk) &&
  /fillText\(SEG_DIFFS\[segDiffIdx\]\.name/.test(drawUiBlk));
check('★ 撳掣 → setSegDiff（−1 / +1）',
  /setSegDiff\(segDiffIdx - 1\)/.test(tapBlk) && /setSegDiff\(segDiffIdx \+ 1\)/.test(tapBlk));
check('★ 用同一套 [−]/[+] 詞彙（唔用滑條）',
  /step\(b\.segMinus, '−'\); step\(b\.segPlus, '\+'\);/.test(drawUiBlk));

/* ============================================================
 * 12. 版本 + 預算
 * ============================================================ */
console.log('\n=== 12. 版本 + 單檔預算 ====');
check('★ 版本號 v0.41.0', /v0\.41\.0/.test(h));
check('★ 啟動日誌有 v0.41.0', /v0\.41\.0/.test(h));
check('★ index.html ≤ 290 KB（字元口徑）',
  h.length <= 290 * 1024, (h.length / 1024).toFixed(3) + ' KB · 餘 ' + (290 * 1024 - h.length) + ' 字元');

/* ============================================================
 * 13. 目標分佈（行為層：真 rng 抽 + 真目標池）
 * ============================================================ */
console.log('\n=== 13. 目標分佈（行為層）===');
{
  const rngSrc = block(code, /function mulberry32\([\s\S]*?\n\}/) + '\n' +
                 block(code, /function stageRngFor\([\s\S]*?\n\}/);
  const { stageRngFor } = new Function(rngSrc + '\nreturn { stageRngFor };')();
  const segM = code.match(/stageRngFor\(runSeed,\s*(\d+)\s*\+\s*lastStage\s*\*\s*(\d+)\s*\+\s*segIndex\)/);
  const base = Number(segM[1]), mul = Number(segM[2]);
  const poolB = code.match(/const SEG_POOL_BODY\s*=\s*\[([^\]]*)\]/)[1].match(/'([a-z]+)'/g).map(x => x.replace(/'/g, ''));
  const poolU = code.match(/const SEG_POOL_BULLET\s*=\s*\[([^\]]*)\]/)[1].match(/'([a-z]+)'/g).map(x => x.replace(/'/g, ''));
  const cnt = { kill: 0, clear: 0, safe: 0 };
  let total = 0;
  /* 「有身體敵」用實測比例（30–36% 純彈幕段 · tools/segment_density.js 量到） */
  const NO_BODY_RATE = 0.32;
  for (let seed = 1; seed <= 300; seed++) {
    for (let sid = 1; sid <= 5; sid++) {
      for (let si = 0; si < 6; si++) {
        const rng = stageRngFor(seed, base + sid * mul + si);
        /* 用 seed 決定呢段係咪純彈幕段（穩定、可重現嘅替代模型） */
        const noBody = (stageRngFor(seed, base + 500 + sid * mul + si)() < NO_BODY_RATE);
        const pool = noBody ? poolU : poolB;
        cnt[pool[Math.floor(rng() * pool.length)]]++;
        total++;
      }
    }
  }
  for (const k of ['kill', 'clear', 'safe']) {
    const p = cnt[k] / total * 100;
    check('★ ' + k + ' 出現率 25–45%（唔可以有死目標）', p >= 25 && p <= 45, p.toFixed(2) + '%');
  }
}

/* ============================================================
 * 14. 還原驗證（mutation test）—— 證明上面啲斷言唔係 vacuous
 *     ⚠️ 喺記憶體改 source，唔會寫落磁盤（唔會掂到 index.html）
 * ============================================================ */
console.log('\n=== 14. 還原驗證（mutation test · 證明守門唔係 vacuous）===');
{
  const MUTANTS = [
    ['段界條件寫死 8000（唔跟難度檔）',
      'stageMs - segStartAt > segCfg().segT', 'stageMs - segStartAt > 8000'],
    ['段界條件改成 * 1000（段界永遠唔觸發）',
      'stageMs - segStartAt > segCfg().segT', 'stageMs - segStartAt > segCfg().segT * 1000'],
    ['清場判定改回 enemies.length === 0（v0.39.0 舊 bug）',
      "ok = gr === 0;", "ok = enemies.length === 0;"],
    ['零傷獎勵去掉盾上限',
      'ship.shield < 5) ship.shield += 1;', ') ship.shield += 1;'],
    ['chip 字級改返 9px', "ctx.font = '12px monospace';", "ctx.font = '9px monospace';"],
    ['段目標 stream 撞返詞綴 9000', '13000 + lastStage * 10 + segIndex', '9000 + lastStage * 10 + segIndex'],
    ['settle / spawn 順序倒轉',
      'if (!segGoal || stageMs - segStartAt > segCfg().segT) { settleSegment(); startSegment(stageMs, waveCursor); maybeQuiz(); }',
      'if (!segGoal || stageMs - segStartAt > segCfg().segT) { startSegment(stageMs, waveCursor); settleSegment(); maybeQuiz(); }'],
    ['段目標變返 4 種（加一個 dead goal）',
      "const SEG_KEYS    = ['kill', 'clear', 'safe'];", "const SEG_KEYS    = ['kill', 'clear', 'safe', 'dead'];"],
    ['need 去掉「第一波敵人數」上限 → 純彈幕段都派「擊殺」＝死目標',
      'Math.min(segCfg().cap, 2 + segIndex, bn)', 'Math.min(segCfg().cap, 2 + segIndex)'],
    ['need 唔跟難度檔（寫死 4）→ 簡單檔變難',
      'Math.min(segCfg().cap, 2 + segIndex, bn)', 'Math.min(4, 2 + segIndex, bn)'],
    ['need 上限用錯字段（cap → segT）→ 簡單檔變極難',
      'Math.min(segCfg().cap, 2 + segIndex, bn)', 'Math.min(segCfg().segT, 2 + segIndex, bn)'],
    ['純彈幕段都派「擊殺」（目標池合併）',
      "const SEG_POOL_BULLET = ['clear', 'safe'];", "const SEG_POOL_BULLET = ['kill', 'clear', 'safe'];"],
    ['擊殺判定用錯基準（runKills → boss 擊殺都計入）',
      'runGrunts - segKillBase', 'runKills - segKillBase'],
    ['三檔變兩檔（老師冇得揀「硬」）',
      "{ name:'硬',   segT:5000, cap:6 },", ""],
    ['簡單檔數值錯（cap 2 → 6）→ 簡單檔比硬檔更難',
      "{ name:'簡單', segT:8000, cap:2 },", "{ name:'簡單', segT:8000, cap:6 },"],
    ['簡單檔段長錯（segT 8000 → 5000）→ 簡單檔段比硬檔仲短',
      "{ name:'簡單', segT:8000, cap:2 },", "{ name:'簡單', segT:5000, cap:2 },"],
    ['硬檔無挑戰（cap 6 → 2）→ 難度掣冇用',
      "{ name:'硬',   segT:5000, cap:6 },", "{ name:'硬',   segT:5000, cap:2 },"],
    ['持久化讀唔到 0（用 lsRead 唔用 parseInt）→ 簡單檔永遠讀唔到',
      '!isNaN(v) && v >= 0', '!isNaN(v) && v > 0'],
    ['setSegDiff 唔循環（越界會寫壞值）',
      'segDiffIdx = (i + SEG_DIFFS.length) % SEG_DIFFS.length;', 'segDiffIdx = i;'],
    ['setSegDiff 唔寫入 localStorage（設定行冇用）',
      'lsWrite(LS_SEG_DIFF, segDiffIdx);', ''],
    ['segDiffIdx 預設唔係 1（標準檔）',
      'let segDiffIdx = 1;', 'let segDiffIdx = 0;'],
    ['設定面板唔畫「段目標難度」列（掣冇用）',
      "ctx.fillText('段目標難度', p.x + 84, midY3 - 10);", ''],
    ['撳掣唔 call setSegDiff（掣冇接上）',
      'if (inRect(px, py, b.segPlus))  { setSegDiff(segDiffIdx + 1); return true; }', ''],
    ['面板唔加高（新一行會撞出面板）',
      'const w = 252, h = 336;', 'const w = 252, h = 248;'],
  ];
  /* 每個 mutant：改 source → 重新行結構斷言 → 必須至少一項紅 */
  function structuralFails(src) {
    const c = stripComments(src);
    const tb = block(c, /function tick\(dtMs\) \{[\s\S]*?\n\}/);
    const sb = block(c, /function settleSegment\(\) \{[\s\S]*?\n\}/);
    const cb = block(c, /function drawSegmentChip\(\) \{[\s\S]*?\n\}/);
    const gb = block(c, /function segGruntCount\(\) \{[\s\S]*?\n\}/);
    const st = block(c, /function startSegment\([\s\S]*?\n\}/);
    const bb = block(c, /function segBodyN\([\s\S]*?\n\}/);
    const lb = block(c, /function loadSegDiff\(\) \{[\s\S]*?\n\}/);
    const sb2 = block(c, /function setSegDiff\(i\) \{[\s\S]*?\n\}/);
    const cg = block(c, /function segCfg\(\)[^\n]*/);
    const pb = block(c, /function audioPanelBtns\(p\) \{[\s\S]*?\n\}/);
    const du = block(c, /function drawAudioUi\(\) \{[\s\S]*?\n\}/);
    const tp = block(c, /function handleAudioPanelTap\([\s\S]*?\n\}/);
    const poolB = (c.match(/const SEG_POOL_BODY\s*=\s*\[([^\]]*)\]/) || [, ''])[1];
    const poolU = (c.match(/const SEG_POOL_BULLET\s*=\s*\[([^\]]*)\]/) || [, ''])[1];
    const dm = c.match(/const SEG_DIFFS = \[([\s\S]*?)\n\];/);
    let diffs = [];
    if (dm) { try { diffs = eval('[' + dm[1] + ']'); } catch (e) { diffs = []; } }
    const rules = [
      diffs.length === 3,
      diffs.every(d => typeof d.segT === 'number' && typeof d.cap === 'number'),
      /* 難度單調 invariant（簡單 ≤ 標準 ≤ 硬）—— 缺咗就會出現「簡單檔比硬檔更難」 */
      diffs.length === 3 && diffs[0].cap <= diffs[1].cap && diffs[1].cap <= diffs[2].cap,
      diffs.length === 3 && diffs[0].segT >= diffs[1].segT && diffs[1].segT >= diffs[2].segT,
      diffs.length === 3 && diffs[0].cap <= 2,
      diffs.length === 3 && diffs[2].cap >= 4,
      diffs.length === 3 && new Set(diffs.map(d => d.cap + '/' + d.segT)).size === 3,
      /stageMs - segStartAt > segCfg\(\)\.segT\)/.test(tb),
      !/const SEG_T\s*=/.test(c),
      !/waveCursor\s*%\s*SEG_WAVES/.test(c),
      /segStartAt = nowMs;/.test(st),
      /segIndex\+\+;/.test(st),
      /function startSegment\(nowMs, waveIdx\)/.test(st),
      /startSegment\(stageMs, waveCursor\)/.test(tb),
      /let segDiffIdx\s*=\s*1;/.test(c),
      /return SEG_DIFFS\[segDiffIdx\];/.test(cg),
      tb.indexOf('settleSegment(); startSegment(stageMs, waveCursor);') >= 0 &&
        tb.indexOf('settleSegment(); startSegment(stageMs, waveCursor);') < tb.indexOf('emitWaveType('),
      /const SEG_KEYS\s*=\s*\['kill', 'clear', 'safe'\]/.test(c),
      !/SEG_KEYS[^;]*graze/.test(c) && !/g\.key === 'graze'/.test(c),
      /runGrunts - segKillBase/.test(sb) && /segKillBase = runGrunts;/.test(st),
      /ok = gr === 0;/.test(sb) && /kind === 'grunt'/.test(gb),
      !/enemies\.length === 0/.test(sb),
      /need: key === 'kill' \? Math\.min\(segCfg\(\)\.cap, 2 \+ segIndex, bn\) : 0/.test(st),
      !/Math\.min\(4,/.test(st),
      /function segBodyN\(waveIdx\)/.test(c),
      /s\.speed == null/.test(bb),
      /enemyRollFor\(waveIdx\)/.test(bb) && /r \? r\.add : 0/.test(bb),
      /bn > 0 \? SEG_POOL_BODY : SEG_POOL_BULLET/.test(st),
      poolU.indexOf('kill') < 0,
      (poolB.match(/'kill'/g) || []).length === 2,
      /ship\.shield < 5\) ship\.shield \+= 1;/.test(sb),
      /ctx\.font = '12px monospace';/.test(cb) && !/ctx\.font = '9px/.test(cb),
      /label = '擊殺 ' \+ got \+ '\/' \+ g\.need;/.test(cb),
      /segActiveHp = segNextHp;\s*segNextHp = 1;/.test(st),
      /segActiveSpd = segNextSpd;\s*segNextSpd = 1;/.test(st),
      /const LS_SEG_DIFF = 'dsf\.segDiff';/.test(c),
      /parseInt\(localStorage\.getItem\(LS_SEG_DIFF\), 10\)/.test(lb) && /!isNaN\(v\)/.test(lb),
      /v >= 0 && v < SEG_DIFFS\.length/.test(lb),
      /lsWrite\(LS_SEG_DIFF, segDiffIdx\)/.test(sb2),
      /segDiffIdx = \(i \+ SEG_DIFFS\.length\) % SEG_DIFFS\.length;/.test(sb2),
      /segMinus:\{/.test(pb) && /segPlus: \{/.test(pb),
      /segMinus:\{ x: p\.x \+ 18,\s*y: p\.y \+ 262, w: 56, h: 56 \}/.test(pb) &&
      /segPlus: \{ x: p\.x \+ p\.w - 74, y: p\.y \+ 262, w: 56, h: 56 \}/.test(pb),
      /const w = 252, h = 336;/.test(c),
      /fillText\('設定'/.test(du),
      /fillText\('段目標難度'/.test(du) &&
      /fillText\(SEG_DIFFS\[segDiffIdx\]\.name/.test(du),
      /setSegDiff\(segDiffIdx - 1\)/.test(tp) && /setSegDiff\(segDiffIdx \+ 1\)/.test(tp),
      /step\(b\.segMinus, '−'\); step\(b\.segPlus, '\+'\);/.test(du),
      streamCheck(c).ok,
    ];
    return rules.filter(r => !r).length;
  }
  const baseFails = structuralFails(h);
  check('★ 未改動嘅 source 結構斷言全綠（基線）', baseFails === 0, baseFails + ' 項紅');
  for (const [label, from, to] of MUTANTS) {
    if (h.indexOf(from) < 0) { check('★ mutant「' + label + '」搵唔到目標字串（測試本身壞）', false); continue; }
    const mutated = h.split(from).join(to);
    const mf = structuralFails(mutated);
    check('★ mutant「' + label + '」令守門變紅', mf > 0, mf + ' 項紅');
  }
  /* 還原：原 source 仍然全綠 */
  check('★ 還原後仍然全綠（確認冇污染真檔）', structuralFails(h) === 0);
  check('★ 磁盤檔案未被 mutation 過程改動', fs.readFileSync(SRC, 'utf8') === h);
}

console.log(fails === 0 ? '\n✓ 全部通過' : '\n✗ ' + fails + ' 項失敗');
process.exit(fails === 0 ? 0 : 1);
