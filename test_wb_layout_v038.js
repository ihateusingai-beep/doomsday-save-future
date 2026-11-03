/* v0.38.0 守門：智慧白板橫向側欄（#143）
 *
 * 背景：`MECHANICS_REVIEW_v036.md` §5 —— 實測「智慧白板 4K 橫向時遊戲只佔畫面 37.5%，
 * 左右各 1200px 全黑 = 63% 畫面冇用」。橫向時加左右教學側欄，填用嗰 63%。
 *
 * ⚠️ **結構斷言一定要喺「剝走註解」嘅 source 度做**（假守門陷阱：命中註解 = 假通過）。
 * ⚠️ **數「某 token 出現幾多次」要數成個 pattern**，唔係數 token。
 * ⚠️ 本檔係**結構層**守門；行為層（實際版面佔用率 / 內容有冇被裁切）由
 *    `tools/viewport_fit.js` 同 `tools/wb_sidebar.js` 量測（實機 DOM 讀數），唔喺呢度重做。
 * ⚠️ 「舊 code 一行都冇被改過」嘅強證據由 `tools/code_delta.js`（git 基準 diff）提供。
 */
const fs = require('fs');
const path = require('path');
const h = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

let fails = 0;
function check(label, ok, extra) {
  if (!ok) fails++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (extra ? '  ' + extra : ''));
}

/* 剝走註解嘅 source —— 結構斷言一定要喺真 code 度做 */
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

/* 抽 const：搵 `const NAME =` 之後用大括號配對（唔靠 ; 分隔 → 唔會被內部 ; 誤切） */
function cval(name) {
  const i = code.indexOf('const ' + name + ' =');
  if (i < 0) throw new Error('抽唔到 const ' + name);
  let s = code.indexOf('{', i);
  if (s < 0) { s = code.indexOf('[', i); }
  const open = code[s], close = open === '{' ? '}' : ']';
  let d = 0;
  for (let k = s; k < code.length; k++) {
    if (code[k] === open) d++;
    else if (code[k] === close) { d--; if (d === 0) return new Function('return (' + code.slice(s, k + 1) + ');')(); }
  }
  throw new Error('const ' + name + ' 大括號唔配對');
}

