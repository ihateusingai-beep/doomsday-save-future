/* 一次性驗證腳本：v3.8 #41 本關風格 */
const fs = require('fs');
const h = fs.readFileSync(__dirname + '/index.html', 'utf8');

let fails = 0;
function check(label, ok, extra) {
  if (!ok) fails++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (extra ? '  ' + extra : ''));
}

/* ---- 抽真實定義做行為驗證 ---- */
function extract(name, re) {
  const m = h.match(re);
  if (!m) throw new Error('抽唔到 ' + name);
  return m[0];
}
const STYLE_SRC = extract('STAGE_STYLES', /const STAGE_STYLES = \[[\s\S]*?\n\];/)
  .replace('const STAGE_STYLES =', '');
const STAGE_STYLES = new Function('return ' + STYLE_SRC)();

const STAGE_RAND_SRC = extract('STAGE_RAND', /const STAGE_RAND = \{[\s\S]*?\n\};/)
  .replace('const STAGE_RAND =', '');
const STAGE_RAND = new Function('return ' + STAGE_RAND_SRC)();

/* 真 chunk id 清單（由 WAVE_CHUNKS 抽，單一真相） */
const CHUNK_IDS = new Set(
  [...extract('WAVE_CHUNKS', /const WAVE_CHUNKS = \{[\s\S]*?\n\};/).matchAll(/^\s{2}([a-z_0-9]+):/gm)].map(m => m[1]));

const STAGE_TABLE = new Function('return ' + extract('STAGE_TABLE', /const STAGE_TABLE = \{[\s\S]*?\n\};/).replace('const STAGE_TABLE =', ''))();

/* 模擬 stylePool()：由真實碼抽規則重建，用嚟驗加權行為 */
function stylePoolSim(stageId, basePool, style) {
  if (!style || !style.prefer) return basePool;
  if (stageId === 1) return basePool;
  if (!basePool || !basePool.length) return basePool;
  const out = [];
  for (const id of basePool) {
    const fam = id.split('_')[0];
    const w = style.prefer[fam] || 1;
    for (let k = 0; k < w; k++) out.push(id);
  }
  return out;
}
function styleHasMatchSim(stageId, style) {
  if (!style || !style.prefer) return false;
  const base = (STAGE_RAND[stageId] || {}).pool;
  if (!base) return false;
  return base.some(id => style.prefer[id.split('_')[0]] > 1);
}

console.log('=== 1. 風格表完整性 ===');
check('風格數 = 3（剛好填滿三卡版面）', STAGE_STYLES.length === 3, STAGE_STYLES.length + ' 個');
check('id 全部唯一', new Set(STAGE_STYLES.map(s => s.id)).size === STAGE_STYLES.length);
check('每個都有 icon + name + desc + prefer',
  STAGE_STYLES.every(s => s.icon && s.name && s.desc && s.prefer && Object.keys(s.prefer).length > 0));
check('prefer 係家族 → 權重（唔係 chunk id 清單）',
  STAGE_STYLES.every(s => Object.entries(s.prefer).every(([k, v]) => /^[a-z]+$/.test(k) && Number.isInteger(v) && v >= 1)));

console.log('\n=== 2. #48 文案 ≤12 字 ===');
const tooLong = STAGE_STYLES.filter(s => Array.from(s.desc).length > 12);
check('desc ≤12 字', tooLong.length === 0,
  tooLong.length ? '超長：' + tooLong.map(s => s.name).join(',') : STAGE_STYLES.map(s => Array.from(s.desc).length + '字').join(' '));

console.log('\n=== 3. 零死卡：每個欄位都有 game logic 讀 ===');
/* 每個 sty* 變數：宣告 1 處 + 至少 1 處使用 */
const STY_FIELDS = ['stageStyle', 'styScore', 'styEnemyHp', 'styCount', 'styGrazeScore', 'styBossFire'];
const logic = h.split('const STAGE_STYLES')[1];
const dead = STY_FIELDS.filter(f => (logic.match(new RegExp('\\b' + f + '\\b', 'g')) || []).length < 2);
check('6 個風格變數全部有 ≥2 處引用（宣告 + 使用）', dead.length === 0, dead.join(','));
/* STAGE_STYLES 每個可選欄位都要有使用 */
check('每個風格都有實際效果欄位（唔可以純裝飾）',
  STAGE_STYLES.every(s => ['score','enemyHp','count','grazeScore','bossFire'].some(k => s[k] != null)));
/* prefer 家族必須真係存在（唔會加權一個冇人嘅家族 = 該風格部分死格） */
const ALL_FAMS = new Set([...CHUNK_IDS].map(id => id.split('_')[0]));
const badFam = [];
STAGE_STYLES.forEach(s => Object.keys(s.prefer).forEach(f => { if (!ALL_FAMS.has(f)) badFam.push(s.id + ':' + f); }));
check('所有 prefer 家族都真係存在（零虛空權重）', badFam.length === 0, badFam.join(','));
/* 每個風格都要有至少一個非 pool 效果（萬一該關全部降級，仲有數值效果） */
check('每個風格都有非 pool 的乘數效果（降級時唔會完全失效）',
  STAGE_STYLES.every(s => ['score','enemyHp','count','grazeScore','bossFire'].some(k => s[k] != null && s[k] !== 1)));

