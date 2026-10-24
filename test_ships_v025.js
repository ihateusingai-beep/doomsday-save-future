/* v0.25.0 戰機重設計：機制差異 + 專屬主動技能 回歸測試
 *
 * 設計前提（PLAN #87–#92）：
 *   三架機各 = 六軸（基礎調味）+ 1 條攻擊節奏 + 1 條被動 + 1 個專屬主動技能。
 *   右掣「炸彈」三架機共用；左掣係每架機專屬技能。
 *   節奏／技能全部喺「形態無關」層面（唔掂 6 種形態卡同 4 個 tag）。
 *
 * 測試方法：唔做 regex 結構檢查（regex 捉唔到「靜靜消失」嘅 bug），
 * 係真係把函數抽出嚟，喺 stub 環境入面實際執行，然後斷言行為。
 */
const fs = require('fs');
const h = fs.readFileSync(__dirname + '/index.html', 'utf8');

let fails = 0;
function check(label, ok, extra) {
  if (!ok) fails++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (extra ? '  ' + extra : ''));
}

/* ---------- 工具：平衡括號掃描器，抽 function 原文 ---------- */
function extractFunction(name) {
  const marker = 'function ' + name + '(';
  const start = h.indexOf(marker);
  if (start < 0) throw new Error('搵唔到 function ' + name);
  const bodyStart = h.indexOf('{', start + marker.length);
  let depth = 0;
  for (let i = bodyStart; i < h.length; i++) {
    const c = h[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return h.slice(start, i + 1);
    }
  }
  throw new Error('括號唔平衡: ' + name);
}
function extractBlock(name) {
  /* 抽 object literal：const NAME = Object.freeze({ ... }); */
  const marker = 'const ' + name + ' = Object.freeze({';
  const start = h.indexOf(marker);
  if (start < 0) throw new Error('搵唔到 ' + name);
  const bodyStart = start + marker.length - 1;   /* marker 本身已經以 { 結尾 */
  let depth = 0;
  for (let i = bodyStart; i < h.length; i++) {
    const c = h[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return h.slice(bodyStart, i + 1);
    }
  }
  throw new Error('括號唔平衡: ' + name);
}
function extractConst(name) {
  /* 抽 module 層 const 嘅原始表達式（測試 stub 要用） */
  const m = h.match(new RegExp('const ' + name + '\\s*=\\s*([^;]+);'));
  if (!m) throw new Error('搵唔到 const ' + name);
  return m[1].trim();
}
function extractConstDecl(name) {
  /* 抽 module 層嘅 let 宣告（測試 stub 要用原句，唔好 hardcode） */
  const m = h.match(new RegExp('let ' + name + '\\s*=\\s*[^;]+;'));
  if (!m) throw new Error('搵唔到 let ' + name);
  return m[0];
}
function stripComments(src) {
  /* 只想查「程式碼」有冇殘留，唔想連歷史說明註解都當中錯 */
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'\"])\/\/[^\n]*/g, '$1');
}
function constValue(name) {
  /* ⚠️ 唔可以用 Number(expr)：Number('20 * Math.PI / 180') = NaN。
     要真正求值先啱，所以用 new Function 即場計。 */
  return new Function('return (' + extractConst(name) + ');')();
}

/* ---------- stub：開火 ---------- */
const SALVO_ANGLE = 20 * Math.PI / 180;
const HEAVY_KNOCK = 3.2;

function makeShip(o) {
  return Object.assign({
    chassis: 'A', x: 160, y: 400,
    hp: 3, maxHp: 3, shield: 0,
    speed: 4, fireRate: 15, fireCD: 0,
    bulletCount: 1, bulletDmg: 1, bulletSpd: 0.44,
    bombCD: 12000, pierce: 0,
    shotForm: 'bolt', shotTags: {},
    skillId: 'dash', skillCdBase: 5000, skillCdMul: 1,
    _holdMs: 0, _ramp: 0, _lastFireGameMs: 0,
    _burstCount: 0, _burstReady: false,
    _bulSpdMul: 1, _bulSpdMulUntil: 0,
    _bulwarkUntil: 0, _overheatUntil: 0,
    _lastDx: 0, _lastDy: -1,
  }, o);
}

