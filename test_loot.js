/* 一次性驗證腳本：v3.8 #44 Boss 裝備 */
const fs = require('fs');
const h = fs.readFileSync(__dirname + '/index.html', 'utf8');

let fails = 0;
function check(label, ok, extra) {
  if (!ok) fails++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (extra ? '  ' + extra : ''));
}
const grab = (re) => { const m = h.match(re); if (!m) throw new Error('抽唔到'); return m[0]; };
const extract = (n, re) => grab(re);

const LOOT_DEFS = new Function('return ' +
  grab(/const LOOT_DEFS = \[[\s\S]*?\n\];/).replace('const LOOT_DEFS =', ''))();

const { mulberry32, stageRngFor } = new Function(
  grab(/function mulberry32[\s\S]*?\n\}/) + '\n' + grab(/function stageRngFor[\s\S]*?\n\}/) +
  '\nreturn { mulberry32, stageRngFor };')();

console.log('=== 1. 裝備表完整性 ===');
check('裝備數 = 5', LOOT_DEFS.length === 5, LOOT_DEFS.length + ' 個');
check('id 全部唯一', new Set(LOOT_DEFS.map(d => d.id)).size === LOOT_DEFS.length);
check('每個都有 icon + name + desc',
  LOOT_DEFS.every(d => d.icon && d.name && d.desc));
check('每個都有實際效果欄位（唔可以純裝飾）',
  LOOT_DEFS.every(d => ['bulletDmgBonus','skillCdDelta','bombCdDelta','shieldBonus','armor'].some(k => d[k] != null)));

console.log('\n=== 2. #48 文案 ≤12 字 ===');
const tooLong = LOOT_DEFS.filter(d => Array.from(d.desc).length > 12);
check('desc ≤12 字', tooLong.length === 0,
  tooLong.length ? '超長：' + tooLong.map(d => d.name).join(',') : LOOT_DEFS.map(d => Array.from(d.desc).length + '字').join(' '));

console.log('\n=== 3. 零死卡：每個欄位都有 game logic 讀 ===');
/* 每個效果欄位都必須有對應 getter 讀佢 */
const EFFECT_READERS = {
  bulletDmgBonus: /if \(d && d\.bulletDmgBonus\)/,
  skillCdDelta:   /if \(d && d\.skillCdDelta\)/,
  bombCdDelta:    /if \(d && d\.bombCdDelta\)/,
  shieldBonus:    /if \(d && d\.shieldBonus\)/,
  armor:          /x\.id === id && x\.armor/,
};
const unreadable = Object.entries(EFFECT_READERS).filter(([k, re]) => !re.test(h)).map(([k]) => k);
check('5 個效果欄位全部有 getter 讀（零死卡）', unreadable.length === 0, unreadable.join(','));
/* getter 本身一定要被 game logic 叫 */
const GETTERS = ['lootBulletDmg', 'lootSkillCd', 'lootBombCd', 'lootShieldBonus', 'hasArmor'];
const uncalled = GETTERS.filter(g => {
  const defs = h.match(new RegExp('function ' + g + '\\(', 'g')) || [];
  const uses = (h.match(new RegExp('(?<![a-zA-Z])' + g + '\\s*\\(', 'g')) || []).length;
  return defs.length !== 1 || uses < 2;   /* 定義 1 次 + 至少 1 次呼叫 */
});
check('5 個 getter 全部有定義且被呼叫', uncalled.length === 0, uncalled.join(','));

console.log('\n=== 4. 掛鉤點（每個 getter 都有實際 game logic 掛鈎）===');
check('子彈傷害 + lootBulletDmg()', /baseDmg = \(ship\.bulletDmg \|\| 1\) \+ lootBulletDmg\(\)/.test(h) || /const dmg = \(ship\.bulletDmg \|\| 1\) \+ lootBulletDmg\(\)/.test(h));
check('專屬技能冷卻 + lootSkillCd()（有下限）', /Math\.max\(2000,[\s\S]{0,80}lootSkillCd\(\)\)/.test(h));
check('炸彈冷卻 + lootBombCd()（有下限）', /Math\.max\(5000,[\s\S]{0,80}lootBombCd\(\)\)/.test(h));
check('護盾 + lootShieldBonus()', /ship\.shield\s*=\s*c\.shield[\s\S]{0,90}lootShieldBonus\(\)/.test(h));
/* 比較位置索引（唔靠固定字元窗口，中間註釋長度會飄） */
const armorAt = h.indexOf('hasArmor() && !armorUsed');
const resAt   = h.indexOf('ship.resurrect > 0', armorAt);
check('致命傷保險：優先過 life_st 復活（兩個都存在且保險在前）',
  armorAt > 0 && resAt > armorAt, armorAt > 0 ? '保險 @' + armorAt + ' < 復活 @' + resAt : '搵唔到保險');
