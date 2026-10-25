/* v0.27.1 觸控去重回歸測試（pointerdown + touchstart 雙重觸發）
 *
 * Bug（v0.21.2 引入 touchstart handler 嗰陣就存在，一直冇人喺真機測過）：
 *   喺支援 Pointer Events 嘅瀏覽器（iPad Safari 13+ / Android Chrome / 桌面 Chrome），
 *   一次實體觸控會派發 **pointerdown** 同 **touchstart** 兩個事件，
 *   而兩個 handler 都叫 handleMenuTap() → 一次撳被處理兩次
 *   → 選單一次撳連跳兩級：撳難度卡直接入關、撳機卡直接入戰鬥、撳元素卡跳過通用技能。
 *
 * 症狀：玩家「冇主頁、冇揀機，一入去就係戰鬥」。
 *
 * 測試方法（同本 repo 其他測試一致）：唔做 regex 結構檢查，
 * 真係把函數抽出嚟喺 stub 環境實際執行，然後斷言行為。
 */
const fs = require('fs');
const h = fs.readFileSync(__dirname + '/index.html', 'utf8');

let fails = 0;
function check(label, ok, extra) {
  if (!ok) fails++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (extra ? '  ' + extra : ''));
}

/* ---------- 工具 ---------- */
function extractFunction(name) {
  const marker = 'function ' + name + '(';
  const start = h.indexOf(marker);
  if (start < 0) throw new Error('搵唔到 function ' + name);
  const bodyStart = h.indexOf('{', start + marker.length);
  let depth = 0;
  for (let i = bodyStart; i < h.length; i++) {
    const c = h[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return h.slice(start, i + 1);
    }
  }
  throw new Error('括號唔平衡: ' + name);
}
function extractBlock(name) {
  const marker = 'const ' + name + ' = ';
  const start = h.indexOf(marker);
  if (start < 0) throw new Error('搵唔到 ' + name);
  let i = start + marker.length;
  while (i < h.length && h[i] !== '{' && h[i] !== '[') i++;
  const open = h[i];
  const close = open === '{' ? '}' : ']';
  let depth = 0, quote = '';
  for (let j = i; j < h.length; j++) {
    const c = h[j];
    if (quote) { if (c === quote && h[j - 1] !== '\\') quote = ''; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) return h.slice(i, j + 1); }
  }
  throw new Error('括號唔平衡: ' + name);
}
/* ⚠️ 約定：**自身參數在前、注入依賴在後** —— makeFn('f',[a,b])(x, y, aVal, bVal)
 * ⚠️⚠️ 但**唔可以直接注入 makeFn 嘅 wrapper** —— wrapper 用 rest args 實作，
 *    注入後被內層 function 用 `dep(x)` 叫（冇帶依賴值）時，佢會把 x 當成依賴值，
 *    own-arity 就錯咗（isMenuState(s) 收到 0 個 own arg → 永遠 false）。
 *    所以注入必須用 **boundFn()**：依賴值喺建立時就綁死，own-arity 保持正確。 */
function makeFn(name, deps, consts) {
  const src = extractFunction(name);
  const prelude = (consts || [])
    .map(n => 'const ' + n + ' = ' + constNum(n) + ';').join('\n');
  const F = new Function(...deps, prelude + '\n' + src + '\nreturn ' + name + ';');
  return function (...callArgs) {
    const split = callArgs.length - deps.length;
    const own = callArgs.slice(0, split);
    const depVals = callArgs.slice(split);
    const inner = F(...depVals);
    return inner(...own);
  };
}
/* ---------- 抽出函數嘅正確做法（重要）----------
   ⚠️ 注入依賴時 **唔可以用 makeFn 嘅 wrapper**：
      wrapper 用 rest args 實作，注入後被內層 function 用 `dep(x)` 叫（冇帶依賴值）時，
      佢會把 x 當成依賴值 → own-arity 錯（isMenuState(s) 收到 0 個 own arg → 永遠 false）。
   ⚠️ 另一個陷阱：`new Function('dep', body)` 係**按位置**綁定參數，
      所以「own args + dep args」嘅傳遞方式會令自由變數（dep）撞到 own arg 嘅位置。
   ✅ 正確做法：**eval 返個函數到本測試檔嘅 scope** ——
      只要本 scope 有同名 const（STATE / menuTapState / MENU_TAP_DEDUP_*），
      函數 body 內嘅自由變數就會自然解析到佢哋，而 own arity 保持原樣。 */

