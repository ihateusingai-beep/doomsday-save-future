#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, '..', 'index.html');
let s = fs.readFileSync(FILE, 'utf8');
function rep(a, b, label) {
  if (!s.includes(a)) { console.error('MISS:', label); console.error(a.slice(0, 80)); process.exit(1); }
  s = s.split(a).join(b);
  if (s.split(b).length - 1 < 1) { console.error('no apply', label); process.exit(1); }
  console.log('OK', label);
}
function repOnce(a, b, label) {
  const i = s.indexOf(a);
  if (i < 0) { console.error('MISS once:', label); process.exit(1); }
  s = s.slice(0, i) + b + s.slice(i + a.length);
  console.log('OK', label);
}

rep("ctx.fillText('v0.45.0 · 壓力段 · 答題 12 條 · 粵語語音', VIEW_W/2, VIEW_H/2 - 12);",
    "ctx.fillText('v0.46.0 · 單元→科目→範疇', VIEW_W/2, VIEW_H/2 - 12);", 'ver title');
rep("console.log('[啟動] 末日救未來 v0.45.0 已載入');",
    "console.log('[啟動] 末日救未來 v0.46.0 已載入');", 'ver boot');

repOnce(`  /* v0.43.0 #154：答題前置分流（揀完難度之後先揀科目 → 單元） */
  QUIZ_SUBJECT: 'QUIZ_SUBJECT',
  QUIZ_UNIT:   'QUIZ_UNIT',
});`,
`  /* v0.46.0 #157：單元 → 科目 → 範疇 */
  QUIZ_UNIT:    'QUIZ_UNIT',
  QUIZ_SUBJECT: 'QUIZ_SUBJECT',
  QUIZ_CAT:     'QUIZ_CAT',
});`, 'STATE');

repOnce(`  QUIZ_SUBJECT: '選擇科目',
  QUIZ_UNIT:   '選擇單元',
});`,
`  QUIZ_UNIT:    '選擇單元',
  QUIZ_SUBJECT: '選擇科目',
  QUIZ_CAT:     '選擇範疇',
});`, 'LABEL');

repOnce(`  } else if (s === STATE.QUIZ_SUBJECT) {
    hudEl.tip.textContent = '選擇科目 · 點擊卡片或按 1 2 3';
  } else if (s === STATE.QUIZ_UNIT) {
    hudEl.tip.textContent = '選擇單元 · 點擊卡片或按 1 至 5';
  } else if (s === STATE.SHIP_SELECT) {`,
`  } else if (s === STATE.QUIZ_UNIT) {
    hudEl.tip.textContent = '選擇單元 · 點擊或按 0–4';
  } else if (s === STATE.QUIZ_SUBJECT) {
    hudEl.tip.textContent = '選擇科目 · 點擊或按 1 2 3';
  } else if (s === STATE.QUIZ_CAT) {
    hudEl.tip.textContent = '選擇範疇 · 點擊卡片';
  } else if (s === STATE.SHIP_SELECT) {`, 'onEnter');

