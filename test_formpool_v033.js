/* v0.33.0 #124 變體 D（一局只出一次形態卡）守門測試
 *
 * 背景（MECHANICS_REVIEW_v032.md §2 P0-2，實測 20 萬局 × 3 玩家模型）：
 *   一局 4 個強化卡位，但每局平均揀 2.00 張形態卡 → 局末只剩 0.97 張 →
 *   **浪費 1.02 個卡位（25.5%）**（每張形態卡流失 20.4–20.7%）。
 *   → 玩家對卡位數量冇控制權，build 變得單薄。
 *
 * 修正（PLAN #124）：玩家持有形態卡之後，之後嘅 boss **唔再出任何 form_***
 *   （卡池層面，唔係「唔揀就唔算」）。四條抽卡路徑要一齊過濾：
 *   ① 主池 ② 池抽乾 fallback ③ 全池用盡嘅最後防線 ④ 保底玩法卡 fallback。
 *
 * 連帶（死代碼，記憶 §13 F5）：
 *   ① isFormTransferCard() + 卡面「轉職」黃色標籤 → 變體 D 之下永遠唔會出現
 *   ② buildReverseOffer() 要排除 form_* → 傳說級形態卡嘅 mod 寫死 shotForm = X，
 *      再行一次都係同一個值 = **零效果死卡**
 *
 * 驗收線（PLAN #124 凍結）：有效卡數 ≥3.8 · 浪費卡位 ≤0.2 · 有形態卡嘅局 ≥90%
 */
const fs = require('fs');
const h = fs.readFileSync(__dirname + '/index.html', 'utf8');

let fails = 0;
function check(label, ok, extra) {
  if (!ok) fails++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (extra ? '  ' + extra : ''));
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

/* 抽真實資料（唔係 mock） */
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

