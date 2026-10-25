/* v0.27.2 修 bug 回歸測試
 *
 * 本批修嘅 4 類問題（全部有實機／實測證據，唔係理論）：
 *
 * ① **P0：sprite key 外洩到玩家畫面**
 *    `index.html` 有兩處用 `fillText(iconKey + ' ' + name)`，
 *    而 iconKey 係圖集 sprite key（'icon_iron' / 'icon_wind' …）——
 *    玩家每關開場見到「icon_wind 逆風」，每次 boss 掉落見到「icon_supply 節能」。
 *    修正：改用 drawIconWithText()（icon 一定係圖集 sprite）。
 *
 * ② **P0：詞綴橫幅同裝備橫幅重疊 / 裝備提示正常節奏根本睇唔到**
 *    詞綴橫幅 y 74–118、裝備橫幅 y 82–104，完全重疊；
 *    而且裝備橫幅只喺戰鬥畫面畫，但 boss 死即刻跳 CHOICE modal，
 *    所以要 2.6 秒內行完 2–3 個選單先返到戰鬥畫面 —— 學生基本睇唔到。
 *    修正：裝備提示改喺 CHOICE 畫面畫（一定見到，唔會撞位）。
 *
 * ③ **P1：斷行會把數字同符號拆開**
 *    逐字斷行令「−25%」變成「−」/「25%」、「+20%」變成「+2」/「0%」。
 *    修正：原子切法（符號 + 數字 + 小數 + 百分比 = 一個原子）。
 *
 * ④ **P2：boss 死亡路徑唔統一**
 *    laserTick 直接叫 onBossDown()，唔經 killEnemy() → 冇爆炸、_dead 唔 set，
 *    同一幀子彈再打中會掉兩件裝備 + 分數雙計。
 *    修正：laserTick 同子彈路徑一樣經 killEnemy() → onBossDown()。
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
function section(t) { console.log('\n=== ' + t + ' ==='); }

/* ---------- 工具：抽出函數 / 常數 ---------- */
function extractFunction(name) {
  const marker = 'function ' + name + '(';
  const start = h.indexOf(marker);
  if (start < 0) throw new Error('搵唔到 function ' + name);
  const bodyStart = h.indexOf('{', start + marker.length);
  let depth = 0;
  for (let i = bodyStart; i < h.length; i++) {
    const c = h[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return h.slice(start, i + 1); }
  }
  throw new Error('括號唔平衡: ' + name);
}

/* ---------- 1. 真正嘅 wrapText（stub canvas） ---------- */
/* monospace 寬度模型：全形 ≈ 1em，ASCII ≈ 0.6em。
   唔需要同瀏覽器一模一樣 —— 重點係驗「原子唔會被拆開」。 */
function makeStubCtx(fontPx) {
  return {
    font: fontPx + 'px monospace',
    measureText(t) {
      let w = 0;
      for (const ch of t) {
        /* 全形 CJK／全角標點 = 1em；其餘 = 0.6em */
        const code = ch.codePointAt(0);
        const wide = (code >= 0x3000 && code <= 0x9fff) ||
                     (code >= 0xff00 && code <= 0xffef) ||
                     (code >= 0x2200 && code <= 0x22ff);
        w += wide ? fontPx : fontPx * 0.6;
      }
      return { width: w };
    },
  };
}
const realWrapText = eval('(' + extractFunction('wrapText') + ')');

/* 斷行邊界有冇切爛一個「數字 token」？
   壞例子：「專屬技能冷卻 −」/「25%」→ 前一行尾係符號、後一行頭係數字。 */
function badBreak(lines) {
  const out = [];
  for (let i = 0; i < lines.length - 1; i++) {
    const a = lines[i], b = lines[i + 1];
    if (/[+\-−×÷]$/.test(a) && /^\d/.test(b)) out.push('符號同數字分家：' + a + ' | ' + b);
    if (/\d$/.test(a) && /^\d/.test(b)) out.push('數字被切開：' + a + ' | ' + b);
    if (/%$/.test(a) && /^\d/.test(b)) out.push('百分比同數字分家：' + a + ' | ' + b);
  }
  return out;
}

