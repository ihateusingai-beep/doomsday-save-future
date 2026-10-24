#!/usr/bin/env node
// 把 pxl build 出嘅圖集 + 座標表貼回 index.html。
// ⚠️ 座標表人手同步係已知風險（改 sprite 忘記更新 → 圖靜靜哋錯位，
//    任何測試都唔會失敗）。呢個 script 令同步變成一個指令。
//
// 用法：node tools/sync_sheet.js
//
// 做三件事：
//   1. 讀 out/dsf_main.json  → 產生 SPRITE 座標表
//   2. 讀 out/dsf_main.png   → 產生 SHEET_B64
//   3. 兩者寫回 index.html（就地替換，唔會碰其他內容）
//
// 前提：art.px.js 已經 build 過。

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ART = path.join(ROOT, 'art.px.js');
const JSON_PATH = path.join(ROOT, 'out', 'dsf_main.json');
const PNG_PATH = path.join(ROOT, 'out', 'dsf_main.png');
const HTML_PATH = path.join(ROOT, 'index.html');

function fail(msg) {
  console.error('✗ ' + msg);
  process.exit(1);
}

/* ---------- 1. 讀 build 產物 ---------- */
if (!fs.existsSync(JSON_PATH)) fail('搵唔到 out/dsf_main.json —— 先跑 build');
if (!fs.existsSync(PNG_PATH)) fail('搵唔到 out/dsf_main.png —— 先跑 build');

const atlas = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
const frames = atlas.frames;
if (!frames) fail('dsf_main.json 冇 frames 欄位');

/* ---------- 2. 產生座標表 ---------- */
const entries = Object.keys(frames).map((k) => {
  const f = frames[k].frame;
  return `  ${k}: { x:${f.x}, y:${f.y}, w:${f.w}, h:${f.h} }`;
});
const spriteTable = `const SPRITE = Object.freeze({\n${entries.join(',\n')},\n});`;

/* ---------- 3. 產生 base64 ---------- */
const b64 = fs.readFileSync(PNG_PATH).toString('base64');

/* ---------- 4. 寫回 index.html ---------- */
let html = fs.readFileSync(HTML_PATH, 'utf8');

const spriteRe = /const SPRITE = Object\.freeze\(\{[\s\S]*?\n\}\);/;
if (!spriteRe.test(html)) fail('index.html 搵唔到 SPRITE 座標表');
html = html.replace(spriteRe, spriteTable);

const b64Re = /const SHEET_B64 = '[^']*';/;
if (!b64Re.test(html)) fail('index.html 搵唔到 SHEET_B64');
html = html.replace(b64Re, `const SHEET_B64 = '${b64}';`);

fs.writeFileSync(HTML_PATH, html);

/* ---------- 5. 報告 ---------- */
const pngBytes = fs.statSync(PNG_PATH).size;
console.log('✓ 圖集已貼回 index.html');
console.log('  格數: ' + entries.length);
console.log('  PNG: ' + pngBytes + ' bytes');
console.log('  base64: ' + b64.length + ' 字元');
if (pngBytes > 8 * 1024) {
  console.warn('⚠️ 圖集超過 8 KB 預算（ART_IMPLEMENTATION_GUIDE.md §10.1）');
}
