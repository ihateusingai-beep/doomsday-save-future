/* tools/wb_sidebar.js — 白板側欄實機量測（#143 · v0.38.0）
 *
 * 量四樣嘢：
 *   1. 側欄喺唔同情況下有冇顯示（縱向 display:none → 零 layout 影響）
 *   2. 側欄內容有冇真嘢（本關重點 / 敵種圖鑑 / 我嘅強化）
 *   3. 內容有冇被裁切（scrollHeight vs clientHeight）—— 靜靜剪走內容 = 靜靜資料損失
 *   4. 逐關敵種圖鑑覆蓋率（pool 嘅 type 有冇全部出現喺右欄）
 *
 * ⚠️ 量測方法：用 fsm.set(STAGE_n) 直接跳關（__dsf.fsm 有 export），唔係靠打機 —— 打機要 5 關。
 * ⚠️ 呢個工具係純 layout + DOM，無隨機 → 同版本重跑應該一模一樣。
 *
 * 用法：node tools/wb_sidebar.js <index.html 路徑>
 */
const pw = require('/Users/kencheng/.npm/_npx/9833c18b2d85bc59/node_modules/playwright');
const HTML = process.argv[2];

const VIEWS = [
  ['iPad 垂直', 834, 1194, 2],
  ['iPad 橫向', 1194, 834, 2],
  ['智慧白板 1080p', 1920, 1080, 1],
  ['智慧白板 4K', 3840, 2160, 2],
];

(async () => {
  const b = await pw.webkit.launch();
  for (const [name, w, h, dpr] of VIEWS) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto('file://' + HTML);
    await page.waitForTimeout(600);
    console.log('\n=== ' + name + ' (' + w + '×' + h + ' dpr' + dpr + ') ===');
    for (const st of [1, 3, 5]) {
      const r = await page.evaluate((s) => {
        const d = window.__dsf;
        d.fsm.set(d.stageS['STAGE_' + s]);
        const L = document.getElementById('wbL'), R = document.getElementById('wbR');
        const cs = getComputedStyle(L);
        if (cs.display === 'none') {
          return { shown: false, vw: innerWidth, vh: innerHeight };
        }
        const lr = L.getBoundingClientRect(), rr = R.getBoundingClientRect();
        const rows = [...R.querySelectorAll('.wb-r')].map(e => e.innerText.replace(/\s+/g, ' ').trim());
        return {
          shown: true, vw: innerWidth, vh: innerHeight,
          lText: (L.innerText || '').replace(/\s+/g, ' ').trim(),
          rText: (R.innerText || '').replace(/\s+/g, ' ').trim(),
          rows,
          lClip: L.scrollHeight - L.clientHeight,
          rClip: R.scrollHeight - R.clientHeight,
          lw: Math.round(lr.width), rw: Math.round(rr.width),
          fontPx: parseFloat(getComputedStyle(L).fontSize),
          /* 內容欄實際寬度（max-width:640px 生效後） */
          contentW: L.firstElementChild ? Math.round(L.firstElementChild.getBoundingClientRect().width) : 0,
        };
      }, st);
      if (!r.shown) { console.log('  S' + st + '：側欄 display:none（縱向 → 零 layout 影響）✅'); continue; }
      console.log('  S' + st + '：側欄 ' + r.lw + '/' + r.rw + 'px · 內容欄 ' + r.contentW + 'px · 字號 ' + r.fontPx + 'px'
        + ' · 裁切 L' + r.lClip + '/R' + r.rClip + (r.lClip > 0 || r.rClip > 0 ? ' ❌有內容被剪走' : ' ✅'));
      console.log('      左欄：' + r.lText);
      console.log('      右欄 ' + r.rows.length + ' 條：' + r.rows.join(' | '));
    }
    await ctx.close();
  }
  await b.close();
})();
