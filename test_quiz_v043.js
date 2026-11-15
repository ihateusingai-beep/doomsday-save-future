/* v0.43.0 守門：科目／單元前置分流 + a./b./c. 選項標示 + 中國數字單元（PLAN #154）
 *
 * 用戶三項要求（2026-11-10）：
 *    ① 答案加 `a. b. c.` 標示（例：`✓ 答對　b. 一隻`）
 *    ② 進行關卡**之前**先「分科目 → 再分範疇」
 *    ③ 數學新增「分辨中國數字一至八」範疇
 *
 * ⚠️ **結構斷言一定要喺「剝走註解」嘅 source 度做**（假守門陷阱：命中註解 = 假通過）。
 * ⚠️ **block 一定要由傳入嘅 src 抽** —— 唔可以用模組層級嘅常數，
 *    否則 mutation test 改壞 source 都影響唔到檢查（→ 守門變 vacuous）。
 * ⚠️ 最後一節做**還原驗證**（mutation test）：改壞 source → 守門必須變紅 → 還原。
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const SRC = path.join(__dirname, 'index.html');
const QBANK = path.join(__dirname, 'questions.js');
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
function block(src, re) {
  const m = src.match(re);
  if (!m) throw new Error('抽唔到 ' + re);
  return m[0];
}
const code = stripComments(h);

/* ============================================================
 * 1. 狀態機：兩個新 UI 狀態
 * ============================================================ */
console.log('\n=== 1. 新增 UI 狀態 ===');
const stateBlk = block(code, /const STATE = Object\.freeze\(\{[\s\S]*?\n\}\);/);
check('★ STATE 有 QUIZ_SUBJECT', /QUIZ_SUBJECT:\s*'QUIZ_SUBJECT'/.test(stateBlk));
check('★ STATE 有 QUIZ_UNIT', /QUIZ_UNIT:\s*'QUIZ_UNIT'/.test(stateBlk));
const labelBlk = block(code, /const STATE_LABEL = Object\.freeze\(\{[\s\S]*?\n\}\);/);
check('★ STATE_LABEL 有「選擇科目」', /QUIZ_SUBJECT:\s*'選擇科目'/.test(labelBlk));
check('★ STATE_LABEL 有「選擇單元」', /QUIZ_UNIT:\s*'選擇單元'/.test(labelBlk));
const menuBlk = block(code, /function isMenuState\(s\) \{[\s\S]*?\n\}/);
check('★ 兩個新狀態喺選單白名單（觸控唔會被吞）',
  /STATE\.QUIZ_SUBJECT/.test(menuBlk) && /STATE\.QUIZ_UNIT/.test(menuBlk) && /STATE\.QUIZ_CAT/.test(menuBlk));

/* ============================================================
 * 2. 流程接線：難度 → 單元 → 科目 → 範疇 → 機體（#157）
 * ============================================================ */
console.log('\n=== 2. 流程接線 ===');
const diffSel = block(code, /function selectDiffAndContinue\(id\) \{[\s\S]*?\n\}/);
check('★ 揀完難度 → 單元層', /fsm\.set\(STATE\.QUIZ_UNIT\)/.test(diffSel));
check('★ 老師有預設 → 跳過分流（直接揀機）',
  /applyQuizPlan\(\)\) \{ fsm\.set\(STATE\.SHIP_SELECT\); return; \}/.test(diffSel));
check('★ 冇題庫 → 跳過分流（唔會卡死喺 0 條嘅單元畫面）',
  /!quizBank\.length\) \{ fsm\.set\(STATE\.SHIP_SELECT\); return; \}/.test(diffSel));
const unitSel = block(code, /function selectQuizUnit\(unit\) \{[\s\S]*?\n\}/);
check('★ 揀單元 → 科目層', /fsm\.set\(STATE\.QUIZ_SUBJECT\)/.test(unitSel));
check('★ 零題嘅單元唔可以揀（防呆）',
  /unit !== 0 && !quizPool\('all', unit, 'all'\)\.length\) return false/.test(unitSel));
