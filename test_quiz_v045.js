/* v0.45.0 守門：每關答題**真係**彈到 12 條（PLAN #156）
 *
 * ⚠️ **呢個檔就係為咗捉 v0.44.0 嗰個靜靜失效**：
 *    v0.44.0 聲稱「每關答題 12 條」（QUIZ_MAX 5→12 + QUIZ_EVERY 3→1），
 *    但**每關只有 3–4 段**（段界綁波次 · 波次清完就出 boss）⇒ 每關實際只有 3–4 條答題。
 *    舊守門只斷言 `QUIZ_MAX === 12`（常數斷言）⇒ **錯得好好睇唔出**。
 *    ⇒ 呢個檔改為**由真 source 計段數 → 計答題條數**（唔再淨係斷言常數）。
 *
 * ⚠️ 段界邏輯（真 source · tick() 內）：
 *      if (!segGoal || stageMs - segStartAt > segCfg().segT) { settleSegment(); startSegment(...); maybeQuiz(); }
 *    段界**只喺波次落嗰刻**檢查 ⇒ **波數決定段數**（拉長時間唔會多段）。
 * ⚠️ 答題喺開新段時觸發（maybeQuiz）· `QUIZ_EVERY=1` → 每段一條 · `QUIZ_MAX=12` 封頂。
 * ⚠️ 結構斷言一定要喺「剝走註解」嘅 source 度做（假守門陷阱：命中註解 = 假通過）。
 * ⚠️ 最後一節做**還原驗證**（mutation test）：改壞 source → 守門必須變紅 → 還原。
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const MUT_ARG = process.argv.find(a => a.startsWith('--mutate-src='));
const IS_MUT = !!MUT_ARG;
const SRC = IS_MUT ? MUT_ARG.slice('--mutate-src='.length) : path.join(__dirname, 'index.html');
const h = fs.readFileSync(SRC, 'utf8');

let fails = 0;
function check(label, ok, extra) {
  if (!ok) fails++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (extra ? '  ' + extra : ''));
}

/* ---------- 剝走註解嘅 source ---------- */
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
function block(src, re) { const m = src.match(re); if (!m) throw new Error('抽唔到 ' + re); return m[0]; }
const code = stripComments(h);

/* ============================================================
 * 1. 波次時間軸（真 source）
 * ============================================================ */
console.log('\n=== 1. 波次時間軸（真 source 抽）===');
const STAGE_TABLE = eval('(' + block(code, /const STAGE_TABLE = \{[\s\S]*?\n\};/).replace(/const STAGE_TABLE =/, '').replace(/;\s*$/, '') + ')');
const SEG_DIFFS = eval('(' + block(code, /const SEG_DIFFS = \[[\s\S]*?\n\];/).replace(/const SEG_DIFFS =/, '').replace(/;\s*$/, '') + ')');
const WAVE_GAP = Number((code.match(/const WAVE_GAP\s*=\s*(\d+)/) || [])[1]);
/* STAGE_ATS 由真 source 抽生成段（唔手抄 · 免得守門同遊戲漂移） */
const STAGE_ATS = new Function('STAGE_TABLE', 'WAVE_GAP',
  block(code, /const STAGE_ATS = \{\};[\s\S]*?\n\}/) + '\nreturn STAGE_ATS;')(STAGE_TABLE, WAVE_GAP);

check('★ WAVE_GAP 已定義', WAVE_GAP > 0, '· ' + WAVE_GAP + 'ms');
check('★ WAVE_TEMPLATES 已刪（時間軸唔可以手打 · 死數據清走）', !/const WAVE_TEMPLATES/.test(code));
check('★ STAGE_TABLE.waveCount 係每關波數', [1, 2, 3, 4, 5].every(s => STAGE_TABLE[s].waveCount >= 26),
  '· ' + [1, 2, 3, 4, 5].map(s => STAGE_TABLE[s].waveCount).join('/'));
check('★ 每關 at[] 數 == waveCount', [1, 2, 3, 4, 5].every(s => STAGE_ATS[s].length === STAGE_TABLE[s].waveCount));
check('★ at[] 由 waveCount + WAVE_GAP 生成（等距）', [1, 2, 3, 4, 5].every(s => {
  const a = STAGE_ATS[s];
  for (let i = 1; i < a.length; i++) if (a[i] - a[i - 1] !== WAVE_GAP) return false;
  return true;
}));

/* ============================================================
 * 2. 段界 + 答題接線（真 source 抽）
 * ============================================================ */
console.log('\n=== 2. 段界 + 答題接線（真 source 抽）===');
const segLine = block(code, /if \(!segGoal \|\| stageMs - segStartAt > segCfg\(\)\.segT\) \{[^}]*\}/);
check('★ 段界條件 = 真 source（!segGoal || elapsed > segT）', /!segGoal \|\| stageMs - segStartAt > segCfg\(\)\.segT/.test(segLine));
check('★ 開新段時會叫 maybeQuiz（答題觸發點）', /maybeQuiz\(\)/.test(segLine));
check('★ 段界只喺波次迴圈內檢查（波數決定段數）',
  /while \(waveCursor < waveQueue\.length[^)]*\)[\s\S]{0,400}if \(!segGoal \|\| stageMs - segStartAt > segCfg\(\)\.segT\)/.test(code));
