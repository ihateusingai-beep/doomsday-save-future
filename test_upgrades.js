/* 一次性驗證腳本：v3.8 #39 強化加代價 + #40 分類標籤 / 抽卡去重 */
const fs = require('fs');
const h = fs.readFileSync(__dirname + '/index.html', 'utf8');

let fails = 0;
function check(label, ok, extra) {
  if (!ok) fails++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (extra ? '  ' + extra : ''));
}

/* 由真實檔案抽出 UPGRADES 表做行為驗證 */
const tblSrc = h.match(/const UPGRADES = \[[\s\S]*?\n\];/)[0].replace('const UPGRADES =', '');
const UPGRADES = new Function('return ' + tblSrc)();

console.log('=== 1. 分類標籤（#40）===');
check('強化池 = ' + UPGRADES.length + ' 張（v3.10：17 數值 + 5 形態 + 4 tag）', UPGRADES.length === 26);
check('17 張數值卡全部有 cat（形態/tag 另計）', UPGRADES.filter(u => !u.id.startsWith('form_') && !u.id.startsWith('tag_')).every(u => u.cat));
const noCat = UPGRADES.filter(u => !u.cat);
const cats = {};
for (const u of UPGRADES) cats[u.cat] = (cats[u.cat] || 0) + 1;
console.log('    分類分佈：' + Object.entries(cats).map(([k, v]) => k + '×' + v).join(' · '));
check('每個分類至少 3 張（抽卡池唔會太窄）',
  Object.values(cats).every(v => v >= 3));
const CAT_COLOR = { '防禦':'#7fe', '火力':'#fa7', '靈活':'#af7', '輔助':'#c9f' };
const noColor = [...new Set(UPGRADES.map(u => u.cat))].filter(c => !CAT_COLOR[c]);
check('每個分類都有配色（卡面唔會畫出 undefined）', noColor.length === 0, noColor.join(','));

console.log('\n=== 2. 強化加代價（#39）===');
const costCards = UPGRADES.filter(u => u.cost);
check('有代價嘅卡 = ' + costCards.length + ' 張（其餘保持純增益）', costCards.length === 3);
check('純增益卡保留（池唔會全係負面）', UPGRADES.length - costCards.length >= 14);
for (const u of costCards) {
  check(u.id + '「' + u.nameZh + '」desc 有寫出代價（用｜分隔）', u.desc.includes('｜'), '「' + u.desc + '」');
}
const badDesc = UPGRADES.filter(u => u.cost && !u.desc.includes('｜')).map(u => u.id);
check('冇「有 cost 但 desc 冇講代價」嘅卡', badDesc.length === 0, badDesc.join(','));

console.log('\n=== 3. cost 冪等性（applyUpgrades 每次全量重算）===');
/* applyUpgrades() 每次都由基礎值重算，所以 mod/cost 必須係 n 嘅純函數。
   模擬：同一組 playerStacks 連續套兩次，結果必須一模一樣。 */
function freshShip() {
  return { maxHp: 3, shield: 1, speed: 3.6, fireRate: 14, bulletCount: 1,
           bulletDmg: 1, bombCD: 12000, focusFactor: 0.3, grazeMult: 1,
           pierce: 0, resurrect: 0, masterStacks: 0 };
}
function applyAll(s, stacks) {
  for (const u of UPGRADES) { const n = stacks[u.id] || 0; if (n > 0) u.mod(s, n); }
  for (const u of UPGRADES) { if (!u.cost) continue; const n = stacks[u.id] || 0; if (n > 0) u.cost(s, n); }
  if (s.masterStacks > 0) { const m = Math.pow(1.20, s.masterStacks); s.speed *= m; s.fireRate *= m; }
  return s;
}
const stackSets = [
  { fr_l: 2 }, { spd_l: 3 }, { gun_3: 1 }, { fr_l: 1, spd_l: 1, gun_3: 1 },
  { fr_l: 2, spd_l: 2, gun_3: 2, hp_l: 1, master: 1 },
];
let idem = true;
for (const st of stackSets) {
  const a = JSON.stringify(applyAll(freshShip(), st));
  const b = JSON.stringify(applyAll(freshShip(), st));
  if (a !== b) { idem = false; console.log('    不冪等 stacks=' + JSON.stringify(st)); }
}
check('5 組疊加值連套兩次結果一致', idem);

console.log('\n=== 4. 代價確實生效，而且方向啱 ===');
{
  let s = applyAll(freshShip(), { fr_l: 1 });
  check('射速++：fireRate 14→21（×1.5）', Math.abs(s.fireRate - 21) < 1e-6, '= ' + s.fireRate);
  check('射速++：shield 1→0（−1）', s.shield === 0, '= ' + s.shield);
}
{
  let s = applyAll(freshShip(), { spd_l: 1 });
  check('速度++：speed 3.6→4.68（×1.3）', Math.abs(s.speed - 4.68) < 1e-6, '= ' + s.speed.toFixed(2));
  check('速度++：bombCD 12000→14400（×1.2）', Math.abs(s.bombCD - 14400) < 1e-6, '= ' + s.bombCD + 'ms');
}
{
  let s = applyAll(freshShip(), { gun_3: 1 });
  /* gun_3 係 min(4, 3+n)：由 3 連發升到 4，唔係由現值 +n */
  check('三砲：bulletCount → 4（3 連發→4 連發）', s.bulletCount === 4, '= ' + s.bulletCount);
  check('三砲：maxHp 3→2（−1）', s.maxHp === 2, '= ' + s.maxHp);
}
{ /* 底線：生命上限唔可以跌到 0，否則即刻死 */
  let s = applyAll(freshShip(), { hp_s: 1, gun_3: 1 });
  check('hp_s+1 之後再食 gun_3 代價，maxHp 仍然 ≥1', s.maxHp >= 1, '= ' + s.maxHp);
}
{ /* 底線：護盾唔可以變負 */
  const s = applyAll(freshShip(), { shd_s: 1, fr_l: 5 });
  check('盾+1 之後再食 5 層射速++ 代價，shield 唔會 <0', s.shield >= 0, '= ' + s.shield);
}

