/* tools/visual_mass.js — 教學可讀性核心量測：玩家自己嘅彈 vs 敵方威脅
 *
 * 量度玩家自己嘅子彈 vs 敵方彈幕，喺實際渲染出來嘅畫面入面幾搶眼。
 * ⚠️ 呢個工具係 `MECHANICS_REVIEW_v036.md` §3 嘅證據來源（2026-11-03）。
 *
 * ⚠️ **方法學（v0.37.0 修正）**：第一版用「整屏色相分割」→ **量測工具自己嘅噪音
 *    比真 bug 更大**：青色 HUD（頂欄文字、按鈕邊框）會被當成「玩家彈」混入平均色，
 *    令改動前後嘅差異被稀釋（實測：alpha 0.55 應該令對比度跌到 2.7:1，
 *    但整屏分割只量到 6.06:1）。
 *    ⇒ 而家改成**逐粒子彈取樣**：由 `window.__dsf` 攞每粒子彈嘅座標，
 *    只喺佢自己嘅 bbox 內取「本體色」像素（排除低飽和嘅白色核心同背景），
 *    背景色由全畫面暗像素嘅中位數估。
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
    const bb = await page.locator('#game').boundingBox();
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
    d0.ship.elementA = '';                 /* 閂咗元素 tint，先量乾淨基準 */
    const cv = document.querySelector('#game');
    const c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height;
    const g = c2.getContext('2d');
    const frame = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
    const samples = [];
    for (let k = 0; k < 90; k++) {
      await frame();
      await new Promise(res => setTimeout(res, 60));
      g.clearRect(0, 0, cv.width, cv.height);
      g.drawImage(cv, 0, 0);
      const d = g.getImageData(0, 0, cv.width, cv.height).data;
      const px = (x, y) => {
        const i = (y * cv.width + x) * 4;
        return [d[i], d[i + 1], d[i + 2]];
      };
      /* 背景：全畫面暗像素嘅中位數（每通道） */
      const darks = [];
      for (let i = 0; i < d.length; i += 4) {
        const mx = Math.max(d[i], d[i + 1], d[i + 2]);
        if (mx < 45) darks.push([d[i], d[i + 1], d[i + 2]]);
      }
      darks.sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]));
      const med = darks.length ? darks[Math.floor(darks.length / 2)] : [6, 23, 45];

      /* 逐粒取樣：只喺自己嘅 bbox 內取「本體色」（排除低飽和嘅白色核心） */
      const bodyOf = (bx, by, rx, ry) => {
        let sum = [0, 0, 0], n = 0;
        for (let y = Math.round(by - ry); y <= Math.round(by + ry); y++) {
          for (let x = Math.round(bx - rx); x <= Math.round(bx + rx); x++) {
            if (x < 0 || y < 0 || x >= cv.width || y >= cv.height) continue;
            const c = px(x, y);
            const mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]);
            if (mx < 90) continue;                       /* 太暗 = 背景 */
            const sat = mx === 0 ? 0 : (mx - mn) / mx;
            if (sat < 0.30) continue;                    /* 低飽和 = 白色核心／灰階 */
            sum[0] += c[0]; sum[1] += c[1]; sum[2] += c[2]; n++;
          }
        }
        return n >= 3 ? sum.map(v => Math.round(v / n)) : null;
      };

      const pbs = d0.bullets.filter(b => b.y > 6 && b.y < 474).map(b => bodyOf(b.x, b.y, 5, 8)).filter(Boolean);
      const ebs = d0.enemies.filter(e => e.kind === 'bullet').map(e => bodyOf(e.x, e.y, 5, 5)).filter(Boolean);
      samples.push({
        med,
        pBody: pbs.length ? pbs.reduce((a, c) => [a[0] + c[0] / pbs.length, a[1] + c[1] / pbs.length, a[2] + c[2] / pbs.length], [0, 0, 0]).map(v => Math.round(v)) : null,
        eBody: ebs.length ? ebs.reduce((a, c) => [a[0] + c[0] / ebs.length, a[1] + c[1] / ebs.length, a[2] + c[2] / ebs.length], [0, 0, 0]).map(v => Math.round(v)) : null,
        pN: d0.bullets.length, eN: ebs.length,
      });
    }
    return { samples, canvas: [cv.width, cv.height] };
  });

  const S = r.samples;
  const withE = S.filter(x => x.eBody);
  const avg = (arr, f) => arr.reduce((a, x) => a + f(x), 0) / arr.length;
  const med = S.map(x => x.med);
  const bg = [0, 1, 2].map(i => Math.round(avg(S, x => x.med[i])));
  const pC = withE.length ? [0, 1, 2].map(i => Math.round(avg(withE, x => x.pBody[i]))) : null;
  const eC = withE.length ? [0, 1, 2].map(i => Math.round(avg(withE, x => x.eBody[i]))) : null;

  console.log(`canvas ${r.canvas.join('×')} · 採樣 ${S.length} 點（有敵彈 ${withE.length} 點）`);
  console.log(`背景（暗像素中位數）rgb(${bg.join(',')})`);
  console.log('');
  console.log('  對象            實渲本體色        vs 背景對比度');
  console.log(`  玩家自己嘅彈    rgb(${pC.join(',')})`.padEnd(30) + cr(pC, bg).toFixed(2) + ':1');
  console.log(`  敵方彈幕        rgb(${eC.join(',')})`.padEnd(30) + cr(eC, bg).toFixed(2) + ':1');
  console.log('');
  const pr = cr(pC, bg), er = cr(eC, bg);
  console.log(`  ➜ 玩家彈比敵彈搶眼 ${(pr / er).toFixed(2)} 倍`);
  console.log(`  ➜ 玩家彈 / 敵彈 對比度比 = ${(pr / er).toFixed(2)}  ${pr < er ? '✅ 敵彈搶眼（期望）' : '❌ 玩家彈仲搶過敵彈'}`);
  console.log(`  ➜ 玩家彈對比度 ≤ 4.0:1 ? ${pr <= 4.0 ? '✅' : '❌'}（${pr.toFixed(2)}）`);
  console.log(`  ➜ 敵彈對比度 ≥ 5.2:1 ? ${er >= 5.2 ? '✅' : '❌'}（${er.toFixed(2)}）`);
  console.log(`  ➜ 兩者對比度比 ≥ 1.4:1（敵明顯搶眼）? ${(pr / er) <= 1 / 1.4 ? '✅' : '❌'}（敵/玩家 = ${(er / pr).toFixed(2)}）`);
  console.log('');
  console.log(`  數量比（玩家彈 : 敵彈）= ${(avg(S, x => x.pN) / Math.max(0.1, avg(S, x => x.eN))).toFixed(1)} : 1`);
  await b.close();
})();
