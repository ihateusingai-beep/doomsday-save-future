/* tools/visual_mass.js — 教學可讀性核心量測：畫面「視覺質量」分配
 *
 * 量度玩家自己嘅子彈 vs 敵方彈幕，喺實際渲染出嚟嘅畫面入面佔幾多像素、對比度幾多。
 * ⚠️ 呢個工具係 `MECHANICS_REVIEW_v036.md` §3 嘅證據來源（2026-11-03）。
 *
 * 方法：真實 canvas getImageData → 色相分割（青綠 = 玩家彈 / 洋紅 = 敵彈）
 *       → 面積加權平均色 → WCAG 相對亮度對比度 vs 背景。
 * ⚠️ 關閉元素 tint（ship.elementA = ''）先量 —— 否則「暗」元素會把玩家彈染成洋紅，污染分割。
 *
 * 用法：node tools/visual_mass.js <index.html 路徑>
 */
const pw = require('/Users/kencheng/.npm/_npx/9833c18b2d85bc59/node_modules/playwright');
const HTML = process.argv[2];

const srgb = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const L = c => 0.2126 * srgb(c[0]) + 0.7152 * srgb(c[1]) + 0.0722 * srgb(c[2]);
const cr = (a, b) => { const l1 = Math.max(L(a), L(b)), l2 = Math.min(L(a), L(b)); return (l1 + 0.05) / (l2 + 0.05); };

(async () => {
  const b = await pw.webkit.launch();
  const ctx = await b.newContext({ viewport: { width: 834, height: 1194 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto('file://' + HTML + '?seed=7&god=1');
  await page.waitForTimeout(1200);
  const tapC = async (fx, fy) => {
    const bb = await page.locator('canvas').boundingBox();
    await page.touchscreen.tap(bb.x + bb.width * fx, bb.y + bb.height * fy);
    await page.waitForTimeout(450);
  };
  for (let i = 0; i < 14; i++) {
    const st = await page.evaluate(() => window.__dsf.fsm.cur);
    if (st.startsWith('STAGE')) break;
    await tapC(0.5, 0.5);
  }
  await page.waitForTimeout(600);

  const r = await page.evaluate(async () => {
    const d0 = window.__dsf;
    d0.ship.elementA = '';                       /* 閂咗元素 tint，先量乾淨基準 */
    const cv = document.querySelector('canvas');
    const c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height;
    const g = c2.getContext('2d');
    const frame = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
    const out = [];
    for (let k = 0; k < 90; k++) {
      await frame();
      await new Promise(res => setTimeout(res, 60));
      g.clearRect(0, 0, cv.width, cv.height);
      g.drawImage(cv, 0, 0);
      const d = g.getImageData(0, 0, cv.width, cv.height).data;
      let teal = 0, mag = 0, white = 0;
      let tealSum = [0, 0, 0], magSum = [0, 0, 0];
      for (let i = 0; i < d.length; i += 4) {
        const R = d[i], G = d[i + 1], B = d[i + 2], A = d[i + 3];
        if (A < 100) continue;
        const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
        if (mx < 90) continue;                       /* 背景太暗，唔算 */
        const sat = mx === 0 ? 0 : (mx - mn) / mx;
        if (sat < 0.30) continue;                    /* 灰階（背景/塔）唔算 */
        if (R > 190 && G > 190 && B > 190) { white++; continue; }
        if (G > R * 1.15 && B > R * 1.15) { teal++; tealSum[0] += R; tealSum[1] += G; tealSum[2] += B; }
        else if (R > G * 1.35) { mag++; magSum[0] += R; magSum[1] += G; magSum[2] += B; }
      }
      out.push({
        teal, mag, white,
        tealC: teal ? tealSum.map(v => Math.round(v / teal)) : null,
        magC: mag ? magSum.map(v => Math.round(v / mag)) : null,
        pb: d0.bullets.length, eb: d0.enemies.filter(e => e.kind === 'bullet').length,
      });
    }
    return { out, canvas: [cv.width, cv.height], total: cv.width * cv.height };
  });

  const withE = r.out.filter(x => x.eb > 0);
  const avg = (arr, f) => arr.reduce((a, x) => a + f(x), 0) / arr.length;
  const tealArea = avg(r.out, x => x.teal);
  const magArea = avg(withE.length ? withE : r.out, x => x.mag);
  const bg = [6, 23, 45];

  console.log(`canvas ${r.canvas.join('×')} = ${r.total} px`);
  console.log(`採樣 ${r.out.length} 點（有敵彈嘅 ${withE.length} 點）`);
  console.log('');
  console.log('  分類                 平均像素數    佔畫面%    平均色');
  console.log(`  玩家自己嘅彈（青綠）  ${tealArea.toFixed(0).padStart(6)} px    ${(tealArea / r.total * 100).toFixed(2).padStart(5)}%   rgb(${avg(r.out, x => x.tealC[0])},${avg(r.out, x => x.tealC[1])},${avg(r.out, x => x.tealC[2])})`);
  console.log(`  敵方彈幕（洋紅）      ${magArea.toFixed(0).padStart(6)} px    ${(magArea / r.total * 100).toFixed(2).padStart(5)}%   rgb(${avg(withE, x => x.magC[0])},${avg(withE, x => x.magC[1])},${avg(withE, x => x.magC[2])})`);
  console.log('');
  const pC = [Math.round(avg(r.out, x => x.tealC[0])), Math.round(avg(r.out, x => x.tealC[1])), Math.round(avg(r.out, x => x.tealC[2]))];
  const eC = [Math.round(avg(withE, x => x.magC[0])), Math.round(avg(withE, x => x.magC[1])), Math.round(avg(withE, x => x.magC[2]))];
  console.log(`  玩家彈 vs 背景對比度：${cr(pC, bg).toFixed(2)}:1`);
  console.log(`  敵方彈 vs 背景對比度：${cr(eC, bg).toFixed(2)}:1`);
  console.log(`  ➜ 玩家彈比敵彈搶眼 ${(cr(pC, bg) / cr(eC, bg)).toFixed(2)} 倍`);
  console.log(`  ➜ 視覺質量比（玩家 : 敵方）= ${(tealArea / magArea).toFixed(1)} : 1`);
  console.log('');
  /* 目標：玩家彈降到 ≤3.5:1 會點 */
  console.log('  目標演算法（背景 rgb(6,23,45)）：');
  for (const a of [0.7, 0.55, 0.45, 0.4, 0.3]) {
    const c = pC.map((v, i) => Math.round(a * v + (1 - a) * bg[i]));
    console.log(`    玩家彈 alpha ${a.toFixed(2)} → rgb(${c.join(',')}) → 對比度 ${cr(c, bg).toFixed(2)}:1  ${cr(c, bg) < cr(eC, bg) ? '✅ 低過敵彈' : '❌ 仲搶過敵彈'}`);
  }
  await b.close();
})();