function constNum(name) {
  const m = h.match(new RegExp('const\\s+' + name + '\\s*=\\s*([^;]+);'));
  if (!m) throw new Error('搵唔到 const ' + name);
  const n = Number(m[1].trim());
  if (isNaN(n)) throw new Error('const ' + name + ' 唔係數字');
  return n;
}

/* ---------- eval scope：抽出嘅函數喺呢度解析自由變數 ---------- */
const STATE = eval('(' + extractBlock('STATE') + ')');
const MENU_TAP_DEDUP_MS = constNum('MENU_TAP_DEDUP_MS');
const MENU_TAP_DEDUP_PX = constNum('MENU_TAP_DEDUP_PX');
const menuTapState = { ms: -1e9, x: 0, y: 0 };
/* 呢兩個係 index.html 嘅真實邏輯（eval 返嚟，own arity 正確） */
const realIsMenuState = eval('(' + extractFunction('isMenuState') + ')');
const realIsDuplicateMenuTap = eval('(' + extractFunction('isDuplicateMenuTap') + ')');

/* ================================================================
 * 1. isMenuState：選單畫面清單（touchstart 同去重共用）
 * ================================================================ */
console.log('\n=== 1. isMenuState（選單 state 清單唯一真實來源）===');
{
  const isMenuState = realIsMenuState;
  const menuStates = ['TITLE', 'DIFF_SELECT', 'SHIP_SELECT', 'SKILL_PICK',
                      'ELEMENT_PICK', 'ELEM_CHOICE', 'CHOICE', 'STYLE', 'EVENT',
                      'REVERSE', 'GAMEOVER', 'VICTORY', 'PAUSED'];
  const missing = menuStates.filter(s => !isMenuState(STATE[s], STATE));
  check('13 個選單 state 全部被 isMenuState 認到', missing.length === 0, missing.join(', '));
  const stageStates = ['STAGE_1', 'STAGE_2', 'STAGE_3', 'STAGE_4', 'STAGE_5'];
  const wrong = stageStates.filter(s => isMenuState(STATE[s], STATE));
  check('5 個戰鬥 state 唔會被當成選單（戰鬥中唔去重）', wrong.length === 0, wrong.join(', '));
  /* ⚠️ 特別檢查三個新 state —— v0.26.0 / v0.27.0 加嘅，之前 touchstart 清單漏咗 */
  check('SKILL_PICK 喺選單清單入面', isMenuState(STATE.SKILL_PICK, STATE));
  check('ELEMENT_PICK 喺選單清單入面', isMenuState(STATE.ELEMENT_PICK, STATE));
  check('ELEM_CHOICE 喺選單清單入面', isMenuState(STATE.ELEM_CHOICE, STATE));
}

/* ================================================================
 * 2. isDuplicateMenuTap：去重判斷
 * ================================================================ */
console.log('\n=== 2. isDuplicateMenuTap（同一個物理觸控只處理一次）===');
const DEDUP_CONSTS = ['MENU_TAP_DEDUP_MS', 'MENU_TAP_DEDUP_PX'];
{
  const st = menuTapState;
  const dup = realIsDuplicateMenuTap;
  check('第一次撳 → 唔係重複（正常處理）', dup(1000, 100, 200) === false);
  check('5ms 後同一個掣 → 係重複（被吞）', dup(1005, 101, 201) === true);
  check('同一個掣、20ms 後 → 仍然係重複（覆蓋慢裝置）', dup(1020, 100, 200) === true);
  check('超過窗口(200ms)後同一個掣 → 唔算重複（新嘅一次撳）', dup(1200, 100, 200) === false);
  check('窗口內但座標差 100px → 唔算重複（玩家撳第二張卡）', dup(1210, 200, 300) === false);
  check('窗口內、座標差 40px（> 容差 32）→ 唔算重複', dup(1220, 140, 200) === false);
  check('狀態真係寫咗入去（可以連續用）', st.ms === 1220 && st.x === 140, '→ ' + JSON.stringify(st));
  const ms = constNum('MENU_TAP_DEDUP_MS');
  check('去重窗口 > 人手最快連撳(150ms)? 唔 —— 必須細過 150ms', ms < 150, '→ ' + ms + 'ms');
  check('去重窗口 > 同一觸控兩個事件嘅實測間隔(10ms)', ms > 10, '→ ' + ms + 'ms');
}