function runSpawnShot(shipObj, nowMs) {
  const pushed = [];
  const stubs = {
    ship: shipObj,
    performance: { now: () => nowMs || 0 },
    waveShotCount: 0,
    lootBulletDmg: () => 0,
    countPlayerBullets: () => 0,
    pushPlayerBullet: (b) => pushed.push(b),
    sfx: () => {},
    clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
    fireLaser: () => {},
    MISSILE_CAP: 8,
    /* 遊戲時間鐘（A 機連射加速用；spawnPlayerShot 會記錄最後開火時間） */
    gameClockMs: 1234,
    /* 節奏／重炮嘅 module 層 const 直接由源碼抽，測試唔會同實作脫節 */
    SALVO_EVERY: constValue('SALVO_EVERY'),
    SALVO_N: constValue('SALVO_N'),
    SALVO_ANGLE: constValue('SALVO_ANGLE'),
    HEAVY_KNOCK: constValue('HEAVY_KNOCK'),
  };
  const src = extractFunction('spawnPlayerShot');
  const fn = new Function(...Object.keys(stubs), src + '\nreturn spawnPlayerShot();');
  fn(...Object.values(stubs));
  return pushed;
}

/* ---------- stub：連射加速 ---------- */
function makeRampModule(shipObj) {
  /* ⚠️ gameClockMs 係 module 層 let（連射加速用**遊戲時間**判定連續性，
     唔係 wall-clock）。stub 要自己帶一份 + 提供 setter 推進時間。 */
  const src = extractConstDecl('gameClockMs') + '\n' +
              extractFunction('shipRampFactor') + '\n' + extractFunction('tickShipRhythm');
  const fn = new Function('ship',
    'RAMP_STEP_MS', 'RAMP_GAIN', 'RAMP_MAX', 'RAMP_MAX_LV',
    src + '\nreturn { shipRampFactor, tickShipRhythm,' +
         ' setClock: (v) => { gameClockMs = v; } };');
  return fn(shipObj,
    constValue('RAMP_STEP_MS'), constValue('RAMP_GAIN'),
    constValue('RAMP_MAX'), constValue('RAMP_MAX_LV'));
}

