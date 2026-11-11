/* v0.42.0 守門：答題系統（PLAN #153）
 *
 * 背景：v0.41.0 段目標機制把「等待」變成「壓力」，但純戰鬥對低耐性學生
 *    仍然缺少**教學回饋**。v0.42.0 每 3 個段目標後彈一條語文／數學題
 *    （2/3/4 選 1），答對派分數 + CD 回充，答錯零懲罰可再試。
 *
 * ⚠️ **構思期實測 source 後嘅關鍵修正**（PLAN #153 §③）：
 *    原方案用 `STATE.PAUSED` 做答題 → **行唔通**。render() 嘅 PAUSED 分支
 *    喺繪製場景之前 return，而場景／chip 嘅繪製呼叫喺 PAUSED 分支之後 →
 *    暫停時場景全部唔畫，「壓暗但保留場景」做唔到。
 *    ⇒ 改用獨立 `quizOpen` flag（唔經狀態機）。
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
 * 1. 載入通道：questions.js 係 runtime 外部檔
 * ============================================================ */
console.log('\n=== 1. 題庫載入通道 ===');
check('★ index.html 有 <script src="questions.js">', /<script src="questions\.js"/.test(h));
check('★ 載入失敗有 onerror 守衛（唔會靜靜唔彈題）',
  /<script src="questions\.js" onerror="window\.__DSF_QUIZ_MISSING=1"><\/script>/.test(h));
check('★ <script src> 喺主 script 之前（確保已載入）',
  h.indexOf('<script src="questions.js"') < h.indexOf('<script>\n\'use strict\';'),
  '· src@' + h.indexOf('<script src="questions.js"') + ' · main@' + h.indexOf('<script>\n\'use strict\';'));
check('★ 啟動時會 loadQuizBank()', /loadQuizBank\(\);/.test(code));
check('★ questions.js 存在', fs.existsSync(QBANK));

/* ============================================================
 * 2. 常數（凍結值）
 * ============================================================ */
console.log('\n=== 2. 答題常數（PLAN #153 §② 凍結）===');
const consts = block(code, /const QUIZ_LS[\s\S]*?const QUIZ_PANEL[^\n]*/);
/* ⚠️ v0.44.0 #155：答題密度改咗（QUIZ_EVERY 3→1 · QUIZ_MAX 5→12）
 *    → 呢兩個常數嘅凍結值以 **PLAN #155** 為準（#153 嘅 3 / 5 已被 #155 取代）。 */
check('★ 每段彈一條（v0.44 #155：QUIZ_EVERY = 1）', /const QUIZ_EVERY\s*=\s*1;/.test(consts));
check('★ 每關上限 12 次（v0.44 #155：QUIZ_MAX = 12）', /const QUIZ_MAX\s*=\s*12;/.test(consts));
check('★ 恢復後無敵 800ms', /const QUIZ_GRACE_MS\s*=\s*800;/.test(consts));
check('★ 3-2-1 倒數 1200ms', /const QUIZ_COUNTDOWN\s*=\s*1200;/.test(consts));
check('★ 答對 base 分 300', /const QUIZ_SCORE\s*=\s*300;/.test(consts));
check('★ localStorage key = dsf.quizBank', /const QUIZ_LS\s*=\s*'dsf\.quizBank';/.test(consts));

/* ============================================================
 * 3. 狀態機：獨立 quizOpen flag（唔經 STATE.PAUSED）
 * ============================================================ */
console.log('\n=== 3. 答題狀態（獨立 flag · 唔經狀態機）===');
const tickBlk = block(code, /function tick\(dtMs\) \{[\s\S]*?\n\}/);
check('★ tick() 開頭有 quizOpen 閘（物理停）',
  /if \(quizOpen\) \{[\s\S]{0,200}return;/.test(tickBlk));
check('★ quizOpen 閘喺波次排程之前',
  tickBlk.indexOf('if (quizOpen)') < tickBlk.indexOf('waveCursor < waveQueue.length'),
  '· 閘@' + tickBlk.indexOf('if (quizOpen)') + ' · 波@' + tickBlk.indexOf('waveCursor < waveQueue.length'));
check('★ 倒數結束會 closeQuiz()', /quizPhase === 3 && performance\.now\(\) >= quizCdUntil\) closeQuiz\(\)/.test(tickBlk));
check('★ tick 會喺 pending 時開題', /if \(quizPending && openQuiz\(\)\) return;/.test(tickBlk));
check('★ 唔用 STATE.PAUSED 做答題（fsm.cur 仍然係 STAGE_n）',
  !/quizOpen[\s\S]{0,120}fsm\.set\(STATE\.PAUSED\)/.test(code));
/* ⚠️ v0.43.0 #154 新增咗 STATE.QUIZ_SUBJECT / STATE.QUIZ_UNIT ——
   呢兩個係**前置分流畫面**（fsm 狀態）· 同答題 overlay（quizOpen flag）唔同層。
   ⇒ 呢條断言改成：答題 engine 嘅函式**唔准**掂 STATE（overlay 仍然唔經狀態機）。 */
const quizEngineFns = ['maybeQuiz', 'openQuiz', 'closeQuiz', 'answerQuiz', 'retryQuiz', 'nextQuiz',
                       'pickQuizQuestion', 'loadQuizBank', 'validateQuizBank']
  .map(n => { try { return block(code, new RegExp('function ' + n + '\\([\\s\\S]*?\\n\\}')); } catch (e) { return ''; } }).join('\n');