/* ================================================================
 * 3. handleMenuTap 端到端：一次撳只推一級
 * ================================================================ */
console.log('\n=== 3. handleMenuTap（一次撳唔可以跳兩級）===');
const MENU_DEPS = ['canvas', 'fsm', 'STATE', 'performance', 'isMenuState', 'isDuplicateMenuTap',
                   'VIEW_W', 'VIEW_H', 'handleAudioPanelTap',
                   'hitDiffCard', 'selectDiffAndContinue',
                   'hitShipCard', 'pickShipAndStart',
                   'hitUniversalCard', 'applyPickedUniversal',
                   'hitElementCard', 'applyPickedElement',
                   'hitElemChoiceCard', 'applyPickedElemChoice'];
{
  /* 造一個完整嘅 stub 環境 */
  const st = menuTapState;
  const canvasStub = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 320, height: 480 }) };


  function mkFsm(start) {
    const f = { cur: start, transitions: [] };
    f.set = (n) => { f.transitions.push([f.cur, n]); f.cur = n; };
    return f;
  }
  const noop = () => {};
  let clock = 1000;
  const perf = { now: () => clock };

  const handleMenuTap = makeFn('handleMenuTap', MENU_DEPS);

  function tap(fsm, cx, cy, extra) {
    const e = extra || {};
    const deps = [
      canvasStub, fsm, STATE, perf, realIsMenuState, realIsDuplicateMenuTap, 320, 480,
      () => false,                                   /* handleAudioPanelTap */
      e.hitDiffCard || (() => 1),                    /* hitDiffCard */
      e.selectDiffAndContinue || ((id) => { fsm.set(STATE.SHIP_SELECT); }),
      e.hitShipCard || (() => 'A'),                  /* hitShipCard */
      e.pickShipAndStart || ((id) => { fsm.set(STATE.ELEMENT_PICK); }),
      e.hitUniversalCard || (() => 0),               /* hitUniversalCard */
      e.applyPickedUniversal || ((i) => { fsm.set(STATE.STAGE_1); }),
      e.hitElementCard || (() => 0),                 /* hitElementCard */
      e.applyPickedElement || ((i) => { fsm.set(STATE.SKILL_PICK); }),
      e.hitElemChoiceCard || (() => -1),             /* hitElemChoiceCard */
      e.applyPickedElemChoice || (noop),
    ];
    return handleMenuTap(cx, cy, ...deps);
  }

  /* --- 場景 A：標題畫面，一次撳 = pointerdown + touchstart（相隔 3ms） --- */
  {
    const fsm = mkFsm(STATE.TITLE);
    clock = 1000;
    tap(fsm, 160, 400);            /* pointerdown */
    clock = 1003;                  /* touchstart 只遲 3ms */
    tap(fsm, 160, 400);
    check('一次撳（pointerdown + touchstart）→ 只推一級', fsm.transitions.length === 1,
          '→ ' + JSON.stringify(fsm.transitions));
    check('推去難度畫面', fsm.cur === STATE.DIFF_SELECT, '→ ' + fsm.cur);
  }

  /* --- 場景 B：難度畫面，撳卡 1 應該去揀機（唔可以跳到揀元素） --- */
  {
    const fsm = mkFsm(STATE.DIFF_SELECT);
    clock = 2000;
    tap(fsm, 62, 260);             /* pointerdown */
    clock = 2003;
    tap(fsm, 62, 260);             /* touchstart */
    check('撳難度卡 → 只推一級到揀機', fsm.cur === STATE.SHIP_SELECT, '→ ' + fsm.cur);
    check('難度 → 揀機 只推一級', fsm.transitions.length === 1, '→ ' + JSON.stringify(fsm.transitions));
  }

  /* --- 場景 C：揀機畫面，撳機 A 應該去揀元素（唔可以跳到通用技能） --- */
  {
    const fsm = mkFsm(STATE.SHIP_SELECT);
    clock = 3000;
    tap(fsm, 54, 132);
    clock = 3003;
    tap(fsm, 54, 132);
    check('撳機體 → 只推一級到揀元素', fsm.cur === STATE.ELEMENT_PICK, '→ ' + fsm.cur);
  }

  /* --- 場景 D：揀元素畫面，撳火應該去揀通用技能（唔可以跳入關） --- */
  {
    const fsm = mkFsm(STATE.ELEMENT_PICK);
    clock = 4000;
    tap(fsm, 54, 134);
    clock = 4003;
    tap(fsm, 54, 134);
    check('撳元素 → 只推一級到揀通用技能', fsm.cur === STATE.SKILL_PICK, '→ ' + fsm.cur);
  }

  /* --- 場景 E：連續兩次獨立撳（隔 300ms）→ 兩次都要處理 --- */
  {
    const fsm = mkFsm(STATE.TITLE);
    clock = 5000;
    tap(fsm, 160, 400);
    clock = 5300;                  /* 人手再撳一次，300ms 後 */
    tap(fsm, 160, 400);
    check('隔 300ms 連撳兩下 → 兩次都處理（玩家正常操作唔會被吞）',
          fsm.transitions.length === 2, '→ ' + JSON.stringify(fsm.transitions));
  }

  /* --- 場景 F：戰鬥中連續撳（移位）→ 唔可以去重！ --- */
  {
    const fsm = mkFsm(STATE.STAGE_1);
    clock = 6000;
    const r1 = tap(fsm, 100, 300);
    clock = 6002;                  /* 同一個物理觸控嘅 touchstart */
    const r2 = tap(fsm, 100, 300);
    check('戰鬥中：兩個事件都唔被去重（handleMenuTap 照樣 return false，畀拖曳邏輯處理）',
          r1 === false && r2 === false, '→ r1=' + r1 + ' r2=' + r2);
    check('戰鬥中唔會觸發任何狀態轉換', fsm.transitions.length === 0);
  }
}

