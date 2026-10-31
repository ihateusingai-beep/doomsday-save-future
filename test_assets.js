/* v0.32.0 assets 守門（PLAN #120 背景場景 + #121 掃描線 + #122 版號）
   ⚠️ 核心係**幾何關係 + 源碼規則**斷言，唔係死字串 ——
      任何人郁貼地線、改層數、改 prop 家族、開 palette 外嘅色，
      呢個測試都會 fail（唔會等到下次先發現場景又收埋咗）。
   ⚠️ 所有座標 / 尺寸 / 規則都係由 index.html + art.px.js **原文抽出**，
      唔喺呢個檔案 hardcode。
   ⚠️ 顏色規則驗喺 **art.px.js 源碼層**（pal() 24 色 + 唔准直接寫 hex）：
      圖集 PNG 層有 97 個色係正常嘅（glow() 會衍生明暗變體），
      所以唔可以用 PNG 層去斷言「24 色」—— 嗰個斷言一定會 fail。 */
const fs = require('fs');
const zlib = require('zlib');
const h = fs.readFileSync(__dirname + '/index.html', 'utf8');
const art = fs.readFileSync(__dirname + '/art.px.js', 'utf8');
const plan = fs.readFileSync(__dirname + '/PLAN.md', 'utf8');
let fails = 0;
function check(label, ok, extra) {
  if (!ok) fails++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (extra ? '  ' + extra : ''));
}
/* 抽掉註解（避免註解入面嘅 hex／數字污染規則檢查） */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
}