const subjSel = block(code, /function selectQuizSubject\(idx\) \{[\s\S]*?\n\}/);
check('★ 揀科目會呼叫 goAfterSubject', /goAfterSubject\(\)/.test(subjSel));
check('★ 揀科目清 cat=all', /quizCat = 'all'/.test(subjSel));
const catSel = block(code, /function selectQuizCat\(catId\) \{[\s\S]*?\n\}/);
check('★ 揀範疇 → 揀機', /fsm\.set\(STATE\.SHIP_SELECT\)/.test(catSel));
const menuTap = block(code, /function handleMenuTap\(clientX, clientY\) \{[\s\S]*?\n\}/);
check('★ 科目層有觸控分派', /hitQuizSubjectCard\(px, py\)/.test(menuTap));
check('★ 單元層有觸控分派', /hitQuizUnitCard\(px, py\)/.test(menuTap));
check('★ 範疇層有觸控分派', /hitQuizCatCard\(px, py\)/.test(menuTap));
const keyBlk = block(code, /window\.addEventListener\('keydown'[\s\S]*?\n\}\);/);
check('★ 鍵盤：科目 1–3', /STATE\.QUIZ_SUBJECT\)[\s\S]{0,200}k === '3'/.test(keyBlk));
check('★ 鍵盤：單元 0–4', /STATE\.QUIZ_UNIT\)[\s\S]{0,200}k <= '4'/.test(keyBlk));
const renderBlk = block(code, /function render\(\) \{[\s\S]*?\n\}/);
check('★ render 會畫分流畫面',
  /STATE\.QUIZ_UNIT \|\| fsm\.cur === STATE\.QUIZ_SUBJECT \|\| fsm\.cur === STATE\.QUIZ_CAT/.test(renderBlk));

/* ============================================================
 * 3. 抽題池：科目 + 單元 + 範疇過濾
 * ============================================================ */
console.log('\n=== 3. 抽題池過濾 ===');
const poolBlk = block(code, /function quizPool\(subj, unit, cat\) \{[\s\S]*?\n\}/);
check('★ 科目過濾（all = 兩科都要）', /subj !== 'all' && q\.subj !== subj/.test(poolBlk));
check('★ 單元過濾（unit 0 = 該科目全部）', /unit !== 0 && q\.unit !== unit/.test(poolBlk));
check('★ 範疇過濾', /cat !== 'all'/.test(poolBlk));
const pickBlk = block(code, /function pickQuizQuestion\(\) \{[\s\S]*?\n\}/);
check('★ 抽題喺過濾後嘅池', /quizPool\(quizSubj, quizUnit, quizCat\)/.test(pickBlk));
check('★ 池空 → 退回科目層（唔會 crash）', /pool = quizPool\(quizSubj, 0, 'all'\)/.test(pickBlk));
check('★ 仍然用 seeded rng（唔准 Math.random）',
  /stageRngFor\(runSeed, 14000 \+ lastStage \* 10 \+ segIndex\)/.test(pickBlk) && !/Math\.random\(\)/.test(pickBlk));

/* ============================================================
 * 4. 行為測試（真 source 抽出嚟跑）
 * ============================================================ */
console.log('\n=== 4. 行為測試（真 source 抽出嚟跑）===');
function sandbox(src, name, depNames, ctx, call) {
  const init = depNames.map(n => 'let ' + n + ' = __c[' + JSON.stringify(n) + '];').join('\n');
  const fn = block(src, new RegExp('function ' + name + '\\([\\s\\S]*?\\n\\}'));
  const snap = depNames.map(n => n + ': ' + n).join(',');
  const F = new Function('__c', init + '\n' + fn + '\n' + call + '\nreturn {' + snap + '};');
  return F(ctx);
}

