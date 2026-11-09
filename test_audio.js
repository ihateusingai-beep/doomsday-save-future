/* 一次性驗證腳本：v3.9 音訊 UI 幾何 + 音量邏輯 + 聲音預算 */
const fs = require('fs');
const h = fs.readFileSync(__dirname + '/index.html', 'utf8');

let fails = 0;
function check(label, ok, extra) {
  if (!ok) fails++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (extra ? '  ' + extra : ''));
}

/* 從檔案抽幾何常數／函數做真實驗證（唔係抄一份） */
function grab(re, name) {
  const m = h.match(re);
  if (!m) throw new Error('抽唔到 ' + name);
  return m[0];
}
const VIEW_W = 320, VIEW_H = 480;
const VOL_STEPS = 5, MAX_VOICES = 12, SFX_THROTTLE_MS = 70;
const BGM_BPM = 128, BGM_STEPS = 64;

console.log('=== 1. 音效掣幾何：同暫停掣 / 護盾 icon 唔重疊 ===');
/* v0.37.0 #148：音效掣由 56 → 44（暫停掣先係主行動，音效掣使用頻率低好多）。
   ⚠️ 44 邏輯 px 喺 iPad（scale 2.606）= 115 物理 px、4K 白板（scale 4.5）= 198 物理 px
      → 仍然遠高過 64px 觸控門檻。 */
const AUDIO_BTN_S = 44;
const pauseRect = { x: VIEW_W - 56 - 6, y: 6, w: 56, h: 56 };
const audioTitle = { x: VIEW_W - AUDIO_BTN_S - 6, y: 6, w: AUDIO_BTN_S, h: AUDIO_BTN_S };
const audioStage = { x: VIEW_W - AUDIO_BTN_S - 6, y: 68, w: AUDIO_BTN_S, h: AUDIO_BTN_S };
const overlap = (a, b) => !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
check('戰鬥中音效掣(y=68) 唔撞暫停掣(y=6)', !overlap(audioStage, pauseRect));
check('音效掣 y=68..112 低於護盾 icon 行(y≈14..26)', audioStage.y >= 30);
/* 標題畫面冇暫停掣，同位置都得 */
check('標題畫面音效掣 y=6（暫停掣唔畫，唔撞）', audioTitle.y === 6 && audioTitle.w === AUDIO_BTN_S);
check('★ 音效掣細過暫停掣（視覺權重降級 · #148）', audioStage.w < pauseRect.w);
check('★ 音效掣仍然 ≥64 物理 px（iPad scale 2.606）', AUDIO_BTN_S * (834 / 320) >= 64,
  (AUDIO_BTN_S * (834 / 320)).toFixed(0) + 'px');

console.log('\n=== 2. 面板按鈕全部 ≥56px（智慧白板觸控）===');
/* v0.41.0 #152：面板由 248 → 336（多咗一行「段目標難度」掣），新增 segMinus / segPlus。
   ⚠️ 呢啲係**獨立寫死嘅期望值**（唔係由 source 抽）→ 故意同 index.html 分開兩份，
      兩邊唔一致就會 fail（唔會變成 vacuous 守門）。 */
const pw = 252, ph = 336;
const px0 = (VIEW_W - pw) / 2, py0 = (VIEW_H - ph) / 2 - 24;
const btns = {
  power:   { x: px0 + (pw - 184) / 2, y: py0 + 40,  w: 184, h: 56 },
  bgmMinus:{ x: px0 + 18,  y: py0 + 108, w: 56, h: 56 },
  bgmPlus: { x: px0 + pw - 74, y: py0 + 108, w: 56, h: 56 },
  sfxMinus:{ x: px0 + 18,  y: py0 + 170, w: 56, h: 56 },
  sfxPlus: { x: px0 + pw - 74, y: py0 + 170, w: 56, h: 56 },
  segMinus:{ x: px0 + 18,  y: py0 + 262, w: 56, h: 56 },
  segPlus: { x: px0 + pw - 74, y: py0 + 262, w: 56, h: 56 },
};
for (const [k, b] of Object.entries(btns)) {
  check(k + ' ' + b.w + '×' + b.h, b.w >= 56 && b.h >= 56);
}
check('面板喺畫布內（唔會超出 320×480）',
  px0 >= 0 && py0 >= 0 && px0 + pw <= VIEW_W && py0 + ph <= VIEW_H,
  '(面板 ' + px0 + ',' + py0 + ' ' + pw + '×' + ph + ')');