const mq = block(code, /function maybeQuiz\(\) \{[\s\S]*?\n\}/);
check('★ maybeQuiz 用 QUIZ_EVERY 判段界', /segIndex % QUIZ_EVERY !== QUIZ_EVERY - 1/.test(mq));
check('★ maybeQuiz 封頂用 QUIZ_MAX', /quizCount >= QUIZ_MAX/.test(mq));
const QUIZ_EVERY = Number((code.match(/const QUIZ_EVERY\s*=\s*(\d+)/) || [])[1]);
const QUIZ_MAX = Number((code.match(/const QUIZ_MAX\s*=\s*(\d+)/) || [])[1]);
check('★ QUIZ_EVERY = 1（每段一條）', QUIZ_EVERY === 1, '· ' + QUIZ_EVERY);
check('★ QUIZ_MAX = 12（每關上限）', QUIZ_MAX === 12, '· ' + QUIZ_MAX);

/* ============================================================
 * 3. ★核心★ 每關實際段數 → 每關實際答題條數（真 source 模擬）
 * ============================================================ */
console.log('\n=== 3. ★每關實際答題條數（真 source 模擬段界邏輯）===');
/* 模擬 tick() 嘅段界：逐波掃，elapsed > segT 就開新段（= 源碼嗰句嘅語義） */
function segmentsFor(sid, segT) {
  const ats = STAGE_ATS[sid];
  let segs = 0, segStart = null;
  for (const at of ats) {
    if (segStart === null || at - segStart > segT) { segStart = at; segs++; }
  }
  return segs;
}
for (const d of SEG_DIFFS) {
  const per = [];
  let allOk = true;
  for (const sid of [1, 2, 3, 4, 5]) {
    const segs = segmentsFor(sid, d.segT);
    /* 答題：每段一條（QUIZ_EVERY=1）· 每關封頂 QUIZ_MAX=12 · 每關重置（quizCount=0） */
    const quizzes = Math.min(segs, QUIZ_MAX);
    const span = STAGE_ATS[sid][STAGE_ATS[sid].length - 1] / 1000;
    if (quizzes < QUIZ_MAX) allOk = false;
    per.push('S' + sid + ' ' + segs + '段→' + quizzes + '條/' + span.toFixed(0) + 's');
  }
  check('★ 檔位「' + d.name + '」五關全部彈到 12 條', allOk, '· ' + per.join(' · '));
}
/* 舊 bug 嘅精準反例：波數得 7 嘅話每關只有 3-4 條 ⇒ 呢個守門要捉到 */
{
  const oldSegs = segmentsFor(1, SEG_DIFFS[1].segT);
  const ats7 = []; for (let i = 0; i < 7; i++) ats7.push(1500 + i * 3000);
  let segs7 = 0, ss = null;
  for (const at of ats7) { if (ss === null || at - ss > SEG_DIFFS[1].segT) { ss = at; segs7++; } }
  check('★ 反例確認：舊波次（7 波）只得 ' + segs7 + ' 段 → 答唔到 12 條（守門真係捉到 v0.44 bug）',
    segs7 < QUIZ_MAX && oldSegs >= QUIZ_MAX,
    '· 舊 ' + segs7 + ' 段 vs 而家 ' + oldSegs + ' 段');
}

/* ============================================================
 * 4. 波間隔 vs 段長（保住三檔嘅段密度差异）
 * ============================================================ */
console.log('\n=== 4. 波間隔 vs segT（三檔密度差异）===');
{
  const segTmax = Math.max(...SEG_DIFFS.map(d => d.segT));
  const segTmin = Math.min(...SEG_DIFFS.map(d => d.segT));
  const effLen = (segT) => Math.ceil(segT / WAVE_GAP) * WAVE_GAP;   /* 段界只喺波次落嗰刻 → 段長要向上取整到波次倍數 */
  const lens = SEG_DIFFS.map(d => effLen(d.segT));
  check('★ WAVE_GAP > 最小 segT（硬檔每波開新段 · 保住段密度优势）', WAVE_GAP > segTmin, '· ' + WAVE_GAP + ' > ' + segTmin);
  check('★ WAVE_GAP ≤ 簡單/標準 segT（唔會三檔都變成一樣）', WAVE_GAP <= segTmax, '· ' + WAVE_GAP + ' ≤ ' + segTmax);
  /* ⚠️ 簡單同標準嘅 segT 本來就一樣（8000）⇒ 段長一樣係設計 · 真正要守住嘅係「硬檔段更密」 */
  const hardLen = effLen(SEG_DIFFS[SEG_DIFFS.length - 1].segT);
  const easyLen = effLen(SEG_DIFFS[0].segT);
  check('★ 硬檔實際段長 < 簡單/標準（硬檔段更密 · 段目標取捨更頻）', hardLen < easyLen,
    '· ' + SEG_DIFFS.map((d, i) => d.name + ' ' + lens[i] + 'ms').join(' / '));
}