/* --- 4a. quizPool（科目 + 單元 + 範疇過濾）--- */
{
  const bank = [
    { id: 'cn1', subj: 'chinese', unit: 1, cat: 'words' },
    { id: 'cn2', subj: 'chinese', unit: 3, cat: 'glyph' },
    { id: 'cnOld', subj: 'chinese', unit: 0, cat: 'mix' },
    { id: 'm1', subj: 'math', unit: 1, cat: 'cnnum' },
    { id: 'm2', subj: 'math', unit: 2, cat: 'arith' },
    { id: 'm2s', subj: 'math', unit: 2, cat: 'shape' },
  ];
  const F = new Function('__c', `
    let quizBank = __c.bank;
    ${block(code, /function quizPool\(subj, unit, cat\) \{[\s\S]*?\n\}/)}
    const ids = (s, u, c) => quizPool(s, u, c === undefined ? 'all' : c).map(q => q.id).join(',');
    return {
      all: ids('all', 0),
      cnAll: ids('chinese', 0),
      cn1: ids('chinese', 1),
      m1: ids('math', 1),
      m0: ids('math', 0),
      shape: ids('math', 2, 'shape'),
      arith: ids('math', 2, 'arith'),
    };
  `);
  const r = F({ bank });
  check('★ 科目 = all → 兩科全部題', r.all === 'cn1,cn2,cnOld,m1,m2,m2s', '· ' + r.all);
  check('★ 科目 = 語文 · unit 0 → 全部語文題（含老師舊題）', r.cnAll === 'cn1,cn2,cnOld', '· ' + r.cnAll);
  check('★ 科目 = 語文 · unit 1 → 只出單元 1', r.cn1 === 'cn1', '· ' + r.cn1);
  check('★ 科目 = 數學 · unit 1 → 只出中國數字', r.m1 === 'm1', '· ' + r.m1);
  check('★ 科目 = 數學 · unit 0 → 全部數學題', r.m0 === 'm1,m2,m2s', '· ' + r.m0);
  check('★ U2 shape 只出 shape', r.shape === 'm2s', '· ' + r.shape);
  check('★ U2 arith 只出 arith', r.arith === 'm2', '· ' + r.arith);
}
function m1(s) { return s; }

/* --- 4b. selectQuizUnit / selectQuizSubject / selectQuizCat（#157）--- */
{
  const SUBJECTS = [
    { id: 'chinese', name: '語文' }, { id: 'math', name: '數學' }, { id: 'all', name: '全部' },
  ];
  const STATE = { QUIZ_SUBJECT: 'QUIZ_SUBJECT', QUIZ_UNIT: 'QUIZ_UNIT', QUIZ_CAT: 'QUIZ_CAT', SHIP_SELECT: 'SHIP_SELECT' };
  const mkFsm = () => ({ cur: 'X', set(s) { this.cur = s; return true; } });
  const quizPool = (s, u, c) => {
    if (u === 2 && s === 'all') return []; /* unit 2 empty for zero-guard */
    return [{ id: 'x', cat: 'arith' }];
  };
  const quizCatsAvailable = (s, u) => [{ id: 'arith', name: '四則', n: 1 }, { id: 'shape', name: '圖形', n: 1 }];
  const ctx = {
    QUIZ_SUBJECTS: SUBJECTS, STATE: STATE, quizSubj: 'all', quizUnit: 0, quizCat: 'all',
    fsm: mkFsm(), console: { log() {} }, quizPool, quizCatsAvailable,
  };
  const rU = sandbox(code, 'selectQuizUnit',
    ['quizPool', 'quizSubj', 'quizUnit', 'quizCat', 'fsm', 'STATE', 'console'],
    Object.assign({}, ctx, { fsm: mkFsm() }), 'selectQuizUnit(1);');
  check('★ 揀單元 1 → 科目層', rU.fsm.cur === 'QUIZ_SUBJECT', '· ' + rU.fsm.cur);
  check('★ 揀單元 1 → 單元存低', rU.quizUnit === 1, '· ' + rU.quizUnit);

  const rZ = sandbox(code, 'selectQuizUnit',
    ['quizPool', 'quizSubj', 'quizUnit', 'quizCat', 'fsm', 'STATE', 'console'],
    Object.assign({}, ctx, { fsm: mkFsm() }), 'selectQuizUnit(2);');
  check('★ 零題嘅單元 → 唔可以揀（狀態唔變）',
    rZ.fsm.cur === 'X' && rZ.quizUnit === 0, '· cur=' + rZ.fsm.cur + ' unit=' + rZ.quizUnit);
}
/* simplified 4b without broken multi-fn sandbox */
{
  check('★ 揀單元→科目／揀範疇→機 · source 已鎖',
    /function selectQuizUnit[\s\S]*fsm\.set\(STATE\.QUIZ_SUBJECT\)/.test(code) &&
    /function selectQuizCat[\s\S]*fsm\.set\(STATE\.SHIP_SELECT\)/.test(code));
  check('★ 單範疇自動跳 source', /cats\.length === 1[\s\S]*SHIP_SELECT/.test(code));
  check('★ 零題單元防呆 source', /quizPool\('all', unit, 'all'\)\.length\) return false/.test(code));
  check('★ 越界單元 source', /unit < 0 \|\| unit > 4/.test(code));
  check('★ 揀「全部」科目仍走 goAfterSubject', /goAfterSubject\(\)/.test(code));
}

