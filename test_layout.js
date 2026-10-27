/* v0.30.0 #113/#114 版面守門：boss 本體 + 血條必須完全離開頂部 HUD 帶
   ⚠️ 核心係**幾何關係斷言**，唔係死字串 —— 任何人郁 HUD 座標或者 boss 座標，
      呢個測試都會 fail（唔會等到下次先發現 boss 俾 HUD 蓋住）。
   座標全部由 index.html 原文抽出，唔喺呢個檔案 hardcode。 */
const fs = require('fs');
const h = fs.readFileSync(__dirname + '/index.html', 'utf8');
let fails = 0;
function check(label, ok, extra) {
  if (!ok) fails++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (extra ? '  ' + extra : ''));
}

console.log('=== 1. 抽座標（由 index.html 原文）===');
const grazeBar = h.match(/const w = 84, h = 5;\s*\n\s*const x = \(VIEW_W - w\) \/ 2, y = (\d+);/);
const mergedRow = h.match(/ctx\.fillRect\(x - 6, (\d+), total \+ 12, (\d+)\)/);
const hpBar = h.match(/ctx\.fillRect\(e\.x - 18, e\.y - (\d+), 36, (\d+)\)/);
const bossTrack = h.match(/e\.y = (\d+)\s*\+\s*Math\.sin\(e\.t \/ (\d+)\) \* (\d+)/);
const bossDraw = h.match(/drawSpriteAnim\('anim_boss', 'boss', e\.x, e\.y, ([\d.]+)/);
const bossSprite = h.match(/anim_boss_0: \{ x:\d+, y:\d+, w:(\d+), h:(\d+) \}/);

check('抽到擦彈條座標', !!grazeBar, grazeBar && grazeBar[1]);
check('抽到合併行座標', !!mergedRow, mergedRow && mergedRow[1] + '+' + mergedRow[2]);
check('抽到 boss 血條偏移', !!hpBar, hpBar && hpBar[1]);
check('抽到 boss 軌跡', !!bossTrack, bossTrack && bossTrack.slice(1).join(' / '));
check('抽到 boss scale', !!bossDraw, bossDraw && bossDraw[1]);
check('抽到 boss sprite 尺寸', !!bossSprite, bossSprite && bossSprite[1] + 'x' + bossSprite[2]);

if (!grazeBar || !mergedRow || !hpBar || !bossTrack || !bossDraw || !bossSprite) {
  console.log('\n抽唔到座標，測試無法繼續');
  console.log('\n' + fails + ' FAIL');
  process.exit(1);
}

const GRAZE_Y = +grazeBar[1], GRAZE_H = 5;
const ROW_Y = +mergedRow[1], ROW_H = +mergedRow[2];
const HP_OFF = +hpBar[1], HP_H = +hpBar[2];
const BOSS_Y0 = +bossTrack[1], BOSS_AMP = +bossTrack[3];
const BOSS_SCALE = +bossDraw[1];
const SPR_W = +bossSprite[1], SPR_H = +bossSprite[2];

/* 頂部中央 HUD 帶 = 合併行 + 擦彈文字 + 擦彈條，取最底 */
const ROW_BOTTOM = ROW_Y + ROW_H - 1;          // 3 + 11 - 1 = 13
const BAR_TOP = GRAZE_Y;                        // 27
const HUD_BOTTOM = GRAZE_Y + GRAZE_H - 1;       // 27 + 5 - 1 = 31
/* boss 軌跡最低位 */
const BOSS_MIN_Y = BOSS_Y0 - BOSS_AMP;         // 80 - 30 = 50
const BODY_HALF = (SPR_H * BOSS_SCALE) / 2;    // 10 * 2.6 / 2 = 13
const BODY_TOP = BOSS_MIN_Y - BODY_HALF;       // 37
const HP_TOP = BOSS_MIN_Y - HP_OFF;             // 32
const HP_BOTTOM = HP_TOP + HP_H - 1;            // 36

console.log('\n=== 2. 幾何關係（呢個先係重點）===');
console.log(`  HUD 合併行: y ${ROW_Y}–${ROW_BOTTOM}`);
console.log(`  HUD 擦彈條: y ${BAR_TOP}–${HUD_BOTTOM}  → 頂部中央帶底 = ${HUD_BOTTOM}`);
console.log(`  boss 最低位: y ${BOSS_MIN_Y}（${BOSS_Y0} ± ${BOSS_AMP}）`);
console.log(`  boss 本體頂: y ${BODY_TOP}（sprite ${SPR_W}×${SPR_H} @scale ${BOSS_SCALE} → 半高 ${BODY_HALF}）`);
console.log(`  boss 血條: y ${HP_TOP}–${HP_BOTTOM}（e.y − ${HP_OFF}，h ${HP_H}）`);

check('HUD 合併行底 < 擦彈條頂（行同條唔重疊）', ROW_BOTTOM < BAR_TOP, `${ROW_BOTTOM} < ${BAR_TOP}`);
check('★ boss 本體頂 完全喺 HUD 帶之下', BODY_TOP > HUD_BOTTOM, `${BODY_TOP} > ${HUD_BOTTOM}`);
check('★ boss 血條頂 完全喺 HUD 帶之下', HP_TOP > HUD_BOTTOM, `${HP_TOP} > ${HUD_BOTTOM}`);
check('★ boss 血條唔同本體重疊（血條喺本體上面）', HP_BOTTOM < BODY_TOP + 1, `${HP_BOTTOM} < ${BODY_TOP + 1}`);
check('★ 玩家子彈命中 boss 嗰刻喺 HUD 帶之下（命中反饋可見）', BODY_TOP > HUD_BOTTOM);

console.log('\n=== 3. 舊座標已經清走 ===');
check('boss 血條唔再用 e.y − 24', !/e\.y - 24/.test(h));
check('獨立關卡 chip（fillRect(VIEW_W/2-60, 6, 120, 16)）已移除', !/fillRect\(VIEW_W\/2 - 60, 6, 120, 16\)/.test(h));
check('合併行存在 stageTxt（關卡名）', h.includes("const stageTxt = 'S' + lastStage + ' · ' + th.name;"));
check('節奏 chip 唔再用舊 y 26 / 36', !/fillRect\(VIEW_W \/ 2 - tw \/ 2 - 5, 26, tw \+ 10, 13\)/.test(h));

console.log('\n=== 4. 選單版面（#114，對齊 UI_STYLE_GUIDE §2.2）===');
const diffLayout = h.match(/function diffCardsLayout\(\)[\s\S]{0,400}?const y = VIEW_H \/ 2 - (\d+);/);
check('抽到 DIFF 卡片區 y', !!diffLayout, diffLayout && diffLayout[1]);
check('DIFF 卡片區 = VIEW_H/2 − 50（spec §2.2）', !!diffLayout && diffLayout[1] === '50', diffLayout && diffLayout[1]);
check('DIFF 卡片區唔再係 VIEW_H/2 − 40', !/function diffCardsLayout\(\)[\s\S]{0,400}?VIEW_H \/ 2 - 40/.test(h));

/* 所有選單提示行嘅 y */
const hintYs = [...h.matchAll(/ctx\.fillText\('[^']*(?:按 1|點卡|點左\/中\/右)[^']*', VIEW_W\/2, VIEW_H - (\d+)\);/g)].map(m => +m[1]);
check('搵到選單提示行', hintYs.length >= 9, hintYs.length + ' 條: ' + JSON.stringify(hintYs));
check('所有選單提示都係 VIEW_H − 56（spec §2.2）', hintYs.length > 0 && hintYs.every(y => y === 56), JSON.stringify(hintYs));
check('冇剩低 VIEW_H − 48 嘅選單提示', !/ctx\.fillText\('[^']*(?:按 1|點卡|點左\/中\/右)[^']*', VIEW_W\/2, VIEW_H - 48\)/.test(h));

console.log('\n=== 5. 版號 ===');
check('version string v0.30', /v0\.30\.0/.test(h));

console.log('\n' + (fails ? fails + ' FAIL' : 'ALL PASS'));
process.exit(fails ? 1 : 0);