console.log('=== 1. art.px.js palette 規則（24 色源碼層）===');
{
  const palBlock = art.match(/pal\(\{[\s\S]*?\n\}\)/);
  check('搵到 pal() 定義', !!palBlock);
  const keys = [...palBlock[0].matchAll(/(\w+):\s*"(#[0-9a-fA-F]{6})"/g)].map(m => m[1]);
  const hexes = [...palBlock[0].matchAll(/"(#[0-9a-fA-F]{6})"/g)].map(m => m[1]);
  check('★ pal() 恰好 24 色', keys.length === 24, keys.length + ' 色：' + keys.join(''));
  check('pal() 每個 key 都對應一個 hex', keys.length === hexes.length);
  const outside = stripComments(art.split(palBlock[0]).join(' '));
  const strayHex = [...outside.matchAll(/#[0-9a-fA-F]{6}/g)].map(m => m[0]);
  check('★ pal() 以外冇任何 hex 色碼（唔准偷開新色）',
    strayHex.length === 0, strayHex.length ? [...new Set(strayHex)].join(' ') : '零');
  /* 所有 sprite 用到嘅色 key（引號短字串）必須喺 palette */
  const used = new Set();
  for (const m of art.matchAll(/"([A-Za-z]{1,2})"/g)) used.add(m[1]);
  const badKey = [...used].filter(s => !s.split('').every(c => keys.includes(c)));
  check('★ 所有引號色 key 都在 palette 內', badKey.length === 0,
    badKey.length ? badKey.join(' ') : '零');
  /* ascii art（模板字串）嘅每個字元都要喺 palette */
  const badChar = new Set();
  let asciiBlocks = 0;
  for (const m of art.matchAll(/`([\s\S]*?)`/g)) {
    if (!/[a-zA-Z]/.test(m[1])) continue;
    asciiBlocks++;
    for (const ch of m[1]) {
      if (ch === '.' || ch === ' ' || ch === '\n') continue;
      if (!keys.includes(ch)) badChar.add(ch);
    }
  }
  check('★ ascii art 用到嘅字元都在 palette 內', badChar.size === 0,
    badChar.size ? [...badChar].join(' ') : `零（${asciiBlocks} 塊 ascii）`);
}

console.log('\n=== 2. 圖集結構（smokestack 加喺最尾）===');
{
  const sheetM = art.match(/sheet\("dsf_main",\s*\[([\s\S]*?)\],\s*\{ pad: 1, cols: 7 \}\)/);
  check('搵到 sheet("dsf_main", ...)', !!sheetM);
  const names = [...sheetM[1].matchAll(/"([a-z0-9_]+)"/g)].map(m => m[1]);
  check('★ sheet 冇重複名', new Set(names).size === names.length,
    names.length - new Set(names).size + ' 個重複');
  check('★ smokestack 係列表最尾（唔會推走任何舊格 index）',
    names[names.length - 1] === 'smokestack', '最後：' + names[names.length - 1]);
  /* art.px.js 入面 smokestack sprite 本體 */
  const sm = art.match(/sprite\("smokestack",\s*\{ w: (\d+), h: (\d+), outline: "(\w+)" \}/);
  check('★ art.px.js 有 smokestack sprite', !!sm, sm && sm[0]);
  if (sm) {
    check('smokestack art 尺寸 = 10×26', +sm[1] === 10 && +sm[2] === 26, `${sm[1]}×${sm[2]}`);
    check('smokestack 有 outline（k）', sm[3] === 'k', sm[3]);
    const sprM = h.match(/const SPRITE = Object\.freeze\(\{([\s\S]*?)\n\}\);/);
    const tab = {};
    for (const l of sprM[1].split('\n').map(s => s.trim()).filter(Boolean)) {
      const mm = l.match(/^(\w+):\s*\{\s*x:(-?\d+),\s*y:(-?\d+),\s*w:(\d+),\s*h:(\d+)\s*\}?/);
      if (mm) tab[mm[1]] = { x: +mm[2], y: +mm[3], w: +mm[4], h: +mm[5] };
    }
    const f = tab['smokestack'];
    check('★ index.html SPRITE 表有 smokestack', !!f);
    if (f) {
      /* outline 令每邊 +1 → 圖集格 = art + 2 */
      check('smokestack 圖集格 = art+2（outline 每邊 1px）',
        f.w === +sm[1] + 2 && f.h === +sm[2] + 2, `${f.w}×${f.h}（預期 ${+sm[1] + 2}×${+sm[2] + 2}）`);
      /* smokestack 必須喺圖集最尾行 → y 必須 ≥ 所有其它 sprite 嘅 y */
      const others = Object.entries(tab).filter(([k]) => k !== 'smokestack');
      const maxOtherY = Math.max(...others.map(([, v]) => v.y));
      check('★ smokestack 唔會推走任何舊格（y 係全表最大）',
        f.y >= maxOtherY, `smokestack.y=${f.y}，其它最大 y=${maxOtherY}`);
      /* 同一行（y 相同）嘅 sprite，smokestack 必須排喺最尾 */
      const sameRow = others.filter(([, v]) => v.y === f.y);
      const maxRowRight = Math.max(...sameRow.map(([, v]) => v.x + v.w));
      check('★ smokestack 喺同一行排最尾（唔會推走同行舊格）',
        f.x >= maxRowRight, `smokestack.x=${f.x}，同行其它最右=${maxRowRight}`);
    }
    /* ★ 圖集完整性：sheet 列表展開之後嘅格數 == SPRITE 表嘅格數
       （anim_X 會展開成 anim_X_0 / anim_X_1 …，所以唔可以直接數列表） */
    let expected = 0;
    const orphan = [];
    for (const nm of names) {
      let n = 0;
      for (let i = 0; ; i++) {
        if (tab[nm + '_' + i]) n++;
        else if (i === 0 && tab[nm]) { n = 1; break; }
        else break;
      }
      if (n === 0) orphan.push(nm); else expected += n;
    }
    const actual = Object.keys(tab).length;
    check('★ sheet 列表展開 == SPRITE 表格數（圖集無漏無多）',
      expected === actual, `展開 ${expected} vs 實際 ${actual}`);
    check('★ sheet 列表冇「展開唔到」嘅名（唔會靜靜消失）',
      orphan.length === 0, orphan.length ? orphan.join(' ') : '零');
  }
}

console.log('\n=== 3. 背景三層縱深（PLAN #120）===');
{
  const pb = h.match(/const PLAY_BOTTOM = (\d+);/);
  const bf = h.match(/const BG_FLOOR = (\d+);/);
  check('抽到 PLAY_BOTTOM', !!pb, pb && pb[1]);
  check('抽到 BG_FLOOR', !!bf, bf && bf[1]);
  const PLAY_BOTTOM = +pb[1], BG_FLOOR = +bf[1];
  check('★ 貼地線 = 遊戲區底（PLAY_BOTTOM）', BG_FLOOR === PLAY_BOTTOM,
    `${BG_FLOOR} vs ${PLAY_BOTTOM}`);
  /* 能力掣區頂（由 abilityBtns() 原文計，唔 hardcode） */
  const ab = h.match(/const w = (\d+), h = (\d+), m = (\d+);[\s\S]*?y: VIEW_H - h - m/);
  check('抽到能力掣尺寸', !!ab);
  const UI_TOP = 480 - (+ab[2]) - (+ab[3]);
  check('★ 背景貼地線喺能力掣區之上（場景唔會再被掣蓋住）',
    BG_FLOOR < UI_TOP, `貼地 ${BG_FLOOR} < 掣區頂 ${UI_TOP}`);
  /* BG_LAYERS */
  const blM = h.match(/const BG_LAYERS = \[([\s\S]*?)\n\];/);
  check('抽到 BG_LAYERS', !!blM);
  const LAYERS = new Function('return ' + blM[0].replace('const BG_LAYERS =', ''))();
  check('★ 背景有 3 層（遠/中/近）', LAYERS.length === 3, LAYERS.length + ' 層');
  let okScale = true, okAlpha = true;
  for (let i = 1; i < LAYERS.length; i++) {
    if (!(LAYERS[i].scale > LAYERS[i - 1].scale)) okScale = false;
    if (!(LAYERS[i].alpha > LAYERS[i - 1].alpha)) okAlpha = false;
  }
  check('★ 層 scale 遞增（愈近愈大）', okScale, LAYERS.map(l => l.scale).join(' → '));
  check('★ 層 alpha 遞增（愈近愈實）', okAlpha, LAYERS.map(l => l.alpha).join(' → '));
  check('近景層 alpha = 1（全亮）', LAYERS[2].alpha === 1, String(LAYERS[2].alpha));
  check('近景層 scale ≥ 1', LAYERS[2].scale >= 1, String(LAYERS[2].scale));
  const perStage = LAYERS.reduce((a, l) => a + l.n, 0);
  check('★ 每關 prop 實例數 ≥ 15', perStage >= 15, LAYERS.map(l => l.n).join('+') + ' = ' + perStage);
  /* 遠景層 y 範圍（由 drawScenery 原文抽） */
  const farM = h.match(/y = BG_FLOOR - (\d+) \+ \(i % (\d+)\) \* (\d+) \+ \(\(i \* (\d+)\) % (\d+)\)/);
  check('抽到遠景層 y 公式', !!farM);
  const farMin = BG_FLOOR - (+farM[1]);
  const farMax = BG_FLOOR - (+farM[1]) + (+farM[2] - 1) * (+farM[3]) + (+farM[5] - 1);
  check('★ 遠景層全部喺遊戲區（唔會漏入能力掣區）',
    farMax < UI_TOP, `遠景 y ${farMin}–${farMax} < ${UI_TOP}`);
  /* 中景層地平線（近景之上 = 更遠） */
  const midM = h.match(/const base = L === 1 \? BG_FLOOR - (\d+) - \(i % (\d+)\) \* (\d+) : BG_FLOOR;/);
  check('抽到中景層地平線', !!midM);
  const midTop = BG_FLOOR - (+midM[1]) - (+midM[2] - 1) * (+midM[3]);
  check('★ 中景層喺近景層之上（遠 = 高）', midTop < BG_FLOOR, `${midTop} < ${BG_FLOOR}`);
  check('中景層唔會漏入能力掣區', midTop < UI_TOP, `${midTop} < ${UI_TOP}`);
  /* SCENERY */
  const scM = h.match(/const SCENERY = \{([\s\S]*?)\n\};/);
  check('抽到 SCENERY', !!scM);
  const vwM = h.match(/const VIEW_W = (\d+);/);
  const VIEW_W = vwM ? +vwM[1] : 320;
  const SCENERY = new Function('VIEW_W', 'return ' + scM[0].replace('const SCENERY =', ''))(VIEW_W);
  const stages = Object.keys(SCENERY);
  check('★ SCENERY 有 5 關', stages.length === 5, stages.join(','));
  for (const s of stages) {
    const sc = SCENERY[s];
    check(`S${s} 有 far/mid/near 三個家族`,
      !!(sc.far && sc.mid && sc.near && sc.far.length && sc.mid.length && sc.near.length),
      `far=${sc.far} mid=${sc.mid} near=${sc.near}`);
  }
  /* 家族名必須真係存在於 SPRITE 表（防 typo → drawSprite 靜靜 return false）*/
  const sprM = h.match(/const SPRITE = Object\.freeze\(\{([\s\S]*?)\n\}\);/);
  const tab = {};
  for (const l of sprM[1].split('\n').map(s => s.trim()).filter(Boolean)) {
    const mm = l.match(/^(\w+):\s*\{\s*x:(-?\d+),\s*y:(-?\d+),\s*w:(\d+),\s*h:(\d+)\s*\}?/);
    if (mm) tab[mm[1]] = 1;
  }
  const missing = [];
  for (const s of stages) {
    for (const k of ['far', 'mid', 'near']) for (const nm of SCENERY[s][k]) {
      if (!tab[nm]) missing.push(`S${s}.${k}:${nm}`);
    }
  }
  check('★ 所有 prop 家族名都存在於圖集（唔會靜靜失效）',
    missing.length === 0, missing.length ? missing.join(' ') : '零');
  /* 語意：每關要有可辨識地點，唔可以離題 */
  const GROUND = ['bldg', 'tower', 'smokestack'];
  const themeM = h.match(/const STAGE_THEME = Object\.freeze\(\{([\s\S]*?)\n\}\);/);
  const THEME = new Function('return ' + themeM[0].replace('const STAGE_THEME =', ''))();
  for (const s of stages) {
    const all = [...SCENERY[s].far, ...SCENERY[s].mid, ...SCENERY[s].near];
    const nm = THEME[s].name;
    /* 太空系關卡（大氣層／軌道殘骸／逃逸門）唔可以出現地面建築 */
    const space = /大氣層|軌道|逃逸/.test(nm);
    if (space) {
      const bad = all.filter(x => GROUND.includes(x));
      check(`★ S${s}「${nm}」係太空系，唔可以出現地面建築`,
        bad.length === 0, bad.length ? [...new Set(bad)].join(',') : '零');
    }
    /* 九龍煙柱必須用 smokestack；維港起飛唔可以用 */
    if (/九龍/.test(nm)) {
      check(`★ S${s}「${nm}」必須有 smokestack（可辨識地點）`,
        all.includes('smokestack'), all.join(','));
    }
    if (/維港/.test(nm)) {
      check(`★ S${s}「${nm}」唔可以用 smokestack（同 S2 唔可以撞家族）`,
        !all.includes('smokestack'), all.join(','));
    }
  }
  /* 5 關背景必須互相唔同（唔可以「只換色」） */
  const sigs = stages.map(s => SCENERY[s].far.join('|') + '#' + SCENERY[s].mid.join('|') + '#' + SCENERY[s].near.join('|'));
  check('★ 5 關背景家族組合全部唔同（唔係「只換色」）',
    new Set(sigs).size === 5, new Set(sigs).size + ' 種');
}

console.log('\n=== 4. 掃描線 backing-store 網格（PLAN #121）===');
{
  const dsM = h.match(/function drawScanlines\(\) \{([\s\S]*?)\n\}/);
  check('抽到 drawScanlines()', !!dsM);
  const body = dsM ? stripComments(dsM[1]) : '';
  check('★ 用 setTransform(1,0,0,1,0,0) 轉回 backing store 像素',
    /setTransform\(1,\s*0,\s*0,\s*1,\s*0,\s*0\)/.test(body));
  check('★ 唔跟 trauma shake（transform 由 setTransform 重設）',
    /setTransform/.test(body) && !/translate/.test(body));
  check('★ scale 由 canvas.width / VIEW_W 計（真實 backing 縮放）',
    /canvas\.width\s*\/\s*VIEW_W/.test(body));
  check('★ 週期 = round(3 × scale)（整數物理 px）',
    /Math\.round\(\s*3\s*\*\s*scale\s*\)/.test(body));
  check('★ 線高 = round(scale)（維持跨 DPR 視覺密度）',
    /Math\.round\(\s*scale\s*\)/.test(body));
  check('★ 唔可以用邏輯空間嘅固定 3 px 週期',
    !/y\s*\+=\s*3/.test(body) && !/y\s*<\s*VIEW_H/.test(body));
  check('scanline 位置用 backing store 高度（canvas.height）',
    /canvas\.height/.test(body));
  /* renderTail 順序：掃描線先、閃光後 */
  const rt = h.match(/function renderTail\(\) \{([\s\S]*?)\n\}/);
  check('renderTail 抽到', !!rt);
  const rtBody = rt ? rt[1] : '';
  const iScan = rtBody.indexOf('drawScanlines');
  const iFlash = rtBody.indexOf('drawFlash');
  check('★ renderTail：掃描線喺閃光之前', iScan >= 0 && iFlash >= 0 && iScan < iFlash,
    `scan@${iScan} flash@${iFlash}`);
}

console.log('\n=== 5. 值階梯（解碼圖集 PNG，量真實像素）===');
{
  function decodePng(buf) {
    let o = 8, width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
    let plte = null, trns = null; const idat = [];
    while (o < buf.length) {
      const len = buf.readUInt32BE(o);
      const type = buf.toString('ascii', o + 4, o + 8);
      const data = buf.slice(o + 8, o + 8 + len);
      if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; interlace = data[12]; }
      else if (type === 'PLTE') plte = data;
      else if (type === 'tRNS') trns = data;
      else if (type === 'IDAT') idat.push(data);
      else if (type === 'IEND') break;
      o += 12 + len;
    }
    if (bitDepth !== 8 || colorType !== 3 || interlace !== 0) throw new Error('唔支援嘅 PNG 格式');
    const raw = zlib.inflateSync(Buffer.concat(idat));
    const idxBuf = Buffer.alloc(width * height);
    let pos = 0;
    for (let y = 0; y < height; y++) {
      const ft = raw[pos++]; const rs = y * width;
      for (let x = 0; x < width; x++) {
        const rv = raw[pos++];
        const a = x >= 1 ? idxBuf[rs + x - 1] : 0;
        const b = y > 0 ? idxBuf[rs - width + x] : 0;
        const c = (x >= 1 && y > 0) ? idxBuf[rs - width + x - 1] : 0;
        let v;
        if (ft === 0) v = rv; else if (ft === 1) v = rv + a; else if (ft === 2) v = rv + b;
        else if (ft === 3) v = rv + ((a + b) >> 1);
        else { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v = rv + (pa <= pb && pa <= pc ? a : (pb <= pc ? b : c)); }
        idxBuf[rs + x] = v & 0xff;
      }
    }
    const rgba = Buffer.alloc(width * height * 4);
    for (let i = 0; i < idxBuf.length; i++) {
      const idx = idxBuf[i];
      rgba[i * 4] = plte[idx * 3]; rgba[i * 4 + 1] = plte[idx * 3 + 1]; rgba[i * 4 + 2] = plte[idx * 3 + 2];
      rgba[i * 4 + 3] = trns && idx < trns.length ? trns[idx] : 255;
    }
    return { width, height, idxBuf, plte, trns };
  }
  const relLum = (r, g, b) => {
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const b64 = h.match(/const SHEET_B64 = '([^']*)';/)[1];
  const png = decodePng(Buffer.from(b64, 'base64'));
  const sprM = h.match(/const SPRITE = Object\.freeze\(\{([\s\S]*?)\n\}\);/);
  const tab = {};
  for (const l of sprM[1].split('\n').map(s => s.trim()).filter(Boolean)) {
    const mm = l.match(/^(\w+):\s*\{\s*x:(-?\d+),\s*y:(-?\d+),\s*w:(\d+),\s*h:(\d+)\s*\}?/);
    if (mm) tab[mm[1]] = { x: +mm[2], y: +mm[3], w: +mm[4], h: +mm[5] };
  }
  function cellStat(name) {
    const f = tab[name];
    let bright = 0, opaque = 0, maxL = 0, sumL = 0;
    for (let y = f.y; y < f.y + f.h; y++) {
      for (let x = f.x; x < f.x + f.w; x++) {
        const i = png.idxBuf[y * png.width + x];
        const a = (png.trns && i < png.trns.length) ? png.trns[i] : 255;
        if (a < 10) continue;
        opaque++;
        const l = relLum(png.plte[i * 3], png.plte[i * 3 + 1], png.plte[i * 3 + 2]);
        sumL += l; if (l > maxL) maxL = l;
        if (l > 0.35) bright++;
      }
    }
    return { bright, opaque, maxL, avgL: opaque ? sumL / opaque : 0, pct: opaque ? bright / opaque * 100 : 0 };
  }
  const sm = cellStat('smokestack');
  const bd = cellStat('bldg');
  const tw = cellStat('tower');
  console.log(`  smokestack: 不透明 ${sm.opaque} · 亮像素 ${sm.bright} (${sm.pct.toFixed(1)}%) · 最亮 ${sm.maxL.toFixed(3)} · 平均 ${sm.avgL.toFixed(3)}`);
  console.log(`  bldg:       不透明 ${bd.opaque} · 亮像素 ${bd.bright} (${bd.pct.toFixed(1)}%) · 最亮 ${bd.maxL.toFixed(3)} · 平均 ${bd.avgL.toFixed(3)}`);
  console.log(`  tower:      不透明 ${tw.opaque} · 亮像素 ${tw.bright} (${tw.pct.toFixed(1)}%) · 最亮 ${tw.maxL.toFixed(3)} · 平均 ${tw.avgL.toFixed(3)}`);
  check('★ smokestack 亮像素佔比 ≤ 10%（背景唔會搶 gameplay 注意力）',
    sm.pct <= 10, sm.pct.toFixed(1) + '%');
  check('★ smokestack 平均亮度唔高過 tower（背景值階梯守住）',
    sm.avgL <= tw.avgL, `${sm.avgL.toFixed(3)} vs ${tw.avgL.toFixed(3)}`);
  check('smokestack 有不透明像素（唔係空 sprite）', sm.opaque > 0, String(sm.opaque));
}

console.log('\n=== 6. 版號 + PLAN 條目 ===');
{
  const m = h.match(/末日救未來 v(\d+)\.(\d+)\.(\d+) 已載入/);
  const ver = m ? [+m[1], +m[2], +m[3]] : null;
  check('版本號可解析', !!ver, ver ? ver.join('.') : '搵唔到');
  check('★ version >= v0.33.0', !!ver && (ver[0] > 0 || ver[1] > 33 || (ver[1] === 33 && ver[2] >= 0)),
    ver ? ver.join('.') : '—');
  check('PLAN 有 #120 背景場景條目', /\| 120 \|.*背景場景/.test(plan));
  check('PLAN 有 #121 掃描線條目', /\| 121 \|.*掃描線/.test(plan));
  check('PLAN 有 #123 形態卡 DPS 帶條目', /\| 123 \|.*形態卡 DPS 帶/.test(plan));
  check('PLAN 有 #124 變體 D 條目', /\| 124 \|.*變體 D/.test(plan));
  check('PLAN 改動紀錄有 v0.33.0', /\*\*v0\.33\.0/.test(plan));
  /* ⚠️ v0.34.0：呢條原本係精確字串比對 `/v0\.33\.0 ·/` —— 改版號就必 fail，
     違反記憶 §3「test invariant 用 >= 唔用 exact-equal」。改成解析版本再比大小。 */
  check('★ version >= v0.34.0', !!ver && (ver[0] > 0 || ver[1] > 34 || (ver[1] === 34 && ver[2] >= 0)),
    ver ? ver.join('.') : '—');
  const title = h.match(/fillText\('(v\d+\.\d+\.\d+)[^']*'/);
  check('標題畫面顯示同版號一致', !!title && !!ver &&
    title[1].replace(/^v/, '') === ver.join('.'), title ? title[1] : '—');
  check('PLAN 改動紀錄有 v0.34.0', /\*\*v0\.34\.0/.test(plan));
  check('PLAN 有 #126 空波修正條目', /\| 126 \|.*splitter/.test(plan));
  check('PLAN 有 #127 未教敵種閘條目', /\| 127 \|.*pool 家族閘/.test(plan));
  check('PLAN 有 #128 敵種攤分條目', /\| 128 \|.*敵種攤分/.test(plan));
  check('PLAN 有 #129 波次對比條目', /\| 129 \|.*強弱對比/.test(plan));
  check('PLAN 有 #130 版號條目', /\| 130 \|.*v0\.34\.0/.test(plan));
}

console.log('\n' + (fails ? fails + ' FAIL' : 'ALL PASS'));
process.exit(fails ? 1 : 0);
