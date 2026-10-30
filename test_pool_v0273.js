/* v0.27.3 強化卡池抽法守門測試
 *
 * 背景（100 萬局蒙地卡羅實測）：原本 `generateChoiceOffer()` 係**全池純隨機**、
 * 逐張抽、可重複 → 一局 12 個卡位只見到 **10.08 / 26 張卡**（38.8%），
 * **6.87% 嘅局一張形態卡都見唔到**、**12.33% 零 tag** ——
 * 呢個就係用戶講「好似無 build concept」嘅真正量化原因。
 *
 * 新抽法（用戶 2026-10-26 明確選咗最激進版 + 玩法卡範圍 14 張）：
 *   ① 只抽本局**未見過**嘅卡 → 12 個卡位全部唔同
 *   ② 玩法卡加權（形態/tag 3 · 生存 2 · 純數值 1）
 *   ③ 保底：每次 boss 強化 3 張卡至少 1 張玩法卡
 *
 * ⚠️ 刻意接受嘅取捨：同一張卡唔會喺同一局出現兩次 → 「疊加」（PLAN #3）
 *    大幅削弱。呢個係用戶已知同接受嘅選擇。
 *
 * 測試方法（同本 repo 一致）：抽出真函數喺 stub 環境實際執行，斷言行為。
 * 詳細抽卡行為測試喺 `test_upgrades.js` §6（已更新成新抽法）。
 */
const fs = require('fs');
const h = fs.readFileSync(__dirname + '/index.html', 'utf8');

let fails = 0;
function check(label, ok, extra) {
  if (!ok) fails++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (extra ? '  ' + extra : ''));
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

/* 抽 UPGRADES 表（真實資料，唔係 mock） */
const tblSrc = h.match(/const UPGRADES = \[[\s\S]*?\n\];/)[0].replace('const UPGRADES =', '');
const UPGRADES = new Function('return ' + tblSrc)();

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

section('1. 玩法卡定義係單一真實來源');
{
  /* ⚠️ 順序有意義：isPlayStyleCard / upgradeWeight 都引用 isOffenseStyleCard，
     所以要先 eval 佢（eval 完嘅自由變數喺 module scope 解析得到）。 */
  const isOffenseStyleCard = eval('(' + extractFunction('isOffenseStyleCard') + ')');
  const isPlayStyleCard = eval('(' + extractFunction('isPlayStyleCard') + ')');
  const style = UPGRADES.filter(isPlayStyleCard);
  check('玩法卡 = 14 張', style.length === 14, '→ ' + style.length);
  check('其中形態 5 張', style.filter(u => u.id.startsWith('form_')).length === 5);
  check('其中 tag 4 張', style.filter(u => u.id.startsWith('tag_')).length === 4);
  check('其中生存 5 張（防禦類）', style.filter(u => u.cat === '防禦').length === 5);
  check('純數值卡 = 12 張', UPGRADES.length - style.length === 12);

  /* ⚠️ 鎖住「唔准出現第二份同義判斷」——
     加權同保底都必須引用同一個定義，唔可以各自寫一套前綴判斷。 */
  const genSrc = extractFunction('generateChoiceOffer');
  check('generateChoiceOffer 用 isPlayStyleCard（唔係自己再判一次）',
    genSrc.includes('isPlayStyleCard'));
  const wSrc = extractFunction('upgradeWeight');
  check('upgradeWeight 引用同一個前綴 helper（唔係自己再判一次）',
    /isOffenseStyleCard\(up\)/.test(wSrc));
  check('upgradeWeight 唔准自己寫 form_/tag_ 前綴字面量',
    !/form_/.test(wSrc) && !/tag_/.test(wSrc));
  const pSrc = extractFunction('isPlayStyleCard');
  check('isPlayStyleCard 引用同一個前綴 helper',
    /isOffenseStyleCard\(up\)/.test(pSrc));
  check('isPlayStyleCard 唔准自己寫 form_/tag_ 前綴字面量',
    !/form_/.test(pSrc) && !/tag_/.test(pSrc));
  const oSrc = extractFunction('isOffenseStyleCard');
  check('isOffenseStyleCard 先定義 form_/tag_ 前綴（唯一真實來源）',
    /form_/.test(oSrc) && /tag_/.test(oSrc));
  /* ⚠️ 鎖住「加權同保底用同一個定義」——
     行為驗證：權重 > 1 ⟺ 玩法卡（如果兩套定義漂移，呢條就會 fail）。 */
  const upgradeWeight = eval('(' + extractFunction('upgradeWeight') + ')');
  const mismatch = UPGRADES.filter(u => (upgradeWeight(u) > 1) !== isPlayStyleCard(u));
  check('加權同玩法卡定義一致（權重>1 ⟺ 玩法卡，26 張逐張驗）',
    mismatch.length === 0, mismatch.length ? mismatch.map(u => u.id).join(',') : '');
  check('形態/tag 權重 3 · 生存權重 2 · 純數值權重 1',
    UPGRADES.filter(u => u.id.startsWith('form_')).every(u => upgradeWeight(u) === 3) &&
    UPGRADES.filter(u => u.id.startsWith('tag_')).every(u => upgradeWeight(u) === 3) &&
    UPGRADES.filter(u => u.cat === '防禦').every(u => upgradeWeight(u) === 2) &&
    UPGRADES.filter(u => !isPlayStyleCard(u)).every(u => upgradeWeight(u) === 1));
}

