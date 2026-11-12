/* tools/quiz_e2e_check.js — 端到端驗證：真 browser（WebKit）跑 S1 全關，自動答題，數答題條數
 *
 * ⚠️ 點解要有呢個工具：v0.44.0 嘅「每關 12 條」係**靜靜失效**（每關實際得 3-4 條）。
 *    靜態守門（計段數）只證明「理論上彈得到」⇒ 呢個工具用**真瀏覽器 + 真遊戲迴圈**，
 *    由頭到尾行完 S1，數真實彈出嘅答題條數 ⇒ 呢個係「端到端」證據。
 *
 * ⚠️ **時間加速**：headless 頁面嘅 rAF 會被節流（遊戲時鐘行得好慢）⇒ 用 init script 把
 *    `performance.now()` 放大 SPEED 倍（遊戲只用時間差 → 等價於「世界行快啲」）。
 *    ⚠️ 物理 dt 會同步變大（敵彈跳得遠）· 但 `?god=1` 無敵 + 答題期間物理凍結 ⇒ 唔影響答題條數。
 *
 * 用法：node tools/quiz_e2e_check.js [index.html] [TIMEOUT_SEC] [SPEED]
 */
'use strict';
const path = require('path');
const fs = require('fs');
const PW = '/Users/kencheng/.npm/_npx/9833c18b2d85bc59/node_modules/playwright';

const HTML = process.argv[2] || path.join(__dirname, '..', 'index.html');
const TIMEOUT_SEC = parseInt(process.argv[3] || '180', 10);
const SPEED = parseFloat(process.argv[4] || '6');
const LOG = path.join('/tmp', 'dsf_quiz_e2e.log');

let fails = 0;
function check(label, ok, extra) {
  if (!ok) fails++;
  const line = (ok ? '  ✓ ' : '  ✗ ') + label + (extra ? '  ' + extra : '');
  console.log(line);
  try { fs.appendFileSync(LOG, line + '\n'); } catch (e) {}
}
function say(s) { console.log(s); try { fs.appendFileSync(LOG, s + '\n'); } catch (e) {} }

