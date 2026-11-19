/* v0.47.0 守門：答錯軟代價包（P0+P1）
 *  - 答錯「繼續」鎖 1.8s
 *  - quizWrong 首次答錯計 1；再試唔加
 *  - 結算 金0／銀1–2／銅≥3
 *  - 再試答對半獎 150、streak 唔加
 *  - 答錯關機無 grace；答對先有
 *  - 仍然唔扣血、唔扣已有分
 */
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, 'index.html');
const h = fs.readFileSync(SRC, 'utf8');

let fails = 0;
function check(label, ok, extra) {
  if (!ok) fails++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (extra ? '  ' + extra : ''));
}
function stripComments(src) {
  let out = '', inC = false;
  for (const line of src.split('\n')) {
    const t = line.trim();
    if (inC) { if (t.indexOf('*/') >= 0) inC = false; out += '\n'; continue; }
    if (t.startsWith('/*')) { if (t.indexOf('*/') < 0) inC = true; out += '\n'; continue; }
    if (t.startsWith('//')) { out += '\n'; continue; }
    out += line.replace(/\/\*.*?\*\//g, '') + '\n';
  }
  return out;
}
function block(src, re) {
  const m = src.match(re);
  if (!m) throw new Error('抽唔到 ' + re);
  return m[0];
}
function sandbox(src, name, depNames, ctx, call) {
  const init = depNames.map(n => 'let ' + n + ' = __c[' + JSON.stringify(n) + '];').join('\n');
  const fn = block(src, new RegExp('function ' + name + '\\([\\s\\S]*?\\n\\}'));
  const snap = depNames.map(n => n + ': ' + n).join(',');
  const F = new Function('__c', init + '\n' + fn + '\n' + call + '\nreturn {' + snap + '};');
  return F(ctx);
}
const code = stripComments(h);

console.log('=== v0.47 常數 / 結構 ===');
check('★ QUIZ_CONT_LOCK_MS = 1800', /const QUIZ_CONT_LOCK_MS\s*=\s*1800/.test(code));
check('★ QUIZ_RETRY_SCORE = 150', /const QUIZ_RETRY_SCORE\s*=\s*150/.test(code));
check('★ quizCert 金牌 0 錯', /quizWrong <= 0[\s\S]*?金牌/.test(code));
check('★ quizCert 銀牌 1–2', /quizWrong <= 2[\s\S]*?銀牌/.test(code));
check('★ quizCert 銅牌 ≥3', /銅牌/.test(code));
check('★ quizContLocked 用 quizOk + lock', /!quizOk && performance\.now\(\) < quizContLockUntil/.test(code));
check('★ nextQuiz 守 lock', /if \(quizContLocked\(\)\) return/.test(code));
check('★ closeQuiz grace 跟 quizOk', /quizGraceUntil = quizOk \? \(performance\.now\(\) \+ QUIZ_GRACE_MS\) : 0/.test(code));
check('★ 再試半獎分支', /QUIZ_RETRY_SCORE \* \(affScore/.test(code));
check('★ 答錯計 quizWrong（首次）', /if \(!quizMissedOnce\) \{ quizWrong\+\+; quizMissedOnce = true; \}/.test(code));
check('★ 新局重置 quizWrong', /quizWrong = 0; quizStreak = 0; quizCount = 0;/.test(code));
check('★ HUD 錯 N', /fillText\('錯' \+ quizWrong/.test(code));
check('★ 勝利畫 cert', /qcWin\.t \+ ' · 答錯 ' \+ quizWrong/.test(code));
check('★ 失敗畫 cert', /qcFail\.t \+ ' · 答錯 ' \+ quizWrong/.test(code));
check('★ 版號 v0.47.0', /v0\.47\.0/.test(h));
check('★ 答錯仍唔扣血', !/ship\.hp\s*-=/.test(block(code, /function answerQuiz\(i\) \{[\s\S]*?\n\}/)));
check('★ 答錯仍唔扣分', !/runScore\s*-=/.test(block(code, /function answerQuiz\(i\) \{[\s\S]*?\n\}/)));

console.log('\n=== 行為：鎖 / wrong / 半獎 / grace ===');
{
  const q = { id: 't', subj: 'math', q: '?', opts: ['a', 'b'], a: 1, why: 'w' };
  const deps = ['quizPhase', 'quizQ', 'quizOk', 'quizPick', 'quizStreak', 'QUIZ_SCORE', 'QUIZ_RETRY_SCORE',
                'affScore', 'styScore', 'runScore', 'skillCdUntil', 'bombCDUntil',
                'segMsg', 'segMsgT', 'sfx', 'ttsSpeak', 'quizRetrying', 'quizMissedOnce', 'quizWrong',
                'quizContLockUntil', 'QUIZ_CONT_LOCK_MS', 'performance'];
  let now = 1000;
  const base = {
    quizPhase: 1, quizQ: q, quizOk: false, quizPick: -1, quizStreak: 2, QUIZ_SCORE: 300, QUIZ_RETRY_SCORE: 150,
    affScore: 1, styScore: 1, runScore: 500, skillCdUntil: 1, bombCDUntil: 1,
    segMsg: '', segMsgT: 0, sfx: function () {}, ttsSpeak: function () {},
    quizRetrying: false, quizMissedOnce: false, quizWrong: 0, quizContLockUntil: 0, QUIZ_CONT_LOCK_MS: 1800,
    performance: { now: () => now },
  };
  const w1 = sandbox(code, 'answerQuiz', deps, base, 'answerQuiz(0);');
  check('★ 首次答錯 wrong=1', w1.quizWrong === 1 && w1.quizMissedOnce === true);
  check('★ 首次答錯 lock=now+1800', w1.quizContLockUntil === 2800);

  const w2 = sandbox(code, 'answerQuiz', deps,
    Object.assign({}, base, { quizMissedOnce: true, quizWrong: 1, quizPhase: 1 }),
    'answerQuiz(0);');
  check('★ 同條再錯 wrong 唔加', w2.quizWrong === 1);

  const half = sandbox(code, 'answerQuiz', deps,
    Object.assign({}, base, { quizRetrying: true, quizMissedOnce: true, quizWrong: 1, quizStreak: 0 }),
    'answerQuiz(1);');
  check('★ 再試對 +150', half.runScore === 650);
  check('★ 再試對 streak 仍 0', half.quizStreak === 0);

  /* nextQuiz lock — 一齊抽 quizContLocked */
  {
    const contFn = block(code, /function quizContLocked\(\) \{[\s\S]*?\n\}/);
    const nextFn = block(code, /function nextQuiz\(\) \{[\s\S]*?\n\}/);
    const runNext = (ctx) => {
      const F = new Function('__c', `
        let quizPhase = __c.quizPhase, quizOk = __c.quizOk, quizContLockUntil = __c.quizContLockUntil;
        let quizCdUntil = __c.quizCdUntil, QUIZ_COUNTDOWN = __c.QUIZ_COUNTDOWN;
        const performance = __c.performance;
        ${contFn}
        ${nextFn}
        nextQuiz();
        return { quizPhase, quizCdUntil };
      `);
      return F(ctx);
    };
    const locked = runNext({
      quizPhase: 2, quizOk: false, quizContLockUntil: 5000, quizCdUntil: 0, QUIZ_COUNTDOWN: 1200,
      performance: { now: () => 2000 },
    });
    check('★ lock 中 nextQuiz 無效', locked.quizPhase === 2);
    const unlocked = runNext({
      quizPhase: 2, quizOk: false, quizContLockUntil: 1000, quizCdUntil: 0, QUIZ_COUNTDOWN: 1200,
      performance: { now: () => 2000 },
    });
    check('★ lock 完 nextQuiz → phase3', unlocked.quizPhase === 3);
  }

  /* cert pure */
  const certSrc = block(code, /function quizCert\(\) \{[\s\S]*?\n\}/);
  const CF = new Function('quizWrong', certSrc + '\nreturn quizCert();');
  check('★ cert 0→金', CF(0).t === '金牌');
  check('★ cert 1→銀', CF(1).t === '銀牌');
  check('★ cert 2→銀', CF(2).t === '銀牌');
  check('★ cert 3→銅', CF(3).t === '銅牌');
}

console.log('\n=== mutant（軟代價被拆必須變紅）===');
{
  function softFails(src) {
    const c = stripComments(src);
    let n = 0;
    const rules = [
      /const QUIZ_CONT_LOCK_MS\s*=\s*1800/.test(c),
      /const QUIZ_RETRY_SCORE\s*=\s*150/.test(c),
      /if \(quizContLocked\(\)\) return/.test(c),
      /quizGraceUntil = quizOk \? \(performance\.now\(\) \+ QUIZ_GRACE_MS\) : 0/.test(c),
      /QUIZ_RETRY_SCORE \* \(affScore/.test(c),
      /if \(!quizMissedOnce\) \{ quizWrong\+\+; quizMissedOnce = true; \}/.test(c),
      /quizWrong = 0; quizStreak = 0; quizCount = 0;/.test(c),
      /fillText\('錯' \+ quizWrong/.test(c),
      /qcWin\.t \+ ' · 答錯 ' \+ quizWrong/.test(c),
      /金牌/.test(c) && /銀牌/.test(c) && /銅牌/.test(c),
      !/runScore\s*-=/.test(block(c, /function answerQuiz\(i\) \{[\s\S]*?\n\}/) || ''),
    ];
    for (const ok of rules) if (!ok) n++;
    return n;
  }
  const base = softFails(h);
  check('★ 基線 softFails=0', base === 0, '· ' + base);
  const MUT = [
    ['鎖改 0', h.replace('const QUIZ_CONT_LOCK_MS = 1800;', 'const QUIZ_CONT_LOCK_MS = 0;')],
    ['半獎改全獎', h.replace('const QUIZ_RETRY_SCORE = 150;', 'const QUIZ_RETRY_SCORE = 300;')],
    ['nextQuiz 唔守 lock', h.replace('if (quizContLocked()) return;   /* 答錯鎖 1.8s · 強制睇答案 */', '')],
    ['grace 永遠有', h.replace(
      'quizGraceUntil = quizOk ? (performance.now() + QUIZ_GRACE_MS) : 0;',
      'quizGraceUntil = performance.now() + QUIZ_GRACE_MS;')],
    ['唔計 wrong', h.replace('if (!quizMissedOnce) { quizWrong++; quizMissedOnce = true; }', '')],
    ['勝利冇 cert 字', h.replace("qcWin.t + ' · 答錯 ' + quizWrong + ' 次'", "'分數' ")],
  ];
  let leak = 0;
  for (const [label, mut] of MUT) {
    const n = softFails(mut);
    const ok = n > 0;
    check('★ mutant「' + label + '」變紅', ok, n + ' 項');
    if (!ok) leak++;
  }
  check('★ 全部 mutant 變紅', leak === 0);
}

console.log(fails === 0 ? '\n✓ v0.47 全部通過' : '\n✗ ' + fails + ' 項失敗');
process.exit(fails === 0 ? 0 : 1);