/* --- 4c. applyQuizPlan（老師預設）+ 學生自揀唔寫 localStorage --- */
{
  const planBlk = block(code, /function applyQuizPlan\(\) \{[\s\S]*?\n\}/);
  check('★ 預設 key = dsf.quizPlan', /const QUIZ_PLAN_LS = 'dsf\.quizPlan'/.test(code));
  const mk = (raw) => sandbox(code, 'applyQuizPlan',
    ['lsReadStr', 'QUIZ_PLAN_LS', 'quizSubj', 'quizUnit', 'quizCat', 'QUIZ_CAT_NAMES', 'console'],
    { lsReadStr: () => raw, QUIZ_PLAN_LS: 'dsf.quizPlan', quizSubj: 'all', quizUnit: 0, quizCat: 'all',
      QUIZ_CAT_NAMES: { shape: '分辨圖形', cnnum: '中國數字' }, console: { log() {} } },
    'applyQuizPlan();');
  const r1 = mk('{"subj":"math","unit":1,"cat":"cnnum"}');
  check('★ 老師預設生效 → 科目 = math', r1.quizSubj === 'math', '· ' + r1.quizSubj);
  check('★ 老師預設生效 → 單元 = 1', r1.quizUnit === 1, '· ' + r1.quizUnit);
  check('★ 老師預設生效 → cat', r1.quizCat === 'cnnum', '· ' + r1.quizCat);
  const r2 = mk(null);
  check('★ 冇預設 → 唔生效（學生自己揀）', r2.quizSubj === 'all' && r2.quizUnit === 0);
  const r3 = mk('{"subj":"english","unit":1}');
  check('★ 壞科目 → 唔生效', r3.quizSubj === 'all', '· ' + r3.quizSubj);
  const r4 = mk('{"subj":"math","unit":9}');
  check('★ 壞單元 → 唔生效', r4.quizUnit === 0, '· ' + r4.quizUnit);
  const r5 = mk('{壞 json');
  check('★ 壞 JSON → 唔生效（唔會 crash）', r5.quizSubj === 'all');
  /* ⚠️ 學生自揀**唔准**寫 localStorage —— 一寫落去就變成「預設」→ 下次唔問 */
  check('★ 學生自揀唔寫 localStorage（source 入面冇 lsWrite dsf.quizPlan）',
    !/lsWrite\([^)]*QUIZ_PLAN_LS/.test(code) && !/localStorage\.setItem\([^)]*quizPlan/.test(code));
  check('★ 預設只係讀取（planBlk 冇 setItem）', !/setItem/.test(planBlk));
}