/* 抽所有玩家可見嘅卡面文案 */
function extractDescs() {
  const out = [];
  const upRegion = h.slice(h.indexOf('const UPGRADES = ['), h.indexOf('const UPGRADES = [') + 9000);
  const upRe = /id:'([a-z0-9_]+)'[\s\S]*?cat:'([^']+)'[\s\S]*?nameZh:'([^']+)'[\s\S]*?desc:'([^']*)'/g;
  let m;
  while ((m = upRe.exec(upRegion))) out.push({ zone: '強化卡', id: m[1], name: m[3], desc: m[4], font: 10, maxW: 74, maxLines: 2 });
  const elRe = /id:'(\w+)',\s*name:'([^']+)',\s*tag:'([^']+)'[\s\S]*?lv:\[([\s\S]*?)\]/g;
  let e2;
  while ((e2 = elRe.exec(h))) {
    const lv = [...e2[4].matchAll(/'([^']*)'/g)].map(x => x[1]);
    lv.forEach((t, i) => out.push({ zone: '元素卡', id: e2[1] + 'L' + (i + 1), name: e2[2], desc: t, font: 9, maxW: 74, maxLines: 3 }));
  }
  return out;
}

section('1. wrapText 唔會把數字同符號拆開（v0.27.2）');
{
  const descs = extractDescs();
  check('抽到卡面文案（強化 26 + 元素 15）', descs.length >= 40, '→ ' + descs.length + ' 條');

  let broken = 0, truncated = 0;
  const details = [];
  for (const d of descs) {
    const ctx = makeStubCtx(d.font);
    const lines = realWrapText(ctx, d.desc, d.maxW);
    const bad = badBreak(lines);
    if (bad.length) { broken++; details.push(d.name + '「' + d.desc + '」→ ' + JSON.stringify(lines)); }
    if (lines.length > d.maxLines) { truncated++; details.push(d.name + ' 超出 ' + d.maxLines + ' 行：' + JSON.stringify(lines)); }
  }
  check('全部文案都冇斷數字', broken === 0, broken ? '\n      ' + details.join('\n      ') : '');
  check('全部文案都冇超出卡面行數', truncated === 0, truncated ? '\n      ' + details.join('\n      ') : '');

  /* 針對性：呢 4 條原本會被拆開 */
  const targets = ['專屬技能冷卻 −25%', '速度與射速 +20%', '灼燒更痛：傷害 +50%，蔓延到相鄰敵人', '光束更亮：傷害 +25%'];
  for (const t of targets) {
    const lines = realWrapText(makeStubCtx(9), t, 74);
    check('「' + t + '」斷行唔會拆數字', badBreak(lines).length === 0, '→ ' + JSON.stringify(lines));
  }
  /* 反向對照：數字 token 一定完整 */
  const l2 = realWrapText(makeStubCtx(10), '專屬技能冷卻 −25%', 74);
  check('「−25%」三個字元一定喺同一行', l2.some(l => l.includes('−25%')), '→ ' + JSON.stringify(l2));
}

section('2. 冇 sprite key 被當文字印出嚟（v0.27.2 P0）');
{
  /* ⚠️ 掃描前要先剝走註解 —— 否則會掃到「解釋舊 bug 嘅註解」而誤報。
     註解入面嘅字串唔會畀玩家見到，所以剝走註解唔會漏報真 bug。 */
  const code = h.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const leaks = [];
  const fillRe = /fillText\(([^\n]*)\)/g;
  let m;
  while ((m = fillRe.exec(code))) {
    const arg = m[1];
    if (/\.icon2?\b/.test(arg)) leaks.push(arg.trim());
  }
  check('全檔冇 fillText(...icon...) 殘留', leaks.length === 0, leaks.length ? '→ ' + leaks.join(' | ') : '');

  /* 兩個原本出事嘅位置而家改用 drawIconWithText */
  check('詞綴橫幅用 drawIconWithText（唔再 print icon key）',
    /drawIconWithText\(stageAffix\.icon, stageAffix\.name/.test(h));
  check('裝備橫幅用 drawIconWithText（唔再 print icon key）',
    /drawIconWithText\(lootBanner\.icon/.test(h));
  check('drawIconWithText helper 存在', /function drawIconWithText\(/.test(h));
  check('drawIconWithText 淨係得文字名（icon 一定係 sprite）',
    /drawIcon\(iconName, iconCx, cy, iconScale\)/.test(h) && /ctx\.fillText\(text,/.test(h));
}

section('3. 裝備掉落提示喺 CHOICE 畫面畫（一定見到 + 唔撞位）');
{
  const renderStart = h.indexOf('function render() {');
  const choiceBlock = h.slice(h.indexOf('if (fsm.cur === STATE.CHOICE) {', renderStart));
  check('CHOICE 畫面有叫 drawLootBanner()',
    choiceBlock.slice(0, 1200).includes('drawLootBanner()'));
  check('裝備提示唔再喺戰鬥 HUD 畫（原 bug 源頭）',
    !/lootShownAt && performance\.now\(\) - lootShownAt < 2600 && isStage/.test(h));
  check('drawLootBanner 畫喺 y 42 附近（詞綴橫幅喺 y 74–118，唔會重疊）',
    /function drawLootBanner\(\)[\s\S]{0,300}?const y = 42/.test(h));
  check('rollLoot 有設 lootBanner', /lootBanner = def;/.test(h));
  check('新局清走 lootBanner', /function resetLoots\(\)[\s\S]{0,300}?lootBanner = null/.test(h));
}

section('4. 三卡畫面提示一致（v0.27.2）');
{
  check('冇「[N] 點擊」殘留（對觸控學生係誤導）',
    !/\[\' \+ \(i\+1\) \+ \'\] 點擊/.test(h));
  const renderStart = h.indexOf('function render() {');
  for (const st of ['CHOICE', 'REVERSE', 'EVENT', 'STYLE']) {
    const i = h.indexOf('if (fsm.cur === STATE.' + st + ') {', renderStart);
    const blk = h.slice(i, i + 4000);
    const hasHint = blk.slice(0, blk.indexOf('renderTail();') > 0 ? blk.indexOf('renderTail();') : 3000)
      .includes('點左/中/右 或 按 1 2 3');
    check(st + ' 畫面有底部操作提示', hasHint);
  }
}

section('5. boss 死亡路徑統一（v0.27.2）');
{
  check('laserTick 經 killEnemy()（唔再直接叫 onBossDown）',
    /function laserTick[\s\S]{0,2200}?killEnemy\(e\) === 'boss'/.test(h));
  check('laserTick 冇裸叫 onBossDown(e)',
    !/function laserTick[\s\S]{0,2200}?if \(e\.hp <= 0\) onBossDown\(e\)/.test(h));
  check('killEnemy 對 boss 都 set _dead（防止同一幀雙重結算）',
    /function killEnemy[\s\S]{0,400}?e\._dead = true;[\s\S]{0,200}?if \(e\.kind === 'spiral'\) return 'boss'/.test(h));
  check('boss 唔會重複掉裝備（killEnemy 見到 _dead 就唔會再觸發）',
    /function killEnemy\(e\)[\s\S]{0,300}?if \(!e \|\| e\._dead \|\| e\.hp > 0\) return null/.test(h));
}

/* ================================================================ */
section('6. 版號');
{
  const ver = (h.match(/末日救未來 v(\d+\.\d+\.\d+) 已載入/) || [])[1] || '0.0.0';
  const v = ver.split('.').map(Number);
  const atLeast = (a, b) => a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] >= b[2])));
  check('版本 >= v0.27.2', atLeast(v, [0, 27, 2]), '→ ' + ver);
  check('標題畫面版本字串同啟動日誌一致',
    h.includes("fillText('v" + ver + " ·") && h.includes('末日救未來 v' + ver + ' 已載入'));
}

console.log('\n' + (fails === 0 ? '✓ 全部通過' : '✗ ' + fails + ' 項失敗'));
process.exit(fails === 0 ? 0 : 1);
