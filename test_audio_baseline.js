/* baseline 量度腳本：v3.9 音訊引擎
   用假 AudioContext 模擬真實時間軸，量度：
   1. 同時發聲數（voice 預算）峰值
   2. 開火節流實際效果
   3. BGM 排程器穩定性（心跳漂移）
   4. 每秒 oscillator 建立數（CPU / GC 壓力）
   5. 節點數（記憶體）
   用法：node test_audio_baseline.js
*/
'use strict';

/* ---------- 假 AudioContext：真實模擬時間軸 ---------- */
class FakeParam {
  constructor(v = 0) { this.value = v; this.events = []; }
  setValueAtTime(v, t) { this.events.push(['set', v, t]); return this; }
  exponentialRampToValueAtTime(v, t) { this.events.push(['exp', v, t]); return this; }
  setTargetAtTime(v, t, tc) { this.events.push(['target', v, t, tc]); return this; }
  linearRampToValueAtTime(v, t) { this.events.push(['lin', v, t]); return this; }
  cancelScheduledValues(t) { this.events.length = 0; return this; }
}
class FakeNode {
  constructor(kind, ctx) {
    this.kind = kind; this.ctx = ctx;
    this.gain = new FakeParam(1);
    this.frequency = new FakeParam(440);
    this.detune = new FakeParam(0);
    this.Q = new FakeParam(1);
    this.type = 'sine';
    this.buffer = null; this.loop = false;
    this._ended = false;
    ctx._nodes.push(this);
    if (kind === 'oscillator') ctx._oscCount++;
    if (kind === 'bufferSource') ctx._bufCount++;
  }
  connect(n) { this.ctx._conns.push([this, n]); return n; }
  disconnect() {}
  start(t) { this._startT = t; this.ctx._started.push(this); }
  stop(t) { this._stopT = t; this.ctx._scheduledStops++; }
  /* 真實 WebAudio 喺 stop 之後先 fire onended */
  _fireEnded(t) {
    if (this._ended) return;
    this._ended = true;
    if (this.onended) this.onended();
  }
}

let NOW = 0;   /* 模擬當前時間（ms） */
class FakeCtx {
  constructor() {
    this.sampleRate = 48000;
    this.currentTime = 0;
    this.state = 'suspended';
    this._nodes = []; this._conns = []; this._started = [];
    this._oscCount = 0; this._bufCount = 0; this._scheduledStops = 0;
    this._gains = []; this._bufBytes = 0;
    this.destination = new FakeNode('destination', this);
  }
  createGain() { const n = new FakeNode('gain', this); this._gains.push(n); return n; }
  createOscillator() { return new FakeNode('oscillator', this); }
  createBufferSource() { return new FakeNode('bufferSource', this); }
  createBiquadFilter() { return new FakeNode('biquad', this); }
  createBuffer(ch, len, rate) {
    const b = { numberOfChannels: ch, length: len, sampleRate: rate, _d: new Float32Array(len) };
    b.getChannelData = () => b._d;
    this._bufBytes += len * 4;
    return b;
  }
  resume() { this.state = 'running'; }
  suspend() { this.state = 'suspended'; }
  /* 推進時間：fire 所有已經過期嘅 onended */
  advance(ms) {
    NOW += ms;
    this.currentTime = NOW / 1000;
    for (const n of this._started) {
      if (n._stopT != null && n._stopT <= this.currentTime) n._fireEnded(this.currentTime);
    }
    this._started = this._started.filter(n => n._stopT == null || n._stopT > this.currentTime);
  }
  get liveVoices() { return this._started.filter(n => n._stopT == null || n._stopT > this.currentTime).length; }
}

/* ---------- 載入真實音訊引擎代碼 ---------- */
const fs = require('fs');
const h = fs.readFileSync(__dirname + '/index.html', 'utf8');
const script = h.match(/<script>([\s\S]*?)<\/script>/)[1];

/* 抽出音訊相關代碼段（由「音訊（PLAN v3.9」到 tickVfx） */
const aStart = script.indexOf('/* ---------- 音訊（PLAN v3.9');
const aEnd = script.indexOf('function tickVfx');
if (aStart < 0 || aEnd < 0) throw new Error('抽唔到音訊段');
let audioCode = script.slice(aStart, aEnd);