section('1. 結構：helper + 死代碼移除');
{
  check('★ isFormTransferCard helper 已移除', !/function isFormTransferCard\(/.test(h));
  check('★ 卡面冇畫「轉職」黃色標籤', !/fillText\('轉職'/.test(h));
  check('hasFormCard helper 存在', /function hasFormCard\(\)/.test(h));
  const genSrc = extractFunction('generateChoiceOffer');
  check('★ 主池用合資格池（剔走 form_*）',
    /const eligible = UPGRADES\.filter\(u => !isBlockedForm\(u\)\)/.test(genSrc));
  check('★ 池抽乾 fallback 用合資格池',
    /const rest = eligible\.filter\(u => !usedIds\.has\(u\.id\)\)/.test(genSrc));
  check('★ 最後防線用合資格池',
    /const spare = eligible\.length \? eligible : UPGRADES/.test(genSrc));
  check('★ 保底玩法卡 fallback 用合資格池',
    /eligible\.filter\(isPlayStyleCard\)/.test(genSrc));
  const boSrc = extractFunction('buildReverseOffer');
  check('★ buildReverseOffer 排除 form_*（傳說級形態 = 零效果死卡）',
    (boSrc.match(/indexOf\('form_'\)/g) || []).length >= 3);
  check('★ 互斥清走邏輯保留做安全網（唔會兩張形態卡同時生效）',
    /delete playerStacks\[id\]/.test(h));
}

section('2. 行為：抽卡池真係唔會再出第二張形態卡');
{
  /* ⚠️ AI_INSTRUCTIONS.md §5.1.1：依賴要 eval 返去測試檔 scope */
  const seenUpgradeIds = new Set();
  const playerStacks = Object.create(null);
  const isOffenseStyleCard = eval('(' + extractFunction('isOffenseStyleCard') + ')');
  const isPlayStyleCard = eval('(' + extractFunction('isPlayStyleCard') + ')');
  const upgradeWeight = eval('(' + extractFunction('upgradeWeight') + ')');
  const pickWeightedIndex = eval('(' + extractFunction('pickWeightedIndex') + ')');
  const hasFormCard = eval('(' + extractFunction('hasFormCard') + ')');
  const gen = eval('(' + extractFunction('generateChoiceOffer') + ')');

  check('hasFormCard：冇持有 → false', hasFormCard() === false);
  playerStacks.tag_home = 1;
  check('hasFormCard：只有 tag → false（唔會把 tag 當形態）', hasFormCard() === false);
  playerStacks.form_rail = 1;
  check('hasFormCard：持有形態 → true', hasFormCard() === true);

  /* 未持有形態 → 形態卡仍然可以出現（唔會變成「永遠冇形態」嘅死規則） */
  seenUpgradeIds.clear();
  for (const k of Object.keys(playerStacks)) delete playerStacks[k];
  let withForm = 0;
  for (let i = 0; i < 500; i++) if (gen().some(u => u.id.startsWith('form_'))) withForm++;
  check('未持有形態時，形態卡仍然會出現', withForm > 0, withForm + '/500 次有');

  /* 已持有形態 → 之後所有 offer 都零 form_（包括保底 fallback） */
  playerStacks.form_laser = 1;
  let leak = 0;
  for (let i = 0; i < 500; i++) if (gen().some(u => u.id.startsWith('form_'))) leak++;
  check('★ 已持有形態後，500 次抽卡零 form_* 漏出', leak === 0, leak + ' 次漏出');
}

section('3. 蒙地卡羅：有效卡位 / 浪費卡位 / 有形態嘅局');
{
  /* ⚠️ 用真 generateChoiceOffer（eval 落測試檔 scope）——
     唔可以自己重寫一份（記憶 §「蒙地卡羅重寫真 function 要驗等價」）。 */
  const seenUpgradeIds = new Set();
  const playerStacks = Object.create(null);
  const isOffenseStyleCard = eval('(' + extractFunction('isOffenseStyleCard') + ')');
  const isPlayStyleCard = eval('(' + extractFunction('isPlayStyleCard') + ')');
  const upgradeWeight = eval('(' + extractFunction('upgradeWeight') + ')');
  const pickWeightedIndex = eval('(' + extractFunction('pickWeightedIndex') + ')');
  const hasFormCard = eval('(' + extractFunction('hasFormCard') + ')');
  const gen = eval('(' + extractFunction('generateChoiceOffer') + ')');

  const SLOTS = 4;                    /* 一局 4 個強化卡位（S1–S4 boss） */
  const MODELS = {
    /* 學生模型：貪玩法卡（form > tag > 防禦 > 數值），同報告一致 */
    '學生（貪玩法卡）': (offer) => {
      const i = offer.findIndex(u => u.id.startsWith('form_'));
      if (i >= 0) return i;
      const j = offer.findIndex(u => u.id.startsWith('tag_'));
      if (j >= 0) return j;
      const k = offer.findIndex(isPlayStyleCard);
      return k >= 0 ? k : 0;
    },
    /* 隨機模型 */
    '隨機': (offer) => Math.floor(Math.random() * offer.length),
    /* 保守模型：永遠揀第一張 */
    '保守（永遠第一張）': () => 0,
  };

  const RUNS = 20000;
  for (const [name, pick] of Object.entries(MODELS)) {
    let eff = 0, waste = 0, hasForm = 0, formN = 0, tagN = 0, numN = 0;
    for (let r = 0; r < RUNS; r++) {
      seenUpgradeIds.clear();
      for (const k of Object.keys(playerStacks)) delete playerStacks[k];
      let e = 0, w = 0, f = 0, t = 0, n = 0, gotForm = false;
      for (let slot = 0; slot < SLOTS; slot++) {
        const offer = gen();
        if (!offer.length) break;
        const up = offer[Math.min(pick(offer), offer.length - 1)];
        const isForm = up.id.startsWith('form_');
        /* 浪費定義：呢個卡位揀咗一張「唔會帶嚟新效果」嘅卡
           （變體 D 之下 = 揀咗一張形态卡但玩家已經持有形態 → 頂走舊嗰張） */
        if (isForm && hasFormCard()) { w++; }
        else { e++; }
        if (isForm) { f++; gotForm = true; }
        else if (up.id.startsWith('tag_')) t++;
        else n++;
        playerStacks[up.id] = (playerStacks[up.id] || 0) + 1;
      }
      eff += e; waste += w; formN += f; tagN += t; numN += n;
      if (gotForm) hasForm++;
    }
    const effAvg = eff / RUNS, wasteAvg = waste / RUNS, formPct = hasForm / RUNS * 100;
    console.log(`  ${name}：有效卡 ${effAvg.toFixed(2)} · 浪費 ${wasteAvg.toFixed(2)} · 形態 ${(formN / RUNS).toFixed(2)} · tag ${(tagN / RUNS).toFixed(2)} · 數值 ${(numN / RUNS).toFixed(2)} · 有形態嘅局 ${formPct.toFixed(1)}%`);
    check(`★ ${name}：有效卡數 ≥3.8`, effAvg >= 3.8, effAvg.toFixed(3));
    check(`★ ${name}：浪費卡位 ≤0.2`, wasteAvg <= 0.2, wasteAvg.toFixed(3));
    /* ⚠️ 「有形態卡嘅局」嘅門檻**分模型**：
       學生模型（目標受眾：貪玩法卡）→ ≥90%（同 MECHANICS_REVIEW_v032.md §2 變體 D 嘅 97.3% 同量級）；
       隨機／保守模型玩家本身唔特別想要形態卡 → 只要求 ≥70%（防止形態卡**完全唔出現**嘅回退）。
       ⚠️ 唔可以將三個模型用同一個門檻 —— 隨機玩家 75.6% 係**正常**（佢就係隨機揀）。 */
    const minFormPct = (name === '學生（貪玩法卡）') ? 90 : 70;
    check(`★ ${name}：有形態卡嘅局 ≥${minFormPct}%`, formPct >= minFormPct, formPct.toFixed(1) + '%');
    if (name === '學生（貪玩法卡）') {
      check(`★ ${name}：形態卡平均揀到 ≈1 張（唔係 0 張 = 玩法消失）`,
        formN / RUNS >= 0.8 && formN / RUNS <= 1.2, (formN / RUNS).toFixed(3));
    }
  }
}

section('4. 版號 + PLAN 條目');
{
  const ver = (h.match(/末日救未來 v(\d+\.\d+\.\d+) 已載入/) || [])[1] || '0.0.0';
  const v = ver.split('.').map(Number);
  check('版本 >= v0.33.0', v[0] > 0 || v[1] > 33 || (v[1] === 33 && v[2] >= 0), '→ ' + ver);
  const plan = fs.readFileSync(__dirname + '/PLAN.md', 'utf8');
  check('PLAN 有 #124 變體 D 條目', /\| 124 \|.*變體 D/.test(plan));
}

console.log('\n' + (fails === 0 ? '✓ 全部通過' : '✗ ' + fails + ' 項失敗'));
process.exit(fails === 0 ? 0 : 1);
