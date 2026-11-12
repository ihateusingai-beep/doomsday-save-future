/* v0.45 #156 驗證：由 index.html 真 source 計每關段數 + 每關答題條數
 * ⚠️ 段界邏輯（tick() 內）：`if (!segGoal || stageMs - segStartAt > segT) { settle; start; maybeQuiz; }`
 *    段界**只喺波次落嗰刻**檢查 → 波數決定段數。
 * ⚠️ 答題喺開新段時觸發（maybeQuiz）· QUIZ_EVERY=1 → 每段一條 · QUIZ_MAX=12 封頂。
 */
const fs = require('fs');
const path = require('path');
const HTML = process.argv[2] || path.join(__dirname, '..', 'index.html');
const h = fs.readFileSync(HTML, 'utf8');

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
const code = stripComments(h);
function block(src, re) { const m = src.match(re); if (!m) throw new Error('抽唔到 ' + re); return m[0]; }

const STAGE_TABLE = eval('(' + block(code, /const STAGE_TABLE = \{[\s\S]*?\n\};/).replace(/const\s+STAGE_TABLE\s*=\s*/, '').replace(/;\s*$/, '') + ')');
const WAVE_GAP = Number((code.match(/const WAVE_GAP\s*=\s*(\d+)/) || [])[1]);
const SEG_DIFFS = eval('(' + block(code, /const SEG_DIFFS = \[[\s\S]*?\n\];/).replace(/const\s+SEG_DIFFS\s*=\s*/, '').replace(/;\s*$/, '') + ')');
const QUIZ_EVERY = Number((code.match(/const QUIZ_EVERY\s*=\s*(\d+)/) || [])[1]);
const QUIZ_MAX = Number((code.match(/const QUIZ_MAX\s*=\s*(\d+)/) || [])[1]);

/* 真 at[] 生成（同 source） */
const STAGE_ATS = {};
for (const k of Object.keys(STAGE_TABLE)) {
  const ats = [];
  for (let i = 0; i < STAGE_TABLE[k].waveCount; i++) ats.push(1500 + i * WAVE_GAP);
  STAGE_ATS[k] = ats;
}

/* 真段界邏輯：逐波掃，elapsed > segT 就開新段 */
function segmentsFor(sid, segT) {
  const ats = STAGE_ATS[sid];
  let segs = 0, segStart = null;
  for (const at of ats) {
    if (segStart === null || at - segStart > segT) { segStart = at; segs++; }
  }
  return segs;
}

console.log('WAVE_GAP = ' + WAVE_GAP + ' · QUIZ_EVERY = ' + QUIZ_EVERY + ' · QUIZ_MAX = ' + QUIZ_MAX);
console.log('');
let allOk = true;
for (const d of SEG_DIFFS) {
  console.log('════ 檔位：' + d.name + '（segT ' + d.segT + 'ms · cap ' + d.cap + '）════');
  for (const sid of Object.keys(STAGE_TABLE)) {
    const segs = segmentsFor(sid, d.segT);
    const quizzes = Math.min(segs, QUIZ_MAX);
    const ats = STAGE_ATS[sid];
    const span = ats[ats.length - 1] / 1000;
    const ok = quizzes >= QUIZ_MAX;
    if (!ok) allOk = false;
    console.log('  S' + sid + '  波 ' + ats.length + '  段 ' + segs + '  → 答題 ' + quizzes + ' 條  '
      + '波次階段 ' + span.toFixed(1) + 's  ' + (ok ? '✓' : '✗ 未夠 12 條'));
  }
  console.log('');
}
console.log(allOk ? '✓ 三檔 × 五關 全部彈到 12 條' : '✗ 有關卡彈唔到 12 條');
process.exit(allOk ? 0 : 1);