/* --- replace QUIZ_PLAN block through quizPool/apply/vars --- */
repOnce(`const QUIZ_PLAN_LS = 'dsf.quizPlan';   /* 老師預設 · {"subj":"math","unit":1} */
const QUIZ_SUBJECTS = [
  { id:'chinese', name:'語文', sub:'詞語 · 成語', col:'#4df' },
  { id:'math',    name:'數學', sub:'數字 · 運算', col:'#3df' },
  { id:'all',     name:'全部', sub:'語文 + 數學', col:'#ff6' },
];
/* 單元名嘅唯一真實來源（questions.js 只帶 unit 數字 · 唔好兩邊各寫一份） */
const QUIZ_UNITS = {
  chinese: ['詞語運用', '成語故事', '字形標點', '修辭手法'],
  math:    ['中國數字', '四則運算', '分數小數', '應用圖形'],
};
let quizSubj = 'all', quizUnit = 0;
/* 抽題池（科目 + 單元）· unit 0 = 該科目全部（含老師貼上嘅舊題 · 佢哋冇 unit） */
function quizPool(subj, unit) {
  const out = [];
  for (const q of quizBank) {
    if (subj !== 'all' && q.subj !== subj) continue;
    if (unit !== 0 && q.unit !== unit) continue;
    out.push(q);
  }
  return out;
}
/* 老師預設（localStorage['dsf.quizPlan']）· 有預設就跳過科目／單元兩張畫面 */
function applyQuizPlan() {
  const raw = lsReadStr(QUIZ_PLAN_LS);
  if (!raw) return false;
  let p = null;
  try { p = JSON.parse(raw); } catch (e) { return false; }
  if (!p || (p.subj !== 'chinese' && p.subj !== 'math' && p.subj !== 'all')) return false;
  const u = (p.unit | 0);
  if (u < 0 || u > 4) return false;
  quizSubj = p.subj;
  quizUnit = (p.subj === 'all') ? 0 : u;
  console.log('[答題] 用老師預設：' + quizSubj + ' · 單元 ' + quizUnit);
  return true;
}`,
`const QUIZ_PLAN_LS = 'dsf.quizPlan';   /* 老師預設 · {"unit":2,"subj":"math","cat":"shape"} */
const QUIZ_SUBJECTS = [
  { id:'chinese', name:'語文', sub:'詞語 · 成語', col:'#4df' },
  { id:'math',    name:'數學', sub:'數字 · 圖形', col:'#3df' },
  { id:'all',     name:'全部', sub:'語文 + 數學', col:'#ff6' },
];
/* 範疇顯示名 SSOT（PLAN #157）· questions.js 只帶 cat id */
const QUIZ_CAT_NAMES = Object.freeze({
  cnnum:'中國數字', arith:'四則運算', shape:'分辨圖形', frac:'分數小數', apply:'應用題',
  words:'詞語運用', idiom:'成語故事', glyph:'字形標點', rhetoric:'修辭手法',
  mix:'綜合', all:'全部範疇'
});
let quizSubj = 'all', quizUnit = 0, quizCat = 'all';
/* 抽題池 unit×subj×cat · 0/all 唔過濾；指定 cat 唔出 mix */
function quizPool(subj, unit, cat) {
  if (cat == null || cat === '') cat = 'all';
  const out = [];
  for (const q of quizBank) {
    if (subj !== 'all' && q.subj !== subj) continue;
    if (unit !== 0 && q.unit !== unit) continue;
    if (cat !== 'all') {
      if (q.cat !== cat) continue;
    }
    out.push(q);
  }
  return out;
}
function quizCatsAvailable(subj, unit) {
  const seen = {}, order = [];
  for (const q of quizBank) {
    if (subj !== 'all' && q.subj !== subj) continue;
    if (unit !== 0 && q.unit !== unit) continue;
    const c = q.cat || 'mix';
    if (c === 'mix' || c === 'all') continue;
    if (!seen[c]) { seen[c] = 0; order.push(c); }
    seen[c]++;
  }
  return order.map(id => ({ id: id, name: QUIZ_CAT_NAMES[id] || id, n: seen[id] }));
}
/* 老師預設 · 跳三層；舊 plan 缺 cat → all */
function applyQuizPlan() {
  const raw = lsReadStr(QUIZ_PLAN_LS);
  if (!raw) return false;
  let p = null;
  try { p = JSON.parse(raw); } catch (e) { return false; }
  if (!p || (p.subj !== 'chinese' && p.subj !== 'math' && p.subj !== 'all')) return false;
  const u = (p.unit | 0);
  if (u < 0 || u > 4) return false;
  let cat = (typeof p.cat === 'string' && p.cat) ? p.cat : 'all';
  if (cat !== 'all' && cat !== 'mix' && !QUIZ_CAT_NAMES[cat]) cat = 'all';
  quizSubj = p.subj;
  quizUnit = u;
  quizCat = cat;
  console.log('[答題] 用老師預設：U' + quizUnit + ' · ' + quizSubj + ' · ' + quizCat);
  return true;
}`, 'pool+plan');

/* validateQuizBank — add cat */
repOnce(`    good.push({ id:q.id, subj:q.subj, level:q.level|0,
                unit:((q.unit|0) >= 1 && (q.unit|0) <= 4) ? (q.unit|0) : 0,
                q:String(q.q||''), opts:q.opts.map(String), a:q.a, why:String(q.why||''), tags:(q.tags||[]).slice(0,6),
                say:String(q.say||''), whySay:String(q.whySay||'') });`,
`    good.push({ id:q.id, subj:q.subj, level:q.level|0,
                unit:((q.unit|0) >= 1 && (q.unit|0) <= 4) ? (q.unit|0) : 0,
                cat:(typeof q.cat === 'string' && q.cat) ? q.cat : 'mix',
                q:String(q.q||''), opts:q.opts.map(String), a:q.a, why:String(q.why||''), tags:(q.tags||[]).slice(0,6),
                say:String(q.say||''), whySay:String(q.whySay||'') });`, 'validate cat');

