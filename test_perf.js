/* v0.31.0 效能守門：背景 gradient per-stage 快取
 *
 * ⚠️ 呢個測試捉嘅係「每幀重新配置 gradient」嘅 allocation 浪費：
 *    v0.30.0 嘅 drawBackdrop() 每幀做 2 次 createLinearGradient / createRadialGradient
 *    → 2 次 per-frame allocation = GC 壓力來源（profile 見到 GC 10.9ms / 8s）。
 *    關卡主題係 Object.freeze（唔會變），所以 gradient 對象可以 per-stage 快取。
 *
 * ⚠️ 呢度**唔係**用 regex 結構檢查（regex 捉唔到「有冇真的快取」）：
 *    係真係把 bgGradient() 抽出嚟，喺 stub 環境入面實際執行，
 *    數真正做咗幾多次 gradient 配置。
 */
const fs = require('fs');
const h = fs.readFileSync(__dirname + '/index.html', 'utf8');

let fails = 0;
function check(label, ok, extra) {
  if (!ok) fails++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (extra ? '  ' + extra : ''));
}

/* ---------- stub canvas 2D context：數 gradient 配置 ---------- */
let gradCalls = { linear: 0, radial: 0 };
const stubCtx = {
  createLinearGradient(...a) { gradCalls.linear++; return { __kind: 'linear', args: a, stops: [], addColorStop(o, c) { this.stops.push([o, c]); } }; },
  createRadialGradient(...a) { gradCalls.radial++; return { __kind: 'radial', args: a, stops: [], addColorStop(o, c) { this.stops.push([o, c]); } }; },
};

/* ---------- 由 index.html 抽出相關代碼，eval 返入測試檔 scope ---------- */
const mTheme = h.match(/const STAGE_THEME = Object\.freeze\(\{[\s\S]*?\n\}\);/);
const mCache = h.match(/const bgGradCache = new Map\(\);/);
const mFn = h.match(/function bgGradient\(stageId, kind\) \{[\s\S]*?\n\}/);
check('抽到 STAGE_THEME', !!mTheme);
check('抽到 bgGradCache', !!mCache);
check('抽到 bgGradient()', !!mFn);
if (!mTheme || !mCache || !mFn) { console.log('\n' + fails + ' FAIL'); process.exit(1); }

const VIEW_W = 320, VIEW_H = 480;
const scopeSrc = mTheme[0] + '\n' + mCache[0] + '\n' + mFn[0] + '\nreturn { bgGradient, bgGradCache, STAGE_THEME };';
/* ⚠️ 注入依賴要用 eval 返入測試檔 scope（own arity 保持原樣），唔可以用 makeFn wrapper */
const api = eval('(function(){' + scopeSrc + '})()');

/* 注入 stub ctx：bgGradient 內部用全域 ctx */
globalThis.ctx = stubCtx;
try {
  console.log('=== 1. 每幀 gradient 配置 ===');
  gradCalls = { linear: 0, radial: 0 };
  api.bgGradient(1, 'sky');
  api.bgGradient(1, 'vignette');
  check('首次呼叫做 1 次 linear + 1 次 radial 配置',
    gradCalls.linear === 1 && gradCalls.radial === 1, JSON.stringify(gradCalls));

  console.log('\n=== 2. 快取生效（之後每幀 0 次配置）===');
  gradCalls = { linear: 0, radial: 0 };
  for (let i = 0; i < 600; i++) {           // 模擬 600 幀
    api.bgGradient(1, 'sky');
    api.bgGradient(1, 'vignette');
  }
  check('600 幀之後仍然 0 次 gradient 配置', gradCalls.linear === 0 && gradCalls.radial === 0,
    JSON.stringify(gradCalls));

  console.log('\n=== 3. 同一 stage 回傳同一個對象 ===');
  check('sky 對象同一', api.bgGradient(1, 'sky') === api.bgGradient(1, 'sky'));
  check('vignette 對象同一', api.bgGradient(1, 'vignette') === api.bgGradient(1, 'vignette'));
  check('sky ≠ vignette', api.bgGradient(1, 'sky') !== api.bgGradient(1, 'vignette'));

  console.log('\n=== 4. 不同 stage → 不同對象（唔可以跨關卡共用）===');
  const s1 = api.bgGradient(1, 'sky'), s5 = api.bgGradient(5, 'sky');
  check('S1 sky ≠ S5 sky', s1 !== s5);
  check('S1 sky 色值 = 維港起飛', s1.stops[0][1] === api.STAGE_THEME[1].skyTop, s1.stops[0][1]);
  check('S5 sky 色值 = 逃逸門', s5.stops[0][1] === api.STAGE_THEME[5].skyTop, s5.stops[0][1]);

  console.log('\n=== 5. 舊寫法已經清走 ===');
  check('drawBackdrop 內冇殘留 createLinearGradient',
    !/function drawBackdrop[\s\S]{0,3000}?createLinearGradient/.test(h));
  check('drawBackdrop 內冇殘留 createRadialGradient',
    !/function drawBackdrop[\s\S]{0,3000}?createRadialGradient/.test(h));
  check('drawBackdrop 用 bgGradient()', /function drawBackdrop[\s\S]{0,3000}?bgGradient\(stageId, 'sky'\)/.test(h)
    && /function drawBackdrop[\s\S]{0,3000}?bgGradient\(stageId, 'vignette'\)/.test(h));
  check('冇殘留離屏烘焙層（bake 方案已廢棄）', !/bgLayerFor|bgLayerCache/.test(h));
} finally {
  delete globalThis.ctx;
}

console.log('\n' + (fails ? fails + ' FAIL' : 'ALL PASS'));
process.exit(fails ? 1 : 0);