/* ================= 1. 三架機嘅專屬技能唔同 ================= */
console.log('=== 1. 每架機有專屬技能（#87/#88）===');
{
  const src = extractBlock('SHIPS');
  /* v0.26.0 #93：機體由 3 架加到 5 架（A/B/C 機制唔變，D/E 新增）。
     ⚠️ 呢個測試鎖嘅係 **A/B/C 三架嘅行為**，唔係「總共有幾多架」——
        v0.26.0 加咗 D/E，count 硬寫 3 就會誤報。 */
  const ids = [...src.matchAll(/skill:'(dash|bulwark|overheat|recall|converge)'/g)].map(m => m[1]);
  check('五架機五個唔同技能 id', new Set(ids).size === 5 && ids.length === 5, ids.join(','));
  check('A = dash / B = bulwark / C = overheat / D = recall / E = converge',
    ids[0] === 'dash' && ids[1] === 'bulwark' && ids[2] === 'overheat' &&
    ids[3] === 'recall' && ids[4] === 'converge', ids.join(','));
  const cds = [...src.matchAll(/skillCD:(\d+)/g)].map(m => Number(m[1]));
  check('五個技能冷卻全部唔同（5/10/12/8/9 秒）',
    cds.length === 5 && new Set(cds).size === 5 && cds.join('/') === '5000/10000/12000/8000/9000',
    cds.join('/'));
  check('每架機都有節奏名', (src.match(/rhythm:'/g) || []).length === 5);
  check('每架機都有被動名', (src.match(/perkName:'/g) || []).length === 5);
  check('每架機都有技能圖示', (src.match(/skillIcon:'icon_/g) || []).length === 5);
  check('右掣炸彈唔喺 SHIPS（真係三架機共用）', !/bombCD/.test(src));
  check('機體名改咗（游隼/堡壘/熔爐）',
    /name:'游隼'/.test(src) && /name:'堡壘'/.test(src) && /name:'熔爐'/.test(src));
}

/* ================= 2. A 機連射加速 ================= */
console.log('\n=== 2. A 機連射加速（有絕對上限）===');
{
  const s = makeShip({ chassis: 'A' });
  const m = makeRampModule(s);
  check('未開火時倍數 = 1', m.shipRampFactor() === 1, '→ ' + m.shipRampFactor());

  /* 連住開火：每 400ms（遊戲時間）升一級，每級 +8% */
  const steps = [];
  for (let i = 0; i < 12; i++) {
    m.setClock(i * 400);          /* 遊戲時間推進 */
    s._lastFireGameMs = i * 400;  /* 今刻啱啱射過一發（連續中） */
    m.tickShipRhythm(400);
    steps.push(Number(m.shipRampFactor().toFixed(4)));
  }
  check('每 0.4 秒升一級', steps[1] === 1.08 && steps[2] === 1.16,
    steps.slice(0, 4).join(' → '));
  check('射速上限 ×1.6（唔會失控）', m.shipRampFactor() === 1.6,
    '→ ' + m.shipRampFactor());
  check('升到頂之後唔會再升', steps.every(v => v <= 1.6));

  /* 停手 0.4 秒 → 回落（用遊戲時間判定） */
  m.setClock(9999);
  s._lastFireGameMs = 9000;       /* 已經停手 999ms */
  m.tickShipRhythm(16);
  check('停手之後回落返 1', m.shipRampFactor() === 1, '→ ' + m.shipRampFactor());
  check('回落時 _holdMs 清零', s._holdMs === 0);

  /* 低 FPS 裝置健壯性：掉幀到 1 秒一次，遊戲時間判定唔會誤判「停手」
     （實機驗證發現過：wall-clock 判定喺低 FPS 令 A 機永遠升唔到 ×1.6） */
  const s2 = makeShip({ chassis: 'A' });
  const m2 = makeRampModule(s2);
  for (let i = 1; i <= 13; i++) {
    m2.setClock(i * 1000);            /* 每秒一幀（極端掉幀） */
    s2._lastFireGameMs = i * 1000;    /* 每幀都射過 */
    m2.tickShipRhythm(250);           /* 固定步上限 250ms */
  }
  /* 13 幀 × 250ms = 3250ms 遊戲時間 → 應該升到 ×1.6（重點係**冇被 reset**） */
  check('低 FPS（1fps）都照升到 ×1.6（唔會被誤判停手）', m2.shipRampFactor() === 1.6,
    '→ ' + m2.shipRampFactor());

  /* B / C 唔受連射加速影響 */
  const sb = makeShip({ chassis: 'B', _ramp: 8 });
  const mb = makeRampModule(sb);
  check('B 機唔受連射加速影響', mb.shipRampFactor() === 1);
  const sc = makeShip({ chassis: 'C', _ramp: 8 });
  const mc = makeRampModule(sc);
  check('C 機唔受連射加速影響', mc.shipRampFactor() === 1);
}

/* ================= 3. B 機齊射扇形 ================= */
console.log('\n=== 3. B 機齊射扇形（每 4 發一次，±20°）===');
{
  const s = makeShip({ chassis: 'B', bulletCount: 2, fireRate: 7, bulletSpd: 0.26 });
  const o1 = runSpawnShot(s);
  check('第 1 發 = 2 粒（普通）', o1.length === 2, '→ ' + o1.length);
  check('開火時有記低遊戲時間（連射加速用）', s._lastFireGameMs === 1234,
    '→ ' + s._lastFireGameMs);
  const a1 = Math.atan2(o1[0].vy, o1[0].vx);
  check('普通發係窄扇（±0.04 rad）', Math.abs(Math.abs(a1 + Math.PI / 2) - 0.04) < 1e-9,
    '→ ' + (Math.abs(a1 + Math.PI / 2)).toFixed(4));

  runSpawnShot(s);
  runSpawnShot(s);
  const o4 = runSpawnShot(s);
  check('第 4 發 = 3 粒（齊射）', o4.length === 3, '→ ' + o4.length);
  const angs = o4.map(b => Math.atan2(b.vy, b.vx));
  check('中央彈正前（-90°）', Math.abs(angs[1] + Math.PI / 2) < 1e-9);
  check('左右彈各 ±20°',
    Math.abs((angs[0] - angs[1]) + SALVO_ANGLE) < 1e-9 &&
    Math.abs((angs[2] - angs[1]) - SALVO_ANGLE) < 1e-9,
    '→ ' + ((angs[0] - angs[1]) * 180 / Math.PI).toFixed(1) + '° / ' +
       ((angs[2] - angs[1]) * 180 / Math.PI).toFixed(1) + '°');
  check('齊射之後回到普通發', s._burstReady === false && s._burstCount === 0);
  const o5 = runSpawnShot(s);
  check('第 5 發返做 2 粒', o5.length === 2, '→ ' + o5.length);

  /* 齊射「存起」：laser 形態唔出實彈，齊射唔會白白消失 */
  const s2 = makeShip({ chassis: 'B', bulletCount: 2, shotForm: 'laser' });
  for (let i = 0; i < 4; i++) runSpawnShot(s2);
  check('laser 形態唔出彈但齊射已存起', s2._burstReady === true);
  s2.shotForm = 'bolt';
  const oBank = runSpawnShot(s2);
  check('下次出實彈就兌現齊射（3 粒）', oBank.length === 3, '→ ' + oBank.length);
}

/* ================= 4. C 機重炮 + 擊退 ================= */
console.log('\n=== 4. C 機重炮（粗彈 + 擊退）===');
{
  const s = makeShip({ chassis: 'C', bulletCount: 1, bulletDmg: 6, bulletSpd: 0.30, fireRate: 4 });
  const o = runSpawnShot(s);
  check('每次只出 1 粒（單發重炮）', o.length === 1, '→ ' + o.length);
  check('彈有 heavy 標記', o[0].heavy === true);
  check('彈有擊退值', o[0].knock === HEAVY_KNOCK, '→ ' + o[0].knock);
  check('重炮唔會變多粒', runSpawnShot(s).length === 1);

  /* 擊退只對雜魚生效，boss 唔食 */
  const kbSrc = extractFunction('applyKnockback');
  /* ⚠️ new Function(body) 本身係一個 function；要 call 一次（尾部加 ()）
     先會真正執行 body 攞返內部嘅 applyKnockback。 */
  const kb = new Function(kbSrc + '\nreturn applyKnockback;')();
  const grunt = { kind: 'grunt', x: 160, y: 100 };
  kb(grunt, 0, -100, HEAVY_KNOCK);
  check('雜魚會被擊退', grunt.ky !== undefined && grunt.ky < 0,
    '→ ky=' + grunt.ky);
  const boss = { kind: 'spiral', x: 160, y: 80 };
  kb(boss, 0, -100, HEAVY_KNOCK);
  check('boss 唔會被擊退', boss.kx === undefined && boss.ky === undefined);

  /* 擊退唔會將敵人推出畫面頂（離開畫面 = 走脫 = 冇分） */
  check('擊退有「唔好推出畫面頂」保護',
    /if \(e\.y < 10\) \{ e\.y = 10; e\.ky = 0; \}/.test(h));
}

/* ================= 5. A 機衝刺彈速加成 ================= */
console.log('\n=== 5. A 機衝刺（彈速 ×1.8）===');
{
  const s = makeShip({ chassis: 'A', _bulSpdMul: 1.8, _bulSpdMulUntil: 1e9 });
  const o = runSpawnShot(s, 100);
  check('技能生效期間彈速 ×1.8',
    Math.abs(o[0].vy - (-0.44 * 1.8)) < 1e-9, '→ vy=' + o[0].vy.toFixed(4));
  const s2 = makeShip({ chassis: 'A', _bulSpdMul: 1.8, _bulSpdMulUntil: 50 });
  const o2 = runSpawnShot(s2, 100);
  check('技能過期後彈速還原',
    Math.abs(o2[0].vy - (-0.44)) < 1e-9, '→ vy=' + o2[0].vy.toFixed(4));
  check('衝刺方向用玩家最後移動方向',
    /ship\._lastDx = vx \/ len/.test(h) && /ship\._lastDx = dx \/ d/.test(h));
}

/* ================= 6. 被動：機體差異真係有效果 ================= */
console.log('\n=== 6. 三個被動都有 game logic（零死卡）===');
{
  check('A 機：擦彈回充 ×2', /ship\.chassis === 'A' \? 2 : 1/.test(h));
  check('B 機：受傷後 1.2 秒無敵',
    /ship\.chassis === 'B'\)[\s\S]{0,120}performance\.now\(\) \+ 1200/.test(h));
  check('C 機：擊殺回充炸彈',
    /ship\.chassis === 'C' && bombCDUntil > 0/.test(h));
  check('B 機：護盾技能期間護盾唔會被打穿',
    /_bulwarkUntil[\s\S]{0,120}ship\.shield -= 1/.test(h) &&
    /ship\.shield -= 1[\s\S]{0,40}\}/.test(h));
  check('C 機：過熱期間射速 ×2',
    /isOverheatActive\(\) \? 2 : 1/.test(h));
  check('C 機：過熱期間移速 ×0.6',
    /isOverheatActive\(\) \? 0\.6 : 1/.test(h));
}

/* ================= 7. 強化卡 / 裝備語意通用化 ================= */
console.log('\n=== 7. focus_d + 節能裝備改成「專屬技能冷卻」===');
{
  check('focus_d 仍然存在（強化池維持 26 張、零新卡）', /id:'focus_d'/.test(h));
  check('focus_d 改成減技能冷卻',
    /id:'focus_d'[\s\S]{0,260}skillCdMul = Math\.max\(0\.4/.test(h));
  check('focus_d 唔再寫 focusFactor', !/s\.focusFactor/.test(h));
  check('裝備「節能」改成 skillCdDelta',
    /id:'eco'[\s\S]{0,120}skillCdDelta:-2000/.test(h));
  check('lootSkillCd() 讀 skillCdDelta',
    /function lootSkillCd\(\)[\s\S]{0,200}if \(d && d\.skillCdDelta\)/.test(h));
  check('技能冷卻有下限 2000ms',
    /Math\.max\(2000,[\s\S]{0,80}lootSkillCd\(\)\)/.test(h));
  check('五架機都有專屬技能 → 呢兩樣對五架機都仲有用',
    /skillCD:5000/.test(h) && /skillCD:10000/.test(h) && /skillCD:12000/.test(h) &&
    /skillCD:8000/.test(h) && /skillCD:9000/.test(h));
}

/* ================= 8. 零死代碼（所有新欄位都有讀） ================= */
console.log('\n=== 8. 零死代碼：欄位唔可以只寫唔讀 ===');
{
  const FIELDS = ['_ramp', '_holdMs', '_lastFireGameMs', '_burstCount', '_burstReady',
                  '_bulSpdMul', '_bulSpdMulUntil', '_bulwarkUntil', '_overheatUntil',
                  '_lastDx', '_lastDy', 'skillId', 'skillCdBase', 'skillCdMul'];
  const dead = FIELDS.filter(f => {
    const uses = (h.match(new RegExp('\\b' + f + '\\b', 'g')) || []).length;
    return uses < 2;   /* 定義 + 至少 1 次讀 */
  });
  check('14 個新欄位全部有 game logic 讀', dead.length === 0, dead.join(','));

  /* 舊「聚焦」機制嘅殘留一定要清乾淨 */
  const LEFTOVER = ['skillDur', 'ship.skillActiveUntil', '_spdMul', 'isFocusActive', '_lastFireAt',
                    'focusCDUntil', 'focusActiveUntil', 'focusFactor', 'focusDuration',
                    'lootFocusCd', 'focusCdDelta', 'tryFocus', 'focusSlowFactor'];
  const code = stripComments(h);   /* 註解入面提到舊機制係正常嘅歷史說明 */
  const left = LEFTOVER.filter(k => code.indexOf(k) >= 0);
  check('舊聚焦機制喺程式碼冇殘留（包括未定義引用）', left.length === 0, left.join(','));
  check('已定義嘅 isSkillActive 有被用', /isSkillActive\(\)/.test(h));
}

/* ================= 9. 形態無關（唔會同 6 形態 / 4 tag 打架） ================= */
console.log('\n=== 9. 技能 / 節奏喺「形態無關」層面 ===');
{
  const trySkill = extractFunction('trySkill');
  check('trySkill 唔掂 shotForm（形態卡不受影響）', !/shotForm/.test(trySkill));
  check('trySkill 唔掂 shotTags', !/shotTags/.test(trySkill));
  /* 節奏 / 技能層唔可以寫 shotForm（形態卡嘅專利）。
     ⚠️ applyUpgrades() 嘅 ship.shotForm = 'bolt' 係重設形態（一直都有），
     唔算節奏掂形態，所以要 scope 落節奏 / 技能函數先準。 */
  const rhythmFns = extractFunction('shipRampFactor') + extractFunction('tickShipRhythm') +
                    extractFunction('spawnPlayerShot') + extractFunction('trySkill');
  check('節奏 / 技能唔掂 shotForm', !/shotForm\s*=/.test(rhythmFns));
  check('三個技能只影響射速 / 護盾 / 移動 / 命中判定',
    /skillId/.test(h) && /isOverheatActive/.test(h) && /_bulwarkUntil/.test(h));
}

/* ================= 10. 可讀性：3 秒認得出 ================= */
console.log('\n=== 10. #90 可讀性規則 ===');
{
  check('選機卡顯示機名', /lab\.id \+ ' · ' \+ c\.name/.test(h));
  check('選機卡顯示節奏', /ctx\.fillText\(c\.rhythm/.test(h));
  check('選機卡顯示專屬技能名', /ctx\.fillText\(c\.skillName/.test(h));
  check('選機卡顯示專屬技能圖示（圖集，零 emoji）',
    /drawIcon\(c\.skillIcon/.test(h));
  check('選機卡顯示被動', /ctx\.fillText\(c\.perkName/.test(h));
  check('HUD 左掣跟機體顯示技能名',
    /label: c \? c\.skillName : '技能'/.test(h) &&
    /name: c \? c\.skillName : '技能'/.test(h));
  check('HUD 節奏狀態 chip 存在', /txt = c\.rhythm/.test(h) && /齊射就緒/.test(h));
  check('冇 emoji 做 icon（只用圖集 sprite）',
    !/icon:[\s]*'[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(h));
  check('技能 icon 全部來自圖集 icon_*',
    (h.match(/skillIcon:'icon_[a-z]+'/g) || []).length === 5);
}

/* ================= 11. 版號 ================= */
console.log('\n=== 11. 版號（v0.25.0 嘅基線，之後升版都要仲係 >=）===');
{
  const title = h.match(/末日救未來 (v[\d.]+) 已載入/);
  check('啟動日誌有版號', !!title, '→ ' + (title && title[1]));
  /* ⚠️ 唔可以硬寫版本號 —— 每個新版本都會令呢個測試誤報。
     改成「版本 >= v0.25.0」，並且同標題畫面嘅版號一致。 */
  const ver = title && title[1];
  const num = ver ? ver.replace('v', '').split('.').map(Number) : [0, 0, 0];
  check('版號 >= v0.25.0', num[0] > 0 || num[1] > 25, '→ ' + ver);
  const titleVer = h.match(/fillText\('(v[\d.]+) · /);
  check('標題畫面版號一致', !!titleVer && titleVer[1] === ver,
    '→ ' + (titleVer && titleVer[1]));
}

console.log(fails === 0 ? '\n✅ 全部通過' : '\n❌ ' + fails + ' 項失敗');
process.exit(fails === 0 ? 0 : 1);