/* pickQuizQuestion */
repOnce(`function pickQuizQuestion() {
  if (!quizBank.length) return null;
  let pool = quizPool(quizSubj, quizUnit);
  /* ⚠️ 池空唔可以 crash：退回科目層全部（單元 0）· 例如只貼咗無 unit 嘅舊題 */
  if (!pool.length) {
    pool = quizPool(quizSubj, 0);
    if (pool.length) console.log('[答題] 單元 ' + quizUnit + ' 冇題 → 退回科目層全部');
  }
  if (!pool.length) return null;`,
`function pickQuizQuestion() {
  if (!quizBank.length) return null;
  let pool = quizPool(quizSubj, quizUnit, quizCat);
  if (!pool.length && quizCat !== 'all') {
    pool = quizPool(quizSubj, quizUnit, 'all');
    if (pool.length) console.log('[答題] 範疇 ' + quizCat + ' 冇題 → 退回單元池');
  }
  if (!pool.length && quizUnit !== 0) {
    pool = quizPool(quizSubj, 0, 'all');
    if (pool.length) console.log('[答題] 單元 ' + quizUnit + ' 冇題 → 退回科目層');
  }
  if (!pool.length) return null;`, 'pick');

/* quizScopeLabel */
repOnce(`function quizScopeLabel() {
  if (quizSubj === 'all') return '語文 + 數學';
  const names = QUIZ_UNITS[quizSubj] || [];
  const sub = quizSubj === 'math' ? '數學' : '語文';
  if (quizUnit === 0) return sub + ' · 全部';
  return sub + ' · ' + (names[quizUnit - 1] || '');
}`,
`function quizScopeLabel() {
  const u = quizUnit === 0 ? '全部單元' : ('單元' + quizUnit);
  const sub = quizSubj === 'all' ? '語數' : (quizSubj === 'math' ? '數學' : '語文');
  const c = (quizCat === 'all') ? '全部範疇' : (QUIZ_CAT_NAMES[quizCat] || quizCat);
  return u + ' · ' + sub + ' · ' + c;
}`, 'scopeLabel');

/* select + drawQuizFlow block */
repOnce(`/* 揀科目：全部 → 跳過單元層直接揀機；語文／數學 → 入單元層 */
function selectQuizSubject(idx) {
  const s = QUIZ_SUBJECTS[idx];
  if (!s) return false;
  quizSubj = s.id; quizUnit = 0;
  console.log('[答題] 科目', s.id);
  fsm.set(s.id === 'all' ? STATE.SHIP_SELECT : STATE.QUIZ_UNIT);
  return true;
}
/* 揀單元：零題嘅單元唔可以揀（防呆 —— 唔好俾學生揀一個永遠冇題嘅範疇） */
function selectQuizUnit(unit) {
  if (unit < 0 || unit > 4) return false;
  if (unit !== 0 && !quizPool(quizSubj, unit).length) return false;
  quizUnit = unit;
  console.log('[答題] 單元', unit);
  fsm.set(STATE.SHIP_SELECT);
  return true;
}`,
`/* #157：先單元 → 科目 → 範疇 */
function selectQuizUnit(unit) {
  if (unit < 0 || unit > 4) return false;
  if (unit !== 0 && !quizPool('all', unit, 'all').length) return false;
  quizUnit = unit; quizSubj = 'all'; quizCat = 'all';
  console.log('[答題] 單元', unit);
  fsm.set(STATE.QUIZ_SUBJECT);
  return true;
}
function goAfterSubject() {
  const cats = quizCatsAvailable(quizSubj, quizUnit);
  if (cats.length === 1) {
    quizCat = cats[0].id;
    console.log('[答題] 單範疇自動', quizCat);
    fsm.set(STATE.SHIP_SELECT);
    return;
  }
  if (cats.length === 0) {
    quizCat = 'all';
    fsm.set(STATE.SHIP_SELECT);
    return;
  }
  fsm.set(STATE.QUIZ_CAT);
}
function selectQuizSubject(idx) {
  const s = QUIZ_SUBJECTS[idx];
  if (!s) return false;
  if (!quizPool(s.id, quizUnit, 'all').length) return false;
  quizSubj = s.id; quizCat = 'all';
  console.log('[答題] 科目', s.id);
  goAfterSubject();
  return true;
}
function selectQuizCat(catId) {
  if (catId !== 'all' && !quizPool(quizSubj, quizUnit, catId).length) return false;
  quizCat = catId || 'all';
  console.log('[答題] 範疇', quizCat);
  fsm.set(STATE.SHIP_SELECT);
  return true;
}`, 'select*');