check('★ 答題 engine 唔掂 STATE（overlay 唔經狀態機）',
  !/STATE\./.test(quizEngineFns));

/* ============================================================
 * 4. 觸發條件：segIndex % 3 === 2 · 每關 5 次上限
 * ============================================================ */
console.log('\n=== 4. 觸發條件 ===');
const maybeBlk = block(code, /function maybeQuiz\(\) \{[\s\S]*?\n\}/);
check('★ 每段觸發（segIndex % QUIZ_EVERY === QUIZ_EVERY - 1 · v0.44 EVERY=1）',
  /segIndex % QUIZ_EVERY !== QUIZ_EVERY - 1/.test(maybeBlk));
check('★ 每關上限（quizCount >= QUIZ_MAX 就唔彈）', /quizCount >= QUIZ_MAX/.test(maybeBlk));
check('★ 冇題庫就唔彈 + 出提示（唔靜靜唔彈題）',
  /!quizBank\.length\) \{ segMsg = '題庫未載入'/.test(maybeBlk));
check('★ 段界觸發（settle → start → maybeQuiz 順序）',
  /settleSegment\(\); startSegment\(stageMs, waveCursor\); maybeQuiz\(\);/.test(tickBlk));
check('★ 每關重置答題計數', /quizCount = 0; quizStreak = 0;/.test(code));

/* ============================================================
 * 5. 時間唔計入段計時（R2 / 驗收線 4）
 * ============================================================ */
console.log('\n=== 5. 答題時間唔計入段計時 ===');
const closeBlk = block(code, /function closeQuiz\(\) \{[\s\S]*?\n\}/);
check('★ stageStartMs 推進（段目標唔會到期）', /stageStartMs \+= elapsed/.test(closeBlk));
check('★ runStartMs 同步推進（時間獎金唔會被答題扣）', /runStartMs \+= elapsed/.test(closeBlk));
check('★ 兩者都有 null 防護', /if \(stageStartMs !== null\)/.test(closeBlk) && /if \(runStartMs !== null\)/.test(closeBlk));
const freezeBlk = block(code, /function endFreezeClocks\(\) \{[\s\S]*?\n\}/);
check('★ 分頁／手動暫停 gap 會推進 quizStartedAtMs（唔重複計 · R13）',
  /if \(quizOpen\) quizStartedAtMs \+= gap;/.test(freezeBlk));

/* ============================================================
 * 6. 抖返三層（PLAN #153 §④）
 * ============================================================ */
console.log('\n=== 6. 抖返三層 ===');
const dmgBlk = block(code, /function damageShip\(n\) \{[\s\S]*?\n\}/);
check('★ 第一層：0.8 秒無敵（扣血前守衛）',
  /performance\.now\(\) < quizGraceUntil\) return false;/.test(dmgBlk));
check('★ 無敵守衛喺扣血之前（唔係扣完先補）',
  dmgBlk.indexOf('quizGraceUntil') < dmgBlk.indexOf('ship.hp -='));
check('★ 第二層：3-2-1 倒數', /quizPhase = 3; quizCdUntil = performance\.now\(\) \+ QUIZ_COUNTDOWN;/.test(code));
check('★ 倒數每 0.4 秒一數', /Math\.ceil\(left \/ \(QUIZ_COUNTDOWN \/ 3\)\)/.test(code));
const drawBlk = block(code, /function drawQuiz\(\) \{[\s\S]*?\n\}/);
check('★ 第三層：壓暗唔黑屏（場景照畫）',
  /rgba\(2,10,20,0\.82\)/.test(drawBlk) && !/fillRect\(0, 0, VIEW_W, VIEW_H\);/.test(drawBlk));
const tailBlk = block(code, /function renderTail\(\) \{[\s\S]*?\n\}/);
check('★ overlay 喺 renderTail() 內疊（蓋住段目標 chip 同能力掣）',
  /drawQuiz\(\);/.test(tailBlk));
check('★ overlay 喺音效掣**之後**畫（實機修正：音效掣唔可以壓喺面板上面）',
  tailBlk.indexOf('drawAudioUi();') < tailBlk.indexOf('drawQuiz();'),
  '· 音效@' + tailBlk.indexOf('drawAudioUi();') + ' · overlay@' + tailBlk.indexOf('drawQuiz();'));

/* ============================================================
 * 7. 答對／答錯（R10：唔派盾）
 * ============================================================ */
console.log('\n=== 7. 獎勵與懲罰 ===');
const ansBlk = block(code, /function answerQuiz\(i\) \{[\s\S]*?\n\}/);
check('★ 答對 → 分數 300 × 連續', /QUIZ_SCORE \* quizStreak/.test(ansBlk));
check('★ 答對 → CD 全回充', /skillCdUntil = 0; bombCDUntil = 0;/.test(ansBlk));
check('★ ★ 答對 **唔派盾**（派盾會令「零傷」段目標變易 · R10）',
  !/shield/.test(ansBlk));
check('★ 答錯 → 連續歸零', /quizStreak = 0;/.test(ansBlk));
check('★ 答錯 → 唔扣血唔扣分（零懲罰）',
  !/ship\.hp/.test(ansBlk) && !/runScore -=/.test(ansBlk));
check('★ 答錯可再試（retryQuiz）', /function retryQuiz\(\)/.test(code));
check('★ 答完可以繼續（nextQuiz）', /function nextQuiz\(\)/.test(code));

/* ============================================================
 * 8. 輸入閘 + 暫停封鎖
 * ============================================================ */