/* ============================================================
 * 5. 關卡長度 + 不變式
 * ============================================================ */
console.log('\n=== 5. 關卡長度 + 波次不變式 ===');
for (const sid of [1, 2, 3, 4, 5]) {
  const span = STAGE_ATS[sid][STAGE_ATS[sid].length - 1] / 1000;
  check('★ S' + sid + ' 波次階段 ≥ 120 秒（關卡拉長 ~3 倍）', span >= 120, '· ' + span.toFixed(1) + 's');
}
check('★ targetSec 重新校準（時間獎金唔會變成一筆全收）',
  [1, 2, 3, 4, 5].every(s => STAGE_TABLE[s].targetSec >= 200),
  '· ' + [1, 2, 3, 4, 5].map(s => STAGE_TABLE[s].targetSec).join('/'));
/* S1 教學關嘅 slots 必須循環用（波次 26 個 > slots 7 個） */
const rawPoolLine = block(code, /const rawPool = [^;]+;/);
check('★ S1 slots 係循環取用（唔係 slots[i] || slots[0]）', /i % cfg\.slots\.length/.test(rawPoolLine),
  '· ' + rawPoolLine.trim().slice(0, 70));

/* ============================================================
 * 6. 還原驗證（mutation test）—— 改壞 source → 守門必須變紅
 * ============================================================ */
console.log('\n=== 6. 還原驗證（mutation test）===');
function runGate(srcPath) {
  try {
    execFileSync('node', [path.join(__dirname, 'test_quiz_v045.js'), '--mutate-src=' + srcPath],
      { stdio: 'pipe', timeout: 60000 });
    return { red: false, out: '' };
  } catch (e) {
    return { red: true, out: (e.stdout || '').toString() };
  }
}
if (!IS_MUT) {
  const orig = fs.readFileSync(SRC, 'utf8');
  const MUT = [
    /* ★ 呢個就係 v0.44.0 嘅真實失效模式：波數收細 → 段數唔夠 → 答題彈唔到 12 條 */
    ['波數收細返 7（v0.44 失效模式）', orig.replace(/waveCount:26/, 'waveCount:7')],
    ['波數收細返 8', orig.replace(/waveCount:28/, 'waveCount:8')],
    ['波間隔收窄到 3000（< 硬檔 segT → 兩檔段密度一樣）', orig.replace(/const WAVE_GAP = 5100;/, 'const WAVE_GAP = 3000;')],
    ['波間隔拉闊到 9000（> 簡單 segT → 硬檔段密度消失）', orig.replace(/const WAVE_GAP = 5100;/, 'const WAVE_GAP = 9000;')],
    ['QUIZ_EVERY 改返 3', orig.replace(/const QUIZ_EVERY\s*=\s*1;/, 'const QUIZ_EVERY = 3;')],
    ['QUIZ_MAX 改返 5', orig.replace(/const QUIZ_MAX\s*=\s*12;/, 'const QUIZ_MAX = 5;')],
    ['段界條件改成永远唔成立', orig.replace(/stageMs - segStartAt > segCfg\(\)\.segT/, 'stageMs - segStartAt > 99999999')],
    ['開新段唔叫 maybeQuiz（答題唔觸發）', orig.replace(/startSegment\(stageMs, waveCursor\); maybeQuiz\(\);/, 'startSegment(stageMs, waveCursor);')],
    ['封頂檢查拎走（每關可以無限彈）', orig.replace(/if \(quizCount >= QUIZ_MAX\) return false;/, '/* removed */')],
    ['at[] 唔跟 waveCount（改用固定 7 個）',
      orig.replace(/for \(let i = 0; i < STAGE_TABLE\[k\]\.waveCount; i\+\+\) ats\.push\(1500 \+ i \* WAVE_GAP\);/,
                  'for (let i = 0; i < 7; i++) ats.push(1500 + i * WAVE_GAP);')],
  ];
  let allRed = true;
  for (const [label, mutated] of MUT) {
    if (mutated === orig) {
      check('★ mutant「' + label + '」真係改到 source', false, '· 錨點冇 match 到');
      allRed = false; continue;
    }
    const tmp = path.join('/tmp', 'dsf_mut_v045.html');
    fs.writeFileSync(tmp, mutated, 'utf8');
    const r = runGate(tmp);
    check('★ mutant「' + label + '」令守門變紅', r.red);
    if (!r.red) allRed = false;
    try { fs.unlinkSync(tmp); } catch (e) {}
  }
  check('★ 全部 mutant 都令守門變紅（守門唔係 vacuous）', allRed);
}

console.log(fails === 0 ? '\n✓ v0.45.0 守門全部通過' : '\n✗ ' + fails + ' 項失敗');
process.exit(fails === 0 ? 0 : 1);