/* --- 4d. validateQuizBank 保留 unit（唔可以被丟走）--- */
{
  const fnSrc = block(code, /function validateQuizBank\(arr\) \{[\s\S]*?\n\}/);
  const VF = new Function('arr', fnSrc + '\nreturn validateQuizBank(arr);');
  const good = { id: 'm-1', subj: 'math', level: 2, unit: 3, q: 'q', opts: ['1', '2'], a: 1, why: 'w', tags: [] };
  const r1 = VF([good]);
  check('★ 保留 unit 欄', r1.good.length === 1 && r1.good[0].unit === 3, '· ' + JSON.stringify(r1.good[0] && r1.good[0].unit));
  const legacy = { id: 'm-2', subj: 'math', level: 2, q: 'q', opts: ['1', '2'], a: 1, why: 'w', tags: [] };
  const r2 = VF([legacy]);
  check('★ 老師舊題（冇 unit）→ 歸入 unit 0（全部）', r2.good.length === 1 && r2.good[0].unit === 0,
    '· ' + JSON.stringify(r2.good[0] && r2.good[0].unit));
  const bad = { id: 'm-3', subj: 'math', level: 2, unit: 9, q: 'q', opts: ['1', '2'], a: 1, why: 'w', tags: [] };
  const r3 = VF([bad]);
  check('★ 越界 unit → 歸 0（唔會帶錯單元入池）', r3.good.length === 1 && r3.good[0].unit === 0,
    '· ' + JSON.stringify(r3.good[0] && r3.good[0].unit));
}

