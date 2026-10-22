/* 一次性驗證腳本：v3.8 #46 單次逆轉 */
const fs = require('fs');
const h = fs.readFileSync(__dirname + '/index.html', 'utf8');

let fails = 0;
function check(label, ok, extra) {
  if (!ok) fails++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (extra ? '  ' + extra : ''));
}
const grab = (re) => { const m = h.match(re); if (!m) throw new Error('抽唔到'); return m[0]; };

console.log('=== 1. 傳說級機制（= 額外多行一次 mod）===');
check('有 legendary 狀態（id → true）', /let legendary = Object\.create\(null\);/.test(h));
/* ⚠️ 關鍵：傳說級必須擺喺「普通 mod 之後、cost 之前」 */
const applyBlock = grab(/function applyUpgrades\(\)[\s\S]*?\n\}/);
const modAt   = applyBlock.indexOf('up.mod(ship, n)');
const legAt   = applyBlock.indexOf('if (legendary[up.id]) up.mod(ship, 1);');
const costAt  = applyBlock.indexOf('up.cost(ship, n)');
check('傳說級 mod 存在', legAt > 0);
check('次序：普通 mod → 傳說級 mod → cost', modAt > 0 && legAt > modAt && costAt > legAt,
  '普通 @' + modAt + ' < 傳說 @' + legAt + ' < cost @' + costAt);
check('傳說級用 mod(ship, 1)（額外一份，唔係取代）', /if \(legendary\[up\.id\]\) up\.mod\(ship, 1\);/.test(h));

console.log('\n=== 2. 候選生成（PLAN：系統直接挑 3 個，唔使玩家判斷邊件最弱）===');
check('buildReverseOffer() 存在', /function buildReverseOffer\(\)/.test(h));
const bo = grab(/function buildReverseOffer\(\)[\s\S]*?\n\}/);
check('優先抽玩家持有嘅強化', /const owned = UPGRADES\.filter\(u => \(playerStacks\[u\.id\] \|\| 0\) > 0/.test(bo));
check('唔夠就補未持有嘅（唔會開天窗）', /const rest\s+=\s*UPGRADES\.filter/.test(bo) && /take\(rest\)/.test(bo));
check('排除已經係傳說級嘅（唔會重複升級）', /!legendary\[u\.id\]/.test(bo));
check('永遠 output 3 個（保底唔會空畫面）', /while \(out\.length < 3\)/.test(bo));
check('候選不重複（同一次三選一內）', (() => {
  /* 模擬：owned + rest 係互斥分割，splice 抽唔會重複 */
  const src = bo.replace(/\s+/g, ' ');
  return /const owned = UPGRADES\.filter\(u => \(playerStacks\[u\.id\] \|\| 0\) > 0 && !legendary\[u\.id\]\);\s*const rest\s*= UPGRADES\.filter\(u => !\(playerStacks\[u\.id\] > 0\) && !legendary\[u\.id\]\);/.test(src);
})());

console.log('\n=== 3. 一局只有一次 ===');
check('reverseUsed 旗標存在', /let reverseUsed\s+= false;/.test(h));
const REVERSE_STAGE = new Function('return ' + grab(/const REVERSE_STAGE = \d+;/).replace('const REVERSE_STAGE =', ''))();
check('REVERSE_STAGE = 5（#47 排程：S5 出場）', REVERSE_STAGE === 5, 'S' + REVERSE_STAGE);
check('觸發條件 = 未用過 + S5', /if \(!reverseUsed && lastStage === REVERSE_STAGE\)/.test(h));
check('揀完即 reverseUsed = true', /reverseUsed = true;/.test(h));
check('觸發後 return（唔會即刻 spawn boss）', /enterReverse\(\);\s*\n\s*return;/.test(h));
check('enterReverse 喺 spawnBossFor 之前', (() => {
  const i = h.indexOf('if (!reverseUsed && lastStage === REVERSE_STAGE)');
  const j = h.indexOf('spawnBossFor(lastStage);', i);
  return i > 0 && j > i;
})());
check('resetRunFresh 重置 reverseUsed', /resetRunFresh\(\)[\s\S]*?reverseUsed = false;/.test(h));

console.log('\n=== 4. boss 出場前暫停 / 恢復（唔可以重置戰場）===');
check('enterReverse() 記 fsm.prev', /function enterReverse\(\)[\s\S]*?fsm\.prev = fsm\.cur/.test(h));
check('resumeReverse() 繞過 fsm.set()', /function resumeReverse\(\)[\s\S]*?fsm\.cur = resumeTo/.test(h) &&
  !/function resumeReverse\(\)[\s\S]{0,700}fsm\.set\(STATE/.test(h));
check('enterReverse beginFreezeClocks()', /function enterReverse\(\)[\s\S]*?beginFreezeClocks\(\)/.test(h));
check('resumeReverse endFreezeClocks()', /function resumeReverse\(\)[\s\S]*?endFreezeClocks\(\)/.test(h));
check('暫停停 BGM / 恢復重開 BGM',
  /function enterReverse\(\)[\s\S]*?Bgm\.setPlaying\(false\)/.test(h) &&
  /function resumeReverse\(\)[\s\S]*?Bgm\.setPlaying\(audioOn\)/.test(h));

console.log('\n=== 5. 應用流程 ===');
check('applyPickedReverse() 存在', /function applyPickedReverse\(idx\)/.test(h));
check('揀完設 legendary[id] = true', /legendary\[up\.id\] = true;/.test(h));
check('揀完即刻 applyUpgrades()（效果即時生效）', /function applyPickedReverse[\s\S]*?applyUpgrades\(\)/.test(h));
check('applyUpgrades 會補返血量（傳說 hp 唔會令血唔滿）',
  /if \(ship\.hp < ship\.maxHp\) ship\.hp = ship\.maxHp;/.test(h));
check('傳說級唔會令護盾變負（cost 之後有夾）', /if \(ship\.shield < 0\) ship\.shield = 0;/.test(h));

console.log('\n=== 6. 生命周期（唔跨局 / 零持久）===');
check('resetRunFresh 清 legendary', /resetRunFresh\(\)[\s\S]*?legendary = Object\.create\(null\)/.test(h));
check('resetRunFresh 清 reverseOffer / reversePicked', /reverseOffer = \[\];[\s\S]*?reversePicked = -1;/.test(h));
const lsCalls = [...h.matchAll(/lsWrite\([^)]*\)|lsRead\([^)]*\)/g)].map(m => m[0]).join(' ');
check('legendary 唔入 localStorage（零持久）', !/legendary|reverseUsed/.test(lsCalls));