console.log('\n=== 8. 輸入閘與暫停 ===');
const menuBlk = block(code, /function handleMenuTap\(clientX, clientY\) \{[\s\S]*?\n\}/);
check('★ 答題中只處理答題掣，其餘吞掉',
  /if \(quizOpen\) \{ handleQuizTap\(px, py\); return true; \}/.test(menuBlk));
const pauseBlk = block(code, /function enterPause\(reason\) \{[\s\S]*?\n\}/);
check('★ 答題中唔准手動暫停（PAUSED 分支唔畫場景 → 畫面會消失）',
  /if \(quizOpen && \(reason \|\| 'manual'\) === 'manual'\) return false;/.test(pauseBlk));

/* ============================================================
 * 9. 觸控目標 ≥64×64 + 字級守 7 級表
 * ============================================================ */
console.log('\n=== 9. UI 規格 ===');
const geomBlk = block(code, /function quizGeom\(\) \{[\s\S]*?\n\}/);
check('★ 選項格 120×72（≥64×64）', /cw = 120, ch = 72/.test(geomBlk));
check('★ 按鈕 120×64（≥64×64）', /bw = 120/.test(geomBlk) && /bh: 64/.test(geomBlk));
check('★ 面板 288×360（320×480 畫面內）',
  /const QUIZ_PANEL     = \{ x:16, y:60, w:288, h:360 \};/.test(consts));
const quizFonts = [...drawBlk.matchAll(/font\s*=\s*'([^']*px[^']*)'/g)].map(x => x[1]);
const sizes = [...new Set(quizFonts.map(x => Number(x.match(/([\d.]+)px/)[1])))].sort((a, b) => a - b);
check('★ 答題 UI 字級全部喺 7 級表（9/10/12/14/16/24/32）',
  sizes.every(s => [9, 10, 12, 14, 16, 24, 32].includes(s)), '→ ' + sizes.join(', '));
check('★ 題目最多 3 行', /wrapText\(ctx, quizQ\.q, p\.w - 32\)\.slice\(0, 3\)/.test(drawBlk));
check('★ 解說最多 2 行', /wrapText\(ctx, quizQ\.why \|\| '', p\.w - 32\)\.slice\(0, 2\)/.test(drawBlk));

/* ============================================================
 * 10. 抽題：seeded rng + 唔連續重複
 * ============================================================ */
console.log('\n=== 10. 抽題 ===');
const pickBlk = block(code, /function pickQuizQuestion\(\) \{[\s\S]*?\n\}/);
check('★ 用 seeded rng（唔准 Math.random）', /stageRngFor\(runSeed, 14000 \+ lastStage \* 10 \+ segIndex\)/.test(pickBlk));
check('★ 唔用 Math.random()', !/Math\.random\(\)/.test(pickBlk));
check('★ 記住上一條 id，唔連續出同一條', /pool\[i\]\.id === quizLastId/.test(pickBlk));

/* ============================================================
 * 11. 答題 0 影響段目標（驗收線 1）
 * ============================================================ */
console.log('\n=== 11. 答題對段目標嘅影響 = 0 ===');
const quizAll = ['maybeQuiz', 'openQuiz', 'closeQuiz', 'answerQuiz', 'retryQuiz', 'nextQuiz',
                 'pickQuizQuestion', 'loadQuizBank', 'validateQuizBank']
  .map(n => block(code, new RegExp('function ' + n + '\\([\\s\\S]*?\\n\\}'))).join('\n');
const SEG_VARS = ['segGoal', 'segChain', 'segNextHp', 'segNextSpd', 'segHurt', 'segActiveHp',
                  'segActiveSpd', 'segKillBase', 'segIndex =', 'segStartAt ='];
const touched = SEG_VARS.filter(v => quizAll.includes(v));
check('★ 答題 code 唔掂任何段目標狀態變數', touched.length === 0, touched.join(','));

/* ============================================================
 * 12. 行為測試（真 source 抽出嚟跑）
 * ============================================================ */
console.log('\n=== 12. 行為測試（真 source 抽出嚟跑）===');
/* sandbox：喺同一 scope 宣告依賴變數 → 函式入面嘅賦值可以被觀察到 */
function sandbox(src, name, depNames, ctx, call) {
  const init = depNames.map(n => 'let ' + n + ' = __c[' + JSON.stringify(n) + '];').join('\n');
  const fn = block(src, new RegExp('function ' + name + '\\([\\s\\S]*?\\n\\}'));
  const snap = depNames.map(n => n + ': ' + n).join(',');
  const F = new Function('__c', init + '\n' + fn + '\n' + call + '\nreturn {' + snap + '};');
  return F(ctx);
}

/* --- 12a. validateQuizBank（壞題要丟 · R8）--- */
{
  const good = { id: 'm-1', subj: 'math', level: 2, q: '1+1=?', opts: ['1', '2'], a: 1, why: 'w', tags: [] };
  /* 直接用真 source 抽出嚟跑 */
  const fnSrc = block(code, /function validateQuizBank\(arr\) \{[\s\S]*?\n\}/);
  const VF = new Function('arr', fnSrc + '\nreturn validateQuizBank(arr);');
  const r1 = VF([good]);
  check('★ 正常題目保留', r1.good.length === 1 && r1.bad === 0);
  const r2 = VF([good, Object.assign({}, good)]);              /* id 重複 */
  check('★ id 重複 → 丟棄', r2.good.length === 1 && r2.bad === 1);
  const r3 = VF([Object.assign({}, good, { a: 5 })]);          /* a 出界 */
  check('★ a 出界 → 丟棄', r3.good.length === 0 && r3.bad === 1);
  const r4 = VF([Object.assign({}, good, { opts: ['1', '1'] })]); /* opts 重複 */
  check('★ opts 重複 → 丟棄', r4.good.length === 0 && r4.bad === 1);
  const r5 = VF([Object.assign({}, good, { subj: 'english' })]); /* 科目錯 */
  check('★ 科目唔認 → 丟棄', r5.good.length === 0);
  const r6 = VF(null);
  check('★ 非陣列 → 空（唔會 crash）', r6.good.length === 0);
}

