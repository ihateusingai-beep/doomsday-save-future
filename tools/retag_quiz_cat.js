#!/usr/bin/env node
/* one-shot: add cat to questions.js + move shape → unit 2 */
'use strict';
const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, '..', 'questions.js');
let src = fs.readFileSync(FILE, 'utf8');

/* Map id → {unit?, cat} */
const MAP = {};
/* math unit1 cnnum */
for (let i = 36; i <= 51; i++) MAP['m-' + String(i).padStart(3, '0')] = { cat: 'cnnum' };
/* math unit2 arith — existing unit 2 ids */
['001','002','003','004','012','013','014','015','019','020','021','027','029','030','034']
  .forEach(id => { MAP['m-' + id] = { cat: 'arith', unit: 2 }; });
/* math unit2 shape — was unit 4 */
for (let i = 52; i <= 63; i++) MAP['m-' + String(i).padStart(3, '0')] = { cat: 'shape', unit: 2 };
/* math unit3 frac */
['007','008','011','017','018','025','026','035'].forEach(id => { MAP['m-' + id] = { cat: 'frac' }; });
/* math unit4 apply — remaining unit4 non-shape */
['005','006','009','010','016','022','023','024','028','031','032','033']
  .forEach(id => { MAP['m-' + id] = { cat: 'apply', unit: 4 }; });

/* chinese by unit in source — tag via unit number in add() later fallback */

/* Rewrite add() signature to accept cat as last-but after whySay — actually inject cat into object push */

/* Change add helper to 12-arg with cat before tags OR after whySay */
const NEW_ADD = `  const add = (id, subj, level, unit, q, opts, a, why, tags, say, whySay, cat) =>
    Q.push({ id: id, subj: subj, level: level, unit: unit, q: q, opts: opts, a: a, why: why,
             tags: tags || [], say: say || '', whySay: whySay || '', cat: cat || 'mix' });`;

if (!src.includes("const add = (id, subj, level, unit, q, opts, a, why, tags, say, whySay)")) {
  console.error('add signature not found');
  process.exit(1);
}
src = src.replace(
  /  const add = \(id, subj, level, unit, q, opts, a, why, tags, say, whySay\) =>\n    Q\.push\(\{ id: id, subj: subj, level: level, unit: unit, q: q, opts: opts, a: a, why: why,\n             tags: tags \|\| \[\], say: say \|\| '', whySay: whySay \|\| '' \}\);/,
  NEW_ADD
);

/* Patch each add('…') call: parse and append cat, maybe fix unit */
const re = /add\('([^']+)',\s*'([^']+)',\s*(\d+),\s*(\d+),\s*'((?:\\'|[^'])*)',\s*(\[[^\]]*\]),\s*(\d+),\s*'((?:\\'|[^'])*)',\s*(\[[^\]]*\]),\s*'((?:\\'|[^'])*)',\s*'((?:\\'|[^'])*)'\);/g;

function cnCat(unit) {
  return ({ 1: 'words', 2: 'idiom', 3: 'glyph', 4: 'rhetoric' })[unit] || 'mix';
}

let n = 0, missing = [];
src = src.replace(re, (full, id, subj, level, unit, q, opts, a, why, tags, say, whySay) => {
  n++;
  let u = +unit;
  let cat = 'mix';
  if (MAP[id]) {
    cat = MAP[id].cat;
    if (MAP[id].unit != null) u = MAP[id].unit;
  } else if (subj === 'chinese') {
    cat = cnCat(u);
  } else if (subj === 'math') {
    missing.push(id + ' u' + u);
    cat = ({ 1: 'cnnum', 2: 'arith', 3: 'frac', 4: 'apply' })[u] || 'mix';
  }
  return `add('${id}', '${subj}', ${level}, ${u}, '${q}', ${opts}, ${a}, '${why}', ${tags}, '${say}', '${whySay}', '${cat}');`;
});

/* header comment update */
src = src.replace(
  / \*    - 數學：1 中國數字 · 2 四則運算 · 3 分數小數 · 4 應用圖形/,
  ` *    - 數學：1 中國數字(cnnum) · 2 四則(arith)+分辨圖形(shape) · 3 分數(frac) · 4 應用(apply)
 *    - 語文：1 words · 2 idiom · 3 glyph · 4 rhetoric
 *    - ⚠️ cat 欄（PLAN #157）：字串 id；舊題無 cat → mix；指定範疇模式唔出 mix`
);

fs.writeFileSync(FILE, src);
console.log('patched adds:', n, 'missing map:', missing.length, missing.join(','));
/* verify load */
const sb = { window: {} };
new Function('window', fs.readFileSync(FILE, 'utf8'))(sb.window);
const B = sb.window.DSF_QUIZ_BANK;
const by = {};
for (const q of B) {
  const k = q.subj + '/u' + q.unit + '/' + q.cat;
  by[k] = (by[k] || 0) + 1;
  if (!q.cat) throw new Error('no cat ' + q.id);
}
console.log('total', B.length);
Object.keys(by).sort().forEach(k => console.log(k, by[k]));
const shapes = B.filter(q => q.cat === 'shape');
console.log('shape', shapes.length, 'units', [...new Set(shapes.map(q => q.unit))].join(','));
