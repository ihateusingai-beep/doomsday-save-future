/* v0.31.0 #116/#117 可讀性守門：詞綴橫幅閱讀時間 + 停電暗幕 alpha
 *
 * ⚠️ 呢個測試唔係 grep 字串 —— 係**真係抽出 drawStageAffixFx() 出嚟實際執行**，
 *    逐個時間點量「橫幅畫咗未 / 淡出到幾多 / 暗幕 alpha 係幾多」，
 *    斷言嘅係**實測行為**（記憶規則：守門要驗實測行為，唔可以只 grep 變數出現次數）。
 *
 * 背景（PLAN 已知落差 #12 / #13）：
 *   ① 橫幅原本總長 2.6s、fade 2.0s 就開始 → 完整可讀只有 2.0s，
 *      但閱讀時間估算需 ≈3.6s → 總長改 4.2s、fade 改 3.6s。
 *   ② 停電 alpha 0.42 → 雜魚對比 3.01:1（零餘量，卡喺 WCAG 非文字 3:1 門檻）
 *      → 0.22 → 雜魚 4.60:1 / 玩家子彈 5.13:1（過 AA 4.5:1）。
 */
const fs = require('fs');
const zlib = require('zlib');
const h = fs.readFileSync(__dirname + '/index.html', 'utf8');
const plan = fs.readFileSync(__dirname + '/PLAN.md', 'utf8');
const art = fs.readFileSync(__dirname + '/art.px.js', 'utf8');

let fails = 0;
function check(label, ok, extra) {
  if (!ok) fails++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (extra ? '  ' + extra : ''));
}

/* ---------- 1. 抽常數（由 index.html 原文抽，唔喺測試檔 hardcode 數值） ---------- */
const num = (re) => { const m = h.match(re); return m ? Number(m[1]) : null; };
const BANNER_MS  = num(/const AFFIX_BANNER_MS\s*=\s*(\d+)/);
const FADE_MS    = num(/const AFFIX_BANNER_FADE_MS\s*=\s*(\d+)/);
const FADE_SPAN  = num(/const AFFIX_BANNER_FADE_SPAN\s*=\s*(\d+)/);
const DARK_ALPHA = num(/const AFFIX_DARK_ALPHA\s*=\s*([\d.]+)/);

console.log('=== 1. 常數抽取 ===');
check('抽到 AFFIX_BANNER_MS', BANNER_MS !== null, String(BANNER_MS));
check('抽到 AFFIX_BANNER_FADE_MS', FADE_MS !== null, String(FADE_MS));
check('抽到 AFFIX_BANNER_FADE_SPAN', FADE_SPAN !== null, String(FADE_SPAN));
check('抽到 AFFIX_DARK_ALPHA', DARK_ALPHA !== null, String(DARK_ALPHA));
if (BANNER_MS === null || FADE_MS === null || FADE_SPAN === null || DARK_ALPHA === null) {
  console.log('\n' + fails + ' FAIL'); process.exit(1);
}

/* ---------- 2. 抽出 drawStageAffixFx() 並 stub 依賴，實際執行 ---------- */
const mFn = h.match(/function drawStageAffixFx\(\) \{[\s\S]*?\n\}/);
const mConsts = h.match(/const AFFIX_BANNER_MS[\s\S]*?const AFFIX_DARK_ALPHA\s*=\s*[\d.]+;/);
check('抽到 drawStageAffixFx()', !!mFn);
check('抽到 AFFIX 常數塊', !!mConsts);
if (!mFn || !mConsts) { console.log('\n' + fails + ' FAIL'); process.exit(1); }

/* ⚠️ 注入依賴要用 eval 返入測試檔 scope（own arity 保持原樣），唔可以用 makeFn wrapper 或 new Function。
   常數同函數一齊 eval → 函數喺自己嘅 closure 見到常數（唔靠 globalThis hack）。 */
