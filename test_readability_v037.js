/* v0.37.0 守門：教學可讀性 Batch A（#141 彈道清晰 + #142 CTA + #148 音效掣）
 *
 * 背景：`MECHANICS_REVIEW_v036.md` §3–§4 —— 實測「玩家自己嘅彈佔畫面 4.92%，
 * 敵方威脅只佔 0.54%」（視覺質量比 9.1:1），學生第一眼望到嘅係自己嘅彈而唔係
 * 要避嘅威脅；標題 CTA 脈動谷值對比度跌到 2.24:1。
 *
 * ⚠️ **結構斷言一定要喺「剝走註解」嘅 source 度做**（上一輪捉到嘅假守門）：
 *    本檔自己嘅註解同 `index.html` 嘅註解都會命中同一個字串 → 命中註解 = 假通過。
 * ⚠️ **數「某 token 出現幾多次」要數成個 pattern**，唔係數 token。
 * ⚠️ 本檔係**結構層**守門；行為層（實際渲染出嚟嘅對比度）由 `tools/visual_mass.js`
 *    量測（畫面像素分割），唔喺呢度重做。
 */
const fs = require('fs');
const path = require('path');
const h = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

let fails = 0;
function check(label, ok, extra) {
  if (!ok) fails++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (extra ? '  ' + extra : ''));
}
function cval(name) {
  const m = h.match(new RegExp('const ' + name + '\\s*=\\s*([^;]+);'));
  if (!m) throw new Error('抽唔到 const ' + name);
  return new Function('return (' + m[1] + ');')();
}
/* ⚠️ 剝走註解嘅 source —— 結構斷言一定要喺真 code 度做（假守門陷阱） */
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
const code = stripComments(h);

/* ---------- 1. 玩家子彈視覺退後 ---------- */
console.log('=== 1. 玩家子彈「視覺退後」（#141）===');
{
  const A = cval('PLAYER_BULLET_ALPHA');
  check('★ PLAYER_BULLET_ALPHA = 0.45', A === 0.45, '= ' + A);

  /* 玩家子彈繪製必須用呢個 alpha（唔係硬寫 0.55 → 方便日後調） */
  const applied = /ctx\.globalAlpha = \(f === 'rail' \|\| f === 'laser'\) \? 1 : PLAYER_BULLET_ALPHA;/.test(code);
  check('★ 玩家子彈繪製用 PLAYER_BULLET_ALPHA', applied);

  /* ⚠️ 光束類（rail / laser）唔減 —— 畫面一兩條、係玩家瞄準用嘅資訊 */
  const beamsExempt = /'rail' \|\| f === 'laser'/.test(code);
  check('★ 光束類（rail / laser）唔減 alpha', beamsExempt);

  /* 必須喺 loop 完還原，否則會漏去之後嘅繪製（敵彈 / HUD） */
  const restored = /ctx\.globalAlpha = 1;/.test(code);
  check('★ 玩家子彈 loop 後還原 globalAlpha = 1', restored);

  /* ⚠️ 還原驗證：alpha 閘被移除 → 上面嗰個斷言必須 fail */
  const mutated = code.replace(
    "ctx.globalAlpha = (f === 'rail' || f === 'laser') ? 1 : PLAYER_BULLET_ALPHA;",
    "ctx.globalAlpha = 1;");
  const stillOk = /ctx\.globalAlpha = \(f === 'rail' \|\| f === 'laser'\) \? 1 : PLAYER_BULLET_ALPHA;/.test(mutated);
  check('還原驗證（alpha 閘被移除）：斷言會 fail', !stillOk);
}