/* --- 12b. pickQuizQuestion（可重現 + 唔連續重複）--- */
{
  const bank = [
    { id: 'a', subj: 'math', unit: 2, q: 'q', opts: ['1', '2'], a: 0 },
    { id: 'b', subj: 'math', unit: 2, q: 'q', opts: ['1', '2'], a: 0 },
    { id: 'c', subj: 'math', unit: 2, q: 'q', opts: ['1', '2'], a: 0 },
  ];
  /* 真 mulberry32（由 index.html 抽出嚟用，唔自己寫一個唔同嘅） */
  const mul = block(code, /function mulberry32\([\s\S]*?\n\}/);
  const srf = block(code, /function stageRngFor\(seed, stageId\) \{[\s\S]*?\n\}/);
  /* ⚠️ v0.43.0 #154：pickQuizQuestion 會叫 quizPool()（科目 + 單元過濾）→ 必須一齊抽 */
  const pool = block(code, /function quizPool\(subj, unit\) \{[\s\S]*?\n\}/);
  const pick = block(code, /function pickQuizQuestion\(\) \{[\s\S]*?\n\}/);
  const F = new Function('__c', `
    let quizBank = __c.bank, runSeed = __c.seed, lastStage = __c.stage, segIndex = __c.seg;
    let quizLastId = __c.lastId, quizSubj = __c.subj, quizUnit = __c.unit;
    ${pool}\n${mul}\n${srf}\n${pick}
    const a = pickQuizQuestion();
    const b = pickQuizQuestion();
    return { a: a ? a.id : null, lastId: quizLastId, second: b ? b.id : null };
  `);
  const base = { bank, seed: 12345, stage: 1, seg: 2, lastId: '', subj: 'all', unit: 0 };
  const r = F(base);
  check('★ 抽到題目', r.a !== null, '· ' + r.a);
  check('★ 記住上一條 id（= 最後抽嗰條）', r.lastId === r.second, '· lastId=' + r.lastId + ' second=' + r.second);
  /* 固定 quizLastId = 會被抽到嗰條 → 必須改抽另一條 */
  const r2 = F(Object.assign({}, base, { lastId: r.a }));
  check('★ 唔連續出同一條', r2.a !== r.a, '· ' + r.a + ' → ' + r2.a);
  /* 同 seed → 同題（可重現） */
  const r3 = F(base);
  check('★ 同 seed → 同題（可重現）', r3.a === r.a);
  const r4 = F(base);
  check('★ 同一輸入 → 結果穩定', r4.a === r3.a && r4.lastId === r3.lastId);
  /* v0.43.0 #154：科目 + 單元過濾 */
  const bank2 = bank.concat([{ id: 'z', subj: 'chinese', unit: 1, q: 'q', opts: ['1', '2'], a: 0 }]);
  const r5 = F(Object.assign({}, base, { subj: 'math', unit: 2 }));
  check('★ 指定單元 → 抽到嘅題唔會 null', r5.a !== null, '· ' + r5.a);
  /* 單元冇題 → 退回科目層（unit 0）· 唔會 null */
  const r6 = F(Object.assign({}, base, { bank: bank2, subj: 'chinese', unit: 2 }));
  check('★ 單元冇題 → 退回科目層全部（唔會 null）', r6.a !== null, '· ' + r6.a);
  check('★ 退回之後只會抽該科目嘅題', r6.a === 'z', '· ' + r6.a);
  const r7 = F(Object.assign({}, base, { subj: 'math', unit: 1 }));
  check('★ 數學單元 1 冇題 → 退回數學全部（唔會 null）', r7.a !== null, '· ' + r7.a);
  /* 真係一條都冇 → 返 null（唔會 crash） */
  const r8 = F(Object.assign({}, base, { bank: [], subj: 'math', unit: 2 }));
  check('★ 完全冇題 → 返 null（唔會 crash）', r8.a === null, '· ' + r8.a);
}