const scopeSrc = mConsts[0] + '\n' + mFn[0] +
  '\nreturn { drawStageAffixFx, AFFIX_BANNER_MS, AFFIX_BANNER_FADE_MS, AFFIX_BANNER_FADE_SPAN, AFFIX_DARK_ALPHA };';
const api = eval('(function(){' + scopeSrc + '})()');

console.log('\n=== 1b. 常數值 = 抽到嘅值 ===');
check('eval 作用域內 AFFIX_BANNER_MS = ' + BANNER_MS, api.AFFIX_BANNER_MS === BANNER_MS, String(api.AFFIX_BANNER_MS));
check('eval 作用域內 AFFIX_BANNER_FADE_MS = ' + FADE_MS, api.AFFIX_BANNER_FADE_MS === FADE_MS, String(api.AFFIX_BANNER_FADE_MS));
check('eval 作用域內 AFFIX_BANNER_FADE_SPAN = ' + FADE_SPAN, api.AFFIX_BANNER_FADE_SPAN === FADE_SPAN, String(api.AFFIX_BANNER_FADE_SPAN));
check('eval 作用域內 AFFIX_DARK_ALPHA = ' + DARK_ALPHA, api.AFFIX_DARK_ALPHA === DARK_ALPHA, String(api.AFFIX_DARK_ALPHA));

const calls = [];
const stubCtx = {
  globalAlpha: 1,
  fillStyle: '', strokeStyle: '', lineWidth: 1,
  font: '', textAlign: '', textBaseline: '',
  fillRect(x, y, w, hgt) { calls.push({ op: 'fillRect', x, y, w, hgt, fillStyle: this.fillStyle, alpha: this.globalAlpha }); },
  strokeRect(x, y, w, hgt) { calls.push({ op: 'strokeRect', x, y, w, hgt }); },
  fillText(t, x, y) { calls.push({ op: 'fillText', t, x, y }); },
};

/* 決定性時鐘：用一個可 set 嘅 performance.now() */
let fakeNow = 100000;
const realPerf = globalThis.performance;
Object.defineProperty(globalThis, 'performance', {
  value: { now: () => fakeNow }, writable: true, configurable: true,
});

globalThis.ctx = stubCtx;
globalThis.VIEW_W = 320;
globalThis.VIEW_H = 480;
globalThis.fsm = { cur: 'STAGE_1' };
globalThis.isStage = () => true;
globalThis.affDark = 0;
globalThis.stageAffix = { id: 'iron', name: '鐵壁', icon: 'icon_iron', desc: '敵血+40%｜分×1.3' };
globalThis.affixShownAt = 0;
globalThis.drawIconWithText = () => { calls.push({ op: 'icon' }); };

const drawStageAffixFx = api.drawStageAffixFx;

function probe(ageMs, dark) {
  calls.length = 0;
  fakeNow = 100000 + ageMs;
  globalThis.affixShownAt = 100000;      /* 即 age = ageMs */
  globalThis.affDark = dark;
  drawStageAffixFx();
  const box = calls.filter(c => c.op === 'fillRect' && c.w === 184 && c.hgt === 44);
  const overlay = calls.filter(c => c.op === 'fillRect' && c.w === 320 && c.hgt === 480);
  return {
    bannerDrawn: box.length > 0,
    alpha: box.length ? box[0].alpha : null,
    overlayStyle: overlay.length ? overlay[0].fillStyle : null,
    overlayAlpha: overlay.length ? overlay[0].alpha : null,
    textCount: calls.filter(c => c.op === 'fillText').length,
    iconDrawn: calls.some(c => c.op === 'icon'),
  };
}