section('2. 三個抽卡規則都在');
{
  const genSrc = extractFunction('generateChoiceOffer');
  check('① 只抽本局未見過嘅卡', /seenUpgradeIds\.has\(u\.id\)/.test(genSrc));
  check('② 玩法卡加權（用 pickWeightedIndex，唔係純 random）',
    /pickWeightedIndex/.test(genSrc) && !/Math\.floor\(Math\.random\(\) \* pool\.length\)/.test(genSrc));
  check('③ 保底：3 張至少 1 張玩法卡', /out\.some\(isPlayStyleCard\)/.test(genSrc) && /out\[2\] =/.test(genSrc));
  check('保底有邊界 fallback（池抽乾唔會靜靜失效）',
    /if \(!stylePool\.length\) stylePool = eligible\.filter\(isPlayStyleCard\)/.test(genSrc));
  check('被保底替換走嘅卡唔算已出現（玩家見唔到佢）',
    /for \(const u of out\) seenUpgradeIds\.add\(u\.id\)/.test(genSrc));
}

section('3. 「已見過」清單唔跨局');
{
  check('新局（揀機）清 seenUpgradeIds', /seenUpgradeIds\.clear\(\)/.test(h));
  check('clear 出現至少兩處（揀機 + resetRunFresh）',
    (h.match(/seenUpgradeIds\.clear\(\)/g) || []).length >= 2);
  check('seenUpgradeIds 係 Set（用 has() 查）', /let seenUpgradeIds = new Set\(\)/.test(h));
}

