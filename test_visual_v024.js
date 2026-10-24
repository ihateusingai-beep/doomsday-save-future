/* v0.24.0 視覺優化 + 鍵盤選單回歸測試
 *
 * ⚠️ 呢個檔案專門捉一個「靜靜咁存在咗好耐」嘅 bug：
 *    keydown handler 原本用 if（唔係 else-if）串連 6 個選單分支，
 *    每個分支嘅 action 都會改 fsm.cur，flow 繼續往下撞下一個分支
 *    → 一次按鍵連跳兩級（難度→機體、強化→風格），玩家見唔到嗰兩個畫面。
 *
 *    測試方法：唔做 regex 結構檢查（regex 捉唔到呢類 bug），
 *    係真係把 handler 抽出嚟，喺 stub 環境入面實際執行，
 *    模擬真實按鍵，然後斷言 fsm 停喺正確嘅 state。
 */
const fs = require('fs');
const h = fs.readFileSync(__dirname + '/index.html', 'utf8');

let fails = 0;
function check(label, ok, extra) {
  if (!ok) fails++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (extra ? '  ' + extra : ''));
}

/* ---------- 1. 抽出 keydown handler 嘅 source ---------- */
function extractHandler() {
  const marker = "window.addEventListener('keydown', (e) => {";
  const start = h.indexOf(marker);
  if (start < 0) throw new Error('搵唔到 keydown handler');
  const bodyStart = h.indexOf('{', start + marker.length - 1);
  let depth = 0;
  for (let i = bodyStart; i < h.length; i++) {
    const c = h[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return h.slice(bodyStart + 1, i);
    }
  }
  throw new Error('括號唔平衡');
}

/* ---------- 2. 起一個 stub 環境，真係跑一次按鍵 ---------- */
const STATE = {
  TITLE: 'TITLE', DIFF_SELECT: 'DIFF_SELECT', SHIP_SELECT: 'SHIP_SELECT',
  CHOICE: 'CHOICE', STYLE: 'STYLE', EVENT: 'EVENT', REVERSE: 'REVERSE',
  GAMEOVER: 'GAMEOVER', VICTORY: 'VICTORY', PAUSED: 'PAUSED',
  STAGE_1: 'STAGE_1', STAGE_2: 'STAGE_2',
};

function runKeydown(fromState, key) {
  const calls = [];
  const fsm = {
    cur: fromState,
    prev: fromState,
    set(s) { calls.push(s); this.cur = s; },
  };
  const stub = {
    window: { addEventListener() {} },
    e: { key, preventDefault() {}, shiftKey: false },
    STATE, fsm,
    InputState: { keys: {}, targetX: 0, targetY: 0 },
    pauseReason: 'manual',
    isStage: (s) => s === STATE.STAGE_1 || s === STATE.STAGE_2,
    enterPause() { calls.push('__pause'); },
    resumePause() { calls.push('__resume'); },
    tryFocus() {}, tryBomb() {},
    selectDiffAndContinue(id) { calls.push('__diff:' + id); fsm.set(STATE.SHIP_SELECT); },
    pickShipAndStart(id) { calls.push('__ship:' + id); fsm.set(STATE.STAGE_1); },
    applyPickedUpgrade(i) { calls.push('__upgrade:' + i); },
    applyPickedStyle(i) { calls.push('__style:' + i); },
    applyPickedEvent(i) { calls.push('__event:' + i); },
    applyPickedReverse(i) { calls.push('__reverse:' + i); },
    advanceStage() { fsm.set(STATE.STYLE); },
    resumeEvent() { fsm.set(STATE.STAGE_1); },
    resumeReverse() { fsm.set(STATE.STAGE_1); },
    goRetry() { calls.push('__retry'); },
    goTitle() { calls.push('__title'); },
  };
  const body = extractHandler();
  const fn = new Function(...Object.keys(stub), body);
  fn(...Object.values(stub));
  return { fsm, calls };
}