console.log('\n=== 2. 橫幅閱讀時間（實際執行，唔係 grep）===');
{
  const a0 = probe(0, 0), a1 = probe(1000, 0), a3 = probe(3000, 0);
  const a3599 = probe(3599, 0), a3600 = probe(3600, 0);
  const a3900 = probe(3900, 0), a4199 = probe(4199, 0), a4300 = probe(4300, 0);

  check('age 0：橫幅畫咗而且完全唔透明', a0.bannerDrawn && a0.alpha === 1, JSON.stringify(a0));
  check('age 1.0s：仍然完全唔透明', a1.bannerDrawn && a1.alpha === 1);
  check('age 3.0s：仍然完全唔透明（舊版 2.0s 就開始淡）', a3.bannerDrawn && a3.alpha === 1);
  check('age 3.599s：仍然完全唔透明', a3599.bannerDrawn && a3599.alpha === 1);
  check('age 3.6s：淡出起點仍然係全不透明', a3600.bannerDrawn && Math.abs(a3600.alpha - 1) < 0.02, String(a3600.alpha));
  check('age 3.9s：淡到一半左右', a3900.bannerDrawn && Math.abs(a3900.alpha - 0.5) < 0.08, String(a3900.alpha));
  check('age 4.199s：仲畫緊（總長未到）', a4199.bannerDrawn);
  check('age 4.3s：橫幅收埋', !a4300.bannerDrawn);

  /* 關鍵不變量：完整可讀時間 >= 3.6s */
  check('完整可讀時間 >= 3600ms（閱讀時間估算需 ≈3.6s）', FADE_MS >= 3600, FADE_MS + 'ms');
  check('總長 = fade 起點 + fade 長度', BANNER_MS === FADE_MS + FADE_SPAN, BANNER_MS + ' = ' + FADE_MS + ' + ' + FADE_SPAN);
  check('總長 >= 完整可讀時間 + 300ms 淡出餘裕', BANNER_MS - FADE_MS >= 300, (BANNER_MS - FADE_MS) + 'ms');

  /* 舊值唔可以返嚟 */
  check('舊總長 2600 已清走（唔可以再硬寫）', !/age > 2600/.test(h));
  check('舊 fade 起點 2000 已清走', !/age > 2000/.test(h));
  check('drawStageAffixFx 用常數而唔係硬寫字面量',
    /function drawStageAffixFx[\s\S]{0,2000}?AFFIX_BANNER_MS/.test(h)
    && /function drawStageAffixFx[\s\S]{0,2000}?AFFIX_BANNER_FADE_MS/.test(h)
    && /function drawStageAffixFx[\s\S]{0,2000}?AFFIX_DARK_ALPHA/.test(h));
}

console.log('\n=== 3. 停電暗幕 alpha（實際執行）===');
{
  const dark = probe(100, 1);
  const none = probe(100, 0);
  check('停電時畫全畫面暗幕', !!dark.overlayStyle, String(dark.overlayStyle));
  check('暗幕 fillStyle 係 rgba(0,0,20,<alpha>)',
    /^rgba\(0,0,20,0\.220\)$/.test(dark.overlayStyle || ''), String(dark.overlayStyle));
  check('冇停電時唔畫暗幕', !none.overlayStyle);
  check('停電時橫幅照畫（暗幕唔係遮橫幅）', dark.bannerDrawn && dark.iconDrawn);
  check('alpha <= 0.22（雜魚對比要過 WCAG AA 4.5:1）', DARK_ALPHA <= 0.22, String(DARK_ALPHA));
  check('alpha >= 0.15（唔可以細到「畫面暗」冇訊號 = 死詞綴）', DARK_ALPHA >= 0.15, String(DARK_ALPHA));
  check('舊 alpha 0.42 已清走', !/0\.42 \* affDark/.test(h));
}

