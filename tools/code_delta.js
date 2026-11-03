/* tools/code_delta.js — 「註解以外嘅代碼差分」檢查器
 *
 * 用途：想證明「我今次改動冇掂過任何舊 gameplay 代碼」時用。
 * 註解壓縮 / 註解新增會產生幾千行 diff，但**唔影響行為** → 剝走註解再比。
 *
 * 輸出三樣嘢：
 *   ① 舊 code 被刪除／改動嘅行（⚠️ 呢個清單係最重要 —— 應該只包含刻意改動嘅行）
 *   ② 新增嘅行
 *   ③ 摘要（被刪改行數 / 新增行數）
 *
 * ⚠️ 用法要小心：baseline ref 一定要係「改動之前」嘅 commit。
 * ⚠️ 呢個工具假設 repo 有 git（單檔分發嘅老師唔會用到 —— 工具喺 tools/，唔喺 index.html）。
 *
 * 用法：node tools/code_delta.js [baseline-ref] [檔案路徑]
 *   例：node tools/code_delta.js f95f4b2 index.html
 */
const fs = require('fs');
const { execFileSync } = require('child_process');

const REF = process.argv[2] || 'HEAD';
const FILE = process.argv[3] || 'index.html';

/* 剝走註解：行內 // 、塊註解、行內塊註解 */
function stripComments(src) {
  const out = [];
  let inC = false;
  for (const line of src.split('\n')) {
    const t = line.trim();
    if (inC) { if (t.indexOf('*/') >= 0) inC = false; out.push(''); continue; }
    if (t.startsWith('/*')) { if (t.indexOf('*/') < 0) inC = true; out.push(''); continue; }
    if (t.startsWith('//')) { out.push(''); continue; }
    out.push(line.replace(/\/\*.*?\*\//g, '').trimEnd());
  }
  return out;
}

let base;
try {
  base = execFileSync('git', ['show', REF + ':' + FILE], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
} catch (e) {
  console.error('讀唔到基準 ' + REF + ':' + FILE + '（' + e.message.split('\n')[0] + '）');
  process.exit(2);
}
const now = fs.readFileSync(FILE, 'utf8');

const setA = new Set(stripComments(base).filter(x => x.trim() !== ''));
const setB = new Set(stripComments(now).filter(x => x.trim() !== ''));
const removed = [...setA].filter(x => !setB.has(x));
const added = [...setB].filter(x => !setA.has(x));

console.log('基準 ' + REF + ' → ' + FILE);
console.log('註解以外嘅代碼：舊 ' + setA.size + ' 行 → 而家 ' + setB.size + ' 行');
console.log('\n=== ① 舊 code 被刪除／改動（' + removed.length + ' 行）⚠️ 應該淨係刻意改動 ===');
removed.forEach(x => console.log('  - ' + x.slice(0, 160)));
console.log('\n=== ② 新增 code（' + added.length + ' 行）===');
added.forEach(x => console.log('  + ' + x.slice(0, 160)));
console.log('\n摘要：刪改 ' + removed.length + ' 行 · 新增 ' + added.length + ' 行');