/* drawQuizFlow — full replace until end of function (before next function or comment) */
const drawStart = s.indexOf('function drawQuizFlow() {');
if (drawStart < 0) { console.error('no drawQuizFlow'); process.exit(1); }
/* find matching end: next "\\nfunction " after start that's at top level - use brace count */
let i = drawStart + 'function drawQuizFlow() {'.length;
let depth = 1;
while (i < s.length && depth > 0) {
  const ch = s[i++];
  if (ch === '{') depth++;
  else if (ch === '}') depth--;
}
const drawEnd = i;
const DRAW_NEW = `function drawQuizFlow() {
  const cur = fsm.cur;
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(0, 0, VIEW_W, 70);
  ctx.fillStyle = '#0ff'; ctx.font = 'bold 16px monospace'; ctx.textAlign = 'center';
  const title = cur === STATE.QUIZ_UNIT ? '選擇單元' : (cur === STATE.QUIZ_SUBJECT ? '選擇科目' : '選擇範疇');
  const sub = cur === STATE.QUIZ_UNIT ? '第幾單元嘅題' : (cur === STATE.QUIZ_SUBJECT ? '語文定數學' : '再揀題目包');
  ctx.fillText(title, VIEW_W / 2, 36);
  ctx.font = '10px monospace'; ctx.fillStyle = '#9ab';
  ctx.fillText(sub, VIEW_W / 2, 54);
  if (cur === STATE.QUIZ_UNIT) {
    const L = quizUnitCardsLayout();
    for (let u = 0; u <= 4; u++) {
      const r = L.rect(u);
      const n = quizPool('all', u, 'all').length;
      const on = quizUnit === u;
      ctx.fillStyle = (n === 0) ? 'rgba(0,20,40,0.5)' : (on ? 'rgba(0,50,80,0.92)' : 'rgba(0,20,40,0.78)');
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = (n === 0) ? '#456' : (on ? '#4df5d0' : 'rgba(77,245,208,0.55)');
      ctx.lineWidth = on ? 3 : 2; ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#9ab'; ctx.font = '10px monospace';
      ctx.fillText(u === 0 ? '全部' : ('單元 ' + u), r.x + r.w / 2, r.y + 22);
      ctx.fillStyle = (n === 0) ? '#667' : '#0ff'; ctx.font = 'bold 16px monospace';
      ctx.fillText(u === 0 ? '全單元' : ('U' + u), r.x + r.w / 2, r.y + 48);
      ctx.fillStyle = '#8ac'; ctx.font = '10px monospace';
      ctx.fillText(n + ' 條', r.x + r.w / 2, r.y + 72);
    }
  } else if (cur === STATE.QUIZ_SUBJECT) {
    const L = diffCardsLayout();
    QUIZ_SUBJECTS.forEach((s0, i0) => {
      const r = L.rect(i0);
      const n = quizPool(s0.id, quizUnit, 'all').length;
      const on = quizSubj === s0.id;
      ctx.fillStyle = (n === 0) ? 'rgba(0,20,40,0.5)' : (on ? 'rgba(0,50,80,0.92)' : 'rgba(0,20,40,0.78)');
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = (n === 0) ? '#456' : s0.col; ctx.lineWidth = on ? 3 : 2;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = (n === 0) ? '#667' : s0.col; ctx.font = 'bold 24px monospace';
      ctx.fillText(s0.name, r.x + r.w / 2, r.y + 34);
      ctx.font = '12px monospace'; ctx.fillStyle = '#cde';
      ctx.fillText(s0.sub, r.x + r.w / 2, r.y + 60);
      ctx.font = '10px monospace'; ctx.fillStyle = '#8ac';
      ctx.fillText(n + ' 條', r.x + r.w / 2, r.y + 84);
    });
    ctx.fillStyle = '#89a'; ctx.font = '10px monospace';
    ctx.fillText(quizUnit === 0 ? '全部單元' : ('已選單元 ' + quizUnit), VIEW_W / 2, VIEW_H - 56);
  } else {
    /* QUIZ_CAT */
    const cats = [{ id: 'all', name: '全部範疇', n: quizPool(quizSubj, quizUnit, 'all').length }]
      .concat(quizCatsAvailable(quizSubj, quizUnit));
    const L = quizUnitCardsLayout();
    for (let i0 = 0; i0 < cats.length && i0 < 5; i0++) {
      const c = cats[i0];
      const r = L.rect(i0);
      const on = quizCat === c.id;
      const n = c.n;
      ctx.fillStyle = (n === 0) ? 'rgba(0,20,40,0.5)' : (on ? 'rgba(0,50,80,0.92)' : 'rgba(0,20,40,0.78)');
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = (n === 0) ? '#456' : (on ? '#4df5d0' : 'rgba(77,245,208,0.55)');
      ctx.lineWidth = on ? 3 : 2; ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.textAlign = 'center';
      ctx.fillStyle = (n === 0) ? '#667' : '#0ff'; ctx.font = 'bold 12px monospace';
      const nm = wrapText(ctx, c.name, r.w - 8);
      ctx.fillText(nm[0] || c.name, r.x + r.w / 2, r.y + 36);
      if (nm[1]) ctx.fillText(nm[1], r.x + r.w / 2, r.y + 50);
      ctx.fillStyle = '#8ac'; ctx.font = '10px monospace';
      ctx.fillText(n + ' 條', r.x + r.w / 2, r.y + 72);
    }
    ctx.fillStyle = '#89a'; ctx.font = '10px monospace';
    const subN = quizSubj === 'all' ? '語數' : (quizSubj === 'math' ? '數學' : '語文');
    ctx.fillText((quizUnit === 0 ? '全單元' : ('U' + quizUnit)) + ' · ' + subN, VIEW_W / 2, VIEW_H - 56);
  }
}`;
s = s.slice(0, drawStart) + DRAW_NEW + s.slice(drawEnd);
console.log('OK drawQuizFlow');