/* ---------- 1. 縱向零改動（結構層 golden） ---------- */
console.log('=== 1. 縱向零改動（canvas 公式 / 座標 / 邏輯尺寸）===');
{
  /* ⚠️ 側欄用 DOM，canvas 一個字都冇改 → 縱向必須同 v0.37.0 完全一樣 */
  check('★ canvas 邏輯尺寸仍然係 320×480',
    /const VIEW_W = 320;/.test(code) && /const VIEW_H = 480;/.test(code));
  check('★ canvas HTML 屬性仍然係 width="320" height="480"',
    /<canvas id="game" width="320" height="480"/.test(h));
  check('★ setupCanvas() 嘅視窗適應公式冇改（winAspect 比較 + cssH/cssW 兩條分支）',
    /const winAspect = window\.innerWidth \/ window\.innerHeight;/.test(code)
    && /if \(winAspect > aspect\) \{/.test(code)
    && /cssH = Math\.min\(window\.innerHeight, window\.innerWidth \* \(1\/aspect\)\);/.test(code)
    && /cssW = Math\.min\(window\.innerWidth, window\.innerHeight \* aspect\);/.test(code));
  check('★ canvas 仍然係 2:3 比例（aspect = VIEW_W / VIEW_H）',
    /const aspect = VIEW_W \/ VIEW_H;/.test(code));
  check('★ 冇引入第二個遊戲 canvas（側欄只用細 icon canvas）',
    (h.match(/<canvas id="game"/g) || []).length === 1);
  /* ⚠️ 觸控：側欄唔可以攞走觸控 —— 遊戲 handler 仍然只掛喺主 canvas */
  check('★ 主 canvas 仍然係 pointer/touch 事件目標',
    /canvas\.addEventListener\('pointerdown'/.test(code) && /canvas\.addEventListener\('touchstart'/.test(code));
  check('★ 側欄冇掛任何 pointer / touch handler（唔會搶走學生嘅撳擊）',
    !/wbL[^;]*addEventListener|wbR[^;]*addEventListener|wb-side[^;]*addEventListener/.test(code));
}

/* ---------- 2. 側欄 DOM + CSS ---------- */
console.log('\n=== 2. 側欄 DOM + CSS（#143）===');
{
  check('★ body 有左側欄 <aside id="wbL">', /<aside class="wb-side" id="wbL"><\/aside>/.test(h));
  check('★ body 有右側欄 <aside id="wbR">', /<aside class="wb-side" id="wbR"><\/aside>/.test(h));
  check('★ 側欄排喺 canvas 左右（body 順序 = 左 · 畫布 · 右）',
    h.indexOf('id="wbL"') < h.indexOf('id="game"') && h.indexOf('id="game"') < h.indexOf('id="wbR"'));

  /* 顯示條件：橫向 + 闊度夠先顯示；縱向 / 手機完全唔顯示 */
  check('★ 顯示條件係 min-aspect-ratio:1/1 and min-width:1024px',
    /@media \(min-aspect-ratio:1\/1\) and \(min-width:1024px\)\{\.wb-side\{display:flex\}\}/.test(code));
  check('★ 預設 display:none（縱向 = 零 layout 影響）',
    /\.wb-side\{display:none;/.test(code));
  check('★ body 係 flex row（側欄 · 畫布 · 側欄）',
    /body \{[\s\S]{0,200}display:flex;/.test(code));
  check('★ canvas flex:none（唔會被側欄擠壓）', /canvas \{[\s\S]{0,120}flex:none;/.test(code));

  /* ⚠️ 字級用 vh：4K 白板睇得遠，固定 14px CSS px 會睇唔清 */
  const fm = code.match(/font:clamp\((\d+)px,([\d.]+)vh,(\d+)px\)/);
  check('★ 側欄字級用 vh（clamp(px, vh, px)）', !!fm, fm ? fm[0] : '—');
  if (fm) {
    const lo = +fm[1], vh = +fm[2], hi = +fm[3];
    check('★ 1080p 字號 ≥ 20px（4K 白板睇得遠）', vh * 10.8 >= 20, (vh * 10.8).toFixed(1) + 'px');
    check('★ 4K 字號封頂 ≥ 30px', hi >= 30, hi + 'px');
    check('★ 下限 ≥ 13px（唔細過 iPad 橫向）', lo >= 13, lo + 'px');
  }
  /* 內容欄上限 + 靠住遊戲嗰邊 */
  check('★ 側欄內容欄有 max-width（唔會拉到全屏）', /\.wb-side>\*\{[^}]*max-width:640px/.test(code));
  check('★ 左欄內容靠右（貼住遊戲）', /#wbL\{align-items:flex-end/.test(code));
  check('★ 右欄內容靠左（貼住遊戲）', /#wbR\{align-items:flex-start/.test(code));
}

/* ---------- 3. 觸發點 ---------- */
console.log('\n=== 3. 面板更新觸發點 ===');
{
  const calls = (code.match(/updateWbPanels\(\);/g) || []).length;
  check('★ updateWbPanels() 有 4 個觸發點（圖集就緒 / 入關 / 揀完強化 / 啟動）', calls >= 4, '= ' + calls);
  /* ⚠️ 入關嗰個必須喺詞綴 roll 之後（詞綴要顯示得啱）
     ⚠️ 唔可以用 indexOf('updateWbPanels();') —— 佢會撞到 sheetImg.onload 嗰個（喺更前面） */
  const idxRoll = code.indexOf('rollStageAffix(lastStage);');
  const idxCall = code.indexOf('updateWbPanels();', idxRoll);
  check('★ 入關觸發點喺 rollStageAffix 之後（詞綴一定顯示得啱）',
    idxRoll >= 0 && idxCall > idxRoll);
  /* ⚠️ 事件強制詞綴會覆寫 stageAffix → 面板要喺覆寫之後更新 */
  const idxForced = code.indexOf('stageAffix = forced;');
  const idxCall2 = code.indexOf('updateWbPanels();', idxForced);
  check('★ 事件強制詞綴覆寫之後先更新面板', idxForced >= 0 && idxCall2 > idxForced);
  check('★ 揀完強化會更新（強化堆疊即時反映）',
    /playerStacks\[up\.id\] = \(playerStacks\[up\.id\] \|\| 0\) \+ 1;\s*\n\s*updateWbPanels\(\);/.test(code));
  check('★ 圖集就緒會重畫 sprite（sprite 一開始 draw 唔到）',
    /sheetImg\.onload = \(\) => \{[^}]*updateWbPanels\(\);/.test(code));
  check('★ updateWbPanels 有空值守衛（DOM 未就緒唔會爆）',
    /const L = document\.getElementById\('wbL'\), R = document\.getElementById\('wbR'\);\s*\n\s*if \(!L \|\| !R\) return;/.test(code));
}

/* ---------- 4. 敵種圖鑑覆蓋率（真數據） ---------- */
console.log('\n=== 4. 敵種圖鑑覆蓋率（每關 pool 全部要出現）===');
{
  const WAVE_CHUNKS = cval('WAVE_CHUNKS');
  const STAGE_RAND = cval('STAGE_RAND');
  const SPRITE = cval('SPRITE');
  const WB_ENEMY = cval('WB_ENEMY');
  const WB_PAT = cval('WB_PAT');

  const poolOf = (stageId) => {
    const cfg = STAGE_RAND[stageId] || {};
    const ids = cfg.slots ? cfg.slots.flat() : (cfg.pool || []);
    const set = new Set();
    for (const id of ids) {
      const ch = WAVE_CHUNKS[id];
      if (!ch) continue;
      for (const s of ch.spawn) set.add(s.type);
    }
    return set;
  };

  for (const st of [1, 2, 3, 4, 5]) {
    const pool = poolOf(st);
    const body = [...pool].filter(t => WB_ENEMY[t]);
    const pat = [...pool].filter(t => WB_PAT[t]);
    const missing = [...pool].filter(t => !WB_ENEMY[t] && !WB_PAT[t]);
    check('★ S' + st + ' pool 全部有覆蓋（身體敵 ' + body.length + ' + 彈幕型 ' + pat.length
      + ' / 共 ' + pool.size + '）', missing.length === 0,
      missing.length ? '未覆蓋：' + missing.join(',') : '');
  }

  /* ⚠️ 圖鑑要跟 pool 走，唔係全部都出（唔可以漏教未教過嘅敵） */
  check('★ 圖鑑只顯示本關 pool 出現過嘅敵（唔會偷渡未教敵種）',
    /if \(k === 'boss' \|\| pool\.has\(k\)\)/.test(code));
  check('★ boss 永遠顯示（每關都有）', /k === 'boss' \|\| pool\.has\(k\)/.test(code));

  /* ⚠️ 零新圖：所有 sprite 名都要喺現有圖集入面 */
  const badSpr = Object.keys(WB_ENEMY).filter(k => !SPRITE[WB_ENEMY[k][0]]);
  check('★ 敵種 sprite 全部喺現有圖集入面（零新圖）', badSpr.length === 0,
    badSpr.length ? '缺：' + badSpr.join(',') : '');
  const badPat = Object.keys(WB_PAT).filter(k => WB_PAT[k] === undefined);
  check('★ 彈幕型描述齊全', badPat.length === 0);
}

/* ---------- 5. 名稱 / 描述同遊戲內一致 ---------- */
console.log('\n=== 5. 名稱同遊戲內 label 一致（教學唔可以講錯）===');
{
  const WB_ENEMY = cval('WB_ENEMY');
  /* 由 source 抽遊戲內 label 三元鏈：type ? '名' */
  const labelBlock = code.match(/label: sniper \? '([^']+)'[\s\S]{0,400}?turret \? '([^']+)' : ''/);
  check('★ 搵到遊戲內 enemy label 三元鏈', !!labelBlock);
  const srcLabel = {};
  if (labelBlock) {
    const seg = labelBlock[0];
    const re = /(sniper|shield|swarm|splitter|rammer|lancer|medic|chaser|bomber|turret) \? '([^']+)'/g;
    let m;
    while ((m = re.exec(seg))) srcLabel[m[1]] = m[2];
  }
  check('★ 抽到 10 種有 label 嘅敵種', Object.keys(srcLabel).length === 10, '=' + Object.keys(srcLabel).length);
  const mismatch = Object.keys(srcLabel).filter(t => WB_ENEMY[t] && WB_ENEMY[t][1] !== srcLabel[t]);
  check('★ 側欄名稱同遊戲內 label 逐個一致', mismatch.length === 0,
    mismatch.length ? mismatch.map(t => t + ':' + WB_ENEMY[t][1] + '≠' + srcLabel[t]).join(' ') : '');

  /* ⚠️ 精英：遊戲內 label 係「精英 · 重裝 / 精英 · 狙擊」→ 側欄用「精英」做前綴 */
  check('★ 精英名同遊戲內 label 前綴一致（精英 · 重裝）',
    /e\.label = '精英 · ' \+ e\.affix;/.test(code) && WB_ENEMY.elite[1] === '精英');

  /* ⚠️ 教學描述唔可以同 source 講嘅相反（v0.38.0 修正咗 3 個講錯嘅描述） */
  check('★ 護盾敵人描述係「血厚」而唔係「要先破盾」（遊戲內 shield 冇護盾機制）',
    WB_ENEMY.shield[2].indexOf('血厚') >= 0 && WB_ENEMY.shield[2].indexOf('破盾') < 0, WB_ENEMY.shield[2]);
  check('★ 炮台描述提到藍圈（佢真係有護罩環）', WB_ENEMY.turret[2].indexOf('藍圈') >= 0, WB_ENEMY.turret[2]);
  check('★ 追蹤描述講「橙線」（實際係線唔係圈）', WB_ENEMY.chaser[2].indexOf('橙線') >= 0, WB_ENEMY.chaser[2]);
  check('★ 自爆描述提到圈越近越亮（source 係警告圈）', WB_ENEMY.bomber[2].indexOf('圈') >= 0, WB_ENEMY.bomber[2]);
}

/* ---------- 6. 玩家可見字串規則 ---------- */
console.log('\n=== 6. 玩家可見字串（em dash / icon 規則）===');
{
  const WB_ENEMY = cval('WB_ENEMY');
  const WB_TIP = cval('WB_TIP');
  const WB_PAT = cval('WB_PAT');
  const strs = [];
  for (const k of Object.keys(WB_ENEMY)) strs.push(WB_ENEMY[k][1], WB_ENEMY[k][2]);
  for (const k of Object.keys(WB_TIP)) strs.push(WB_TIP[k]);
  for (const k of Object.keys(WB_PAT)) strs.push(WB_PAT[k]);
  const emDash = strs.filter(s => s.indexOf('—') >= 0);
  check('★ 側欄字串冇 em dash（— 會喺 monospace fallback 變水平線）', emDash.length === 0,
    emDash.length ? emDash.join(' / ') : '');
  const nonCjk = strs.filter(s => /[A-Za-z]/.test(s));
  check('★ 側欄字串冇英文（白板學生 3 秒讀得明）', nonCjk.length === 0,
    nonCjk.length ? nonCjk.join(' / ') : '');
  check('★ 彈幕型冇 icon（冇 sprite 就用文字，唔違反 icon 規則）',
    !/icon/.test(JSON.stringify(WB_PAT)));
}

/* ---------- 7. 版號 + 預算 ---------- */
console.log('\n=== 7. 版號 + 預算 ===');
{
  const m = h.match(/末日救未來 v(\d+)\.(\d+)\.(\d+) 已載入/);
  const ver = m ? [+m[1], +m[2], +m[3]] : null;
  check('★ version >= v0.38.0', !!ver && (ver[0] > 0 || ver[1] > 38 || (ver[1] === 38 && ver[2] >= 0)),
    ver ? ver.join('.') : '—');
  const title = h.match(/fillText\('(v\d+\.\d+\.\d+)[^']*'/);
  check('標題畫面顯示同版號一致', !!title && !!ver && title[1].replace(/^v/, '') === ver.join('.'),
    title ? title[1] : '—');
  check('★ index.html ≤ 290 KB（字元口徑）', h.length <= 290 * 1024,
    (h.length / 1024).toFixed(3) + ' KB · 餘 ' + (290 * 1024 - h.length) + ' 字元');
}

/* ---------- 8. 還原驗證（守門唔可以 vacuous） ---------- */
console.log('\n=== 8. 還原驗證（改壞條件 → 斷言必須 fail）===');
{
  /* ① 移除 media query 嘅 min-width 閘 → 顯示條件斷言必須 fail */
  const m1 = code.replace(
    '@media (min-aspect-ratio:1/1) and (min-width:1024px){.wb-side{display:flex}}',
    '@media (min-aspect-ratio:1/1){.wb-side{display:flex}}');
  const stillOk = /@media \(min-aspect-ratio:1\/1\) and \(min-width:1024px\)\{\.wb-side\{display:flex\}\}/.test(m1);
  check('還原驗證①：media query 閘被移除 → 斷言 fail', !stillOk);

  /* ② 字級改成固定 px → vh 斷言必須 fail */
  const m2 = code.replace(/font:clamp\(\d+px,[\d.]+vh,\d+px\)/, 'font:clamp(13px,14px,34px)');
  const stillOk2 = /font:clamp\(\d+px,([\d.]+)vh,\d+px\)/.test(m2);
  check('還原驗證②：字級改成固定 px → 斷言 fail', !stillOk2);

  /* ③ canvas flex:none 被移除 → 斷言必須 fail */
  const m3 = code.replace(/canvas \{[\s\S]{0,120}flex:none;/, 'canvas {');
  const stillOk3 = /canvas \{[\s\S]{0,120}flex:none;/.test(m3);
  check('還原驗證③：canvas flex:none 被移除 → 斷言 fail', !stillOk3);

  /* ④ 圖鑑改為顯示全部敵 → 覆蓋 / 偷渡斷言必須 fail */
  const m4 = code.replace(/if \(k === 'boss' \|\| pool\.has\(k\)\)/, 'if (true)');
  const stillOk4 = /if \(k === 'boss' \|\| pool\.has\(k\)\)/.test(m4);
  check('還原驗證④：圖鑑顯示全部敵 → 斷言 fail', !stillOk4);

  /* ⑤ 側欄字級改返 14px 固定 → 1080p ≥20px 斷言必須 fail */
  const m5 = code.replace(/font:clamp\(\d+px,[\d.]+vh,\d+px\)/, 'font:clamp(13px,14px,34px)');
  const fm5 = m5.match(/font:clamp\((\d+)px,([\d.]+)vh,(\d+)px\)/);
  check('還原驗證⑤：字級改固定 px → 1080p ≥20px 斷言 fail', !fm5 || (+fm5[2] * 10.8) < 20);
}

console.log('\n' + (fails === 0 ? '✅ 全部通過' : '❌ ' + fails + ' 條失敗'));
process.exit(fails === 0 ? 0 : 1);
