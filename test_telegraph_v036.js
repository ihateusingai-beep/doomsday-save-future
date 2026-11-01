/* v0.36.0 #140 守門：chaser 鎖定期 + bomber 引信（telegraph）
 *
 * ⚠️ 呢個 feature 嘅邏輯喺 `tick()` 巨型函數入面（敵人 AI 唔係獨立 function）
 *    → 唔可以像其他 feature 咁抽真函數落 stub 環境跑。
 *    ⇒ 所以本檔用「**條件式結構斷言 + 還原驗證**」：
 *      ① 斷言真 source 入面確實有鎖定／引信嘅結構（唔係淨係有個常數）
 *      ② **還原驗證**：把條件改壞（模擬「冇實作」），確認斷言真係會 fail
 *         → 確保斷言唔係 vacuous（記憶教訓：假守門會喺 repo 留到幾個 cycle 先有人發現）
 *    ⚠️ 行為層（實機：反應窗口真係存在）由 `tools/` 嘅量測 + PLAN #140 驗收線把關。
 */
const fs = require('fs');
const path = require('path');
const h = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

let fails = 0;
function check(label, ok, extra) {
  if (!ok) fails++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (extra ? '  ' + extra : ''));
}
function cval(name) {
  const m = h.match(new RegExp('const ' + name + '\\s*=\\s*([^;]+);'));
  if (!m) throw new Error('抽唔到 const ' + name);
  return new Function('return (' + m[1] + ');')();
}
/* ⚠️ 剝走註解嘅 source —— 結構斷言一定要喺「真 code」度做。
 *    記憶教訓：測試檔自己嘅註解經常包含同一個字串 → regex 命中註解 = 假通過。
 *    （本輪就撞過：碰撞守衛嘅註解寫咗 `e.fuse == null` → 令「守衛只出現一次」數到 2。） */
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
const code = stripComments(h);

/* ---------- 1. 常數存在同數值 ---------- */
console.log('=== 1. telegraph 常數 ===');
const LOCK = cval('CHASER_LOCK_MS');
const FUSE = cval('BOMBER_FUSE_MS');
check('★ CHASER_LOCK_MS = 600（追蹤型鎖定期）', LOCK === 600, '= ' + LOCK);
check('★ BOMBER_FUSE_MS = 500（自爆型引信）', FUSE === 500, '= ' + FUSE);
check('⚠️ 兩個 telegraph 都比最長既有 telegraph（lancer 900ms）短',
  LOCK < 900 && FUSE < 900, 'lock=' + LOCK + ' fuse=' + FUSE);

/* ---------- 2. chaser：追擊邏輯確實被鎖定期閘住 ---------- */
console.log('\n=== 2. chaser 鎖定期（追蹤唔可以喺預警期就轉向）===');
{
  /* 真正嘅結構：追蹤修正方向嘅 if 條件必須包含 e.t > CHASER_LOCK_MS */
  const gated = /if \(e\.chaser && ship && e\.t > CHASER_LOCK_MS\)/.test(h);
  check('★ chaser 追蹤分支被 e.t > CHASER_LOCK_MS 閘住', gated);
  /* 唔可以存在第二個「未閂」嘅 chaser 轉向點（否則閘形同虛設）。
     ⚠️ 繪製層都係 `if (e.chaser && ship)` → 唯一允許嗰處必須帶鎖定期分支（lk）。 */
  const spots = [];
  let idx = -1;
  while ((idx = h.indexOf('if (e.chaser && ship)', idx + 1)) >= 0) spots.push(idx);
  const logicSpots = spots.filter(i => !/const lk = e\.t < CHASER_LOCK_MS/.test(h.slice(i, i + 400)));
  check('★ 冇第二個未閂嘅 chaser 轉向點（閘唔可以形同虛設）', logicSpots.length === 0,
    spots.length + ' 處 e.chaser && ship（其中 ' + logicSpots.length + ' 處未帶鎖定期分支）');
  /* 繪製層要有明顯區分（鎖定期 vs 追擊期唔同樣式） */
  check('★ chaser 繪製有鎖定期分支（lk）', /const lk = e\.t < CHASER_LOCK_MS/.test(h));
  check('★ 鎖定期用粗線（lineWidth = lk ? 2 : 1）', /lineWidth = lk \? 2 : 1/.test(h));
}