/* hitQuizCatCard */
repOnce(`function hitQuizUnitCard(px, py) {
  const L = quizUnitCardsLayout();
  for (let i = 0; i <= 4; i++) {
    const r = L.rect(i);
    if (px >= r.x - 8 && px <= r.x + r.w + 8 && py >= r.y - 8 && py <= r.y + r.h + 8) return i;
  }
  return -1;
}`,
`function hitQuizUnitCard(px, py) {
  const L = quizUnitCardsLayout();
  for (let i = 0; i <= 4; i++) {
    const r = L.rect(i);
    if (px >= r.x - 8 && px <= r.x + r.w + 8 && py >= r.y - 8 && py <= r.y + r.h + 8) return i;
  }
  return -1;
}
function hitQuizCatCard(px, py) {
  const cats = [{ id: 'all' }].concat(quizCatsAvailable(quizSubj, quizUnit));
  const L = quizUnitCardsLayout();
  const n = Math.min(5, cats.length);
  for (let i = 0; i < n; i++) {
    const r = L.rect(i);
    if (px >= r.x - 8 && px <= r.x + r.w + 8 && py >= r.y - 8 && py <= r.y + r.h + 8) return cats[i].id;
  }
  return null;
}`, 'hitCat');

/* menu tap order: UNIT first then SUBJECT then CAT */
repOnce(`  /* v0.43.0 #154：答題前置分流（科目 → 單元） */
  if (fsm.cur === STATE.QUIZ_SUBJECT) {
    const idx = hitQuizSubjectCard(px, py);
    if (idx >= 0) selectQuizSubject(idx);
    return true;
  }
  if (fsm.cur === STATE.QUIZ_UNIT) {
    const u = hitQuizUnitCard(px, py);
    if (u >= 0) selectQuizUnit(u);
    return true;
  }`,
`  /* v0.46.0 #157：單元 → 科目 → 範疇 */
  if (fsm.cur === STATE.QUIZ_UNIT) {
    const u = hitQuizUnitCard(px, py);
    if (u >= 0) selectQuizUnit(u);
    return true;
  }
  if (fsm.cur === STATE.QUIZ_SUBJECT) {
    const idx = hitQuizSubjectCard(px, py);
    if (idx >= 0) selectQuizSubject(idx);
    return true;
  }
  if (fsm.cur === STATE.QUIZ_CAT) {
    const cid = hitQuizCatCard(px, py);
    if (cid) selectQuizCat(cid);
    return true;
  }`, 'menuTap');