console.log('\n=== 4. 詞綴 icon 可見性（解碼 index.html 入面嵌嘅圖集 PNG，量真實像素）===');
{
  /* ---------- PNG 解碼（palette 型：colorType 3 · bitDepth 8 · 非交錯）---------- */
  function decodePng(buf) {
    let o = 8, width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
    let plte = null, trns = null;
    const idat = [];
    while (o < buf.length) {
      const len = buf.readUInt32BE(o);
      const type = buf.toString('ascii', o + 4, o + 8);
      const data = buf.slice(o + 8, o + 8 + len);
      if (type === 'IHDR') {
        width = data.readUInt32BE(0); height = data.readUInt32BE(4);
        bitDepth = data[8]; colorType = data[9]; interlace = data[12];
      } else if (type === 'PLTE') plte = data;
      else if (type === 'tRNS') trns = data;
      else if (type === 'IDAT') idat.push(data);
      else if (type === 'IEND') break;
      o += 12 + len;
    }
    if (bitDepth !== 8 || colorType !== 3 || interlace !== 0) {
      throw new Error('唔支援嘅 PNG 格式 depth=' + bitDepth + ' colorType=' + colorType);
    }
    const raw = zlib.inflateSync(Buffer.concat(idat));
    const idxBuf = Buffer.alloc(width * height);
    let pos = 0;
    for (let y = 0; y < height; y++) {
      const ft = raw[pos++];
      const rs = y * width;
      for (let x = 0; x < width; x++) {
        const rv = raw[pos++];
        const a = x >= 1 ? idxBuf[rs + x - 1] : 0;
        const b = y > 0 ? idxBuf[rs - width + x] : 0;
        const c = (x >= 1 && y > 0) ? idxBuf[rs - width + x - 1] : 0;
        let v;
        if (ft === 0) v = rv;
        else if (ft === 1) v = rv + a;
        else if (ft === 2) v = rv + b;
        else if (ft === 3) v = rv + ((a + b) >> 1);
        else if (ft === 4) {
          const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v = rv + (pa <= pb && pa <= pc ? a : (pb <= pc ? b : c));
        } else throw new Error('壞 filter ' + ft);
        idxBuf[rs + x] = v & 0xff;
      }
    }
    const rgba = Buffer.alloc(width * height * 4);
    for (let i = 0; i < idxBuf.length; i++) {
      const idx = idxBuf[i];
      rgba[i * 4] = plte[idx * 3];
      rgba[i * 4 + 1] = plte[idx * 3 + 1];
      rgba[i * 4 + 2] = plte[idx * 3 + 2];
      rgba[i * 4 + 3] = trns && idx < trns.length ? trns[idx] : 255;
    }
    return { width, height, rgba };
  }

  const b64m = h.match(/const SHEET_B64 = '([^']*)';/);
  check('抽到 SHEET_B64', !!b64m);
  /* SPRITE 座標表 */
  const spriteTbl = {};
  for (const m of h.matchAll(/^\s*(\w+): \{ x:(-?\d+), y:(-?\d+), w:(\d+), h:(\d+) \}/gm)) {
    spriteTbl[m[1]] = { x: +m[2], y: +m[3], w: +m[4], h: +m[5] };
  }
  check('抽到 SPRITE 座標表', Object.keys(spriteTbl).length > 50, Object.keys(spriteTbl).length + ' 格');

  if (b64m) {
    const png = decodePng(Buffer.from(b64m[1], 'base64'));
    console.log(`  圖集 ${png.width}×${png.height}`);
    const relLum = (r, g, b) => {
      const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    /* 量一格 sprite 嘅最亮不透明像素（相對亮度）*/
    const cellMaxLum = (key) => {
      const f = spriteTbl[key];
      if (!f) return null;
      let maxL = -1, rgb = null;
      for (let y = f.y; y < f.y + f.h; y++) {
        for (let x = f.x; x < f.x + f.w; x++) {
          const p = (y * png.width + x) * 4;
          if (png.rgba[p + 3] < 128) continue;
          const l = relLum(png.rgba[p], png.rgba[p + 1], png.rgba[p + 2]);
          if (l > maxL) { maxL = l; rgb = [png.rgba[p], png.rgba[p + 1], png.rgba[p + 2]]; }
        }
      }
      return { maxL: +maxL.toFixed(3), rgb };
    };
    /* 6 個詞綴 icon：每個都要有一粒「明顯亮」嘅像素，否則喺深色橫幅底上會睇唔到 */
    const AFFIX_ICONS = ['icon_wind', 'icon_iron', 'icon_swarm', 'icon_blackout', 'icon_glass', 'icon_static'];
    for (const key of AFFIX_ICONS) {
      const m = cellMaxLum(key);
      const ok = m && m.maxL >= 0.25;
      check(`${key} 有亮像素（相對亮度 >= 0.25）`, ok,
        m ? `lum=${m.maxL} rgb(${m.rgb.join(',')})` : '搵唔到格');
    }
    /* 停電 icon 嘅舊問題：用 palette 最暗色 → 實測對比 1.08:1 */
    const bo = cellMaxLum('icon_blackout');
    check('icon_blackout 唔係暗色塊（lum >= 0.4）', bo && bo.maxL >= 0.4, bo ? String(bo.maxL) : '—');
    /* 座標：icon_blackout 必須維持 12×12（尺寸冇變 → 唔會推走其他格） */
    const bf = spriteTbl.icon_blackout;
    check('icon_blackout 座標維持 12×12（改色唔改尺寸 → 座標唔會移）',
      bf && bf.w === 12 && bf.h === 12, bf ? `${bf.w}×${bf.h} @${bf.x},${bf.y}` : '—');
    /* art.px.js 係真實來源：唔可以改返用 'N' */
    /* ⚠️ 要 match 到**closing** backtick（`）—— 只 match 到 opening 會攞唔到 ascii art 本體 */
    const artBlk = art.match(/sprite\("icon_blackout",[\s\S]*?`\)/);
    check('art.px.js 有 icon_blackout 定義', !!artBlk);
    if (artBlk) {
      check("art.px.js 嘅 icon_blackout 用亮色 w（唔係最暗色 N）",
        /\.\w{8}\./.test(artBlk[0]), artBlk[0].split('\n')[1]);
      check('art.px.js 嘅 icon_blackout 保留 10×10 art 尺寸',
        /sprite\("icon_blackout", \{ w: 10, h: 10/.test(artBlk[0]));
    }
  }
}

console.log('\n=== 5. 版號 + PLAN 條目 ===');
{
  const m = h.match(/末日救未來 v(\d+)\.(\d+)\.(\d+) 已載入/);
  const ver = m ? [+m[1], +m[2], +m[3]] : null;
  check('版本號可解析', !!ver, ver ? ver.join('.') : '搵唔到');
  check('version >= v0.31.0', !!ver && (ver[0] > 0 || ver[1] > 31 || (ver[1] === 31 && ver[2] >= 0)),
    ver ? ver.join('.') : '—');
  check('PLAN 有 #116 橫幅時長條目', /\| 116 \|.*橫幅時長/.test(plan));
  check('PLAN 有 #117 停電 alpha 條目', /\| 117 \|.*停電詞綴暗幕 alpha/.test(plan));
  check('PLAN 有 #118 版號條目', /\| 118 \|.*v0\.31\.0/.test(plan));
  check('PLAN 有 #119 停電 icon 條目', /\| 119 \|/.test(plan));
  check('PLAN 已知落差 #12 已標「v0.31.0 已修」',
    /12\. ~~詞綴橫幅只出現 2\.6 秒就收~~ → \*\*v0\.31\.0 已修/.test(plan));
  check('PLAN 已知落差 #13 已標「v0.31.0 已修」',
    /13\. ~~停電詞綴嘅畫面暗幕未經可讀性實測~~ → \*\*v0\.31\.0 已修/.test(plan));
  check('PLAN 已知落差 #2 已更新（推翻「15 秒死」）',
    /靜止玩家 15 秒死喺第一關.*已被推翻|靜止唔郁嘅玩家 15 秒死喺第一關.*已被推翻/.test(plan));
  check('PLAN 改動紀錄有 v0.31.0', /\*\*v0\.31\.0 可讀性調校/.test(plan));
}

Object.defineProperty(globalThis, 'performance', { value: realPerf, writable: true, configurable: true });
delete globalThis.ctx;

console.log('\n' + (fails ? fails + ' FAIL' : 'ALL PASS'));
process.exit(fails ? 1 : 0);
