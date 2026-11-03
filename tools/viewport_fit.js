/* tools/viewport_fit.js — 版面佔用率 + 白板側欄覆蓋率量測（多裝置矩陣）
 *
 * 量 `setupCanvas()` 喺唔同情況下畀遊戲幾多畫面，同埋 #143 白板側欄有冇真正用到左右空間。
 *
 * 2026-11-03（v0.37.0 前）實測：iPad 垂直 95.4% ✅ / iPad 橫向 46.6% ⚠️ /
 *   智慧白板 4K 橫向 37.5%（左右各 1200px 全黑 = 63% 畫面冇用）❌ / 手機 69.3% ✅
 *
 * 2026-11-04（v0.38.0 #143 後）實測：橫向時左右側欄出現，戰鬥區高度保持 100%（= 視窗高度），
 *   側欄內容欄靠住遊戲嗰邊；縱向 iPad 垂直 / 手機完全不變（側欄 display:none → 零 layout 影響）。
 *
 * ⚠️ 量測工具自己嘅噪音要留意：同一版本重跑應該一模一樣（純 layout，無隨機）。
 *
 * 用法：node tools/viewport_fit.js <index.html 路徑>
 */
const pw = require('/Users/kencheng/.npm/_npx/9833c18b2d85bc59/node_modules/playwright');
const HTML = process.argv[2];

const VIEWS = [
  ['iPad 垂直（學生用）', 834, 1194, 2],
  ['iPad 橫向', 1194, 834, 2],
  ['iPad Pro 12.9 橫向', 1366, 1024, 2],
  ['智慧白板 4K 橫向（86"）', 3840, 2160, 2],
  ['智慧白板 1080p 橫向', 1920, 1080, 1],
  ['投影 16:9', 1600, 900, 1],
  ['正方形 1024（最窄邊界）', 1024, 1024, 1],
  ['手機', 390, 844, 3],
];

(async () => {
  const b = await pw.webkit.launch();
  console.log('裝置'.padEnd(26), '視窗'.padEnd(12), 'canvas CSS'.padEnd(12), '畫面%'.padEnd(7),
    '戰鬥區高%'.padEnd(9), '側欄'.padEnd(8), '側欄可用寬'.padEnd(10), '內容欄寬');
  for (const [name, w, h, dpr] of VIEWS) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto('file://' + HTML);
    await page.waitForTimeout(700);
    const r = await page.evaluate(() => {
      const cv = document.querySelector('#game');
      const b = cv.getBoundingClientRect();
      const L = document.getElementById('wbL'), R = document.getElementById('wbR');
      const side = (el) => {
        if (!el) return null;
        const cs = getComputedStyle(el);
        if (cs.display === 'none') return { shown: false, w: 0, contentW: 0, text: '', rows: 0 };
        const r = el.getBoundingClientRect();
        /* 內容欄 = 第一個子元素嘅實際寬度（CSS max-width:640px 生效後） */
        const first = el.firstElementChild;
        const fr = first ? first.getBoundingClientRect() : { width: 0 };
        return {
          shown: true, w: Math.round(r.width), contentW: Math.round(fr.width),
          text: (el.innerText || '').replace(/\s+/g, ' ').trim(),
          rows: el.querySelectorAll('.wb-r').length,
        };
      };
      return {
        cw: Math.round(b.width), ch: Math.round(b.height), left: Math.round(b.left),
        vw: innerWidth, vh: innerHeight, L: side(L), R: side(R),
      };
    });
    const area = (r.cw * r.ch) / (r.vw * r.vh) * 100;
    const fightH = (r.ch / r.vh) * 100;
    const sb = r.L.shown && r.R.shown;
    const sbW = sb ? `各${r.L.w}/${r.R.w}` : '（無）';
    const usable = sb ? r.L.contentW + r.R.contentW : 0;
    console.log(
      name.padEnd(24),
      (r.vw + '×' + r.vh).padEnd(12),
      (r.cw + '×' + r.ch).padEnd(12),
      (area.toFixed(1) + '%').padEnd(7),
      (fightH.toFixed(1) + '%').padEnd(9),
      sbW.padEnd(8),
      (usable + 'px').padEnd(10),
      (sb ? `左 ${r.L.rows} 條 / 右 ${r.R.rows} 條 · 左欄字數 ${r.L.text.length}` : '—')
    );
    await ctx.close();
  }
  await b.close();
})();