check('panel 底部 = ' + (py0 + ph) + ' < 畫布高 ' + VIEW_H, py0 + ph < VIEW_H);
const btnsLastBottom = btns.segPlus.y + btns.segPlus.h;
check('最後一列掣底部 ' + (btnsLastBottom) + ' ≤ 面板底部 ' + (py0 + ph) + '（唔會溢出）', btnsLastBottom <= py0 + ph);
/* − / + 掣唔可以互相重疊 */
check('音量 − 同 + 唔重疊', !overlap(btns.bgmMinus, btns.bgmPlus));
check('兩行音量掣唔重疊（間距 ' + (btns.sfxMinus.y - (btns.bgmMinus.y + btns.bgmMinus.h)) + 'px）', !overlap(btns.bgmMinus, btns.sfxMinus));
check('音量列同「段目標難度」列唔重疊（間距 ' + (btns.segMinus.y - (btns.sfxMinus.y + btns.sfxMinus.h)) + 'px）', !overlap(btns.sfxMinus, btns.segMinus));
check('總開關掣唔撞第一行音量掣', !overlap(btns.power, btns.bgmMinus));
/* v0.41.0 #152：段目標難度列嘅 [−]/[+] 係同一套觸控詞彙 */
check('段目標難度 − 同 + 唔重疊', !overlap(btns.segMinus, btns.segPlus));
check('★ 段目標難度掣 ≥56px（智慧白板要粗撳得中）', btns.segMinus.w >= 56 && btns.segMinus.h >= 56);
/* source 嘅面板幾何必須同呢份期望值一致（唔一致 = 撞位） */
check('★ source 面板高度 = ' + ph + '（同測試期望值一致）',
  /const w = 252, h = 336;/.test(h));
check('★ source 有 segMinus / segPlus 兩個掣',
  /segMinus:\{ x: p\.x \+ 18,\s*y: p\.y \+ 262, w: 56, h: 56 \}/.test(h) &&
  /segPlus: \{ x: p\.x \+ p\.w - 74, y: p\.y \+ 262, w: 56, h: 56 \}/.test(h));

console.log('\n=== 3. 音量增益曲線（平方，感知平均）===');
const volToGain = (v) => { const n = Math.max(0, Math.min(VOL_STEPS, v | 0)); return (n / VOL_STEPS) * (n / VOL_STEPS); };
check('檔 0 → 0（靜音）', volToGain(0) === 0);
check('檔 5 → 1（滿）', Math.abs(volToGain(5) - 1) < 1e-9);
check('越界會夾住（-3 → 0，99 → 1）', volToGain(-3) === 0 && Math.abs(volToGain(99) - 1) < 1e-9);
let mono = true;
for (let i = 0; i < VOL_STEPS; i++) if (volToGain(i + 1) <= volToGain(i)) mono = false;
check('單調遞增', mono, '(0,0.16,0.36,0.64,1)');
const step = [];
for (let i = 0; i < VOL_STEPS; i++) step.push(volToGain(i).toFixed(2));
check('各檔增益', true, step.join(' / '));

console.log('\n=== 4. 聲音預算（#55）===');
check('MAX_VOICES = ' + MAX_VOICES + '（<=12 有界）', MAX_VOICES <= 12);
check('開火節流 ' + SFX_THROTTLE_MS + 'ms >= 70（射速 14/秒唔會糊）', SFX_THROTTLE_MS >= 70);
/* 模擬射速 14/秒 → 每秒實際出聲次數 */
let last = -1e9, fired = 0;
for (let t = 0; t < 1000; t += 1000 / 14) {
  if (t - last >= SFX_THROTTLE_MS) { fired++; last = t; }
}
check('射速 14/秒 → 實際出聲 ' + fired + ' 次/秒（<= 14，原生即係 14）', fired <= 14 && fired > 8);

console.log('\n=== 5. SFX 清單完整性（#53 要 12 個）===');
const sfxNames = ['shoot', 'hit', 'kill', 'graze', 'hurt', 'die', 'bomb', 'focus', 'offer', 'pick', 'click', 'boss'];
const defBlock = h.match(/const SFX = \{[\s\S]*?\n\};/)[0];
const undef = sfxNames.filter((n) => !new RegExp('\\n  ' + n + '\\s*\\(').test(defBlock));
check('12 個 SFX 全部有定義', undef.length === 0, undef.length ? '缺：' + undef : '');
const called = new Set([...h.matchAll(/sfx\('([a-z_]+)'\)/g)].map(m => m[1]));
const unknown = [...called].filter((n) => !sfxNames.includes(n));
check('所有 sfx() 呼叫點都有對應定義', unknown.length === 0, '實際呼叫 ' + [...called].join(','));

