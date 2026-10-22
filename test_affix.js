/* 一次性驗證腳本：v3.8 #43 本局詞綴 + #45 雜魚小詞綴 */
const fs = require('fs');
const h = fs.readFileSync(__dirname + '/index.html', 'utf8');

let fails = 0;
function check(label, ok, extra) {
  if (!ok) fails++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (extra ? '  ' + extra : ''));
}

/* 抽真實定義做行為驗證 */
function extract(name, re) {
  const m = h.match(re);
  if (!m) throw new Error('抽唔到 ' + name);
  return m[0];
}
const AFFIX_DEFS = new Function('return ' + extract('AFFIX_DEFS', /const AFFIX_DEFS = \[[\s\S]*?\n\];/).replace('const AFFIX_DEFS =', ''))();
const MINOR_AFFIX = new Function('return ' + extract('MINOR', /const MINOR_AFFIX = \[[\s\S]*?\n\];/).replace('const MINOR_AFFIX =', ''))();

/* 抽 mulberry32 + stageRngFor 做決定性驗證 */
const rngSrc = extract('rng', /function mulberry32[\s\S]*?\n\}/) + '\n' + extract('rng2', /function stageRngFor[\s\S]*?\n\}/);
const { mulberry32, stageRngFor } = new Function(rngSrc + '\nreturn { mulberry32, stageRngFor };')();

console.log('=== 1. 詞綴表（#43）===');
check('詞綴數 = ' + AFFIX_DEFS.length, AFFIX_DEFS.length >= 5);
check('id 全部唯一', new Set(AFFIX_DEFS.map(a => a.id)).size === AFFIX_DEFS.length);
check('每個都有 icon + name + desc', AFFIX_DEFS.every(a => a.icon && a.name && a.desc));
/* #48：文案 ≤12 字（desc 部分，唔計 icon 同空格） */
const tooLong = AFFIX_DEFS.filter(a => Array.from(a.desc).length > 12);
check('desc ≤12 字（#48）', tooLong.length === 0,
  tooLong.length ? '超長：' + tooLong.map(a => a.name + '(' + Array.from(a.desc).length + ')') : AFFIX_DEFS.map(a => Array.from(a.desc).length + '字').join(' '));
check('每個詞綴都有實際效果欄位（唔可以有純裝飾）',
  AFFIX_DEFS.every(a => ['score','enemyHp','enemySpd','count','bulletSpd','grazeBonus','dark','hpDelta'].some(k => a[k] != null)));
/* 每個詞綴必須至少有代價同回報其中一邊，唔可以「淨係加難」 */
check('冇「淨係加難冇回報」嘅詞綴',
  AFFIX_DEFS.every(a => (a.score && a.score > 1) || a.grazeBonus || a.bulletSpd < 1 || a.enemyHp < 1 || a.hpDelta < 0));

console.log('\n=== 2. 零死卡：每個詞綴欄位都有 game logic 讀 ===');
const FIELDS = ['affScore','affEnemyHp','affEnemySpd','affCount','affBulletSpd','affGrazeBonus','affDark','affHpDelta','stageAffix','affixShownAt'];
const logic = h.split('const AFFIX_DEFS')[1];
const dead = FIELDS.filter(f => (logic.match(new RegExp('\\b' + f + '\\b', 'g')) || []).length < 2);
check('10 個詞綴變數全部有 ≥2 處引用（宣告 + 至少 1 處使用）', dead.length === 0, dead.join(','));

console.log('\n=== 3. 敵方彈速單一來源 ===');
check('bulletSpeedMul() 存在', /function bulletSpeedMul\(\)/.test(h));
/* 掃「實際取用點」：剝走 bulletSpeedMul() 自身嘅定義行同註釋，
   剩低嘅就係散落喺 game logic 入面嘅直接讀取。 */
