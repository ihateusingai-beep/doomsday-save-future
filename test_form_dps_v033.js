/* v0.33.0 #123 形態卡 DPS 帶守門測試
 *
 * 背景（MECHANICS_REVIEW_v032.md §1 P0-1，實測）：
 *   原本 applyShotFormCosts() 用**絕對射速乘數**（boom ×0.15 / miss ×0.07 / rail ×0.35），
 *   但 5 架機嘅基礎射速差 3.75 倍（C 4/s ↔ A 15/s）→
 *   boom / miss / wave 三張卡喺 **5/5 機體全部 <1×**（揀咗之後 DPS 反而跌過唔揀）。
 *   v0.28.0 嘅校準只對住單一機體做過 → 整體帶咗出嚟嘅係「每架機各自唔同嘅帶」。
 *
 * 修正（PLAN #123）：每張形態卡 × 每架機體一格**傷害乘數**（FORM_DPS_MUL），
 *   目標 2.0×（相對無卡）。DPS 對「每發傷害」係線性 → 一輪實測就收斂。
 *   ⚠️ 只校準傷害、唔改射速 → 各形態嘅節奏身份（導彈慢 / 迴力鏢往返 / 軌道炮一發一線）保留。
 *
 * 本檔係**結構守門**（表存在 / 接線正確 / 節奏保留 / 零死欄位）。
 *   數值驗收線（每張卡 5 架機全部 ≥1.5× 且 max÷min ≤2×）靠**實機量測**，
 *   記錄喺 PLAN #123 同 MECHANICS_REVIEW_v033.md。
 */
const fs = require('fs');
const h = fs.readFileSync(__dirname + '/index.html', 'utf8');

let fails = 0;
function check(label, ok, extra) {
  if (!ok) fails++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (extra ? '  ' + extra : ''));
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

const FORMS = ['laser', 'rail', 'boomerang', 'missile', 'wave'];
const CHASSIS = ['A', 'B', 'C', 'D', 'E'];

/* ⚠️ FORM_DPS_MUL 一定要喺**模組層**宣告（唔可以放喺 block 入面）：
   applyShotFormCosts() 係用 direct eval 抽出嚟嘅（function 宣告會漏到模組層），
   佢喺執行時要喺同一個 scope 搵到 FORM_DPS_MUL → block 入面嘅 const 佢見唔到。
   ⚠️ eval 成物件字面量表達式（直接 eval('const ...') 嘅 const 唔會漏出 scope）。 */
const FORM_DPS_MUL = eval('(' + h.match(/const FORM_DPS_MUL = \{[\s\S]*?\n\};/)[0]
  .replace(/^const FORM_DPS_MUL = /, '').replace(/;\s*$/, '') + ')');