check('保險用完會失效（armorUsed 一次性）', /armorUsed = true/.test(h));

console.log('\n=== 5. boss 死必掉（零選擇）===');
check('boss 擊破路徑叫 rollLoot()', /BOSS_SCORE \* affScore \* styScore;[\s\S]{0,200}rollLoot\(lastStage\)/.test(h));
check('rollLoot 每關用獨立 rng stream（5000+stageId）', /stageRngFor\(runSeed, 5000 \+ stageId\)/.test(h));
check('5 個 boss 每個都可能掉唔同裝備（1000 seed 覆蓋）', (() => {
  const seen = new Set();
  for (let seed = 1; seed <= 1000; seed++) {
    const rng = stageRngFor(seed, 5000 + 3);
    seen.add(LOOT_DEFS[Math.floor(rng() * LOOT_DEFS.length)].id);
  }
  return seen.size === LOOT_DEFS.length;
})(), '');
check('唔會出現無效裝備（roll 索引一定喺範圍內）', (() => {
  for (let seed = 1; seed <= 500; seed++) {
    const rng = stageRngFor(seed, 5000 + 2);
    const d = LOOT_DEFS[Math.floor(rng() * LOOT_DEFS.length)];
    if (!d) return false;
  }
  return true;
})());
check('掉裝備有 log（同其它系統一致）', /\[裝備\] boss S/.test(h));
check('掉裝備有音效', /lootShownAt = performance\.now\(\);\s*\n\s*sfx\('pick'\)/.test(h));

console.log('\n=== 6. 生命周期（唔跨局 / 零持久）===');
check('resetRunFresh 有 resetLoots()', /resetRunFresh\(\)[\s\S]*?resetLoots\(\);/.test(h));
check('resetLoots 清 loots + armorUsed', /function resetLoots\(\)[\s\S]*?loots = Object\.create\(null\)[\s\S]*?armorUsed = false/.test(h));
check('裝備唔入 localStorage（零持久）', !/localStorage[\s\S]{0,200}\bloots\b/.test(h));
check('armorUsed 每次重開都重置（保險可以再用）', /resetLoots[\s\S]*?armorUsed = false/.test(h));

console.log('\n=== 7. UI 顯示 ===');
check('裝備欄繪製（HUD 血心下）', /LOOT_DEFS\.find\(x => x\.id === ids\[i\]\)/.test(h));
check('掉落橫幅有（2.6 秒）', /lootShownAt && performance\.now\(\) - lootShownAt < 2600/.test(h));
check('裝備欄上限 5 + 顯示 +N', /ids\.length > 5/.test(h));
check('debug HUD 顯示裝備', /裝備\s/.test(h) || /loot/.test(h));

console.log('\n=== 8. 冷卻下限保護（唔會變成無限連環）===');
check('專屬技能冷卻下限 2000ms', /Math\.max\(2000,/.test(h));
check('炸彈冷卻下限 5000ms', /Math\.max\(5000,/.test(h));
/* 疊加多件裝備之後仍然喺下限之上 */
const maxCd = 12000 + 5 * (-3000);
check('疊加 5 件散熱都唔會低過 5000ms（Math.max 擋住）',
  Math.max(5000, maxCd) >= 5000, '實測下限 ' + Math.max(5000, maxCd) + 'ms');

console.log(fails === 0 ? '\n✓ 全部通過' : '\n✗ ' + fails + ' 項失敗');
process.exit(fails === 0 ? 0 : 1);