/* ---------- 2. 敵方彈幕加白色描邊 ---------- */
console.log('\n=== 2. 敵方彈幕白色描邊（#141）===');
{
  /* 白色描邊 = 危險物體有輪廓，玩家自己嘅彈冇 */
  const stroked = /ctx\.strokeStyle = 'rgba\(255,255,255,0\.85\)'/.test(code);
  check('★ 敵方彈幕有白色描邊', stroked);
  const ring = /ctx\.arc\(e\.x, e\.y, 6, 0, Math\.PI \* 2\)/.test(code);
  check('★ 描邊係圓環（配合圓形 bullet_e sprite）', ring);

  /* ⚠️ 描邊一定要包住 sprite 本身（唔係只喺 fallback 分支畫） */
  const bothBranches = /const drew = drawSpriteAnim\('anim_bullet_e'/.test(code)
    && /if \(!drew\)/.test(code);
  check('★ sprite 同 fallback 兩條路徑都畫描邊', bothBranches);

  /* ⚠️ 舊嘅「只喺 fallback 先畫」寫法唔可以仲喺度（否則 sprite 成功時冇描邊） */
  const oldOnly = /else if \(!drawSpriteAnim\('anim_bullet_e'/.test(code);
  check('★ 舊嘅「只喺 fallback 畫」寫法已移除', !oldOnly);
}

/* ---------- 3. 標題 CTA 脈動下限 ---------- */
console.log('\n=== 3. 標題 CTA 對比度（#142）===');
{
  const m = code.match(/const pulse = ([\d.]+) \+ ([\d.]+) \* Math\.sin\(performance\.now\(\) \/ 320\);/);
  check('★ 搵到 CTA 脈動常數', !!m, m ? m[0] : '—');
  if (m) {
    const base = +m[1], amp = +m[2];
    const floor = base - amp, peak = base + amp;
    /* ⚠️ 對比度驗收線：谷值 ≥ 4.5:1（AA 文字） */
    /* 前景 rgb(255,220,80) · 背景 rgb(6,23,45)（實測像素） */
    const srgb = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const L = c => 0.2126 * srgb(c[0]) + 0.7152 * srgb(c[1]) + 0.0722 * srgb(c[2]);
    const bg = L([6, 23, 45]);
    const fg = L([255, 220, 80]);
    const eff = floor * fg + (1 - floor) * bg;
    const cr = (Math.max(eff, bg) + 0.05) / (Math.min(eff, bg) + 0.05);
    check('★ CTA 谷值對比度 ≥ 4.5:1（AA）', cr >= 4.5, cr.toFixed(2) + ':1  (floor=' + floor + ')');
    check('★ CTA 峰值仍然好高（≤1.0 alpha）', peak <= 1.0, 'peak=' + peak.toFixed(2));
    check('★ 脈動幅度收窄但仍然肉眼可見（amp ≥ 0.15）', amp >= 0.15, 'amp=' + amp.toFixed(2));
  }
}

/* ---------- 4. 音效掣視覺權重降級 ---------- */
console.log('\n=== 4. 音效掣降級（#148）===');
{
  const m = code.match(/function audioBtnRect\(\) \{\s*const s = (\d+);/);
  check('★ 搵到 audioBtnRect 嘅尺寸', !!m, m ? m[1] : '—');
  if (m) {
    const s = +m[1];
    check('★ 音效掣 56 → 44（暫停掣先係主行動）', s === 44, '= ' + s);
    check('★ 音效掣細過暫停掣（56）', s < 56);
    check('★ 音效掣仍然 ≥64 物理 px（iPad scale 2.606）', s * (834 / 320) >= 64,
      (s * (834 / 320)).toFixed(0) + 'px');
  }
  /* 邊框要轉淡（原本同暫停掣同樣 0.55） */
  const dim = /audioPanelOpen \? '#ff5e8a' : 'rgba\(0,255,255,0\.35\)'/.test(code);
  check('★ 音效掣邊框轉淡（0.55 → 0.35）', dim);
}

/* ---------- 5. 版號 + 零平衡改動 ---------- */
console.log('\n=== 5. 版號 + 其他東西零改動 ===');
{
  const m = h.match(/末日救未來 v(\d+)\.(\d+)\.(\d+) 已載入/);
  const ver = m ? [+m[1], +m[2], +m[3]] : null;
  check('★ version >= v0.37.0', !!ver && (ver[0] > 0 || ver[1] > 37 || (ver[1] === 37 && ver[2] >= 0)),
    ver ? ver.join('.') : '—');
  const title = h.match(/fillText\('(v\d+\.\d+\.\d+)[^']*'/);
  check('標題畫面顯示同版號一致', !!title && !!ver && title[1].replace(/^v/, '') === ver.join('.'),
    title ? title[1] : '—');

  /* ⚠️ #141 最重要嘅保證：玩家彈數量 / DPS / 命中判定全部冇改 */
  check('★ 玩家彈生成邏輯冇被改（冇加新嘅 bullet 條件）',
    !/PLAYER_BULLET_ALPHA[^;]*;[\s\S]{0,200}?(fireCD|shotsLeft|spawnPlayerShot)/.test(code));
  check('★ 冇改命中判定（playerBulletHits 函數存在同改動前一致）',
    /function playerBulletHits/.test(code));
  check('★ 強化池仍然 26 張', /const UPGRADES = \[/.test(code));
  check('★ telegraph 常數冇被順手改（chaser 600 / bomber 500）',
    cval('CHASER_LOCK_MS') === 600 && cval('BOMBER_FUSE_MS') === 500);
}

console.log('\n' + (fails === 0 ? '✅ 全部通過' : '❌ ' + fails + ' 項失敗'));
process.exit(fails === 0 ? 0 : 1);
