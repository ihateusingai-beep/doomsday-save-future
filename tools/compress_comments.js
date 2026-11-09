/* tools/compress_comments.js — 為騰預算壓縮 index.html 舊註解（v0.42.0 #153）
 *
 * 項目慣例（見 PLAN.md v0.40.0 / v0.41.0 改動紀錄）：
 *   「詳細敘事全部搬去 PLAN.md，index.html 只留 invariant + 陷阱 + 指標」。
 *
 * 規則（每個塊註解）：
 *   - 頭行（標題 / invariant 摘要）永遠保留
 *   - 第一條含 ⚠️ 嘅行保留（陷阱標題）
 *   - 其餘敘事行刪走 → **原文完整存檔去 PLAN.md**
 *   - body 短過 MIN_BODY 嘅塊原樣保留（短註解刪唔划算）
 *
 * ⚠️ 唔可以刪走嘅嘢：
 *   ① test_weapons.js 有 `/v0\.21\.\d/.test(h)` → 至少要留返一個 v0.21.x 標記
 *   ② 陷阱註解嘅 ⚠️ 標題行 → 一律保留
 * 用法：node tools/compress_comments.js [--dry]
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const F = path.join(ROOT, 'index.html');
const PLAN = path.join(ROOT, 'PLAN.md');
const MIN_BODY = Number((process.argv.find(a => a.startsWith('--min-body=')) || '--min-body=80').split('=')[1]);
const DRY = process.argv.includes('--dry');

let src = fs.readFileSync(F, 'utf8');
const before = src.length;

const re = /\/\*[\s\S]*?\*\//g;
const archive = [];
let out = '';
let last = 0;
let m;
while ((m = re.exec(src))) {
  const text = m[0];
  const endIdx = text.lastIndexOf('*/');
  if (endIdx < 0) continue;
  let lines = text.slice(0, endIdx).split('\n');
  if (lines.length < 3) continue;                       /* 單行註解 · 唔郁 */
  let closeIndent = '';
  if (lines[lines.length - 1].trim() === '') closeIndent = lines.pop();
  const header = lines[0];
  const bodyLen = text.length - header.length;
  if (bodyLen < MIN_BODY) continue;                     /* 太短 · 唔值得刪 */
  const keep = [header];
  let warned = false;
  for (let i = 1; i < lines.length; i++) {
    const L = lines[i];
    if (!warned && L.includes('⚠️')) { keep.push(L); warned = true; }
  }
  const compressed = keep.join('\n') + '\n' + closeIndent + '*/';
  if (compressed.length >= text.length) continue;
  archive.push({ header: header.trim(), text: text });
  out += src.slice(last, m.index) + compressed;
  last = m.index + text.length;
}
out += src.slice(last);

const saved = before - out.length;
console.log('壓縮 ' + archive.length + ' 塊 · 騰 ' + saved + ' 字元 · ' + before + ' → ' + out.length);
console.log('預算：' + (out.length / 1024).toFixed(3) + ' KB / 290 · 餘 ' + (290 * 1024 - out.length));
if (DRY) { console.log('（--dry · 冇寫入）'); process.exit(0); }

/* ⚠️ 存檔原文去 PLAN.md（詳盡敘事唔會失蹤） */
if (archive.length) {
  const stamp = '### 舊註解存檔（v0.42.0 預算壓縮 · ' + archive.length + ' 塊）\n\n'
    + '> 為咗令 `index.html` 返到 290 KB 內，呢批舊註解嘅**詳細敘事**搬到呢度；\n'
    + '> `index.html` 只留**標題 + ⚠️ 陷阱行**（invariant + 指標）。原文照抄，未改一字。\n\n';
  let body = '';
  let n = 0;
  for (const a of archive) {
    n++;
    body += '#### ' + n + '. ' + a.header.replace(/^\/\*\s*[-=]*\s*/, '').replace(/\s*[-=]*\*\/$/, '').trim() + '\n\n```\n' + a.text + '\n```\n\n';
  }
  const marker = '\n### 舊註解存檔（v0.42.0 預算壓縮';
  let plan = fs.readFileSync(PLAN, 'utf8');
  if (plan.includes(marker)) {
    /* 已有存檔段 → 追加落去（唔可以跳過，否則新壓縮嘅內容會失蹤） */
    const at = plan.indexOf(marker);
    const nextH = plan.indexOf('\n### ', at + 10);
    const insertAt = nextH < 0 ? plan.length : nextH;
    const head = '\n> **追加（min-body=' + MIN_BODY + ' · ' + archive.length + ' 塊）**\n\n';
    plan = plan.slice(0, insertAt) + head + body + plan.slice(insertAt);
    fs.writeFileSync(PLAN, plan);
    console.log('PLAN.md 存檔段已追加（' + archive.length + ' 塊 · ' + body.length + ' 字元）');
  } else {
    /* 插喺「## 關卡數據」之前 */
    const anchor = '\n## 關卡數據';
    const at = plan.indexOf(anchor);
    if (at < 0) { console.log('✗ PLAN.md 搵唔到插入錨點'); process.exit(1); }
    plan = plan.slice(0, at) + '\n' + stamp + body + plan.slice(at);
    fs.writeFileSync(PLAN, plan);
    console.log('PLAN.md 已加存檔段（' + archive.length + ' 塊 · ' + body.length + ' 字元）');
  }
}

fs.writeFileSync(F, out);
console.log('✓ index.html 已寫入');