console.log('\n=== 7. UI 接線 ===');
check('STATE.REVERSE 已加入列舉', /REVERSE:\s+'REVERSE'/.test(h));
check('STATE_LABEL 有 REVERSE', /REVERSE:\s+'單次逆轉'/.test(h));
check('onStateEnter 有 REVERSE 分支（buildReverseOffer）', /s === STATE\.REVERSE\)[\s\S]{0,200}buildReverseOffer\(\)/.test(h));
check('render 有 REVERSE 繪圖分支', /fsm\.cur === STATE\.REVERSE\)[\s\S]{0,80}choiceLayout\(\)/.test(h));
check('REVERSE 分支有 renderTail()', /STATE\.REVERSE\)[\s\S]{0,5000}?renderTail\(\);/.test(h));
check('指標點擊有 REVERSE 處理', /fsm\.cur === STATE\.REVERSE\)[\s\S]{0,140}hitReverseCard/.test(h));
check('鍵盤 1/2/3 有 REVERSE 處理', /fsm\.cur === STATE\.REVERSE\)[\s\S]{0,220}applyPickedReverse/.test(h));
check('hitReverseCard 存在', /function hitReverseCard/.test(h));
check('背景 stage 包含 REVERSE', /fsm\.cur === STATE\.REVERSE/.test(h));

console.log('\n=== 8. 行為驗證：傳說級真係令數值變雙 ===');
/* 用真 UPGRADES mod 驗：持有 n 次 vs 傳說級效果 */
const UP_SRC = grab(/const UPGRADES = \[[\s\S]*?\n\];/).replace('const UPGRADES =', '');
const UPS = new Function('return ' + UP_SRC)();
check('UPGRADES 抽到 ' + UPS.length + ' 張', UPS.length === 17);
let doubled = 0, total = 0;
for (const up of UPS) {
  if (!up.mod) continue;
  // 測試：持有 1 次 vs 1 次 + 傳說 1 次
  const a = { ship: { bulletDmg: 1, fireRate: 10, speed: 3, maxHp: 3, shield: 2, bulletCount: 1, bombCD: 100, focusFactor: 0.3, grazeMult: 1, pierce: 0, resurrect: 0, masterStacks: 0, hp: 3 } };
  const s1 = Object.assign({}, a.ship);
  const s2 = Object.assign({}, a.ship);
  let ok = true;
  try { up.mod(s1, 1); up.mod(s2, 1); up.mod(s2, 1); } catch (e) { ok = false; }
  if (!ok) continue;
  total++;
  // 至少一個有意義欄位應該有變化（或者本來就係飽和，例如 gun_2→3→4）
  const changed = Object.keys(s1).some(k => s2[k] !== s1[k]);
  if (changed) doubled++;
}
check('傳說級對大多數強化都令數值再變一次（≥12/' + UPS.length + '）', doubled >= 12, doubled + '/' + UPS.length + ' 有變化');

console.log('\n=== 9. 觸控目標 ===');
const L = h.match(/function choiceLayout\(\)[\s\S]*?const cardW = (\d+), cardH = (\d+)/);
check('卡片尺寸沿用 choiceLayout（88×108 ≥ 64×64）',
  L && Number(L[1]) >= 64 && Number(L[2]) >= 64, L ? L[1] + '×' + L[2] : '抽唔到');

console.log(fails === 0 ? '\n✓ 全部通過' : '\n✗ ' + fails + ' 項失敗');
process.exit(fails === 0 ? 0 : 1);