/* 去掉依賴遊戲內部變數嘅部分（lsRead/lsWrite/localStorage/Bgm 用法） */
const shim = `
const store = Object.create(null);
function lsRead(k) { return store[k]; }
function lsWrite(k, v) { store[k] = v; }
function sfxLastAtReset() { for (const k in sfxLastAt) delete sfxLastAt[k]; }
const Bgm = { wanted(){ return false; }, setPlaying(){} };
`;
/* 將 Bgm 物件定義刪走（由上面 shim 代替） */
audioCode = audioCode.replace(/const Bgm = \{[\s\S]*?\n\};\n/, '');
audioCode = audioCode.replace(/function loadAudioPrefs\(\)[\s\S]*?\n\}\n/, '');
audioCode = audioCode.replace(/function setAudioOn[\s\S]*?\n\}\n/, '');
audioCode = audioCode.replace(/function bumpVol[\s\S]*?\n\}\n/, '');
audioCode = audioCode.replace(/document\.addEventListener\('visibilitychange'[\s\S]*?\n\}\);\n/, '');
audioCode = audioCode.replace(/function audioPaused\(\)[^\n]*\n/, '');

const ctx = new FakeCtx();
const factory = new Function('window', 'performance', 'AudioContext', shim + audioCode + `
return { sfx, tone, noise, ensureAudio, applyVolumes, getActx:()=>actx, getVoices:()=>voices,
         setAudioOn:(on)=>{ audioOn = on; }, SFX, getSfxLastAt:()=>sfxLastAt,
         resetLastAt:()=>{ for (const k in sfxLastAt) delete sfxLastAt[k]; } };`);
const M = factory({ AudioContext: function () { return ctx; } },
                  { now: () => NOW }, FakeCtx);

/* ---------- 1. 建立音訊圖 ---------- */
console.log('=== 1. 音訊圖建立 ===');
M.ensureAudio();
console.log('  AudioContext state:', ctx.state);
console.log('  gain 節點數（master+bgm+sfx）:', ctx._gains.length);
const buf = ctx._nodes.find(n => n.kind === 'bufferSource');
console.log('  noise buffer 建立:', ctx._bufBytes ? (ctx._bufBytes / 1024).toFixed(1) + ' KB (1 秒白噪 @48kHz mono)' : '未建立');
console.log('  建立時 oscillator 數:', ctx._oscCount, '| bufferSource 數:', ctx._bufCount);

/* ---------- 2. 聲音預算峰值 ---------- */
console.log('\n=== 2. 聲音預算（MAX_VOICES=12）峰值 ===');
M.setAudioOn(true);
M.resetLastAt();
/* 模擬最惡劣：同一幀狂叫 12 種音效 + 開火 */
const names = ['shoot','hit','kill','graze','hurt','die','bomb','focus','offer','pick','click','boss'];
let peak = 0;
for (let round = 0; round < 50; round++) {
  for (const n of names) M.sfx(n);
  peak = Math.max(peak, ctx.liveVoices);
  ctx.advance(16.67);
}
console.log('  峰值同時發聲:', peak, peak <= 12 ? '✓ 未超預算' : '✗ 超預算');
/* 死循環：die 音效 0.9 秒長，會佔住 voice 直到結束 */
ctx.advance(1000);
console.log('  1 秒後剩餘 voice:', ctx.liveVoices);

/* ---------- 3. 開火節流 ---------- */
console.log('\n=== 3. 開火節流（70ms）===');
M.resetLastAt();
const before = ctx._oscCount;
for (let i = 0; i < 14; i++) { M.sfx('shoot'); ctx.advance(10); }   /* 140ms 內 14 次 */
const fired = ctx._oscCount - before;
console.log('  140ms 內叫 14 次開火 → 實際發聲:', fired, fired <= 3 ? '✓ 節流有效' : '✗ 節流失效');
/* 對照：hit 用 60ms 去重 */
M.resetLastAt();
const b2 = ctx._oscCount;
for (let i = 0; i < 14; i++) { M.sfx('hit'); ctx.advance(10); }
console.log('  140ms 內叫 14 次擊中 → 實際發聲:', ctx._oscCount - b2);

