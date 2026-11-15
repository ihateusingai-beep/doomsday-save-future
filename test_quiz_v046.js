/* v0.46.0 守門：答題前置 單元→科目→範疇（PLAN #157） */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const qsrc = fs.readFileSync(path.join(ROOT, 'questions.js'), 'utf8');
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name + (extra || '')); }
  else { fail++; console.log('  ✗ ' + name + (extra || '')); }
}

console.log('\n=== 1. 流程 / STATE ===');
check('★ STATE 有 QUIZ_CAT', /QUIZ_CAT:\s*'QUIZ_CAT'/.test(html));
check('★ 難度後入 QUIZ_UNIT（唔係 SUBJECT）', /fsm\.set\(STATE\.QUIZ_UNIT\)/.test(html) &&
  /function selectDiffAndContinue[\s\S]*?fsm\.set\(STATE\.QUIZ_UNIT\)/.test(html));
check('★ selectQuizUnit → QUIZ_SUBJECT', /function selectQuizUnit[\s\S]*?fsm\.set\(STATE\.QUIZ_SUBJECT\)/.test(html));
check('★ goAfterSubject / selectQuizCat 存在', /function goAfterSubject/.test(html) && /function selectQuizCat/.test(html));
check('★ 版號 v0.46.0', /v0\.46\.0/.test(html));

console.log('\n=== 2. 題庫 cat ===');
const sb = { window: {} };
new Function('window', qsrc)(sb.window);
const BANK = sb.window.DSF_QUIZ_BANK;
check('★ 111 條', BANK.length === 111, ' · ' + BANK.length);
check('★ 全部有 cat', BANK.every(q => typeof q.cat === 'string' && q.cat), ' · ' + BANK.filter(q => !q.cat).length);
const shapes = BANK.filter(q => q.cat === 'shape');
check('★ shape 12 條', shapes.length === 12, ' · ' + shapes.length);
check('★ shape 全 unit=2', shapes.every(q => q.unit === 2));
const arith = BANK.filter(q => q.cat === 'arith');
check('★ arith ≥10 條 unit2', arith.length >= 10 && arith.every(q => q.unit === 2), ' · ' + arith.length);

function pool(subj, unit, cat) {
  const o = [];
  for (const q of BANK) {
    if (subj !== 'all' && q.subj !== subj) continue;
    if (unit !== 0 && q.unit !== unit) continue;
    if (cat !== 'all' && q.cat !== cat) continue;
    o.push(q);
  }
  return o;
}
check('★ U2 數學 all = arith+shape', pool('math', 2, 'all').length === pool('math', 2, 'arith').length + pool('math', 2, 'shape').length);
check('★ U2 shape 池只有 shape', pool('math', 2, 'shape').every(q => q.cat === 'shape'));

console.log('\n=== 3. validate 保留 cat（抽出 source）===');
{
  const m = html.match(/function validateQuizBank\([\s\S]*?\n\}/);
  check('★ validateQuizBank 有 cat 欄', m && /cat:/.test(m[0]));
  const fn = new Function('arr', m[0].replace('function validateQuizBank', 'return function validateQuizBank') + '\nreturn validateQuizBank(arr);');
  /* can't - need different extract */
  const body = m[0];
  check('★ validate 寫入 cat', /cat:\(typeof q\.cat === 'string'/.test(body) || /cat:.*q\.cat/.test(body));
}

console.log('\n=== 4. quizPool 三參 ===');
check('★ quizPool(subj, unit, cat)', /function quizPool\(subj, unit, cat\)/.test(html));
check('★ quizCatsAvailable', /function quizCatsAvailable/.test(html));
check('★ QUIZ_CAT_NAMES 有 shape', /shape:'分辨圖形'/.test(html));
check('★ overlay quizScopeLabel 三截', /function quizScopeLabel[\s\S]*?單元/.test(html));

console.log('\n=== 5. tools/quiz_check ===');
{
  const r = require('child_process').spawnSync('node', [path.join(ROOT, 'tools/quiz_check.js')], { encoding: 'utf8' });
  check('★ quiz_check 全過', r.status === 0, ' · ' + (r.stdout || '').split('\n').slice(-2).join(' '));
}

console.log('\n=== 6. mutant：validate 唔保留 cat ===');
{
  const bad = html.replace(
    /cat:\(typeof q\.cat === 'string' && q\.cat\) \? q\.cat : 'mix',/,
    '/* MUTANT no cat */'
  );
  check('★ mutant 令 cat 行消失', !/cat:\(typeof q\.cat === 'string' && q\.cat\) \? q\.cat : 'mix',/.test(bad) && /cat:\(typeof q\.cat === 'string' && q\.cat\) \? q\.cat : 'mix',/.test(html));
}

console.log('\n' + (fail ? '✗ ' + fail + ' 項失敗' : '✓ v0.46.0 守門全部通過') + ' · pass ' + pass);
process.exit(fail ? 1 : 0);
