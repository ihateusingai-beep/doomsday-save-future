/* tools/pixel_scale.js — canvas 非整數倍縮放量測（V12 · H6′）
 *
 * ⚠️⚠️ **方法未驗實 —— 唔好當呢個工具嘅輸出係產品結論** ⚠️⚠️
 * 對照組（640×960 = 精確 2.0× 整數）都報「像素唔等寬」→ 量測方法本身有問題
 * （現時掃嘅係區域內**所有**青色像素嘅 run 長度，混咗多粒 sprite 嘅邊緣，
 *  唔係量單一 sprite 嘅像素寬度）。修好對照組之前，本工具只係研究草稿。
 *
 * 問題：`setupCanvas()` 令 canvas CSS 尺寸 = 視窗適應結果，唔保證係 320×480 嘅整數倍。
 * 喺智慧白板常見尺寸：
 *   1920×1080 → canvas 720×1080 → 720/320 = 2.25×（非整數）
 *   3840×2160 → canvas 1440×2160 → 1440/320 = 4.5×（非整數）
 *   iPad 834 闊 → 796×1194 → 2.4875×（非整數）
 * `image-rendering: pixelated` = nearest-neighbour → 非整數倍會令**同一個 sprite 嘅
 * 相鄰 source 像素喺 device 上佔 4 或 5 物理 px 交替** → 像素大小不均（V12 差距來源）。
 *
 * 量測方法（逐個目標物體取樣，唔好整屏分割）：
 *   截圖只裁玩家機附近嘅一小塊 → 喺瀏覽器內解碼 → 搵玩家子彈（青色）像素叢 →
 *   對每行量青色連續 run 長度 → 收集所有 run 長度。
 *   整數倍 → 只有一個值（例如全部 2）；非整數倍 → 兩個值交替（例如 2 同 3）。
 *
 * ⚠️ 對照組一定要有：同一個 sprite、同一個 deviceScaleFactor、唯一分別係 scale 整數 vs 非整數。
 * ⚠️ 唔喺 /tmp 留低 → 量測工具要入 repo（#147 嘅要求）。
 *
 * 用法：node tools/pixel_scale.js <index.html 路徑>
 */
const pw = require('/Users/kencheng/.npm/_npx/9833c18b2d85bc59/node_modules/playwright');
const HTML = process.argv[2];

/* 對照組：640×960 → canvas 640×960 → 精確 2.0×（整數）
 * 測試組：1920×1080 → 2.25× · 3840×2160 → 4.5× · 834×1194 → 2.4875× */
const VIEWS = [
  ['對照組 640×960（2.0× 整數）', 640, 960, 1],
  ['白板 1080p（2.25×）', 1920, 1080, 1],
  ['白板 4K（4.5×）', 3840, 2160, 1],
  ['iPad 垂直 834（2.4875×）', 834, 1194, 1],
];

/* 喺瀏覽器內解碼 PNG 同量 run 長度（避免套 pngjs 依賴） */
async function analyse(page, b64) {
  return await page.evaluate(async (data) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + data;
    await img.decode();
    const W = img.width, H = img.height;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, W, H).data;
    const isCyan = (i) => {
      const r = d[i], gg = d[i + 1], bl = d[i + 2];
      return gg > 90 && bl > 90 && r < gg * 0.75 && bl > r + 30;
    };
    const hist = {};
    for (let y = 0; y < H; y++) {
      let run = 0, best = 0;
      for (let x = 0; x < W; x++) {
        if (isCyan((y * W + x) * 4)) { run++; if (run > best) best = run; }
        else run = 0;
      }
      if (best >= 1 && best <= 14) hist[best] = (hist[best] || 0) + 1;
    }
    return { W, H, hist };
  }, b64);
}

(async () => {
  const b = await pw.webkit.launch();
  console.log('裝置'.padEnd(26), 'canvas CSS'.padEnd(12), 'scale'.padEnd(10), '青色 run 長度統計'.padEnd(30), '判定');
  for (const [name, w, h, dpr] of VIEWS) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto('file://' + HTML);
    await page.waitForTimeout(600);
    await page.evaluate(() => { const d = window.__dsf; d.fsm.set(d.stageS.STAGE_1); });
    await page.waitForTimeout(2600);   // 等玩家開火

    const meta = await page.evaluate(() => {
      const c = document.querySelector('#game').getBoundingClientRect();
      return { cw: Math.round(c.width), ch: Math.round(c.height), left: c.left, top: c.top };
    });
    /* 只裁畫布中下方一塊（玩家 + 彈幕）—— 夠量 run 長度，又唔使傳巨圖 */
    const cw = Math.min(320, meta.cw), chh = Math.min(260, meta.ch);
    const shot = await page.screenshot({
      clip: { x: Math.round(meta.left + (meta.cw - cw) / 2), y: Math.round(meta.top + meta.ch - chh), width: cw, height: chh },
    });
    const r = await analyse(page, shot.toString('base64'));
    const lens = Object.keys(r.hist).map(Number).sort((a, b) => a - b);
    const scale = meta.cw / 320;
    const uniform = lens.length <= 1;
    const verdict = uniform
      ? '✅ 像素等寬'
      : '❌ 像素唔等寬（' + lens.map(k => k + 'px×' + r.hist[k]).join(' ') + '）';
    console.log(
      name.padEnd(24),
      (meta.cw + '×' + meta.ch).padEnd(12),
      (scale.toFixed(4) + '×').padEnd(10),
      (lens.length ? lens.map(k => k + 'px×' + r.hist[k]).join(' ').slice(0, 28) : '（搵唔到彈）').padEnd(30),
      verdict
    );
    await ctx.close();
  }
  await b.close();
})();