/* selectDiffAndContinue → QUIZ_UNIT */
repOnce(`  fsm.set(STATE.QUIZ_SUBJECT);
}`,
`  fsm.set(STATE.QUIZ_UNIT);
}`, 'diffContinue');

/* render gate */
repOnce(`  if (fsm.cur === STATE.QUIZ_SUBJECT || fsm.cur === STATE.QUIZ_UNIT) {
    drawQuizFlow();
    renderTail();
    return;
  }`,
`  if (fsm.cur === STATE.QUIZ_UNIT || fsm.cur === STATE.QUIZ_SUBJECT || fsm.cur === STATE.QUIZ_CAT) {
    drawQuizFlow();
    renderTail();
    return;
  }`, 'render');

/* menu whitelist if any */
rep(`|| s === STATE.QUIZ_SUBJECT || s === STATE.QUIZ_UNIT`,
    `|| s === STATE.QUIZ_UNIT || s === STATE.QUIZ_SUBJECT || s === STATE.QUIZ_CAT`, 'whitelist');

/* keyboard handlers - read and patch */
/* common pattern around 3729 */
if (s.includes(`if (fsm.cur === STATE.QUIZ_SUBJECT) {`)) {
  /* keyboard section may have two occurrences - pointer already fixed; keydown */
}

/* __dsf */
repOnce(`  quizFlow: { get subj(){ return quizSubj; }, get unit(){ return quizUnit; },
              pool: () => quizPool(quizSubj, quizUnit).length,
              selectQuizSubject, selectQuizUnit, applyQuizPlan,
              subjectCards: diffCardsLayout, unitCards: quizUnitCardsLayout },`,
`  quizFlow: { get subj(){ return quizSubj; }, get unit(){ return quizUnit; }, get cat(){ return quizCat; },
              pool: () => quizPool(quizSubj, quizUnit, quizCat).length,
              cats: () => quizCatsAvailable(quizSubj, quizUnit),
              selectQuizSubject, selectQuizUnit, selectQuizCat, applyQuizPlan,
              subjectCards: diffCardsLayout, unitCards: quizUnitCardsLayout },`, 'dsf');

/* keydown handlers for quiz */
repOnce(`  /* v0.43.0 #154：用鍵盤揀科目（1–3）／單元（1–5 = 全部／單元 1–4） */
  if (fsm.cur === STATE.QUIZ_SUBJECT) {
    if (k === '1' || k === '2' || k === '3') selectQuizSubject(parseInt(k, 10) - 1);
    else if (k === 'enter' || k === ' ') selectQuizSubject(0);
    return;
  }
  if (fsm.cur === STATE.QUIZ_UNIT) {
    if (k >= '1' && k <= '5') selectQuizUnit(parseInt(k, 10) - 1);
    else if (k === 'enter' || k === ' ') selectQuizUnit(0);
    return;
  }`,
`  /* v0.46.0 #157：鍵盤 單元 → 科目 → 範疇 */
  if (fsm.cur === STATE.QUIZ_UNIT) {
    if (k >= '0' && k <= '4') selectQuizUnit(parseInt(k, 10));
    else if (k === 'enter' || k === ' ') selectQuizUnit(0);
    return;
  }
  if (fsm.cur === STATE.QUIZ_SUBJECT) {
    if (k === '1' || k === '2' || k === '3') selectQuizSubject(parseInt(k, 10) - 1);
    else if (k === 'enter' || k === ' ') selectQuizSubject(0);
    return;
  }
  if (fsm.cur === STATE.QUIZ_CAT) {
    const cats = [{ id: 'all' }].concat(quizCatsAvailable(quizSubj, quizUnit));
    if (k >= '1' && k <= '5' && cats[parseInt(k, 10) - 1]) selectQuizCat(cats[parseInt(k, 10) - 1].id);
    else if (k === 'enter' || k === ' ') selectQuizCat(cats[0] ? cats[0].id : 'all');
    return;
  }`, 'keydown');

fs.writeFileSync(FILE, s);
console.log('wrote', FILE, 'bytes', s.length);

const scripts = [];
const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
let mm;
while ((mm = re.exec(s))) scripts.push(mm[1]);
const main = scripts.sort((a, b) => b.length - a.length)[0];
fs.writeFileSync('/tmp/dsf046.js', main);
const { spawnSync } = require('child_process');
const r = spawnSync('node', ['--check', '/tmp/dsf046.js'], { encoding: 'utf8' });
console.log(r.stderr || r.stdout || '');
console.log('check exit', r.status);
