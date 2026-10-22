/* 一次性驗證腳本：v3.7 P0 組波邏輯靜態測試 */
const fs = require('fs');
const h = fs.readFileSync(__dirname + '/index.html', 'utf8');

/* 抽 8b 段：由 mulberry32 開始到 assembleWaves 完 */
const start = h.indexOf('/* mulberry32');
const end = h.indexOf('/* 波次產生佇列');
const seg = h.slice(start, end);

const st = h.match(/const STAGE_TABLE = \{[\s\S]*?\n\};/)[0];
const wt = h.match(/const WAVE_TEMPLATES = \{[\s\S]*?\n\};/)[0];

/* 剝走 console.* 陳述式（避免污染測試輸出） */
const clean = seg.replace(/^\s*console\.(log|warn)\(.*?\);\s*$/gm, '');

const code = st + '\n' + wt + '\n' + clean + '\n' +
  'return { assembleWaves, WAVE_CHUNKS, STAGE_ATS, STAGE_RAND, STAGE_TABLE, WAVE_TEMPLATES };';
const F = new Function(code)();

let fails = 0;
function check(label, ok, extra) {
  if (!ok) fails++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (extra ? '  ' + extra : ''));
}

console.log('=== 1. 不變式：組出波數 ===');
for (const s of [1, 2, 3, 4, 5]) {
  const a = F.assembleWaves(s, 12345);
  check('S' + s + ' 組出 ' + a.length + ' 波',
    a.length === F.STAGE_TABLE[s].waveCount && a.length === F.STAGE_ATS[s].length,
    '(STAGE_TABLE 寫 ' + F.STAGE_TABLE[s].waveCount + ')');
}

console.log('\n=== 2. 決定性：同 seed 重複組波 ===');
for (const s of [2, 3, 5]) {
  const sig = () => F.assembleWaves(s, 777).map(w => w.chunk).join(',');
  const r = [sig(), sig(), sig()];
  check('S' + s + ' 三次一致', r[0] === r[1] && r[1] === r[2], '| ' + r[0]);
}

console.log('\n=== 3. 不同 seed 應該不同 ===');
for (const s of [2, 3, 4, 5]) {
  const sig = (sd) => F.assembleWaves(s, sd).map(w => w.chunk).join(',');
  const a = sig(1), b = sig(2), c = sig(999);
  check('S' + s + ' seed 1/2/999 各異', a !== b && a !== c && b !== c);
}

console.log('\n=== 4. S1 教學類別鎖（#49）===');
const S1_EXPECT = ['grunt', 'spray', 'grunt', 'aim', 'grunt', 'spray', 'grunt'];
const S1_FORBID = ['dive', 'elite', 'swarm', 'shield', 'sniper', 'ring', 'meteor'];
for (const seed of [1, 42, 999, 31337, 65535]) {
  const w = F.assembleWaves(1, seed);
  const cats = w.map(x => x.spawn.map(s => s.type).join('+'));
  const hasWarn = w.some(x => x.spawn.some(s => s.warn));
  const badType = w.some(x => x.spawn.some(s => S1_FORBID.includes(s.type)));
  const catOk = JSON.stringify(cats) === JSON.stringify(S1_EXPECT);
  const atOk = JSON.stringify(w.map(x => x.at)) === JSON.stringify(F.STAGE_ATS[1]);
  check('seed ' + seed, catOk && !hasWarn && !badType && atOk,
    '| 類別' + (catOk ? '✓' : '✗ ' + cats.join('|')) +
    ' warn' + (hasWarn ? '✗' : '✓無') +
    ' 禁用類' + (badType ? '✗' : '✓無') +
    ' at[]' + (atOk ? '✓' : '✗'));
}

console.log('\n=== 5. 相鄰不重複（#35 cooldown ≥ 1 槽）===');
for (const s of [2, 3, 4, 5]) {
  let dup = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const c = F.assembleWaves(s, seed).map(w => w.chunk);
    for (let i = 1; i < c.length; i++) if (c[i] === c[i - 1]) dup++;
  }
  check('S' + s + ' 200 seeds 相鄰重複 = ' + dup, dup === 0);
}

console.log('\n=== 6. spawn 深拷貝防污染 ===');
const a1 = F.assembleWaves(2, 555);
const origCount = F.WAVE_CHUNKS[a1[0].chunk].spawn[0].count;
a1[0].spawn[0].count = 999;
a1[0].spawn.push({ type: 'hack' });
const a2 = F.assembleWaves(2, 555);
check('WAVE_CHUNKS 原文未受污染',
  F.WAVE_CHUNKS[a2[0].chunk].spawn[0].count === origCount && a2[0].spawn.length === 1);

console.log('\n=== 7. chunk id 全部存在於 WAVE_CHUNKS ===');
let missing = 0, total = 0;
for (const s of [1, 2, 3, 4, 5]) {
  const cfg = F.STAGE_RAND[s];
  const ids = cfg.pool || cfg.slots.flat();
  for (const id of ids) { total++; if (!F.WAVE_CHUNKS[id]) { missing++; console.log('    缺少 chunk: ' + id); } }
}
check('所有 pool 引用都存在（' + total + ' 條引用）', missing === 0);

console.log('\n=== 8. 各關 pool 大小（#35 要求 8–12）===');
for (const s of [1, 2, 3, 4, 5]) {
  const cfg = F.STAGE_RAND[s];
  const uniq = new Set(cfg.pool || cfg.slots.flat());
  check('S' + s + ' pool = ' + uniq.size + ' 個唯一 chunk', uniq.size >= 8 && uniq.size <= 12);
}

console.log('\n=== 9. 分佈抽樣（看有冇真係變化）===');
for (const s of [2, 3, 4, 5]) {
  const seen = new Set();
  for (let seed = 1; seed <= 200; seed++) {
    F.assembleWaves(s, seed).forEach(w => seen.add(w.chunk));
  }
  const pool = new Set(F.STAGE_RAND[s].pool);
  check('S' + s + ' 200 seeds 覆蓋 ' + seen.size + '/' + pool.size + ' 個 chunk', seen.size === pool.size);
}

console.log('\n' + (fails === 0 ? '✓ 全部通過' : '✗ ' + fails + ' 項失敗'));
process.exit(fails === 0 ? 0 : 1);