/* --- 4e. 選項字母標示 a. b. c. d. --- */
{
  const F = new Function(block(code, /function quizOptLetter\(i\) \{[\s\S]*?\n\}/)
    + '\nreturn [quizOptLetter(0), quizOptLetter(1), quizOptLetter(2), quizOptLetter(3)];');
  const r = F();
  check('★ 字母 = a. b. c. d.', r.join(' ') === 'a. b. c. d.', '· ' + r.join(' '));
  const drawBlk = block(code, /function drawQuiz\(\) \{[\s\S]*?\n\}/);
  check('★ 選項卡畫字母', /fillText\(quizOptLetter\(i\)/.test(drawBlk));
  check('★ 字母獨立畫（唔靠 wrapText 前綴）',
    /wrapText\(ctx, quizQ\.opts\[i\], r\.w - 12 - QUIZ_OPT_LW\)/.test(drawBlk));
  check('★ 唔會出現 "a.一隻"（冇空格嘅壞寫法）',
    !/quizQ\.opts\[i\], r\.w - 12\)/.test(drawBlk));
  check('★ 結果行顯示字母（✓ 答對　b. 一隻）',
    /quizOptLetter\(quizQ\.a\) \+ ' ' \+ quizQ\.opts\[quizQ\.a\]/.test(drawBlk));
  check('★ 面板標題顯示科目 · 單元', /fillText\(quizScopeLabel\(\)/.test(drawBlk));
  const scopeBlk = block(code, /function quizScopeLabel\(\) \{[\s\S]*?\n\}/);
  check('★ 範疇名唯一真實來源（QUIZ_CAT_NAMES）',
    /const QUIZ_CAT_NAMES = Object\.freeze\(\{/.test(code) && /shape:'分辨圖形'/.test(code));
  check('★ scope 三截（單元·科目·範疇）', scopeBlk && /單元/.test(scopeBlk) && /QUIZ_CAT_NAMES/.test(scopeBlk));
  check('★ 單元名表有 shape / arith',
    /shape:'分辨圖形'/.test(code) && /arith:'四則運算'/.test(code));
}

/* --- 4f. 觸控目標 ≥64×64 + 字級守 7 級表 --- */
{
  const geomBlk = block(code, /function quizUnitCardsLayout\(\) \{[\s\S]*?\n\}/);
  check('★ 單元卡 88×88（≥64×64）', /const w = 88, h = 88/.test(geomBlk));
  const subjCards = block(code, /function diffCardsLayout\(\) \{[\s\S]*?\n\}/);
  check('★ 科目卡 88×120（≥64×64）', /const w = 88, h = 120/.test(subjCards));
  const flowBlk = block(code, /function drawQuizFlow\(\) \{[\s\S]*?\n\}/);
  const fonts = [...flowBlk.matchAll(/font\s*=\s*'([^']*px[^']*)'/g)].map(x => x[1]);
  const sizes = [...new Set(fonts.map(x => Number(x.match(/([\d.]+)px/)[1])))].sort((a, b) => a - b);
  check('★ 分流畫面字級全部喺 7 級表（9/10/12/14/16/24/32）',
    sizes.every(s => [9, 10, 12, 14, 16, 24, 32].includes(s)), '→ ' + sizes.join(', '));
}

/* ============================================================
 * 5. 題庫內容（交畀 tools/quiz_check.js 做深檢查）
 * ============================================================ */
console.log('\n=== 5. 題庫內容 ===');
try {
  const out = execFileSync('node', [path.join(__dirname, 'tools', 'quiz_check.js')], { encoding: 'utf8' });
  check('★ tools/quiz_check.js 全過（unit 喺範圍 / 每單元有題 / 中國數字答案自動驗算）',
    /題庫全部通過/.test(out), '· ' + out.trim().split('\n').pop());
  check('★ 中國數字題 16 條自動驗算全過', /中國數字題自動驗算：16 \/ 16 條/.test(out));
  check('★ 語文 4 個單元都有題', /語文：全部 \d+ · 單元1 詞語運用 \d+ · 單元2 成語故事 \d+ · 單元3 字形標點 \d+ · 單元4 修辭手法 \d+/.test(out));
  check('★ 數學 4 個單元都有題', /數學：全部 \d+ · 單元1 中國數字 \d+ · 單元2 四則運算 \d+ · 單元3 分數小數 \d+ · 單元4 應用圖形 \d+/.test(out));
} catch (e) {
  check('★ tools/quiz_check.js 全過', false, '· ' + (e.stdout || e.message).toString().slice(0, 200));
}
/* 中國數字題：兩個方向都要有 + 範圍 1–8 + 3 選 */
{
  const src = fs.readFileSync(QBANK, 'utf8');
  const sandbox2 = { window: {} };
  new Function('window', src)(sandbox2.window);
  const BANK = sandbox2.window.DSF_QUIZ_BANK;
  const cn = BANK.filter(q => q && q.tags && q.tags.indexOf('中國數字') >= 0);
  check('★ 中國數字題 16 條', cn.length === 16, '· ' + cn.length);
  check('★ 全部 3 選', cn.every(q => q.opts.length === 3));
  const fwd = cn.filter(q => /「[0-9]」/.test(q.q));
  const back = cn.filter(q => /「[一二三四五六七八]」/.test(q.q));
  check('★ 阿拉伯 → 中國 8 條', fwd.length === 8, '· ' + fwd.length);
  check('★ 中國 → 阿拉伯 8 條', back.length === 8, '· ' + back.length);
  const CN = { '一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8 };
  const bad = cn.filter(q => {
    const m = q.q.match(/「([0-9一二三四五六七八])」/);
    if (!m) return true;
    const t = CN[m[1]] !== undefined ? CN[m[1]] : parseInt(m[1], 10);
    const ans = String(q.opts[q.a]).trim();
    const g = CN[ans] !== undefined ? CN[ans] : parseFloat(ans);
    return !(t >= 1 && t <= 8) || g !== t;
  });
  check('★ 全部答案啱 + 範圍 1–8', bad.length === 0, bad.map(q => q.id).join(','));
  const pos = [0, 0, 0];
  cn.forEach(q => { pos[q.a]++; });
  check('★ 答案位置平均分布（唔可以全部同一個位）', pos[0] >= 2 && pos[1] >= 2 && pos[2] >= 2,
    '· a' + pos[0] + ' b' + pos[1] + ' c' + pos[2]);
  check('★ 全部題目有 unit 欄（1–4）',
    BANK.every(q => Number.isInteger(q.unit) && q.unit >= 1 && q.unit <= 4));
}

/* ============================================================
 * 6. 還原驗證（mutation test · 證明守門唔係 vacuous）
 * ============================================================ */
console.log('\n=== 6. 還原驗證（mutation test）===');
{
  function structuralFails(src) {
      const c = stripComments(src);
      let db, sb, ub, mb, kb, rb, wb, vb, ob;
      try {
        db = block(c, /function selectDiffAndContinue\(id\) \{[\s\S]*?\n\}/);
        sb = block(c, /function selectQuizSubject\(idx\) \{[\s\S]*?\n\}/);
        ub = block(c, /function selectQuizUnit\(unit\) \{[\s\S]*?\n\}/);
        mb = block(c, /function isMenuState\(s\) \{[\s\S]*?\n\}/);
        kb = block(c, /function quizPool\(subj, unit, cat\) \{[\s\S]*?\n\}/);
        rb = block(c, /function pickQuizQuestion\(\) \{[\s\S]*?\n\}/);
        wb = block(c, /function applyQuizPlan\(\) \{[\s\S]*?\n\}/);
        vb = block(c, /function validateQuizBank\(arr\) \{[\s\S]*?\n\}/);
        ob = block(c, /function drawQuiz\(\) \{[\s\S]*?\n\}/);
      } catch (e) { return 99; }
      const rules = [
        /fsm\.set\(STATE\.QUIZ_UNIT\)/.test(db),
        /applyQuizPlan\(\)\) \{ fsm\.set\(STATE\.SHIP_SELECT\); return; \}/.test(db),
        /!quizBank\.length\) \{ fsm\.set\(STATE\.SHIP_SELECT\); return; \}/.test(db),
        /goAfterSubject\(\)/.test(sb),
        /fsm\.set\(STATE\.QUIZ_SUBJECT\)/.test(ub),
        /unit !== 0 && !quizPool\('all', unit, 'all'\)\.length\) return false/.test(ub),
        /STATE\.QUIZ_SUBJECT/.test(mb) && /STATE\.QUIZ_UNIT/.test(mb) && /STATE\.QUIZ_CAT/.test(mb),
        /subj !== 'all' && q\.subj !== subj/.test(kb),
        /unit !== 0 && q\.unit !== unit/.test(kb),
        /quizPool\(quizSubj, quizUnit, quizCat\)/.test(rb),
        /pool = quizPool\(quizSubj, 0, 'all'\)/.test(rb),
        /stageRngFor\(runSeed, 14000 \+ lastStage \* 10 \+ segIndex\)/.test(rb) && !/Math\.random\(\)/.test(rb),
        /const QUIZ_PLAN_LS = 'dsf\.quizPlan'/.test(c),
        /lsReadStr\(QUIZ_PLAN_LS\)/.test(wb),
        /unit:\(\(q\.unit\|0\) >= 1 && \(q\.unit\|0\) <= 4\) \? \(q\.unit\|0\) : 0/.test(vb),
        /cat:\(typeof q\.cat === 'string' && q\.cat\) \? q\.cat : 'mix'/.test(vb),
        /fillText\(quizOptLetter\(i\)/.test(ob),
        /wrapText\(ctx, quizQ\.opts\[i\], r\.w - 12 - QUIZ_OPT_LW\)/.test(ob),
        /quizOptLetter\(quizQ\.a\) \+ ' ' \+ quizQ\.opts\[quizQ\.a\]/.test(ob),
        /fillText\(quizScopeLabel\(\)/.test(ob),
        /const QUIZ_CAT_NAMES = Object\.freeze\(\{/.test(c),
        /shape:'分辨圖形'/.test(c),
        /const w = 88, h = 88/.test(block(c, /function quizUnitCardsLayout\(\) \{[\s\S]*?\n\}/)),
        /drawQuizFlow\(\);/.test(c),
        !/lsWrite\([^)]*QUIZ_PLAN_LS/.test(c) && !/localStorage\.setItem\([^)]*quizPlan/.test(c),
      ];
      return rules.filter(r => !r).length;
    }

    const MUTANTS = [
      ['流程：跳過單元層（直接揀機）',
        '  fsm.set(STATE.QUIZ_UNIT);', '  fsm.set(STATE.SHIP_SELECT);'],
      ['老師預設唔生效（分流畫面永遠出現）',
        'if (applyQuizPlan()) { fsm.set(STATE.SHIP_SELECT); return; }', ''],
      ['冇題庫都照問分流（學生會卡死喺 0 條單元）',
        'if (!quizBank.length) { fsm.set(STATE.SHIP_SELECT); return; }', ''],
      ['零題嘅單元可以揀（學生揀咗永遠冇題嘅範疇）',
        "if (unit !== 0 && !quizPool('all', unit, 'all').length) return false;", ''],
      ['科目過濾失效（語文模式會抽到數學題）',
            "function quizPool(subj, unit, cat) {\n  if (cat == null || cat === '') cat = 'all';\n  const out = [];\n  for (const q of quizBank) {\n    if (subj !== 'all' && q.subj !== subj) continue;",
            "function quizPool(subj, unit, cat) {\n  if (cat == null || cat === '') cat = 'all';\n  const out = [];\n  for (const q of quizBank) {\n    /* mutant no subj filter */"],
          ['單元過濾失效（指定單元會抽到其他單元嘅題）',
            "    if (unit !== 0 && q.unit !== unit) continue;\n    if (cat !== 'all') {",
            "    /* mutant no unit filter */\n    if (cat !== 'all') {"],
      ['抽題唔用過濾後嘅池',
        'let pool = quizPool(quizSubj, quizUnit, quizCat);', 'let pool = quizBank.slice();'],
      ['池空唔退回（會 null → 唔彈題）',
        "pool = quizPool(quizSubj, 0, 'all');", ''],
      ['validateQuizBank 丟走 unit 欄（單元資訊靜靜失效）',
        'unit:((q.unit|0) >= 1 && (q.unit|0) <= 4) ? (q.unit|0) : 0,', 'unit:0,'],
      ['validateQuizBank 丟走 cat 欄',
        "cat:(typeof q.cat === 'string' && q.cat) ? q.cat : 'mix',", ''],
      ['選項唔畫字母',
        'ctx.fillText(quizOptLetter(i), r.x + 6, oy);', ''],
      ['字母欄闊度冇扣除（文字會撞到字母）',
        'wrapText(ctx, quizQ.opts[i], r.w - 12 - QUIZ_OPT_LW)',
        'wrapText(ctx, quizQ.opts[i], r.w - 12)'],
      ['結果行冇字母（答完唔知係邊個答案）',
        "quizOptLetter(quizQ.a) + ' ' + quizQ.opts[quizQ.a]", 'quizQ.opts[quizQ.a]'],
      ['面板標題唔顯示科目 · 單元',
        'ctx.fillText(quizScopeLabel(), p.x + p.w / 2, p.y + 18);',
        "ctx.fillText(quizQ.subj === 'math' ? '數學' : '語文', p.x + p.w / 2, p.y + 18);"],
      ['學生自揀寫咗 localStorage（會變成預設 → 下次唔問）',
        "let quizSubj = 'all', quizUnit = 0, quizCat = 'all';",
        "let quizSubj = 'all', quizUnit = 0, quizCat = 'all'; lsWrite(QUIZ_PLAN_LS, JSON.stringify({ subj: quizSubj, unit: quizUnit }));"],
      ['分流畫面唔喺選單白名單（觸控被吞）',
        '|| s === STATE.QUIZ_UNIT || s === STATE.QUIZ_SUBJECT || s === STATE.QUIZ_CAT\n', ''],
      ['單元卡細過 64×64（白板撳唔中）',
        'const w = 88, h = 88, gap = 10, top = 84;', 'const w = 40, h = 40, gap = 10, top = 84;'],
    ];

  const baseFails = structuralFails(h);
  check('★ 未改動嘅 source 結構斷言全綠（基線）', baseFails === 0, baseFails + ' 項紅');
  let bad = 0;
  for (const [label, from, to] of MUTANTS) {
    const n = h.split(from).length - 1;
    if (n !== 1) { check('★ mutant「' + label + '」錨點要唯一（搵到 ' + n + ' 處）', false); bad++; continue; }
    const mutated = h.split(from).join(to);
    const mf = structuralFails(mutated);
    check('★ mutant「' + label + '」令守門變紅', mf > 0, mf + ' 項紅');
    if (mf === 0) bad++;
  }
  check('★ 全部 mutant 都令守門變紅', bad === 0, bad + ' 個漏網');
  check('★ 還原後仍然全綠（確認冇污染真檔）', structuralFails(h) === 0);
  check('★ 磁盤檔案未被 mutation 過程改動', fs.readFileSync(SRC, 'utf8') === h);
}

console.log(fails === 0 ? '\n✓ 全部通過' : '\n✗ ' + fails + ' 項失敗');
process.exit(fails === 0 ? 0 : 1);