/* --- 12c. answerQuiz（答對派分 + CD 回充 + 唔派盾；答錯零懲罰）--- */
{
  const q = { id: 'm-1', subj: 'math', q: '1+1=?', opts: ['1', '2'], a: 1, why: 'w' };
  /* ⚠️ v0.44 #155：answerQuiz 會叫 ttsSpeak（讀粵語解說）→ sandbox 要有 stub */
  const deps = ['quizPhase', 'quizQ', 'quizOk', 'quizPick', 'quizStreak', 'QUIZ_SCORE',
                'affScore', 'styScore', 'runScore', 'skillCdUntil', 'bombCDUntil',
                'segMsg', 'segMsgT', 'sfx', 'ttsSpeak'];
  const base = {
    quizPhase: 1, quizQ: q, quizOk: false, quizPick: -1, quizStreak: 0, QUIZ_SCORE: 300,
    affScore: 1, styScore: 1, runScore: 1000, skillCdUntil: 5000, bombCDUntil: 9000,
    segMsg: '', segMsgT: 0, sfx: function () {}, ttsSpeak: function () {},
  };
  const ok = sandbox(code, 'answerQuiz', deps, base, 'answerQuiz(1);');
  check('★ 答對 → quizOk=true / phase=2', ok.quizOk === true && ok.quizPhase === 2);
  check('★ 答對 → 分數 +300×連續', ok.runScore === 1000 + 300, '· ' + ok.runScore);
  check('★ 答對 → 連續 +1', ok.quizStreak === 1);
  check('★ 答對 → CD 全回充', ok.skillCdUntil === 0 && ok.bombCDUntil === 0);
  check('★ 答對 → 唔派盾（shield 唔喺依賴入面 → 冇得派）',
    !/shield/.test(block(code, /function answerQuiz\(i\) \{[\s\S]*?\n\}/)));

  const base2 = Object.assign({}, base, { quizStreak: 2 });
  const ok2 = sandbox(code, 'answerQuiz', deps, base2, 'answerQuiz(1);');
  check('★ 答對 → 300 × 連續（streak 2 → 3 → +900）', ok2.runScore === 1000 + 900, '· ' + ok2.runScore);

  const base3 = Object.assign({}, base, { quizStreak: 3 });
  const bad = sandbox(code, 'answerQuiz', deps, base3, 'answerQuiz(0);');
  check('★ 答錯 → 連續歸零', bad.quizStreak === 0);
  check('★ 答錯 → 分數不變（零懲罰）', bad.runScore === 1000, '· ' + bad.runScore);
  check('★ 答錯 → CD 唔回充（唔獎勵）', bad.skillCdUntil === 5000 && bad.bombCDUntil === 9000);
}

/* --- 12d. closeQuiz（時間唔計入段計時 + 0.8 秒無敵）--- */
{
  /* ⚠️ v0.44 #155：closeQuiz 會叫 ttsStop / ttsBgm → sandbox 要有 stub */
  const deps = ['performance', 'quizStartedAtMs', 'stageStartMs', 'runStartMs',
                'quizGraceUntil', 'QUIZ_GRACE_MS', 'quizOpen', 'quizPhase', 'quizQ', 'quizPick',
                'ttsStop', 'ttsBgm'];
  let now = 100000;
  const r = sandbox(code, 'closeQuiz', deps, {
    performance: { now: () => now },
    quizStartedAtMs: 90000, stageStartMs: 5000, runStartMs: 2000,
    quizGraceUntil: 0, QUIZ_GRACE_MS: 800,
    quizOpen: true, quizPhase: 3, quizQ: { id: 'x' }, quizPick: 1,
    ttsStop: function () {}, ttsBgm: function () {},
  }, 'closeQuiz();');
  check('★ 答題時間推走 stageStartMs（段目標唔會到期）', r.stageStartMs === 5000 + 10000, '· ' + r.stageStartMs);
  check('★ 答題時間推走 runStartMs（時間獎金唔會被扣）', r.runStartMs === 2000 + 10000, '· ' + r.runStartMs);
  check('★ 恢復後 0.8 秒無敵', r.quizGraceUntil === 100000 + 800, '· ' + r.quizGraceUntil);
  check('★ 關閉後狀態清乾淨', r.quizOpen === false && r.quizPhase === 0 && r.quizQ === null);
}

/* --- 12e. maybeQuiz（觸發節奏 + 上限）--- */
{
  const deps = ['segIndex', 'QUIZ_EVERY', 'quizCount', 'QUIZ_MAX', 'quizBank', 'segMsg', 'segMsgT', 'quizPending'];
  const bank = [{ id: 'a', subj: 'math', q: 'q', opts: ['1', '2'], a: 0 }];
  const run = (segIndex, quizCount, bk) => {
    const F = new Function('__c', `
      let segIndex = __c.segIndex, QUIZ_EVERY = 1, quizCount = __c.quizCount, QUIZ_MAX = 12;
      let quizBank = __c.quizBank, segMsg = '', segMsgT = 0, quizPending = false;
      ${block(code, /function maybeQuiz\(\) \{[\s\S]*?\n\}/)}
      const r = maybeQuiz();
      return { r: r, pending: quizPending, msg: segMsg, msgT: segMsgT };
    `);
    return F({ segIndex, quizCount, quizBank: bk });
  };
  /* ⚠️ v0.44 #155：QUIZ_EVERY = 1（每段都彈）· QUIZ_MAX = 12 */
  check('★ segIndex=0（第一段）都彈（EVERY=1）', run(0, 0, bank).r === true);
  check('★ segIndex=2 彈 + 設 pending', run(2, 0, bank).r === true && run(2, 0, bank).pending === true);
  check('★ segIndex=5 彈', run(5, 0, bank).r === true);
  check('★ 每關 12 次上限：第 13 次唔彈', run(2, 12, bank).r === false);
  check('★ 未到上限（第 12 次）彈', run(2, 11, bank).r === true);
  const empty = run(2, 0, []);
  check('★ 冇題庫 → 唔彈 + 出提示', empty.r === false && empty.msg === '題庫未載入' && empty.msgT > 0);
}