console.log('\n=== 4. 風格加權 pool：唔會越關 intro + 死格會被標記 ===');
let leak = 0, weighted = 0, flat = 0;
const flatCases = [];
for (let st = 2; st <= 5; st++) {
  for (const s of STAGE_STYLES) {
    const base = STAGE_RAND[st].pool;
    const out = stylePoolSim(st, base, s);
    const allowed = new Set(base);
    if (!out.every(id => allowed.has(id))) { leak++; console.log('    洩漏：S' + st, s.id, out.filter(i => !allowed.has(i)).join(',')); }
    /* 加權 = pool 變長（同 id 重複出現）；冇變長 = 該關冇對口家族 = 降級 */
    if (out.length > base.length) weighted++;
    else { flat++; flatCases.push('S' + st + '×' + s.name); }
    /* 每個原本嘅 id 至少出現一次（唔會抽唔到某個合法 chunk） */
    if (!base.every(id => out.includes(id))) { leak++; console.log('    掉 chunk：S' + st, s.id); }
  }
}
check('S2-S5 × 3 風格全部唔會 intro 越關 chunk / 唔會掉 chunk', leak === 0, leak + ' 個問題');
check('每個 id 至少出現一次（加權唔會令某 chunk 消失）', leak === 0);
/* 死格唔可以無聲發生：每個降級組合都必須有 styleHasMatch() = false 嘅 UI 提示 */
const promptCases = [];
for (const c of flatCases) {
  const [s, nm] = c.split('×');
  const st = Number(s.slice(1));
  const style = STAGE_STYLES.find(x => x.name === nm);
  if (styleHasMatchSim(st, style)) promptCases.push(c + '(有對口但無加權=矛盾)');
}
check('降級組合全部會顯示「本關無對口敵種」提示（零無聲死格）',
  promptCases.length === 0, promptCases.join(','));
console.log('    加權生效 ' + weighted + ' / 降級（會提示）' + flat + (flat ? ': ' + flatCases.join(' ') : ''));
check('降級組合數量合理（≤2，唔係大部分都冇效）', flat <= 2, flat + ' 個');

console.log('\n=== 5. S1 教學關鎖死（#49 不變式）===');
check('stylePool 對 stageId===1 直接 return basePool（唔改教學順序）',
  /if \(stageId === 1\) return basePool;/.test(h));
check('S1 用 slots（唔用 pool），風格無從介入',
  Array.isArray(STAGE_RAND[1].slots) && !STAGE_RAND[1].pool);

console.log('\n=== 6. 排程（#47：只喺 S2/S4）===');
const STYLE_STAGES_SRC = extract('STYLE_STAGES', /const STYLE_STAGES = new Set\(\[[^\]]*\]\);/);
const STYLE_STAGES = new Function(STYLE_STAGES_SRC.replace('const STYLE_STAGES =', 'return '))();
check('風格只喺 S2 / S4 出現', [...STYLE_STAGES].sort().join(',') === '2,4', [...STYLE_STAGES].join(','));
check('advanceStage 喺 CHOICE 分支檢查 STYLE_STAGES', /STYLE_STAGES\.has\(next\)/.test(h));
check('S1 完全冇 STYLE 選擇（乾淨純教學）', !STYLE_STAGES.has(1));

console.log('\n=== 7. 風格只影響本關（唔跨關 / 唔跨局）===');
check('有 stylePending flag 保住 STYLE→入關嘅風格', /let stylePending = false;/.test(h) && /stylePending = true;/.test(h));
check('入關時非 STYLE 路徑會清走舊風格', /if \(!stylePending\) applyStageStyle\(null\);/.test(h));
check('resetRunFresh 有 resetStyle()（唔跨局）', /resetRunFresh\(\)[\s\S]*?resetStyle\(\);/.test(h));
check('非風格關入關前有 resetStyle()', /resetStyle\(\);\s*\/\* 非風格關/.test(h));
check('風格唔入 localStorage（零持久）', !/localStorage[\s\S]{0,200}(stageStyle|styScore|styCount)/.test(h));