section('1. FORM_DPS_MUL 表（5 張形態 × 5 架機 = 25 格）');
{
  check('FORM_DPS_MUL 表存在', /const FORM_DPS_MUL = \{/.test(h));
  check('表有 5 張形態', FORMS.every(f => FORM_DPS_MUL[f]),
    FORMS.filter(f => !FORM_DPS_MUL[f]).join(',') || '全齊');
  check('每張形態有 5 架機', FORMS.every(f => CHASSIS.every(s => typeof FORM_DPS_MUL[f][s] === 'number')),
    '共 ' + FORMS.reduce((n, f) => n + CHASSIS.filter(s => typeof FORM_DPS_MUL[f][s] === 'number').length, 0) + ' 格');
  check('25 格全部有限正數（唔會 NaN / 0 / 負）',
    FORMS.every(f => CHASSIS.every(s => isFinite(FORM_DPS_MUL[f][s]) && FORM_DPS_MUL[f][s] > 0)));
  const all = FORMS.flatMap(f => CHASSIS.map(s => FORM_DPS_MUL[f][s]));
  check('乘數範圍合理（0.05 – 20 之間，唔會失控）',
    Math.min(...all) >= 0.05 && Math.max(...all) <= 20,
    Math.min(...all).toFixed(3) + ' – ' + Math.max(...all).toFixed(3));
  check('★ 表係「相對該機體」嘅（同一張卡 5 架機唔應該全部一樣）',
    FORMS.every(f => new Set(CHASSIS.map(s => FORM_DPS_MUL[f][s])).size > 1),
    FORMS.filter(f => new Set(CHASSIS.map(s => FORM_DPS_MUL[f][s])).size === 1).join(',') || '每張都唔同');
}

section('2. applyShotFormCosts 接線（真函數 eval 落測試檔 scope）');
{
  /* ⚠️ AI_INSTRUCTIONS.md §5.1.1：依賴要 eval 返去測試檔 scope，own arity 保持原樣 */
  eval(h.match(/function applyShotFormCosts\(s\) \{[\s\S]*?\n\}/)[0]);
  const mk = (form, chassis) => ({ fireRate: 10, bulletSpd: 0.3, shotForm: form, shotTags: {}, chassis });

  let s = mk('bolt', 'A'); applyShotFormCosts(s);
  check('bolt（冇卡）→ formDmgMul = 1', s.formDmgMul === 1, String(s.formDmgMul));

  s = mk('laser', 'C'); applyShotFormCosts(s);
  check('laser on C → 表值', Math.abs(s.formDmgMul - FORM_DPS_MUL.laser.C) < 1e-9, String(s.formDmgMul));

  s = mk('missile', 'E'); applyShotFormCosts(s);
  check('missile on E → 表值', Math.abs(s.formDmgMul - FORM_DPS_MUL.missile.E) < 1e-9, String(s.formDmgMul));

  s = mk('wave', 'Z'); applyShotFormCosts(s);
  check('未知機體 → 1（唔會 NaN / undefined）', s.formDmgMul === 1, String(s.formDmgMul));

  s = mk('bolt', 'A'); s.formDmgMul = 999; applyShotFormCosts(s);
  check('★ 每次都重算（切換形態唔會殘留舊乘數）', s.formDmgMul === 1, String(s.formDmgMul));
}

section('3. 節奏身份保留（v0.28.0 嘅射速代價唔准改）');
{
  eval(h.match(/function applyShotFormCosts\(s\) \{[\s\S]*?\n\}/)[0]);
  const mk = (form) => ({ fireRate: 10, bulletSpd: 0.3, shotForm: form, shotTags: {}, chassis: 'A' });
  let s = mk('boomerang'); applyShotFormCosts(s);
  check('boom fireRate ×0.15（往返彈仍然慢）', Math.abs(s.fireRate - 1.5) < 1e-9, String(s.fireRate));
  s = mk('missile'); applyShotFormCosts(s);
  check('missile fireRate ×0.07（慢但追仍然慢）', Math.abs(s.fireRate - 0.7) < 1e-9, String(s.fireRate));
  s = mk('rail'); applyShotFormCosts(s);
  check('rail fireRate ×0.35（一發一線仍然慢）', Math.abs(s.fireRate - 3.5) < 1e-9, String(s.fireRate));
  s = mk('wave'); applyShotFormCosts(s);
  check('wave bulletSpd ×0.9（左右擺仍然慢）', Math.abs(s.bulletSpd - 0.27) < 1e-9, String(s.bulletSpd));
  s = mk('laser'); applyShotFormCosts(s);
  check('★ laser 唔改射速（佢嘅 DPS 由 tick 率主導，改咗冇用 = 死卡）',
    Math.abs(s.fireRate - 10) < 1e-9, String(s.fireRate));
}

section('4. 傷害乘數真係接到傷害出口（唔係宣告咗就算）');
{
  check('spawnPlayerShot 讀 formDmgMul', /const formMul = ship\.formDmgMul \|\| 1;/.test(h));
  check('普通／形態子彈：dmg *= formMul（喺形態分支之後）',
    /dmg \*= formMul;/.test(h));
  const railHit = /dmg: baseDmg \* formMul/.test(h);
  check('軌道炮：dmg = baseDmg * formMul', railHit);
  const laserHits = (h.match(/\* 0\.35 \* \(ship\.formDmgMul \|\| 1\)/g) || []).length;
  check('★ laser 兩個傷害出口（fireLaser + laserTick）都乘咗', laserHits === 2, laserHits + ' 處');
  const reads = (h.match(/formDmgMul/g) || []).length;
  check('★ formDmgMul 有多過 1 個讀取點（唔係死欄位）', reads >= 5, reads + ' 處');
}

section('5. 導彈生命期修正（慢機體物理上飛唔到 boss）');
{
  check('生命期按飛行時間計（唔再寫死 2200）',
    /life = maxLife = Math\.max\(2200, Math\.ceil\(needMs\)\)/.test(h));
  check('計算式用鎖定期 + 距離 ÷ 巡航速',
    /MISSILE_LOCK_MS \+ 400 \/ Math\.max\(0\.02, cruise\)/.test(h));
  /* ⚠️ 實測揪出嘅真 bug：B / C / E 機導彈 12 秒只有 0.44 次命中
     （DPS = 無卡嘅 0.06× / 0.18× / 0.11×），加幾多傷害乘數都係 0.000×
     —— 因為「物理上飛唔到 boss」。呢度驗證修正後生命期夠唔夠飛到。 */
  const SHIP_SPD = { A: 0.44, B: 0.26, C: 0.30, D: 0.40, E: 0.28 };
  const DIST = 362;   /* 機身 y=412 → boss 最遠 y=50 */
  for (const [k, spd] of Object.entries(SHIP_SPD)) {
    const cruise = spd * 0.55 * 1.15;                       /* 鎖定期後嘅巡航速 */
    const need = 400 + Math.ceil(DIST / cruise);            /* 鎖定期 + 飛行時間 */
    const life = Math.max(2200, Math.ceil(400 + 400 / cruise));
    check(`${k} 機導彈生命期 ${life}ms ≥ 飛到 boss 所需 ${need}ms`, life >= need,
      `${(life - need) >= 0 ? '餘 ' + (life - need) : '唔夠 ' + (need - life)}ms`);
  }
}

section('6. 版號 + PLAN 條目');
{
  const ver = (h.match(/末日救未來 v(\d+\.\d+\.\d+) 已載入/) || [])[1] || '0.0.0';
  const v = ver.split('.').map(Number);
  check('版本 >= v0.33.0', v[0] > 0 || v[1] > 33 || (v[1] === 33 && v[2] >= 0), '→ ' + ver);
  const plan = fs.readFileSync(__dirname + '/PLAN.md', 'utf8');
  check('PLAN 有 #123 形態卡 DPS 帶條目', /\| 123 \|.*形態卡 DPS 帶/.test(plan));
  check('PLAN 有 #124 變體 D 條目', /\| 124 \|.*變體 D/.test(plan));
}

console.log('\n' + (fails === 0 ? '✓ 全部通過' : '✗ ' + fails + ' 項失敗'));
process.exit(fails === 0 ? 0 : 1);