/* ---------- 3. bomber：引爆必須等引信完，唔可以入圈即爆 ---------- */
console.log('\n=== 3. bomber 引信（入觸發圈唔可以即爆）===');
{
  /* 引信必須被觸發圈啟動 */
  check('★ 入觸發圈會起引信（e.fuse = BOMBER_FUSE_MS）',
    /e\.fuse == null && bd < BOMBER_TRIGGER_R\) e\.fuse = BOMBER_FUSE_MS/.test(h));
  /* 引信期要停低（畀玩家走位） */
  check('★ 引信期停低（vx = 0 · vy = 0）', /e\.fuse -= dtMs;\s*e\.vx = 0; e\.vy = 0;/.test(h));
  /* 引信未完唔可以爆：爆發條件要經過 fuse */
  check('★ 引信未完唔會爆（boom 只喺 fuse <= 0 先為 true）',
    /boom = e\.fuse <= 0/.test(h) && /if \(boom\)/.test(h));
  /* 唔可以再存在「距離近即刻爆」嘅舊路徑 */
  const oldPath = /if \(Math\.hypot\(ship\.x - e\.x, ship\.y - e\.y\) < BOMBER_TRIGGER_R\)/.test(h);
  check('★ 舊嘅「入圈即爆」路徑已經冇咗', !oldPath);
  /* 繪製層要有引信分支 */
  check('★ bomber 繪製有引信分支（fu）', /const fu = e\.fuse != null && e\.fuse > 0/.test(h));
}