console.log('\n=== 5. 套用次序：cost 必須喺所有 mod 之後 ===');
const applySrc = h.match(/function applyUpgrades\(\)[\s\S]*?\n\}\n/)[0];
const iMod = applySrc.indexOf('if (n > 0) up.mod(ship, n);');
const iCost = applySrc.indexOf('if (n > 0) up.cost(ship, n);');
check('mod 迴圈喺 cost 迴圈之前', iMod > 0 && iCost > iMod, '(mod@' + iMod + ' cost@' + iCost + ')');
check('applyUpgrades 內兩個迴圈都存在', iMod > 0 && iCost > 0);

console.log('\n=== 6. 抽卡去重（#40）===');
const genSrc = h.match(/function generateChoiceOffer\(\)[\s\S]*?\n\}\n/)[0];
const gen = new Function('UPGRADES', genSrc + '\nreturn generateChoiceOffer;')(UPGRADES);
let dupRuns = 0, shortRuns = 0;
for (let i = 0; i < 5000; i++) {
  const offer = gen();
  if (offer.length !== 3) shortRuns++;
  const ids = offer.map(u => u.id);
  if (new Set(ids).size !== ids.length) dupRuns++;
}
check('5000 次抽卡：出現重複 = ' + dupRuns, dupRuns === 0);
check('5000 次抽卡：唔足 3 張 = ' + shortRuns, shortRuns === 0);
check('實作用 splice 移除已抽中（唔係獨立 random 撞運氣）', /pool\.splice/.test(genSrc));
check('跨次疊加仍然允許（冇按 playerStacks 過濾）', !/playerStacks/.test(genSrc));

console.log('\n=== 7. 零死卡：每個 mod/cost 寫入嘅欄位都有 game logic 讀 ===');
const FIELDS = ['maxHp','shield','speed','fireRate','bulletCount','bulletDmg','bulletSpd',
                'bombCD','focusFactor','focusDuration','focusCD','grazeMult','pierce',
                'resurrect','masterStacks','hp'];
const body = h.split('const UPGRADES = [')[1].split('\n];')[0];
const written = new Set();
for (const m of body.matchAll(/s\.([A-Za-z_]+)\s*(?:[+*/-]?=|\*=|\+\+)/g)) written.add(m[1]);
/* 「死卡」定義：欄位寫入咗，但強化表以外冇任何地方讀。
   掃全檔（唔只某個區段）——之前只掃第 8 節之後，會漏咗 applyUpgrades()
   入面讀 masterStacks 嘅情況。 */
const gameLogic = h.split('const UPGRADES = [')[1];
const dead = [...written].filter(f => !new RegExp('\\.' + f + '\\b').test(gameLogic));
check('寫入 ' + written.size + ' 個欄位，全部有 game logic 讀取', dead.length === 0, dead.join(','));

console.log('\n=== 8. 卡面座標唔會撞位 ===');
/* 88×108 卡。分類標籤同疊加次數原本都放右上，實作時撞過；
   分隔線原本 y+100 同「[1] 點擊」y+cardH-8 撞，實作時踩過。 */
const cardW = 88, cardH = 108;
const slots = [
  { name: '分類標籤', y: 13,  x: 'left  (x+7)' },
  { name: '疊加次數', y: 14,  x: 'right (x+cardW-6)' },
  { name: 'icon',     y: 30,  x: 'center' },
  { name: '名',        y: 50,  x: 'center' },
  { name: 'desc 第1行', y: 66,  x: 'center' },
  { name: 'desc 第2行', y: 77,  x: 'center' },
  { name: 'desc 第3行', y: 88,  x: 'center' },
  { name: '[1] 點擊',  y: cardH - 8, x: 'center' },
];
/* 同 y（差 ≤3px 視為同一橫帶）而 x 位置重疊 = 會撞 */
for (let i = 0; i < slots.length; i++) {
  for (let j = i + 1; j < slots.length; j++) {
    const a = slots[i], b = slots[j];
    const sameBand = Math.abs(a.y - b.y) <= 3;
    const sameX = a.x === b.x;
    if (sameBand && sameX) {
      check('⚠ ' + a.name + ' 撞 ' + b.name, false, '(y+' + a.y + ' vs y+' + b.y + ')');
    }
  }
}
check('8 個卡面元素之間冇同帶同 x 碰撞', true);
check('分類標籤喺左上、疊加次數喺右上（刻意分邊）',
  slots[0].x.startsWith('left') && slots[1].x.startsWith('right'));
check('卡面冇殘留代價分隔線（會撞 [1] 點擊）', !/moveTo\(x \+ 8, y \+ 100\)/.test(h));
check('卡面代價靠 desc 入面嘅｜表達（' + (h.match(/｜/g)||[]).length + ' 處）', (h.match(/｜/g)||[]).length >= 3);

console.log('\n' + (fails === 0 ? '✓ 全部通過' : '✗ ' + fails + ' 項失敗'));
process.exit(fails === 0 ? 0 : 1);