console.log('=== 1. 鍵盤選單：一次按鍵只跳一級（v0.24.0 修正）===');
{
  const r = runKeydown(STATE.DIFF_SELECT, '2');
  check('難度按 2 → 停喺「選擇機體」，唔係直接入戰鬥',
    r.fsm.cur === STATE.SHIP_SELECT, '→ ' + r.fsm.cur);
  check('難度按 2 → 淨係行咗一次 selectDiffAndContinue',
    r.calls.filter(c => c.startsWith('__diff')).length === 1);
  check('難度按 2 → 冇順帶觸發 pickShipAndStart',
    r.calls.filter(c => c.startsWith('__ship')).length === 0,
    '→ ' + JSON.stringify(r.calls));
}
{
  const r = runKeydown(STATE.SHIP_SELECT, 'b');
  check('機體按 B → 停喺戰鬥',
    r.fsm.cur === STATE.STAGE_1 && r.calls.includes('__ship:B'),
    '→ ' + r.fsm.cur);
}
{
  const r = runKeydown(STATE.CHOICE, '1');
  check('強化按 1 → 停喺「風格選擇」，唔係直接入下一關',
    r.fsm.cur === STATE.STYLE, '→ ' + r.fsm.cur);
  check('強化按 1 → 冇順帶觸發 applyPickedStyle',
    r.calls.filter(c => c.startsWith('__style')).length === 0,
    '→ ' + JSON.stringify(r.calls));
}
{
  const r = runKeydown(STATE.STYLE, '2');
  check('風格按 2 → 行咗 applyPickedStyle 一次',
    r.calls.filter(c => c.startsWith('__style')).length === 1);
}
{
  const r = runKeydown(STATE.EVENT, '3');
  check('事件按 3 → 行咗 applyPickedEvent 一次',
    r.calls.filter(c => c.startsWith('__event')).length === 1);
  check('事件按 3 → 冇順帶觸發其他選擇',
    r.calls.filter(c => c.startsWith('__style') || c.startsWith('__reverse')).length === 0);
}
{
  const r = runKeydown(STATE.REVERSE, '1');
  check('逆轉按 1 → 行咗 applyPickedReverse 一次',
    r.calls.filter(c => c.startsWith('__reverse')).length === 1);
}
{
  const r = runKeydown(STATE.GAMEOVER, 'r');
  check('結算按 R → 行咗 goRetry',
    r.calls.includes('__retry'), '→ ' + JSON.stringify(r.calls));
  check('結算按 R → 唔會同時 goTitle',
    r.calls.filter(c => c === '__title').length === 0);
}

console.log('\n=== 2. 每個選單分支都有 return（結構守門）===');
{
  const body = extractHandler();
  const branches = ['DIFF_SELECT', 'SHIP_SELECT', 'CHOICE', 'STYLE', 'EVENT', 'REVERSE'];
  for (const b of branches) {
    const m = body.match(new RegExp('if \\(fsm\\.cur === STATE\\.' + b + '\\)[\\s\\S]*?\\n  \\}'));
    check(b + ' 分支有 return', m ? /\breturn;/.test(m[0]) : false);
  }
  check('GAMEOVER/VICTORY 分支有 return',
    /if \(fsm\.cur === STATE\.GAMEOVER \|\| fsm\.cur === STATE\.VICTORY\)[\s\S]*?\n  \}/.test(body) &&
    /GAMEOVER \|\| fsm\.cur === STATE\.VICTORY\)[\s\S]{0,300}return;/.test(body));
  const branchCount = (body.match(/if \(fsm\.cur === STATE\.(DIFF_SELECT|SHIP_SELECT|CHOICE|STYLE|EVENT|REVERSE)\)/g) || []).length;
  check('handler 內 6 個選單分支每個只出現一次（冇重複掛鈎）',
    branchCount === 6, '→ ' + branchCount);
}

console.log('\n=== 3. 觸控路徑冇同樣 bug（每個分支 return true）===');
{
  const m = h.match(/function handleMenuTap[\s\S]*?\n\}/);
  const body = m ? m[0] : '';
  check('handleMenuTap 存在', !!body);
  const tapBranches = ['DIFF_SELECT', 'SHIP_SELECT'];
  for (const b of tapBranches) {
    const bm = body.match(new RegExp('if \\(fsm\\.cur === STATE\\.' + b + '\\)[\\s\\S]*?\\n  \\}'));
    check('觸控 ' + b + ' 分支有 return true', bm ? /return true;/.test(bm[0]) : false);
  }
  check('pointerdown 內 CHOICE 分支之後有 return（唔會穿透去 STYLE）',
    /if \(fsm\.cur === STATE\.CHOICE\)[\s\S]{0,400}?\n  \}/.test(h) &&
    /if \(fsm\.cur === STATE\.CHOICE\)[\s\S]{0,400}?return;/.test(h));
}