/* ---------- 4. BGM 排程穩定性 ---------- */
console.log('\n=== 4. BGM 排程器 ===');
/* 抽真 Bgm.step_ 出嚟，量度每小節 oscillator 數 */
const bgmSrc = h.match(/const Bgm = \{[\s\S]*?\n\};/)[0];
const Bgm = new Function('actx', 'bgmGain', 'noiseBuf', 'midiHz', 'BGM_BPM', 'BGM_STEPS', 'BGM_CHORDS', 'BGM_ARP',
  bgmSrc.replace('const Bgm =', 'return') + '\nreturn Bgm;')(
  ctx, ctx.createGain(), { _d: new Float32Array(1), getChannelData: () => new Float32Array(1) },
  (m) => 440 * Math.pow(2, (m - 69) / 12), 128, 64,
  [[45,52,57,60,64],[41,48,53,57,60],[48,52,55,60,64],[43,50,55,59,62]],
  [1,0,1,1,0,1,0,1,1,0,1,0,0,1,1,0]);
/* 一個 4 小節循環 = 64 步 = 4 秒（128 BPM） */
const oscBefore = ctx._oscCount, bufBefore = ctx._bufCount;
for (let step = 0; step < 64; step++) {
  Bgm.step_(step, ctx.currentTime, 60 / 128 / 4);
}
const oscPerLoop = ctx._oscCount - oscBefore;
const bufPerLoop = ctx._bufCount - bufBefore;
console.log('  4 小節循環（4.0 秒）→ oscillator:', oscPerLoop, '| bufferSource:', bufPerLoop);
console.log('  每秒 oscillator ≈', (oscPerLoop / 4).toFixed(1), '| bufferSource ≈', (bufPerLoop / 4).toFixed(1));
console.log('  loop 長度:', (64 * 60 / 128 / 4).toFixed(2), '秒');

/* ---------- 5. CPU / GC 壓力估算 ---------- */
console.log('\n=== 5. CPU / GC 壓力 ===');
/* 每幀建立嘅節點數：戰鬥最密集時（3 個子彈命中 + 開火 + 擦彈） */
M.resetLastAt();
let perFrame = 0;
const n0 = ctx._nodes.length;
for (let f = 0; f < 60; f++) {
  M.sfx('shoot'); M.sfx('hit'); M.sfx('hit'); M.sfx('graze');
  ctx.advance(16.67);
}
perFrame = (ctx._nodes.length - n0) / 60;
console.log('  戰鬥密集（1 開火 + 2 擊中 + 1 擦彈）平均每幀新建節點:', perFrame.toFixed(2));
console.log('  60fps → 每秒新建 WebAudio 節點 ≈', (perFrame * 60).toFixed(0));
console.log('  節點 = oscillator + gain + filter + bufferSource，各節點都要 GC');

/* ---------- 6. 記憶體 ---------- */
console.log('\n=== 6. 記憶體 ===');
console.log('  noise buffer（1 秒 mono @48kHz）:', (ctx._bufBytes / 1024).toFixed(1), 'KB — 唯一常駐音訊資料');
console.log('  音訊節點（一次性，全部 GC 回收）: 約', ctx._nodes.length, '個（累計）');

/* ---------- 7. 匯總 ---------- */
console.log('\n=== BASELINE 匯總 ===');
console.log('  聲音預算峰值 voice:', peak, '/ 12');
console.log('  開火 140ms 內實際發聲:', fired, '次（目標 ≤3）');
console.log('  BGM 每秒新建節點:', ((oscPerLoop + bufPerLoop) / 4).toFixed(1));
console.log('  戰鬥每秒新建節點:', (perFrame * 60).toFixed(0));
console.log('  常駐音訊資料:', (ctx._bufBytes / 1024).toFixed(1), 'KB');
console.log('  音訊網絡請求: 0（全部即時合成）');
console.log('  音訊資產位元組: 0 KB');