(async () => {
  try { fs.unlinkSync(LOG); } catch (e) {}
  const pw = require(PW);
  const browser = await pw.webkit.launch();
  const ctx = await browser.newContext({ viewport: { width: 834, height: 1194 }, hasTouch: true, deviceScaleFactor: 1 });
  /* ⚠️ 時間加速（行前注入 · 頁面一載入就生效） */
  await ctx.addInitScript((sp) => {
    const real = performance.now.bind(performance);
    performance.now = () => real() * sp;
    /* ⚠️ **rAF timestamp 一定要一齊加速**：遊戲比較 `nowMs < hitStopUntil`，
       `nowMs` 係 rAF 俾嘅（瀏覽器內部時鐘 · 唔受 performance.now patch 影響），
       `hitStopUntil` 係 performance.now() → 兩個唔同時鐘混用 ⇒ 成個 fixed-step loop 卡死
       （畫面靜止但 waveCursor / segIndex 唔郁）。⇒ 一齊乘返同樣倍數。*/
    const rafReal = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => rafReal((t) => cb(t * sp));
  }, SPEED);
  const page = await ctx.newPage();
  const logs = [];
  const errs = [];
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));

  say('=== 端到端：真 browser 跑 S1 · 自動答題 · 數答題條數 ===');
  say('檔案：' + HTML + ' · 時間加速 ' + SPEED + '× · 最多行 ' + TIMEOUT_SEC + ' 秒');

  await page.goto('file://' + HTML + '?god=1&seed=7');
  await page.waitForTimeout(1200);

  /* 標題畫面：撳一下就入難度選擇（handleMenuTap：TITLE 任何點擊都進 DIFF_SELECT） */
  {
    const r = await page.evaluate(() => {
      const b = document.getElementById('game').getBoundingClientRect();
      return { x: b.x, y: b.y, w: b.width, h: b.height };
    });
    await page.mouse.click(r.x + 160 * r.w / 320, r.y + 420 * r.h / 480);
    await page.waitForTimeout(400);
  }

  /* 鍵盤流程：難度 2（標準）· 科目 2（數學）· 單元 2（中國數字）· 機體 1 · 元素 3（雷）· 技能 1 */
  for (const k of ['2', '2', '2', '1', '3', '1']) {
    await page.keyboard.press(k);
    await page.waitForTimeout(400);
  }

  async function clickLogical(gx, gy) {
    const r = await page.evaluate(() => {
      const b = document.getElementById('game').getBoundingClientRect();
      return { x: b.x, y: b.y, w: b.width, h: b.height };
    });
    await page.mouse.click(r.x + gx * r.w / 320, r.y + gy * r.h / 480);
  }

  const t0 = Date.now();
  let answered = 0, lastCount = 0, polls = 0, doneAt = 0;
  while (Date.now() - t0 < TIMEOUT_SEC * 1000) {
    polls++;
    let st = null;
    try {
      st = await Promise.race([
        page.evaluate(() => {
          if (typeof quizOpen === 'undefined') return { ready: false };
          if (!quizOpen || quizPhase !== 1 || !quizQ) return { ready: true, open: false, count: quizCount,
            phase: quizPhase, seg: segIndex, wave: waveCursor, segT: (typeof segStartAt !== 'undefined' ? Math.round(performance.now() - stageStartMs) : -1) };
          const g = quizGeom();
          const o = quizOptRect(g, quizQ.a);
          return {
            ready: true, open: true, count: quizCount, a: quizQ.a, id: quizQ.id, nOpts: quizQ.opts.length,
            opt: { x: o.x + o.w / 2, y: o.y + o.h / 2 },
          };
        }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('evaluate timeout')), 8000)),
      ]);
    } catch (e) {
      say('  ! evaluate 失敗（' + e.message + '）· 跳過今輪');
      await page.waitForTimeout(300);
      continue;
    }
    if (!st.ready) { await page.waitForTimeout(200); continue; }
    if (st.open) {
      await clickLogical(st.opt.x, st.opt.y);            /* 揀正確答案（phase 1 面板） */
      await page.waitForTimeout(200);
      /* ⚠️ 「繼續」掣喺 **phase 2 面板**（quizGeom() 用唔同嘅 p）⇒ 答完之後重新讀座標 */
      let st2 = null;
      try {
        st2 = await page.evaluate(() => {
          if (!quizOpen || quizPhase < 2 || !quizQ) return null;
          const b = quizBtnRect(quizGeom(), 1);
          return { ok: quizOk, btn: { x: b.x + b.w / 2, y: b.y + b.h / 2 } };
        });
      } catch (e) { st2 = null; }
      if (st2) await clickLogical(st2.btn.x, st2.btn.y); /* 撳「繼續」 */
      await page.waitForTimeout(200);
      answered++;
      continue;
    }
    if (st.count > lastCount) {
      lastCount = st.count;
      const q = logs.filter(l => l.indexOf('[答題] 第 ') === 0).pop();
      say('  · ' + (q || ('第 ' + st.count + ' 條')) + '   [答咗 ' + answered + ' · poll ' + polls
        + ' · seg ' + st.seg + ' · wave ' + st.wave + ' · stageMs ' + st.segT + ']');
    } else if (polls % 40 === 0) {
      say('    … poll ' + polls + ' · count ' + st.count + ' · phase ' + st.phase + ' · seg ' + st.seg
        + ' · wave ' + st.wave + ' · stageMs ' + st.segT + ' (6×)');
    }
    /* ⚠️ 彈到 12 條之後**唔好即刻停** —— 要再行多幾秒，
       確認「第 13 段會開新段（段 log +1）· 但唔會再彈第 13 條答題（QUIZ_MAX 封頂）」 */
    if (st.count >= 12) {
      if (doneAt === 0) { doneAt = Date.now(); say('    … 已彈到 12 條 · 再等 5 秒驗證封頂（第 13 段唔會再彈題）'); }
      else if (Date.now() - doneAt > 5000) break;
    }
    await page.waitForTimeout(120);
  }

  /* ---------- 結果 ---------- */
  const quizLogs = logs.filter(l => l.indexOf('[答題] 第 ') === 0);
  const ttsLogs = logs.filter(l => l.indexOf('[語音] ') === 0);
  const segLogs = logs.filter(l => l.indexOf('[段] S') === 0);
  const nums = quizLogs.map(l => parseInt((l.match(/第 (\d+) 條/) || [])[1], 10)).filter(n => !isNaN(n));
  const maxN = nums.length ? Math.max.apply(null, nums) : 0;
  const uniqueN = nums.filter((v, i, a) => a.indexOf(v) === i);

  say('');
  say('（答題 log 共 ' + quizLogs.length + ' 條 · 段 log 共 ' + segLogs.length + ' 條 · 語音 log 共 ' + ttsLogs.length + ' 條）');
  check('★ 答題真係彈到第 12 條', maxN === 12, '· 最大條數 = ' + maxN);
  check('★ 答題條數 = 12（唔多唔少）', quizLogs.length === 12, '· 彈出 ' + quizLogs.length + ' 次');
  check('★ 條數連續 1..12（唔會跳號）', uniqueN.length === 12 && uniqueN[0] === 1 && uniqueN[11] === 12,
    '· ' + uniqueN.join(','));
  check('★ 第 13 條冇彈出（QUIZ_MAX 封頂生效）', maxN === 12);
  check('★ 粵語語音有讀出聲（讀題目 + 讀解說）', ttsLogs.length >= 24, '· ' + ttsLogs.length + ' 段語音 log');
  /* ⚠️ 答題喺「開新段」時觸發 → 彈到第 12 條 = 第 12 段開頭；再等 5 秒應該見到第 13 段開新段
     （但唔會彈第 13 條題 · QUIZ_MAX 封頂）⇒ 段 log = 13 · 答題 log = 12 */
  check('★ 段數 ≥ 13（第 13 段有開新段）', segLogs.length >= 13, '· ' + segLogs.length + ' 段');
  check('★ 段數 > 答題條數（第 13 段開咗但冇彈題 · 封頂生效）', segLogs.length > quizLogs.length,
    '· ' + segLogs.length + ' 段 vs ' + quizLogs.length + ' 條');
  check('★ 零 page error', errs.length === 0, errs.join(' | ') || '零');

  say('');
  say('--- 答題 log（全部）---');
  quizLogs.forEach(l => say('  ' + l));
  say('--- 語音 log（前 4 段）---');
  ttsLogs.slice(0, 4).forEach(l => say('  ' + l));

  await browser.close();
  say('\n' + (fails ? '✗ ' + fails + ' 項失敗' : '✓ 端到端全部通過'));
  process.exit(fails ? 1 : 0);
})().catch(e => { say('ERR ' + e.message); process.exit(1); });