/* ================================================================
 * 4. source-level 守門：兩個 handler 唔准各自維護 state 清單
 * ================================================================ */
console.log('\n=== 4. 唔准再手寫 state 清單 ===');
{
  const touchSrc = h.match(/canvas\.addEventListener\('touchstart'[\s\S]*?\}\);/);
  check('搵到 touchstart handler', !!touchSrc);
  const ts = touchSrc ? touchSrc[0] : '';
  check('touchstart 用 isMenuState(fsm.cur)', /isMenuState\(fsm\.cur\)/.test(ts));
  check('touchstart 唔再手寫 STATE\.XXX 清單',
        !/fsm\.cur === STATE\./.test(ts), ts.replace(/\s+/g, ' ').slice(0, 120));
  const mt = extractFunction('handleMenuTap');
  check('handleMenuTap 有 isMenuState 守衛（戰鬥中唔去重）',
        /if \(isMenuState\(fsm\.cur\)\)[\s\S]{0,160}isDuplicateMenuTap/.test(mt));
  check('handleMenuTap 叫咗 isDuplicateMenuTap', /isDuplicateMenuTap\(/.test(mt));
  check('去重狀態用 object 容器（方便注入測試）', /const menuTapState = \{/.test(h));
  /* ⚠️ 版本斷言用 >= 而唔係 exact-equal（記憶 §3：SemVer 喺 runtime 係單一真實來源，
     測試只應該守住「唔好退版」，唔應該鎖死死版本號 —— 否則每次 bump 版都會誤報 fail）。 */
  const ver = (h.match(/末日救未來 v(\d+\.\d+\.\d+) 已載入/) || [])[1] || '0.0.0';
  const verNum = ver.split('.').map(Number);
  const atLeast = (a, b) => a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] >= b[2])));
  check('版本 >= v0.27.1', atLeast(verNum, [0, 27, 1]), '→ ' + ver);
  check('標題畫面版本字串 = 啟動日誌版本',
    new RegExp("fillText\\('v" + ver.replace(/\./g, '\\.') + " ·").test(h));
  check('啟動日誌版本一致', new RegExp('末日救未來 v' + ver.replace(/\./g, '\\.') + ' 已載入').test(h));
  check('pointerdown 同 touchstart 兩個 handler 仍然共存（唔係刪一個）',
        /canvas\.addEventListener\('pointerdown'/.test(h) &&
        /canvas\.addEventListener\('touchstart'/.test(h));
}

/* ---------- 總結 ---------- */
console.log('\n' + (fails === 0 ? '=== 全部通過 ===' : '=== ' + fails + ' 項失敗 ==='));
process.exit(fails === 0 ? 0 : 1);