section('4. 變體 D：一局只出一次形態卡（PLAN #124 · v0.33.0）');
{
  /* ⚠️ v0.28.0 原本呢度測「轉職」標籤（isFormTransferCard）。
     v0.33.0 #124 變體 D（一局只出一次形態卡）之後：
       ① 玩家永遠只會有一張形態卡 → 「轉職」標籤**永遠唔會出現** = 死代碼 → 連帶移除
       ② 持有形態卡之後，之後嘅 boss 唔再出任何 form_*（卡池層面，唔係「唔揀就唔算」） */
  check('★ isFormTransferCard helper 已移除（變體 D 之下係死代碼）',
    !/function isFormTransferCard\(/.test(h));
  check('★ 卡面冇畫「轉職」黃色標籤', !/fillText\('轉職'/.test(h));
  check('★ hasFormCard helper 存在', /function hasFormCard\(\)/.test(h));

  /* ⚠️ eval 真函數喺測試檔 scope（AI_INSTRUCTIONS.md §5.1.1）——
     generateChoiceOffer() 依賴：UPGRADES / seenUpgradeIds / playerStacks /
     hasFormCard / isPlayStyleCard / upgradeWeight / pickWeightedIndex。 */
  const seenUpgradeIds = new Set();
  const playerStacks = Object.create(null);
  const isOffenseStyleCard = eval('(' + extractFunction('isOffenseStyleCard') + ')');
  const isPlayStyleCard = eval('(' + extractFunction('isPlayStyleCard') + ')');
  const upgradeWeight = eval('(' + extractFunction('upgradeWeight') + ')');
  const pickWeightedIndex = eval('(' + extractFunction('pickWeightedIndex') + ')');
  const hasFormCard = eval('(' + extractFunction('hasFormCard') + ')');
  const gen = eval('(' + extractFunction('generateChoiceOffer') + ')');
  const genSrc = extractFunction('generateChoiceOffer');

  /* ① 未持有形態 → 形態卡仍然會出現（唔會變成「永遠冇形態」嘅死規則） */
  let withForm = 0;
  for (let i = 0; i < 400; i++) {
    if (gen().some(u => u.id.startsWith('form_'))) withForm++;
  }
  check('未持有形態時，形態卡仍然會出現（唔會變成永遠冇形態）', withForm > 0, withForm + '/400 次有');

  /* ② 已持有形態 → 之後所有 offer 都唔可以有 form_*（包括保底 fallback） */
  playerStacks.form_laser = 1;
  let leak = 0;
  for (let i = 0; i < 400; i++) {
    if (gen().some(u => u.id.startsWith('form_'))) leak++;
  }
  check('★ 已持有形態後，之後 400 次抽卡零 form_* 漏出', leak === 0, leak + ' 次漏出');

  /* ③ 四條路徑都要過濾（只改一條會漏） */
  check('★ 主池 + 池抽乾 fallback + 最後防線 + 保底 fallback 全部用合資格池',
    /const eligible = UPGRADES\.filter\(u => !isBlockedForm\(u\)\)/.test(genSrc) &&
    /const pool = \(unseen\.length \? unseen : eligible\)/.test(genSrc) &&
    /const rest = eligible\.filter\(u => !usedIds\.has\(u\.id\)\)/.test(genSrc) &&
    /const spare = eligible\.length \? eligible : UPGRADES/.test(genSrc) &&
    /eligible\.filter\(isPlayStyleCard\)/.test(genSrc));

  /* ④ 傳說級（單次逆轉）唔可以出形態卡 = 零效果死卡（mod 寫死 shotForm） */
  const boSrc = extractFunction('buildReverseOffer');
  check('★ buildReverseOffer 排除 form_*（傳說級形態卡 = 零效果死卡）',
    (boSrc.match(/indexOf\('form_'\)/g) || []).length >= 3);
}

section('5. 版號');
{
  const ver = (h.match(/末日救未來 v(\d+\.\d+\.\d+) 已載入/) || [])[1] || '0.0.0';
  const v = ver.split('.').map(Number);
  const atLeast = (a, b) => a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] >= b[2])));
  check('版本 >= v0.27.3', atLeast(v, [0, 27, 3]), '→ ' + ver);
  /* v0.28.0：形態卡死卡修正併入同一個 release（PLAN #110/#111/#112） */
  check('版本 >= v0.28.0', atLeast(v, [0, 28, 0]), '→ ' + ver);
  check('標題畫面版本字串同啟動日誌一致',
    h.includes("fillText('v" + ver + " ·") && h.includes('末日救未來 v' + ver + ' 已載入'));
}

console.log('\n' + (fails === 0 ? '✓ 全部通過' : '✗ ' + fails + ' 項失敗'));
process.exit(fails === 0 ? 0 : 1);