/* --- 12f. handleQuizTap（撳選項／撳掣 · 用真幾何）--- */
{
  /* ⚠️ 用**真 source** 抽出嚟嘅幾何函數（唔自己 mock）——
     咁先驗到真實觸控目標大細，而唔係測試自己寫嘅假座標。 */
  const geomSrc = block(code, /function quizGeom\(\) \{[\s\S]*?\n\}/)
    + '\n' + block(code, /function quizOptRect\(g, i\) \{[\s\S]*?\n\}/)
    + '\n' + block(code, /function quizBtnRect\(g, i\) \{[\s\S]*?\n\}/);
  const F = new Function('__c', `
    let quizOpen = __c.quizOpen, quizQ = __c.quizQ, quizPhase = __c.quizPhase, quizOk = __c.quizOk;
    let answerQuiz = __c.answerQuiz, nextQuiz = __c.nextQuiz, retryQuiz = __c.retryQuiz;
    const QUIZ_PANEL = { x:16, y:60, w:288, h:360 };
    const QUIZ_PANEL_Q = { x:16, y:60, w:288, h:300 };
    ${geomSrc}
    ${block(code, /function handleQuizTap\(px, py\) \{[\s\S]*?\n\}/)}
    const g = quizGeom();
    return { a: handleQuizTap(__c.px, __c.py),
             g: g, o0: quizOptRect(g, 0), o1: quizOptRect(g, 1),
             b0: quizBtnRect(g, 0), b1: quizBtnRect(g, 1) };
  `);
  const q = { id: 'x', subj: 'math', q: 'q', opts: ['1', '2', '3'], a: 0 };
  const spy = [];
  const ctx = {
    quizOpen: true, quizQ: q, quizPhase: 1, quizOk: false,
    answerQuiz: (i) => spy.push('answer' + i),
    nextQuiz: () => spy.push('next'),
    retryQuiz: () => spy.push('retry'),
  };
  const probe = F(Object.assign({}, ctx, { px: 0, py: 0 }));
  const cx = (r) => r.x + r.w / 2, cy = (r) => r.y + r.h / 2;

  /* 幾何規格（驗收線：觸控目標 ≥64×64 · 面板喺 320×480 內） */
  check('★ 選項格 ≥64×64', probe.o0.w >= 64 && probe.o0.h >= 64, '· ' + probe.o0.w + '×' + probe.o0.h);
  check('★ 按鈕 ≥64×64', probe.b0.w >= 64 && probe.b0.h >= 64, '· ' + probe.b0.w + '×' + probe.b0.h);
  check('★ 面板喺 320×480 畫面內',
    probe.g.p.x >= 0 && probe.g.p.x + probe.g.p.w <= 320 &&
    probe.g.p.y >= 0 && probe.g.p.y + probe.g.p.h <= 480,
    '· x' + probe.g.p.x + ' y' + probe.g.p.y + ' w' + probe.g.p.w + ' h' + probe.g.p.h);
  check('★ 4 個選項唔會重疊',
    !(probe.o0.x < probe.o1.x + probe.o1.w && probe.o1.x < probe.o0.x + probe.o0.w &&
      probe.o0.y < probe.o1.y + probe.o1.h && probe.o1.y < probe.o0.y + probe.o0.h));
  check('★ 兩個掣唔會重疊',
    !(probe.b0.x < probe.b1.x + probe.b1.w && probe.b1.x < probe.b0.x + probe.b0.w));
  /* 答對 → 淨得「繼續」→ 應該置中 */
  const probeOk = F(Object.assign({}, ctx, { px: 0, py: 0, quizOk: true }));
  check('★ 答對 → 「繼續」掣置中（唔留左邊空白）',
    Math.abs(probeOk.b1.x + probeOk.b1.w / 2 - (16 + 288 / 2)) < 1,
    '· 中心 x=' + (probeOk.b1.x + probeOk.b1.w / 2));
  check('★ 問題階段面板唔留大片空白（高度 300 < 結果階段 360）',
    probe.g.p.h === 300, '· h=' + probe.g.p.h);

  spy.length = 0;
  F(Object.assign({}, ctx, { px: cx(probe.o0), py: cy(probe.o0) }));
  check('★ 撳第 1 個選項 → answerQuiz(0)', spy[0] === 'answer0', '· ' + spy.join(','));
  spy.length = 0;
  F(Object.assign({}, ctx, { px: cx(probe.o1), py: cy(probe.o1) }));
  check('★ 撳第 2 個選項 → answerQuiz(1)', spy[0] === 'answer1', '· ' + spy.join(','));
  spy.length = 0;
  F(Object.assign({}, ctx, { px: 2, py: 2 }));
  check('★ 撳錯位都唔會漏去（吞掉）', spy.length === 0);
  /* 結果頁（phase 2）：撳「繼續」掣 → nextQuiz；撳「再試」掣 → retryQuiz */
  spy.length = 0;
  F(Object.assign({}, ctx, { quizPhase: 2, px: cx(probe.b1), py: cy(probe.b1) }));
  check('★ 結果頁撳「繼續」→ nextQuiz', spy[0] === 'next', '· ' + spy.join(','));
  spy.length = 0;
  F(Object.assign({}, ctx, { quizPhase: 2, px: cx(probe.b0), py: cy(probe.b0) }));
  check('★ 結果頁撳「再試」→ retryQuiz', spy[0] === 'retry', '· ' + spy.join(','));
  spy.length = 0;
  F(Object.assign({}, ctx, { quizPhase: 2, quizOk: true, px: cx(probe.b0), py: cy(probe.b0) }));
  check('★ 答對之後「再試」掣唔會觸發', spy.length === 0, '· ' + spy.join(','));
}

/* ============================================================
 * 13. 題庫內容（交畀 tools/quiz_check.js 做深檢查）
 * ============================================================ */