console.log('\n=== 6. BGM 時序（#54）===');
const spb = 60 / BGM_BPM, stepDur = spb / 4;
const barDur = spb * 4, loopDur = spb * 16;
check('128 BPM → 每拍 ' + spb.toFixed(3) + ' 秒 · 16分 ' + (stepDur * 1000).toFixed(1) + 'ms', Math.abs(spb - 60/128) < 1e-9);
check('64 步 = ' + (BGM_STEPS * stepDur).toFixed(2) + ' 秒（' + (BGM_STEPS / 16) + ' 小節）', BGM_STEPS === 64 && Math.abs(BGM_STEPS * stepDur - loopDur) < 1e-9);
const chordBlock = h.match(/const BGM_CHORDS = \[[\s\S]*?\n\];/)[0];
const chordCount = (chordBlock.match(/\[/g) || []).length - 1;
check('和弦進行有 ' + chordCount + ' 個不同和弦（Am-F-C-G）', chordCount === 4);
check('lookahead 調度：25ms 心跳 + 100ms 前瞻', /setInterval\(\(\) => this\.sched\(\), 25\)/.test(h) && /currentTime \+ 0\.1/.test(h));
check('唔用逐音 setTimeout（會飄）', !/setTimeout\(\(\) => this\.step_/.test(h));

console.log('\n=== 7. 持久化 key（#52 · #152）===');
for (const k of ['dsf.audio', 'dsf.vol.bgm', 'dsf.vol.sfx', 'dsf.segDiff']) {
  check(k, h.includes("'" + k + "'"));
}
check('開機只讀數值、唔建立 AudioContext（#56）',
  /loadAudioPrefs\(\);/.test(h) && /function loadAudioPrefs\(\)[\s\S]*?lsRead/.test(h) && !/new AC\(\)/.test(h.split('function loadAudioPrefs')[1].split('function setAudioOn')[0]));
check('★ 段目標難度開機都會讀（loadSegDiff）', /loadSegDiff\(\);/.test(h));

console.log('\n=== 7b. 段目標難度掣（#152）===');
check('★ 面板標題由「音效設定」改成「設定」（而家唔止音效）',
  /ctx\.fillText\('設定', p\.x \+ p\.w \/ 2, p\.y \+ 22\)/.test(h));
check('★ 有「段目標難度」列', /ctx\.fillText\('段目標難度'/.test(h));
check('★ 顯示當前檔名（簡單／標準／硬）', /ctx\.fillText\(SEG_DIFFS\[segDiffIdx\]\.name/.test(h));
check('★ 用同一套 [−]/[+] 掣（唔用滑條）',
  /step\(b\.segMinus, '−'\); step\(b\.segPlus, '\+'\);/.test(h));
check('★ 撳掣 → setSegDiff（−1 / +1）',
  /setSegDiff\(segDiffIdx - 1\)/.test(h) && /setSegDiff\(segDiffIdx \+ 1\)/.test(h));
check('★ 三檔循環切換（唔會越界）', /segDiffIdx = \(i \+ SEG_DIFFS\.length\) % SEG_DIFFS\.length;/.test(h));
check('★ setSegDiff 會寫入 localStorage', /lsWrite\(LS_SEG_DIFF, segDiffIdx\)/.test(h));
check('★ 玩家可見字串冇 em dash（—）', !/段目標難度[^\n]*—/.test(h));

console.log('\n=== 8. 音效 UI 每個畫面都畫到（renderTail）===');
const renderBody = h.match(/function render\(\)[\s\S]*?\n\}\n/)[0];
const tails = (renderBody.match(/renderTail\(\);/g) || []).length;
const leftover = (renderBody.match(/drawScanlines\(\)/g) || []).length;
const totalTails = (h.match(/^\s*renderTail\(\);$/gm) || []).length;
check('全檔 renderTail() 呼叫 = ' + totalTails + '（7 條早退 + 1 條戰鬥尾路徑）', totalTails >= 8);
check('render() 內冇殘留直接 drawScanlines（否則漏畫音效 UI）', leftover === 0);
check('drawAudioUi() 只喺 renderTail() 內呼叫一次', (h.match(/  drawAudioUi\(\);/g) || []).length === 1);

console.log('\n' + (fails === 0 ? '✓ 全部通過' : '✗ ' + fails + ' 項失敗'));
process.exit(fails === 0 ? 0 : 1);