console.log('\n=== 8. UI 狀態接線 ===');
check('STATE.STYLE 已加入列舉', /STYLE:\s+'STYLE'/.test(h));
check('STATE_LABEL 有 STYLE', /STYLE:\s+'選擇風格'/.test(h));
check('onStateEnter 有 STYLE 分支（roll 三卡）', /s === STATE\.STYLE\)[\s\S]{0,200}styleOffer = STAGE_STYLES\.slice\(\)/.test(h));
check('render 有 STYLE 繪圖分支', /fsm\.cur === STATE\.STYLE\)[\s\S]{0,80}choiceLayout\(\)/.test(h));
check('STYLE 分支有 renderTail()（音效 UI 畫到）', /STATE\.STYLE\)[\s\S]{0,4000}?renderTail\(\);/.test(h));
check('指標點擊有 STYLE 處理', /fsm\.cur === STATE\.STYLE\)[\s\S]{0,120}hitStyleCard/.test(h));
check('鍵盤 1/2/3 有 STYLE 處理', /fsm\.cur === STATE\.STYLE\)[\s\S]{0,200}applyPickedStyle/.test(h));
/* 鍵盤分支：抽 onKeyDown 入面嗰個 STYLE 段落（唔用 split，避免抽錯位置） */
const styleKeyBlock = (h.match(/\/\* #41 風格選擇[\s\S]*?\n  \}/) || [''])[0];
check('Esc/Enter 有 fallback（唔會卡死）',
  /k === 'escape' \|\| k === 'enter'/.test(styleKeyBlock), styleKeyBlock ? '' : '抽唔到 STYLE 鍵盤段');
check('hitStyleCard 存在', /function hitStyleCard/.test(h));
check('背景 stage 包含 STYLE', /STATE\.PAUSED \|\| fsm\.cur === STATE\.STYLE/.test(h));
check('debug HUD 顯示風格', /風格 \$\{stageStyle/.test(h));

console.log('\n=== 9. 行為驗證：加權真係改變敵種分佈（真 assembleWaves）===');
/* 抽真實 assembleWaves 執行環境，做統計驗證而唔係靜態掃描 */
const grab = (re) => { const m = h.match(re); if (!m) throw new Error('抽唔到'); return m[0]; };
const simSrc = [
  grab(/function mulberry32[\s\S]*?\n\}/),
  grab(/function stageRngFor[\s\S]*?\n\}/),
  grab(/const WAVE_CHUNKS = \{[\s\S]*?\n\};/),
  grab(/const WAVE_TEMPLATES = \{[\s\S]*?\n\};/),
  grab(/const STAGE_RAND = \{[\s\S]*?\n\};/),
  grab(/const STAGE_TABLE = \{[\s\S]*?\n\};/),
  'const STAGE_STYLES = ' + grab(/const STAGE_STYLES = \[[\s\S]*?\n\];/).replace('const STAGE_STYLES =', ''),
  'let stageStyle=null, styScore=1,styEnemyHp=1,styCount=1,styGrazeScore=1,styBossFire=1, stylePending=false;',
  grab(/function applyStageStyle[\s\S]*?\n\}/),
  grab(/function stylePool[\s\S]*?\n\}/),
  grab(/function pickChunkId[\s\S]*?\n\}/),
  grab(/const STAGE_ATS[\s\S]*?\n\}/),
  grab(/function assembleWaves[\s\S]*?\n\}/),
  'return {assembleWaves,applyStageStyle,STAGE_STYLES};',
].join('\n');
const SIM = new Function(simSrc)();
function familyDist(stageId, style) {
  SIM.applyStageStyle(style);
  const seen = {};
  for (let seed = 1; seed <= 200; seed++) {
    SIM.assembleWaves(stageId, seed).forEach(w => {
      const f = w.chunk.split('_')[0];
      seen[f] = (seen[f] || 0) + 1;
    });
  }
  return seen;
}
let noEffect = 0;
for (let st = 2; st <= 5; st++) {
  for (const s of STAGE_STYLES) {
    const base = familyDist(st, null);
    const withS = familyDist(st, s);
    const same = JSON.stringify(base) === JSON.stringify(withS);
    const isDegraded = !styleHasMatchSim(st, s);
    if (same && !isDegraded) {
      noEffect++;
      console.log('    ✗ S' + st + '×' + s.name + ' 分佈完全冇變但又唔算降級');
    }
  }
}
SIM.applyStageStyle(null);
check('有對口家族嘅組合，敵種分佈一定會變（唔係空轉）', noEffect === 0, noEffect + ' 個空轉');
check('波數不變式仍然守住（風格唔改 waveCount）',
  [2,3,4,5].every(st => SIM.assembleWaves(st, 7).length === STAGE_TABLE[st].waveCount));

console.log('\n=== 10. 觸控目標 ===');
/* 風格卡沿用 choiceLayout：88×108，遠超 56px（PLAN 既有慣例）/ 64px（#20） */
const L = h.match(/function choiceLayout\(\)[\s\S]*?const cardW = (\d+), cardH = (\d+)/);
check('卡片尺寸沿用 choiceLayout（88×108 ≥ 64×64）',
  L && Number(L[1]) >= 64 && Number(L[2]) >= 64, L ? L[1] + '×' + L[2] : '抽唔到');

console.log(fails === 0 ? '\n✓ 全部通過' : '\n✗ ' + fails + ' 項失敗');
process.exit(fails === 0 ? 0 : 1);