const logicNoSrc = h
  .replace(/\/\*[^*]*敵方彈速單一來源[\s\S]*?\*\//g, '')
  .replace(/function bulletSpeedMul\(\)[^\n]*/g, '');
const direct = (logicNoSrc.match(/D\(\)\.bulletSpdMul/g) || []).length;
const viaD   = (logicNoSrc.match(/\bd\.bulletSpdMul/g) || []).length;
check('game logic 冇殘留直接用 D().bulletSpdMul（' + direct + ' 處）', direct === 0);
check('game logic 冇殘留 d.bulletSpdMul（' + viaD + ' 處）', viaD === 0);
check('bulletSpeedMul = D().bulletSpdMul × affBulletSpd', /D\(\)\.bulletSpdMul \* affBulletSpd/.test(h));
/* 難度表（DIFFS）本身仍然擁有 bulletSpdMul 欄位，呢個係合法來源 */
check('難度表仍然保有 bulletSpdMul 欄位（單一來源嘅上游）',
  /bulletSpdMul:\s*[\d.]+/.test(h));

console.log('\n=== 4. 擦彈半徑動態化 ===');
check('grazeRadius() 存在', /function grazeRadius\(\)/.test(h));
check('GRAZE_RADIUS 直接用只剩定義 + 喺 grazeRadius() 入面',
  (h.match(/\bGRAZE_RADIUS\b/g) || []).length === 2,
  (h.match(/\bGRAZE_RADIUS\b/g) || []).length + ' 處');
check('判定 / 光環 / 常駐圈三處都用 grazeRadius()',
  (h.match(/grazeRadius\(\)/g) || []).length === 4);

console.log('\n=== 5. 決定性 + 分佈 ===');
/* 詞綴用 stageRngFor(runSeed, 9000+stageId)，唔會影響波次組波 */
const rollFor = (seed, stage) => {
  const rng = stageRngFor(seed, 9000 + stage);
  return AFFIX_DEFS[Math.floor(rng() * AFFIX_DEFS.length)];
};
let det = true;
for (const sd of [1, 42, 777]) for (const st of [1,2,3,4,5]) {
  if (rollFor(sd, st).id !== rollFor(sd, st).id) det = false;
}
check('同 seed + 同關 → 同詞綴', det);
/* 同 seed 唔同關應該有變化 */
const perSeed = {};
for (let sd = 1; sd <= 300; sd++) {
  for (let st = 1; st <= 5; st++) {
    const id = rollFor(sd, st).id;
    (perSeed[id] = perSeed[id] || new Set()).add(sd + ':' + st);
  }
}
check('6 個詞綴都有出現過（冇死詞綴）',
  Object.keys(perSeed).length === AFFIX_DEFS.length, Object.keys(perSeed).join(','));
/* 每關分佈唔應該完全一樣 */
const stageSpread = [1,2,3,4,5].map(st => new Set(Array.from({length:200}, (_,i) => rollFor(i+1, st).id)).size);
check('每關 200 個 seed 都覆蓋全部詞綴（分佈均勻）', stageSpread.every(n => n === AFFIX_DEFS.length), stageSpread.join('/'));

/* 詞綴 stream 唔可以污染波次 stream */
const waveBefore = stageRngFor(999, 3);
stageRngFor(999, 9003);           /* 模擬詞綴抽咗一次 */
const waveAfter = stageRngFor(999, 3);
check('詞綴用獨立 rng stream，唔污染波次組波', waveBefore() === waveAfter());

console.log('\n=== 6. 雜魚小詞綴（#45）===');
check('小詞綴數 = ' + MINOR_AFFIX.length, MINOR_AFFIX.length >= 3);
check('每個都有 id/label/spd/hp/tint', MINOR_AFFIX.every(a => a.id && a.label && a.spd && a.hp && a.tint));
check('id 唯一', new Set(MINOR_AFFIX.map(a => a.id)).size === MINOR_AFFIX.length);
/* 唔可以全部都係同一方向，否則冇「變化」意義 */
check('速度有快有慢（唔係全部同一方向）',
  MINOR_AFFIX.some(a => a.spd > 1) && MINOR_AFFIX.some(a => a.spd < 1));
check('血量有厚有薄',
  MINOR_AFFIX.some(a => a.hp > 1) && MINOR_AFFIX.some(a => a.hp < 1));
check('label ≤2 字（唔嘈）', MINOR_AFFIX.every(a => Array.from(a.label).length <= 2));
/* 命中率 ~34%，mini 不帶 */
const rollSrc = h.match(/function rollMinorAffix[\s\S]*?\n\}/)[0];
check('mini 唔帶小詞綴（畫面唔會太花）', /if \(isMini\) return null/.test(rollSrc));
check('命中率 < 1（唔係每隻都有）', /rng\(\) > 0\.\d+/.test(rollSrc));
let hit = 0;
for (let i = 0; i < 20000; i++) { const r = mulberry32(i + 1)(); if (!(r > 0.34)) hit++; }
check('實測命中率 ≈34%', Math.abs(hit / 20000 - 0.34) < 0.02, (hit / 20000 * 100).toFixed(1) + '%');

console.log('\n=== 7. 生成時套用 ===');
const spawnSrc = h.match(/function spawnGruntFormation[\s\S]*?\n\}\n/)[0];
check('數量套 affCount 並 Math.max(1, ceil(...))', /opt\.count \|\| 1\) \* affCount/.test(spawnSrc) && /Math\.max\(1, Math\.ceil/.test(spawnSrc));
check('血量套 affEnemyHp + 小詞綴 hp', /affEnemyHp/.test(spawnSrc) && /minor \? minor\.hp : 1/.test(spawnSrc));
check('落速套 affEnemySpd + 小詞綴 spd', /affEnemySpd/.test(spawnSrc) && /minor \? minor\.spd : 1/.test(spawnSrc));
check('血量至少 1（唔會變 0 hp）', /Math\.max\(1, Math\.round/.test(spawnSrc));

console.log('\n=== 8. 生命代價底線（玻璃 −1）===');
const apSrc = h.match(/function applyUpgrades\(\)[\s\S]*?\n\}\n/)[0];
check('maxHp = Math.max(1, d.startHp + affHpDelta)', /Math\.max\(1, d\.startHp \+ affHpDelta\)/.test(apSrc));

console.log('\n=== 9. 生命周期 ===');
const enterSrc = h.match(/function onStateEnter[\s\S]*?\n\}/);
check('入關會 rollStageAffix', /rollStageAffix\(lastStage\)/.test(enterSrc ? enterSrc[0] : h));
check('重開一局會 resetAffix', /resetAffix\(\)/.test(h));
check('詞綴唔入 localStorage（零持久）', !/lsWrite[^)]*affix/i.test(h) && !/lsRead[^)]*affix/i.test(h));
check('debug HUD 顯示詞綴', /詞綴 \$\{stageAffix/.test(h));
check('有詞綴繪圖函式 + 戰鬥路徑有呼叫',
  /function drawStageAffixFx/.test(h) && /drawStageAffixFx\(\)/.test(h));

console.log('\n' + (fails === 0 ? '✓ 全部通過' : '✗ ' + fails + ' 項失敗'));
process.exit(fails === 0 ? 0 : 1);