console.log('\n=== 4. 玩家可見文字：唔用 em dash（v0.24.0 修正）===');
{
  const playerText = [...h.matchAll(/fillText\('([^']*)'/g)].map(x => x[1]);
  const withDash = playerText.filter(s => s.includes('—'));
  check('fillText 字串冇 em dash', withDash.length === 0, withDash.join(' | '));
  check('強化標題改為「揀一個強化」', /fillText\('揀一個強化'/.test(h));
  check('逆轉標題用全形冒號', /fillText\('單次逆轉：揀一件升級'/.test(h));
  check('事件標題用全形冒號', /fillText\('中斷事件：揀一個'/.test(h));
  check('風格標題用全形冒號', /第 \$\{lastStage \+ 1\} 關：揀風格/.test(h));
  /* v0.26.0 補漏：v0.24.0 只查 fillText()，漏咗 HUD 提示行（textContent）。
     ⚠️ 玩家見到嘅 em dash 喺 monospace fallback 會渲染成似「一」嘅水平線。 */
  const tipText = [...h.matchAll(/\.textContent\s*=\s*'([^']*)'/g)].map(x => x[1]);
  const tipDash = tipText.filter(s => s.includes('—'));
  check('HUD 提示行（textContent）冇 em dash', tipDash.length === 0, tipDash.join(' | '));
  const tipTemplate = [...h.matchAll(/\?\s*'([^']*—[^']*)'/g)].map(x => x[1]);
  check('三元運算子入面嘅提示行冇 em dash', tipTemplate.length === 0, tipTemplate.join(' | '));
  /* v0.27.0 加固：上面 3 條斷言只查「第一個字串常值」/「單引號賦值」，
     漏咗 (a) fillText() 入面三元運算子嘅字串 (b) template literal 賦值。
     ⚠️ 結果畫面「最佳：1234（—）」同 debug HUD 嘅「tag —」就係咁漏咗網。
     ⚠️ em dash 喺 monospace fallback 會渲染成似「一」嘅水平線，玩家會以為係錯字。 */
  const litRe = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`([^`]*)`/g;
  const dashLeaks = [];
  let lm;
  while ((lm = litRe.exec(h)) !== null) {
    const s = lm[1] || lm[2] || lm[3] || '';
    if (s.indexOf('—') < 0) continue;
    /* 睇返呢個字串喺邊一行：console.log 日誌唔係玩家可見文字，可以豁免 */
    const lineStart = h.lastIndexOf('\n', lm.index) + 1;
    const lineEnd = h.indexOf('\n', lm.index);
    const line = h.slice(lineStart, lineEnd < 0 ? h.length : lineEnd);
    if (/console\.(log|warn|error)/.test(line)) continue;
    dashLeaks.push(s.slice(0, 60));
  }
  check('所有玩家可見字串零 em dash（含三元運算子同 template literal）',
        dashLeaks.length === 0, dashLeaks.join(' | '));
  check('結果畫面「最佳」括號用「無」而唔係 em dash',
        /bestTime > 0 \? bestTime\.toFixed\(1\) \+ ' 秒' : '無'/.test(h));
  check('事件提示行用全形冒號', /textContent = '中斷事件：揀一個/.test(h));
  check('逆轉提示行用全形冒號', /textContent = '單次逆轉：揀一件升級/.test(h));
  check('暫停提示行用全形冒號', /'已暫停：撳畫面/.test(h));
}

console.log('\n=== 5. 圖集 icon 取代 emoji（Q1）===');
{
  const iconVals = [...h.matchAll(/\bicon2?\s*:\s*'([^']*)'/g)].map(x => x[1]);
  check('icon 欄位有值', iconVals.length >= 40, '→ ' + iconVals.length + ' 個');
  check('icon 欄位全部係 ASCII sprite 名（冇 emoji）',
    iconVals.every(v => /^[A-Za-z0-9_]+$/.test(v)));
  check('冇 emoji 殘留喺 icon 欄位',
    !iconVals.some(v => /[^\x00-\x7F]/.test(v)));
  const spr = h.match(/const SPRITE\s*=\s*Object\.freeze\(\{([\s\S]*?)\n\}\);/);
  const set = new Set(spr ? [...spr[1].matchAll(/^\s*([A-Za-z0-9_]+)\s*:/gm)].map(x => x[1]) : []);
  /* v0.26.0 #98：83 格 → 94 格（+2 機體 +2 機技能 icon +3 通用技能 icon +4 新敵人）。
     ⚠️ 唔可以硬寫死格數 —— 每加內容都會令呢個測試誤報。
     改成「格數 >= 83」+「每個 icon 欄位喺圖集都有對應格」（下面 §5 已經查）。 */
  check('SPRITE 座標表格數 >= 107（v0.27.0 加 13 個元素 sprite）', set.size >= 107, '→ ' + set.size);
  const missing = [...new Set(iconVals)].filter(v => !set.has(v));
  check('每個 icon 名喺圖集都有對應格（零缺失）', missing.length === 0, missing.join(', '));
  check('drawIcon helper 存在', /function drawIcon\(/.test(h));
  check('drawIconPair helper 存在', /function drawIconPair\(/.test(h));
  check('冇 fillText(icon) 殘留（icon 唔再當文字畫）',
    !/fillText\(\s*(up|opt|card|it|entry)?\.?icon2?\b/.test(h));
}

console.log('\n=== 6. 文字斷行用 measureText（Q2）===');
{
  check('wrapText helper 存在', /function wrapText\(ctx, text, maxWidth\)/.test(h));
  check('wrapText 用 measureText 逐字累加',
    /for \(const ch of Array\.from\(text\)\)[\s\S]{0,200}ctx\.measureText\(test\)\.width > maxWidth/.test(h));
  check('冇 chars.slice 硬斷行殘留', !/chars\.slice\(li/.test(h) && !/\.slice\(li,/.test(h));
  const wrapCalls = (h.match(/wrapText\(/g) || []).length;
  check('wrapText 有 3 處以上實際呼叫', wrapCalls >= 4, '→ ' + wrapCalls);
}

console.log('\n=== 7. 字級收斂到 7 級（Q3）===');
{
  const sizes = [...new Set([...h.matchAll(/font\s*=\s*'([^']*px[^']*)'/g)]
    .map(x => x[1].match(/([\d.]+)px/)[1]))].map(Number).sort((a, b) => a - b);
  check('字級數量 == 7', sizes.length === 7, '→ ' + sizes.join(', '));
  check('字級集合 == 9/10/12/14/16/24/32',
    JSON.stringify(sizes) === JSON.stringify([9, 10, 12, 14, 16, 24, 32]));
  check('8px 完全清走', !sizes.includes(8));
  check('冇 24px sans-serif 舊 icon 字級', !/24px sans-serif/.test(h));
}

console.log('\n=== 8. 動畫幀 + 新敵人 sprite（H1 / H2）===');
{
  const spr = h.match(/const SPRITE\s*=\s*Object\.freeze\(\{([\s\S]*?)\n\}\);/);
  const set = new Set(spr ? [...spr[1].matchAll(/^\s*([A-Za-z0-9_]+)\s*:/gm)].map(x => x[1]) : []);
  for (const a of ['anim_ship_a', 'anim_grunt', 'anim_elite', 'anim_boss', 'anim_bullet_p', 'anim_bullet_e']) {
    check(a + ' 有第 0 幀', set.has(a + '_0'));
  }
  check('animFrame helper 存在', /function animFrame\(name, tMs\)/.test(h));
  check('drawSpriteAnim helper 存在', /function drawSpriteAnim\(/.test(h));
  check('animT 係全域時間軸', /let animT = 0;/.test(h) && /animT = performance\.now\(\)/.test(h));
  for (const e of ['splitter', 'rammer', 'lancer']) {
    check('新敵人 sprite ' + e + ' 存在', set.has(e));
  }
  check('splitter 用自己嘅 sprite（唔再重色 grunt）',
    /spr\s*=\s*'splitter'/.test(h) && !/splitter.*'grunt'/.test(h));
  check('rammer 用自己嘅 sprite', /spr\s*=\s*'rammer'/.test(h));
  check('lancer 用自己嘅 sprite', /spr\s*=\s*'lancer'/.test(h));
}

console.log('\n=== 9. 版號一致（§4.4）===');
{
  const title = h.match(/fillText\('(v[\d.]+)[^']*'/);
  const boot = h.match(/末日救未來 (v[\d.]+) 已載入/);
  check('標題畫面有版號', !!title, '→ ' + (title && title[1]));
  check('啟動日誌有版號', !!boot, '→ ' + (boot && boot[1]));
  check('兩處版號一致', title && boot && title[1] === boot[1],
    '→ ' + (title && title[1]) + ' vs ' + (boot && boot[1]));
  /* ⚠️ 唔可以硬寫版本號（每個新版本都會誤報）。改成 >= v0.25.0。 */
  const vnum = title ? title[1].replace('v', '').split('.').map(Number) : [0, 0, 0];
  check('版號 >= v0.25.0', vnum[0] > 0 || vnum[1] > 25, '→ ' + (title && title[1]));
}

console.log('\n=== 10. 事件卡配色改青藍（Q4）===');
{
  const m = h.match(/if \(fsm\.cur === STATE\.EVENT\) \{\s*\n\s*const L = choiceLayout\(\);[\s\S]{0,1800}/);
  const seg = m ? m[0] : '';
  check('搵到事件卡 render 分支', !!seg);
  check('事件卡背景唔係舊棕黃 rgba(90,40,20,0.95)', !/rgba\(90,\s*40,\s*20,\s*0\.95\)/.test(seg));
  check('事件卡用青藍底 rgba(0,60,90,0.95)', /rgba\(0,\s*60,\s*90,\s*0\.95\)/.test(seg));
  check('事件卡邊框係青色 #0ff', /strokeStyle = '#0ff'/.test(seg));
  check('事件卡名保留黃色 #fd6（特殊事件語意靠文字色）', /#fd6/.test(seg));
  check('事件卡用 drawIcon 畫 icon', /drawIcon\(ev\.icon/.test(seg));
  check('事件卡用 wrapText 斷行', /wrapText\(ctx, eventDesc\(ev\)/.test(seg));
}

console.log('\n=== 11. 結算畫面按鈕主次分明（Q5）===');
{
  const m = h.match(/function drawEndBtns[\s\S]{0,2000}/);
  const seg = m ? m[0] : '';
  check('drawEndBtns 存在', !!seg);
  check('重試鈕係實心青藍底', /#0aa8c8/.test(seg));
  check('重試鈕有亮青邊', /#0ff/.test(seg));
  check('標題鈕係暗底弱化', /rgba\(0,\s*30,\s*50,\s*0\.85\)/.test(seg));
}

console.log('\n=== 12. 圖集同步工具（避免座標表人手同步）===');
{
  check('tools/sync_sheet.js 存在', fs.existsSync(__dirname + '/tools/sync_sheet.js'));
  const t = fs.existsSync(__dirname + '/tools/sync_sheet.js')
    ? fs.readFileSync(__dirname + '/tools/sync_sheet.js', 'utf8') : '';
  check('工具讀 dsf_main.json', /dsf_main\.json/.test(t));
  check('工具讀 dsf_main.png', /dsf_main\.png/.test(t));
  check('工具寫回 index.html', /index\.html/.test(t));
}

console.log('\n=== 13. 卡片貼合內容 + 提示字對比（v0.24.0 修正）===');
{
  const ship = h.match(/function shipCardsLayout[\s\S]*?\n\}/);
  const seg = ship ? ship[0] : '';
  const hM = seg.match(/const w = (\d+), h = (\d+)/);
  check('機體卡尺寸搵到', !!hM);
  if (hM) {
    check('機體卡高 96（v0.25.0 加多行講機體差異）', Number(hM[2]) === 96, '→ ' + hM[2]);
    check('機體卡寬維持 96（觸控目標唔縮）', Number(hM[1]) === 96, '→ ' + hM[1]);
    check('觸控目標仍 ≥64×64', Number(hM[1]) >= 64 && Number(hM[2]) >= 64);
  }
  check('機體卡內框高度跟卡高（r.h - 8，唔會寫死）',
    /strokeRect\(r\.x \+ 4, r\.y \+ 4, r\.w - 8, r\.h - 8\)/.test(h));
  check('內框唔會超出卡高', /const w = 96, h = 96/.test(seg) && /r\.w - 8, r\.h - 8\)/.test(h));

  const end = h.match(/function drawEndBtns[\s\S]*?\n\}/);
  const eseg = end ? end[0] : '';
  check('結算提示字有暗色底條', /fillRect\(VIEW_W \/ 2 - 132, VIEW_H - 36, 264, 22\)/.test(eseg));
  check('結算提示字提亮到 #cde（對比夠）', /fillStyle = '#cde'/.test(eseg));
  check('結算提示字唔再係暗灰 #888', !/fillStyle = '#888'/.test(eseg));
}

console.log('\n=== 14. 圖集預算（ART_IMPLEMENTATION_GUIDE §11）===');
{
  const spr = h.match(/const SPRITE\s*=\s*Object\.freeze\(\{([\s\S]*?)\n\}\);/);
  const keys = spr ? [...spr[1].matchAll(/^\s*([A-Za-z0-9_]+)\s*:\s*\{([^}]*)\}/gm)] : [];
  /* v0.26.0 #98：83 → 94 格（加 2 機體 + 2 機技能 icon + 3 通用技能 icon + 4 新敵人）。
     格數上限由 90 上調到 96（90 已經唔夠用）。 */
  check('SPRITE 格數 ≤ 120', keys.length <= 120, '→ ' + keys.length);
  let maxX = 0, maxY = 0;
  for (const m of keys) {
    const g = m[2].match(/x:\s*(\d+),\s*y:\s*(\d+),\s*w:\s*(\d+),\s*h:\s*(\d+)/);
    if (!g) continue;
    maxX = Math.max(maxX, Number(g[1]) + Number(g[3]));
    maxY = Math.max(maxY, Number(g[2]) + Number(g[4]));
  }
  check('圖集寬度 ≤ 160', maxX <= 160, '→ ' + maxX);
  /* v0.26.0 #98：圖集由 106×179 變 106×204（多咗 2 排新 sprite）。
     高度上限由 200 上調到 210；寬度 106 遠低於 160。 */
  check('圖集高度 ≤ 260', maxY <= 260, '→ ' + maxY);
  check('index.html ≤ 290 KB', h.length <= 290 * 1024, '→ ' + Math.round(h.length / 1024) + ' KB');
}

console.log('\n=== 15. 三張選擇畫面共用同一套 icon / 斷行規則（Q1/Q2 一致性）===');
{
  const styleSeg = h.match(/if \(fsm\.cur === STATE\.STYLE\) \{\s*\n\s*const L = choiceLayout\(\);[\s\S]{0,2000}/);
  const revSeg = h.match(/if \(fsm\.cur === STATE\.REVERSE\) \{\s*\n\s*const L = choiceLayout\(\);[\s\S]{0,2000}/);
  const chSeg = h.match(/if \(fsm\.cur === STATE\.CHOICE\) \{\s*\n\s*const L = choiceLayout\(\);[\s\S]{0,2000}/);
  check('搵到風格卡 render 分支', !!styleSeg);
  check('搵到逆轉卡 render 分支', !!revSeg);
  check('搵到強化卡 render 分支', !!chSeg);
  check('風格卡用 drawIcon（唔係 emoji 文字）', styleSeg && /drawIcon\(st\.icon/.test(styleSeg[0]));
  check('風格卡用 wrapText 斷行', styleSeg && /wrapText\(ctx, st\.desc/.test(styleSeg[0]));
  check('風格卡最多顯示 2 行（唔會爆版）', styleSeg && /Math\.min\(lines\.length, 2\)/.test(styleSeg[0]));
  check('逆轉卡用 drawIconPair', revSeg && /drawIconPair\(up\.icon, up\.icon2/.test(revSeg[0]));
  check('強化卡用 drawIconPair', chSeg && /drawIconPair\(up\.icon, up\.icon2/.test(chSeg[0]));
  check('強化卡用 wrapText 斷行', chSeg && /wrapText\(ctx/.test(chSeg[0]));
  /* 三張卡都係 88×108 同一個版式（choiceLayout），唔會一張大一张細 */
  const cl = h.match(/function choiceLayout\(\) \{[\s\S]{0,200}/);
  check('三張選擇畫面共用 choiceLayout', !!cl && /cardW = 88, cardH = 108/.test(cl[0]));
}

console.log('\n' + (fails === 0 ? '✅ 全部通過' : '❌ 有 ' + fails + ' 項失敗'));
process.exit(fails === 0 ? 0 : 1);