console.log('\n=== 13. 題庫內容 ===');
try {
  const out = execFileSync('node', [path.join(__dirname, 'tools', 'quiz_check.js')], { encoding: 'utf8' });
  check('★ tools/quiz_check.js 全過（id 唯一 / a 喺範圍 / 冇簡體 / 冇粵語 / 冇英文 / 答案唯一）',
    /題庫全部通過/.test(out), '· ' + out.trim().split('\n').pop());
} catch (e) {
  check('★ tools/quiz_check.js 全過', false, '· ' + (e.stdout || e.message).toString().slice(0, 200));
}

/* ============================================================
 * 14. 還原驗證（mutation test · 證明守門唔係 vacuous）
 * ============================================================ */
console.log('\n=== 14. 還原驗證（mutation test）===');
{
  function structuralFails(src) {
    const c = stripComments(src);
    let tb, cb, mb, ab, pb, db, qb, fb, gb;
    try {
      tb = block(c, /function tick\(dtMs\) \{[\s\S]*?\n\}/);
      cb = block(c, /function closeQuiz\(\) \{[\s\S]*?\n\}/);
      mb = block(c, /function maybeQuiz\(\) \{[\s\S]*?\n\}/);
      ab = block(c, /function answerQuiz\(i\) \{[\s\S]*?\n\}/);
      pb = block(c, /function pickQuizQuestion\(\) \{[\s\S]*?\n\}/);
      db = block(c, /function damageShip\(n\) \{[\s\S]*?\n\}/);
      qb = block(c, /function handleQuizTap\(px, py\) \{[\s\S]*?\n\}/);
      fb = block(c, /function endFreezeClocks\(\) \{[\s\S]*?\n\}/);
      gb = block(c, /function drawQuiz\(\) \{[\s\S]*?\n\}/);
    } catch (e) { return 99; }
    const consts2 = (c.match(/const QUIZ_LS[\s\S]*?const QUIZ_PANEL[^\n]*/) || [''])[0];
    const quizFonts2 = [...gb.matchAll(/font\s*=\s*'([^']*px[^']*)'/g)].map(x => Number(x[1].match(/([\d.]+)px/)[1]));
    const segVars = ['segGoal', 'segChain', 'segNextHp', 'segNextSpd', 'segHurt', 'segActiveHp',
                     'segActiveSpd', 'segKillBase'];
    const quizAll2 = ['maybeQuiz', 'openQuiz', 'closeQuiz', 'answerQuiz', 'retryQuiz', 'nextQuiz',
                      'pickQuizQuestion', 'loadQuizBank', 'validateQuizBank']
      .map(n => { try { return block(c, new RegExp('function ' + n + '\\([\\s\\S]*?\\n\\}')); } catch (e) { return ''; } }).join('\n');
    const rules = [
      /* ⚠️ v0.44.0 #155：答題密度改咗（EVERY 3→1 · MAX 5→12）· 凍結值以 PLAN #155 為準 */
      /const QUIZ_EVERY\s*=\s*1;/.test(consts2),
      /const QUIZ_MAX\s*=\s*12;/.test(consts2),
      /const QUIZ_GRACE_MS\s*=\s*800;/.test(consts2),
      /const QUIZ_COUNTDOWN\s*=\s*1200;/.test(consts2),
      /const QUIZ_SCORE\s*=\s*300;/.test(consts2),
      /if \(quizOpen\) \{[^}]*return;/.test(tb),
      tb.indexOf('if (quizOpen)') < tb.indexOf('waveCursor < waveQueue.length'),
      /settleSegment\(\); startSegment\(stageMs, waveCursor\); maybeQuiz\(\);/.test(tb),
      /segIndex % QUIZ_EVERY !== QUIZ_EVERY - 1/.test(mb),
      /quizCount >= QUIZ_MAX/.test(mb),
      /stageStartMs \+= elapsed/.test(cb),
      /runStartMs \+= elapsed/.test(cb),
      /if \(quizOpen\) quizStartedAtMs \+= gap;/.test(fb),
      /performance\.now\(\) < quizGraceUntil\) return false;/.test(db),
      db.indexOf('quizGraceUntil') < db.indexOf('ship.hp -='),
      /QUIZ_SCORE \* quizStreak/.test(ab),
      /skillCdUntil = 0; bombCDUntil = 0;/.test(ab),
      !/shield/.test(ab),
      /quizStreak = 0;/.test(ab),
      !/runScore\s*-=/.test(ab),
      !/ship\.hp/.test(ab),
      /stageRngFor\(runSeed, 14000 \+ lastStage \* 10 \+ segIndex\)/.test(pb),
      !/Math\.random\(\)/.test(pb),
      /pool\[i\]\.id === quizLastId/.test(pb),
      /rgba\(2,10,20,0\.82\)/.test(gb),
      /drawQuiz\(\);/.test(block(c, /function renderTail\(\) \{[\s\S]*?\n\}/)),
      (() => { const t = block(c, /function renderTail\(\) \{[\s\S]*?\n\}/);
                return t.indexOf('drawAudioUi();') < t.indexOf('drawQuiz();'); })(),
      /const p = \(quizPhase >= 2 \? QUIZ_PANEL : QUIZ_PANEL_Q\)/.test(block(c, /function quizGeom\(\) \{[\s\S]*?\n\}/)),
      /const x = quizOk \? g\.p\.x \+ \(g\.p\.w - g\.bw\) \/ 2/.test(block(c, /function quizBtnRect\(g, i\) \{[\s\S]*?\n\}/)),
      /if \(quizOpen\) \{ handleQuizTap\(px, py\); return true; \}/.test(c),
      /if \(quizOpen && \(reason \|\| 'manual'\) === 'manual'\) return false;/.test(c),
      quizFonts2.every(s => [9, 10, 12, 14, 16, 24, 32].includes(s)),
      segVars.filter(v => quizAll2.includes(v)).length === 0,
    ];
    return rules.filter(r => !r).length;
  }

  const MUTANTS = [
    ['每段 → 每 2 段（v0.44 EVERY=1）', 'const QUIZ_EVERY     = 1;', 'const QUIZ_EVERY     = 2;'],
    ['每關上限 12 → 99（v0.44 MAX=12）', 'const QUIZ_MAX       = 12;', 'const QUIZ_MAX       = 99;'],
    ['無敵 800ms → 0', 'const QUIZ_GRACE_MS  = 800;', 'const QUIZ_GRACE_MS  = 0;'],
    ['倒數 1200ms → 0', 'const QUIZ_COUNTDOWN = 1200;', 'const QUIZ_COUNTDOWN = 0;'],
    ['答對分 300 → 0', 'const QUIZ_SCORE     = 300;', 'const QUIZ_SCORE     = 0;'],
    ['抽題用 Math.random（唔可重現）',
      'const rng = stageRngFor(runSeed, 14000 + lastStage * 10 + segIndex);',
      'const rng = Math.random;'],
    ['答題 stream 撞返詞綴 9000',
      'stageRngFor(runSeed, 14000 + lastStage * 10 + segIndex)',
      'stageRngFor(runSeed, 9000 + lastStage * 10 + segIndex)'],
    ['tick 唔凍結物理（答題期間照行）',
      '  if (quizOpen) {\n    if (quizPhase === 3 && performance.now() >= quizCdUntil) closeQuiz();\n    return;\n  }',
      '  if (quizOpen) {\n    if (quizPhase === 3 && performance.now() >= quizCdUntil) closeQuiz();\n  }'],
    ['時間照計（段目標會喺答題期間到期）',
      '  if (stageStartMs !== null) stageStartMs += elapsed;',
      '  if (stageStartMs !== null) stageStartMs += 0;'],
    ['runStartMs 唔推進（時間獎金被答題扣）',
      '  if (runStartMs !== null) runStartMs += elapsed;', ''],
    ['分頁 gap 重複計（段計時會倒退）',
      '  if (quizOpen) quizStartedAtMs += gap;', ''],
    ['無敵 guard 移除（恢復後即刻受傷）',
      '  if (performance.now() < quizGraceUntil) return false;', ''],
    ['答對派盾（令「零傷」段目標變易）',
      '    skillCdUntil = 0; bombCDUntil = 0;',
      '    skillCdUntil = 0; bombCDUntil = 0; ship.shield += 1;'],
    ['答錯扣分（零懲罰被破壞）',
      '    quizStreak = 0;', '    quizStreak = 0; runScore -= 100;'],
    ['答錯唔清連續', '    quizStreak = 0;\n    segMsg = ', '    segMsg = '],
    ['唔記住上一條 id（會連續出同一條）',
      'for (let k = 0; k < pool.length && pool[i].id === quizLastId; k++) i = (i + 1) % pool.length;', ''],
    ['段界唔觸發答題',
      'settleSegment(); startSegment(stageMs, waveCursor); maybeQuiz();',
      'settleSegment(); startSegment(stageMs, waveCursor);'],
    ['答題中唔吞掣（可以拖曳移機／開火）',
      '  if (quizOpen) { handleQuizTap(px, py); return true; }', ''],
    ['答題中可以手動暫停（畫面會消失）',
      "  if (quizOpen && (reason || 'manual') === 'manual') return false;", ''],
    ['overlay 黑屏（場景睇唔到）',
      "ctx.fillStyle = 'rgba(2,10,20,0.82)';", "ctx.fillStyle = 'rgba(0,0,0,1)';"],
    ['答題字級越界（13px 唔喺 7 級表）',
      "ctx.fillStyle = fg; ctx.font = '12px monospace';", "ctx.fillStyle = fg; ctx.font = '13px monospace';"],
    ['overlay 喺音效掣之前畫（音效掣壓喺面板上面）',
      'function renderTail() {\n  drawAudioUi();\n  drawQuiz();',
      'function renderTail() {\n  drawQuiz();\n  drawAudioUi();'],
    ['「繼續」掣唔置中（答對時左邊留白）',
      'const x = quizOk ? g.p.x + (g.p.w - g.bw) / 2 : g.bx + i * (g.bw + g.gap);',
      'const x = g.bx + i * (g.bw + g.gap);'],
    ['問題階段面板唔縮（留大片空白）',
      'const p = (quizPhase >= 2 ? QUIZ_PANEL : QUIZ_PANEL_Q), cw = 120, ch = 72, gap = 16, bw = 120;',
      'const p = QUIZ_PANEL, cw = 120, ch = 72, gap = 16, bw = 120;'],
    ['答題觸碰段目標狀態（影響三種目標分佈）',
      '  quizPending = true;\n  return true;', '  segChain = 0;\n  quizPending = true;\n  return true;'],
  ];

  const baseFails = structuralFails(h);
  check('★ 未改動嘅 source 結構斷言全綠（基線）', baseFails === 0, baseFails + ' 項紅');
  let bad = 0;
  for (const [label, from, to] of MUTANTS) {
    if (h.indexOf(from) < 0) { check('★ mutant「' + label + '」搵唔到目標字串（測試本身壞）', false); bad++; continue; }
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
