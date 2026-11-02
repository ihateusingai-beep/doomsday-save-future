/* tools/viewport_fit.js — 版面佔用率量測（多裝置矩陣）
 *
 * 量 `setupCanvas()` 喺唔同情況下畀遊戲幾多畫面。
 * ⚠️ 呢個工具係 `MECHANICS_REVIEW_v036.md` §5 嘅證據來源（2026-11-03）。
 *
 * 2026-11-03 實測結果：iPad 垂直 95.4% ✅ / iPad 橫向 46.6% ⚠️ /
 *   智慧白板 4K 橫向 37.5%（左右各 1200px 全黑 = 63% 畫面冇用）❌ / 手機 69.3% ✅
 *
 * 用法：node tools/viewport_fit.js <index.html 路徑>
 */
const pw = require('/Users/kencheng/.npm/_npx/9833c18b2d85bc59/node_modules/playwright');
const HTML = process.argv[2];

const VIEWS = [
  ['iPad 垂直（學生用）', 834, 1194, 2],
  ['iPad 橫向', 1194, 834, 2],
  ['智慧白板 4K 橫向（86"）', 3840, 2160, 2],
  ['智慧白板 1080p 橫向', 1920, 1080, 1],
  ['投影 16:9', 1600, 900, 1],
  ['手機', 390, 844, 3],
];

(async () => {
  const b = await pw.webkit.launch();
  console.log('裝置'.padEnd(28), '視窗'.padEnd(12), 'canvas CSS'.padEnd(14), '佔畫面%', '  左右黑邊');
  for (const [name, w, h, dpr] of VIEWS) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto('file://' + HTML);
    await page.waitForTimeout(700);
    const r = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      const b = c.getBoundingClientRect();
      return { cw: Math.round(b.width), ch: Math.round(b.height), left: Math.round(b.left), vw: innerWidth, vh: innerHeight };
    });
    const area = (r.cw * r.ch) / (r.vw * r.vh) * 100;
    const side = Math.round((r.vw - r.cw) / 2);
    console.log(
      name.padEnd(26),
      (r.vw + '×' + r.vh).padEnd(12),
      (r.cw + '×' + r.ch).padEnd(14),
      (area.toFixed(1) + '%').padEnd(8),
      side > 4 ? `左右各 ${side}px（合共 ${(side * 2 / r.vw * 100).toFixed(0)}% 畫面冇用）` : '（幾乎滿版）'
    );
    await ctx.close();
  }
  await b.close();
})();