/* ---------- 3b. bomber 引信期唔可以撞到玩家扣血（守 invariant）---------- */
console.log('\n=== 3b. bomber 引信期唔撞人（保住「自爆型唔會撞到玩家扣血」）===');
{
  /* ⚠️ v0.36.0 實作期捉到嘅 regression：bomber 停低起引信後仍然係活體，
     玩家行埋去撞到 → 會扣血 → 「預警」變成「罚玩家」，公平性交換反轉。
     修法：碰撞迴圈加 e.fuse == null 守衛（引信中嘅 bomber 唔參與撞擊判定）。
     ⚠️ e.fuse == null 對非 bomber 係 true（undefined == null）→ 其他敵種行為零改動。 */
  const guard = /if \(e\.fuse == null && Math\.abs\(e\.x - ship\.x\) < 6 \+ r/.test(code);
  check('★ 撞擊判定被 e.fuse == null 守衛閂住（引信期唔扣血）', guard);

  /* 守衛只可以出現喺撞擊判定嗰度（唔可以亂加）· ⚠️ 喺剝走註解嘅 source 度數
     ⚠️ 唔可以數 `e.fuse == null &&` 呢個 token —— 佢有兩個合法用法
        （① 起引信 ② 碰撞守衛）→ 要數「碰撞守衛成個 pattern」 */
  const guardPat = /if \(e\.fuse == null && Math\.abs\(e\.x - ship\.x\) < 6 \+ r/g;
  const guardCount = (code.match(guardPat) || []).length;
  check('★ 碰撞守衛只出現一次（唔可以亂加）', guardCount === 1, '= ' + guardCount + ' 處');

  /* 順序 invariant：引信必須喺「撞得到」之前就起 → 觸發圈 >= 撞擊框最遠距離
     （撞擊框 = |dx| < 6 + r，body r = 9 → 最遠 √(15²+15²) ≈ 21.2） */
  const TRIG = cval('BOMBER_TRIGGER_R');
  const reach = Math.SQRT2 * 15;
  check('★ 引信觸發圈 >= 撞擊框最遠距離（引信一定先過撞擊起）',
    TRIG >= reach, 'trigger=' + TRIG + ' reach=' + reach.toFixed(2));

  /* 引信期 bomber 仍然要會爆（守衛唔可以令佢變成永遠唔爆） */
  check('★ 引信完仍然會爆（守衛唔會令 bomber 失效）',
    /boom = e\.fuse <= 0/.test(h) && /e\._dead = true;\s*continue;/.test(h));
}

/* ---------- 4. 還原驗證（確保上面嘅斷言唔係 vacuous）---------- */
console.log('\n=== 4. 還原驗證（改壞條件 → 斷言必須 fail）===');
{
  const mutants = [
    { name: 'chaser 閘被移除', from: 'e.chaser && ship && e.t > CHASER_LOCK_MS', to: 'e.chaser && ship' },
    { name: 'bomber 引信被移除', from: 'e.fuse == null && bd < BOMBER_TRIGGER_R) e.fuse = BOMBER_FUSE_MS', to: 'bd < BOMBER_TRIGGER_R) e.fuse = BOMBER_FUSE_MS' },
    { name: 'bomber 引信唔停低', from: 'e.vx = 0; e.vy = 0;                /* 引信期停低', to: '/* 引信期停低' },
    { name: 'bomber 引信唔等完就爆', from: 'boom = e.fuse <= 0', to: 'boom = true' },
    { name: '碰撞守衛被移除（引信期會撞到玩家扣血）', from: 'if (e.fuse == null && Math.abs(e.x - ship.x)', to: 'if (Math.abs(e.x - ship.x)' },
  ];
  for (const m of mutants) {
    if (!h.includes(m.from)) { check('還原驗證（' + m.name + '）：原文搵唔到，跳過', false); continue; }
    const mutated = h.replace(m.from, m.to);
    const mcode = stripComments(mutated);
    const stillOk = /if \(e\.chaser && ship && e\.t > CHASER_LOCK_MS\)/.test(mcode)
      && /e\.fuse == null && bd < BOMBER_TRIGGER_R\) e\.fuse = BOMBER_FUSE_MS/.test(mcode)
      && /e\.fuse -= dtMs;\s*e\.vx = 0; e\.vy = 0;/.test(mcode)
      && /boom = e\.fuse <= 0/.test(mcode)
      && /if \(e\.fuse == null && Math\.abs\(e\.x - ship\.x\) < 6 \+ r/.test(mcode);
    check('還原驗證（' + m.name + '）：改壞之後斷言會 fail', !stillOk);
  }
}

/* ---------- 5. 版號 + 平衡守門（唔准改其他嘢）---------- */
console.log('\n=== 5. 版號 + 其他東西零改動 ===');
{
  const m = h.match(/末日救未來 v(\d+)\.(\d+)\.(\d+) 已載入/);
  const ver = m ? [+m[1], +m[2], +m[3]] : null;
  check('★ version >= v0.36.0', !!ver && (ver[0] > 0 || ver[1] > 36 || (ver[1] === 36 && ver[2] >= 0)),
    ver ? ver.join('.') : '—');
  const title = h.match(/fillText\('(v\d+\.\d+\.\d+)[^']*'/);
  check('標題畫面顯示同版號一致', !!title && !!ver && title[1].replace(/^v/, '') === ver.join('.'),
    title ? title[1] : '—');
  /* 敵種總數 / sprite / 強化池不變（#140 唔准加新敵種、唔准改強化池） */
  const marker = 'const UPGRADES = ';
  let i = h.indexOf(marker) + marker.length;
  while (h[i] !== '[') i++;
  let depth = 0, quote = '', end = i;
  for (let j = i; j < h.length; j++) {
    const c = h[j];
    if (quote) { if (c === quote && h[j - 1] !== '\\') quote = ''; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) { end = j + 1; break; } }
  }
  const ups = eval('(' + h.slice(i, end) + ')');
  check('強化池仍然 26 張', ups.length === 26, '= ' + ups.length);
  check('敵種 sprite 沿用原有（chaser / bomber 冇新 sprite）',
    /chaser: \{ x:/.test(h) && /bomber: \{ x:/.test(h));
  check('冇新增 telegraph 常數（只用 CHASER_LOCK_MS / BOMBER_FUSE_MS）',
    (h.match(/const [A-Z_]*WARN_MS\s*=/g) || []).length === 3);
}

console.log('\n' + (fails === 0 ? '✅ 全部通過' : '❌ ' + fails + ' 項失敗'));
process.exit(fails === 0 ? 0 : 1);
