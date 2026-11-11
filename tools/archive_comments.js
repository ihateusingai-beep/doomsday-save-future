/* tools/archive_comments.js — 為騰預算把 index.html 嘅「純敘事註解」搬去 PLAN.md
 * （v0.43.0 #154 · 科目／單元前置流程要 ~3000 字元，v0.42.0 收尾只剩 1147）
 *
 * 同 tools/compress_comments.js 嘅分別：
 *   - compress_comments.js：保留「頭行 + 第一條 ⚠️ 行」（壓縮）
 *   - archive_comments.js：**整塊搬走**（原文照抄存去 PLAN.md）
 *
 * ⚠️ 搬走嘅條件（全部要啱）：
 *   ① 塊內冇 ⚠️ —— ⚠️ = 陷阱註解，係 invariant，**唔准搬**
 *   ② 塊內冇 `v0.<數字>` —— 有測試靠註解入面嘅版本字串做斷言
 *      （test_feel.js: `/v0\.29|v0\.30/` · test_segment_v041.js: `/v0\.41\.0/`
 *        · test_weapons.js: `/v0\.21\.\d/`）→ 搬咗就會 fail
 *   ③ 塊長 >= MIN —— 太短嘅註解搬走唔抵事（反而仲要喺 PLAN.md 加標題）
 *   ④ 原文**一字不改**存去 PLAN.md（唔准改寫、唔准摘要）
 *
 * 用法：node tools/archive_comments.js [--dry] [--min=60]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const F = path.join(ROOT, 'index.html');
const PLAN = path.join(ROOT, 'PLAN.md');

const argv = process.argv.slice(2);
const MIN = Number((argv.find(a => a.startsWith('--min=')) || '--min=60').split('=')[1]);
const DRY = argv.includes('--dry');

/* ⚠️ 有測試靠呢幾個版本字串（喺 index.html **原始內容**入面）：
 *      test_feel.js         `/v0\.29|v0\.30/`
 *      test_segment_v041.js `/v0\.41\.0/`
 *      test_weapons.js      `/v0\.21\.\d/`
 *    → 搬走咗呢啲字串嗰啲測試就 fail（而且係靜靜咁 fail）。
 *    ⚠️ 唔好保護「所有」v0.N —— 其他版本號冇測試靠，保護咗就白白封住一大堆可搬嘅塊。 */
const PROTECTED_VER = /v0\.29|v0\.30|v0\.41\.0|v0\.21\.\d/;

const src = fs.readFileSync(F, 'utf8');
const before = src.length;

/* ---------- 掃塊註解 ---------- */
const re = /\/\*[\s\S]*?\*\//g;
const picked = [];
let m;
while ((m = re.exec(src))) {
  const text = m[0];
  if (text.includes('⚠️')) continue;          /* ① 陷阱註解 */
  if (PROTECTED_VER.test(text)) continue;      /* ② 版本字串 */
  if (text.length < MIN) continue;             /* ③ 太短 */
  picked.push({ start: m.index, end: m.index + text.length, text: text });
}

/* ---------- 由尾到頭剪（避免 index 偏移） ---------- */
let out = src;
for (let i = picked.length - 1; i >= 0; i--) {
  const p = picked[i];
  const lineStart = out.lastIndexOf('\n', p.start - 1) + 1;
  const lineEnd = out.indexOf('\n', p.end);
  const beforeLine = out.slice(lineStart, p.start);
  const afterLine = out.slice(p.end, lineEnd < 0 ? out.length : lineEnd);
  /* 整行都係呢個註解 → 連行一齊剪走（唔留空白行） */
  if (beforeLine.trim() === '' && afterLine.trim() === '') {
    const cutTo = lineEnd < 0 ? out.length : lineEnd + 1;
    out = out.slice(0, lineStart) + out.slice(cutTo);
  } else {
    out = out.slice(0, p.start) + out.slice(p.end);
  }
}

const saved = before - out.length;
console.log('搬走 ' + picked.length + ' 塊 · 騰 ' + saved + ' 字元 · ' + before + ' → ' + out.length);
console.log('預算：' + (out.length / 1024).toFixed(3) + ' KB / 290 · 餘 ' + (290 * 1024 - out.length));
if (DRY) { console.log('（--dry · 冇寫入）'); process.exit(0); }

/* ---------- 原文存檔去 PLAN.md（插喺 v0.42.0 存檔段之後） ---------- */
if (!picked.length) process.exit(0);

const stamp = '### 舊註解存檔（v0.43.0 預算壓縮';
let plan = fs.readFileSync(PLAN, 'utf8');
let body = '';
let n = 0;
for (const p of picked) {
  n++;
  const hdr = p.text.split('\n')[0].replace(/^\/\*\s*[-=]*\s*/, '').replace(/\s*[-=]*\*\/$/, '').trim();
  body += '#### ' + n + '. ' + hdr + '\n\n```\n' + p.text + '\n```\n\n';
}
const sectionHead = stamp + ' · ' + picked.length + ' 塊）\n\n'
  + '> 為咗令 `index.html` 返到 290 KB 內（v0.43.0 科目／單元前置流程要 ~8000 字元），\n'
  + '> 呢批**純敘事**註解嘅原文搬到呢度。原文照抄，未改一字。\n'
  + '> ⚠️ **含 ⚠️ 嘅陷阱註解一律冇搬**（invariant 要留喺 source 附近）。\n\n';

const at = plan.indexOf(stamp);
if (at < 0) {
  /* 第一次：插喺「舊註解存檔（v0.42.0…」段之後（搵下一個頂格標題） */
  const anchor = plan.indexOf('### 舊註解存檔（v0.42.0 預算壓縮');
  let ins = -1;
  if (anchor >= 0) {
    const rest = plan.slice(anchor + 10);
    const mh = rest.match(/\n(?=#{1,3} )/);
    ins = mh ? anchor + 10 + mh.index + 1 : plan.length;
  } else {
    ins = plan.length;
  }
  plan = plan.slice(0, ins) + '\n' + sectionHead + body + plan.slice(ins);
} else {
  /* 已經有 v0.43.0 存檔段 → 追加落去（唔可以跳過，否則新搬嘅內容會失蹤） */
  const headEnd = plan.indexOf('\n', at);
  const mh = plan.slice(headEnd).match(/\n(?=#{1,3} )/);
  const end = mh ? headEnd + mh.index + 1 : plan.length;
  plan = plan.slice(0, end) + body + plan.slice(end);
}
fs.writeFileSync(PLAN, plan);
fs.writeFileSync(F, out);
console.log('已寫入 index.html + PLAN.md');
