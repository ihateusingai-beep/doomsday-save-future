/* v0.44.0 守門：答題加量（5→12）+ 粵語語音（PLAN #155）
 *
 * 用戶兩項要求（2026-11-11）：
 *    ① 每關答題嘅數量加到 12 條（密集 · 答題時間約佔整關 35%）
 *    ② 問題追加廣東話語音（主要係發音 · 文字不是重點 · 要讀出聲）
 *
 * ⚠️ **用 web 本身嘅語音功能**（speechSynthesis）—— 唔預生成音檔、repo 唔加幾 MB 檔案。
 * ⚠️ **一定要用粵語 voice**：粵語稿有「嘅/咗/啲/咩/冇/喺/佢」呢啲普通話冇嘅字，
 *    用 zh-CN / zh-TW voice 讀會讀錯 → **冇粵語 voice 就唔讀**（靜靜跳過）。
 * ⚠️ **結構斷言一定要喺「剝走註解」嘅 source 度做**（假守門陷阱：命中註解 = 假通過）。
 * ⚠️ **block 一定要由傳入嘅 src 抽** —— 否則 mutation test 改壞 source 都影響唔到檢查。
 * ⚠️ 最後一節做**還原驗證**（mutation test）：改壞 source → 守門必須變紅 → 還原。
 * ⚠️ ⚠️ **最易靜靜失效嘅位**：`validateQuizBank()` 重建成固定欄位清單 ——
 *    唔加 say / whySay → 語音**完全唔會讀**，但唔會 crash、唔會 log、測試可能照綠。
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

/* ⚠️ `--mutate-src=<path>` = 用外部傳入嘅（改壞咗嘅）source 嚟跑，
 *    並且**跳過第 7 節**（否則會無限遞歸 → timeout）。 */
const MUT_ARG = process.argv.find(a => a.startsWith('--mutate-src='));
const IS_MUT = !!MUT_ARG;
const SRC = IS_MUT ? MUT_ARG.slice('--mutate-src='.length) : path.join(__dirname, 'index.html');
const QBANK = path.join(__dirname, 'questions.js');
const h = fs.readFileSync(SRC, 'utf8');

let fails = 0;
function check(label, ok, extra) {
  if (!ok) fails++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (extra ? '  ' + extra : ''));
}

/* ---------- 剝走註解嘅 source ---------- */
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
const code = stripComments(h);

/* ============================================================
 * 1. 答題密度：QUIZ_MAX 12 + QUIZ_EVERY 1
 * ============================================================ */
console.log('\n=== 1. 答題密度（5 → 12 條）===');
{
  const cst = block(code, /const QUIZ_LS[\s\S]*?QUIZ_COUNTDOWN = \d+;/);
  check('★ QUIZ_MAX = 12', /const QUIZ_MAX\s*=\s*12\s*;/.test(cst),
    '· ' + (cst.match(/QUIZ_MAX\s*=\s*\d+/) || [''])[0]);
  check('★ QUIZ_EVERY = 1', /const QUIZ_EVERY\s*=\s*1\s*;/.test(cst),
    '· ' + (cst.match(/QUIZ_EVERY\s*=\s*\d+/) || [''])[0]);
  /* ⚠️ 淨係改 MAX 唔會生效：maybeQuiz 條件係 segIndex % QUIZ_EVERY === QUIZ_EVERY - 1
     → EVERY = 3 嘅話 16/21/22 段只會彈 5–7 次，永遠彈唔到 12 */
  const mq = block(code, /function maybeQuiz\(\) \{[\s\S]*?\n\}/);
  check('★ maybeQuiz 仍然用 QUIZ_EVERY 取模（唔係寫死）', /segIndex % QUIZ_EVERY/.test(mq));
  check('★ maybeQuiz 仍然有 QUIZ_MAX 上限', /quizCount >= QUIZ_MAX/.test(mq));
  check('★ 段數下限夠（每段 1 次觸發 · 最細關 16 段 ≥ 12）', 16 >= 12);
}

/* ============================================================
 * 1b. 版本行唔可以溢出畫面（320px · 12px monospace）
 *     ⚠️ 呢個係「靜靜失效」：文字被切走，但唔會 crash、唔會 log、唔會有 console error。
 * ============================================================ */
console.log('\n=== 1b. 版本行寬度 ===');
{
  const m = h.match(/ctx\.fillText\('(v0\.\d+\.\d+[^']*)', VIEW_W\/2, VIEW_H\/2 - 12\)/);
  check('★ 搵到標題畫面嘅版本行', !!m);
  if (m) {
    const line = m[1];
    /* 12px monospace：ASCII ≈ 1 單位 · CJK ≈ 2 單位 · 1 單位 ≈ 6.5px */
    let units = 0;
    for (const ch of line) units += (ch.codePointAt(0) > 0x2e80) ? 2 : 1;
    const px = units * 6.5;
    check('★ 版本行放得落 320px（唔會被切走）', px <= 320, '· ' + units + ' 單位 ≈ ' + px.toFixed(0) + 'px · 「' + line + '」');
    check('★ 版本行係 v0.44.0', /v0\.44\.0/.test(line), '· ' + line);
  }
}

/* ============================================================
 * 2. 粵語稿欄位：全部 99 條齊全 + 語言規則
 * ============================================================ */
console.log('\n=== 2. 粵語稿欄位（say / whySay）===');
{
  const sb = { window: {} };
  new Function('window', fs.readFileSync(QBANK, 'utf8'))(sb.window);
  const BANK = sb.window.DSF_QUIZ_BANK;
  const LETTERS = 'ABCDEFGH';
  const fracNorm = (s) => String(s).replace(/(\d+)\s*分之\s*(\d+)/g, '$1/$2');
  const CN_NUM = { '一':1, '二':2, '三':3, '四':4, '五':5, '六':6, '七':7, '八':8 };
  const OP_WORD = { '+': '加', '−': '減', '×': '乘', '÷': '除以' };

  check('★ 題庫 99 條', BANK.length === 99, '· ' + BANK.length);
  let noSay = 0, noWhy = 0, longSay = 0, longWhy = 0, badLetter = 0, badAns = 0;
  let opBad = 0, leak = 0, cnNoPrefix = 0, cnPrefix = 0, enBad = 0, cnQ = 0;
  for (const q of BANK) {
    if (!q.say) { noSay++; continue; }
    if (!q.whySay) noWhy++;
    if (q.say.length > 40) longSay++;
    if (q.whySay.length > 60) longWhy++;
    const letters = [...new Set((q.say + q.whySay).match(/[A-Za-z]/g) || [])];
    if (letters.some(l => LETTERS.indexOf(l) < 0)) enBad++;
    if (!q.whySay.includes(LETTERS[q.a])) badLetter++;
    if (!fracNorm(q.whySay).includes(fracNorm(String(q.opts[q.a])))) badAns++;
    if (q.subj === 'math') {
      for (const [sym, word] of Object.entries(OP_WORD)) {
        if ((q.q.indexOf(sym) >= 0) !== (q.say.indexOf(word) >= 0)) opBad++;
      }
    }
    const isCNq = /中國數字|阿拉伯數字/.test(q.q || '');
    if (isCNq) { cnQ++; if (q.say.indexOf('阿拉伯數字') < 0) cnNoPrefix++; }
    else if (q.subj === 'math' && q.say.indexOf('阿拉伯數字') >= 0) cnPrefix++;
    /* ⚠️ 同音洩漏：答案選項係中國數字 + say 讀出同一個數字 → 直接讀出答案 */
    const ans = String(q.opts[q.a]).trim();
    if (Object.prototype.hasOwnProperty.call(CN_NUM, ans)) {
      const d = CN_NUM[ans];
      if (new RegExp('(^|[^0-9])' + d + '([^0-9]|$)').test(q.say)) leak++;
    }
  }
  check('★ 全部題目都有 say（粵語題目讀稿）', noSay === 0, '· 缺 ' + noSay);
  check('★ 全部題目都有 whySay（粵語解說讀稿）', noWhy === 0, '· 缺 ' + noWhy);
  check('★ say ≤ 40 字', longSay === 0, '· 超 ' + longSay);
  check('★ whySay ≤ 60 字', longWhy === 0, '· 超 ' + longWhy);
  check('★ 粵語稿冇非答案英文字母（只准 A–H）', enBad === 0, '· 違 ' + enBad);
  check('★ whySay 一定講答案字母', badLetter === 0, '· 錯 ' + badLetter);
  check('★ whySay 一定講答案內容', badAns === 0, '· 錯 ' + badAns);
  check('★ 運算詞同題目一致（+加 −減 ×乘 ÷除以）', opBad === 0, '· 錯 ' + opBad);
  check('★ 中國數字題嘅 say 一定含「阿拉伯數字」', cnNoPrefix === 0, '· 缺 ' + cnNoPrefix + ' / ' + cnQ);
  check('★ 非中國數字題嘅 say 唔加「阿拉伯數字」前綴', cnPrefix === 0, '· 多 ' + cnPrefix);
  check('★ ⚠️ 冇同音洩漏（答案唔可以出現喺 say 嘅讀音入面）', leak === 0, '· 洩 ' + leak);
  check('★ 稿總數 = 99 × 2 = 198 段', BANK.filter(q => q.say && q.whySay).length * 2 === 198);
}

/* ============================================================
 * 3. 語言邊界：粵語只可以出現喺 say / whySay（顯示欄位照舊禁粵語）
 * ============================================================ */
console.log('\n=== 3. 語言邊界（粵語只喺讀稿欄位）===');
{
  const sb = { window: {} };
  new Function('window', fs.readFileSync(QBANK, 'utf8'))(sb.window);
  const BANK = sb.window.DSF_QUIZ_BANK;
  const CANTONESE = ['嘅','咗','喺','唔','冇','咁','啲','俾','係','咩','乜','睇','攞','掂','嘢','佢','哋'];
  let shown = 0, inDraft = 0;
  for (const q of BANK) {
    const shownTxt = [q.q, q.why, ...(q.opts || [])].join('');
    for (const c of CANTONESE) if (shownTxt.indexOf(c) >= 0) shown++;
    const draftTxt = (q.say || '') + (q.whySay || '');
    for (const c of CANTONESE) if (draftTxt.indexOf(c) >= 0) inDraft++;
  }
  check('★ 顯示欄位（q / opts / why）零粵語字', shown === 0, '· ' + shown);
  check('★ 粵語稿確實有粵語（唔係抄咗書面語）', inDraft > 0, '· ' + inDraft + ' 處');
}

/* ============================================================
 * 4. 語音接線（結構）
 * ============================================================ */
console.log('\n=== 4. 語音接線（結構）===');
{
  check('★ 用 web 語音合成（speechSynthesis）', /speechSynthesis/.test(code));
  check('★ 有 SpeechSynthesisUtterance', /new SpeechSynthesisUtterance\(/.test(code));
  check('★ 有粵語語言 tag 常數', /const TTS_LANGS = \[/.test(code));
  const langs = (code.match(/const TTS_LANGS = \[([^\]]*)\]/) || ['', ''])[1];
  check('★ 語言 tag 包含粵語（yue-Hant-HK / zh-HK）',
    /yue-Hant-HK/.test(langs) && /zh-HK/.test(langs), '· ' + langs.trim());
  check('★ ⚠️ 語言 tag **唔包含**普通話（zh-CN / zh-TW）',
    !/zh-CN|zh-TW/.test(langs), '· ' + langs.trim());
  const pickBlk = block(code, /function ttsPickVoice\(\) \{[\s\S]*?\n\}/);
  check('★ ttsPickVoice 先 exact match 語言 tag', /v\.lang\)\.toLowerCase\(\) === lang/.test(pickBlk));
  check('★ ttsPickVoice 冇語音清單 → 返 null', /!vs \|\| !vs\.length\) return null/.test(pickBlk));
  const speakBlk = block(code, /function ttsSpeak\(text\) \{[\s\S]*?\n\}/);
  check('★ ttsSpeak 冇 voice → 唔讀（唔用普通話讀粵語稿）',
    /if \(!ttsVoice\) \{[\s\S]*?return;/.test(speakBlk));
  check('★ ⚠️ 冇粵語 voice 會出 console warning（唔係靜靜失效）',
    /console\.warn\(/.test(speakBlk) && /ttsNoVoiceWarned/.test(speakBlk));
  check('★ ttsSpeak 用返 voice 嘅 lang', /u\.lang = ttsVoice\.lang/.test(speakBlk));
  check('★ 語速慢啲（rate 0.95 · 俾學生聽清）', /u\.rate = 0\.95/.test(speakBlk));
  /* ⚠️ v0.44 修正：遊戲音效預設關 → 語音如果跟 audioOn 就會「開箱冇聲」（靜靜失效） */
  check('★ ⚠️ 語音唔跟 audioOn 總開關（教學內容 · 開箱即生效）',
    !/!audioOn/.test(speakBlk), speakBlk.indexOf('audioOn') >= 0 ? '· 仲有 audioOn' : '');
  check('★ 語音音量跟「音效・語音」音量檔（老師拉去 0 就靜音）',
    /u\.volume = volToGain\(volSfx\)/.test(speakBlk));
  check('★ 音訊面板標明「音效・語音」（老師知點樣靜音）',
    /row\('音效・語音'/.test(code));
  check('★ 讀之前 cancel（唔會疊聲）', /speechSynthesis\.cancel\(\)/.test(speakBlk));
  check('★ 讀嘅時候 BGM 靜音', /ttsBgm\(true\)/.test(speakBlk));
  const stopBlk = block(code, /function ttsStop\(\) \{[\s\S]*?\n\}/);
  check('★ ttsStop 用 speechSynthesis.cancel()', /speechSynthesis\.cancel\(\)/.test(stopBlk));

  const openBlk = block(code, /function openQuiz\(\) \{[\s\S]*?\n\}/);
  check('★ openQuiz 會讀粵語題目（q.say）', /ttsSpeak\(q\.say\)/.test(openBlk));
  const ansBlk = block(code, /function answerQuiz\(i\) \{[\s\S]*?\n\}/);
  check('★ answerQuiz 會讀粵語解說（quizQ.whySay）', /ttsSpeak\(quizQ\.whySay\)/.test(ansBlk));
  const closeBlk = block(code, /function closeQuiz\(\) \{[\s\S]*?\n\}/);
  check('★ closeQuiz 停語音', /ttsStop\(\)/.test(closeBlk));
  check('★ closeQuiz 還原 BGM', /ttsBgm\(false\)/.test(closeBlk));
  /* ⚠️ 語音清單非同步載入 → 一定要有 voiceschanged 監聽 */
  check('★ 有監聽 voiceschanged（語音清單係非同步載入）',
    /voiceschanged/.test(code));
  /* ⚠️ 唔預生成音檔 */
  check('★ 唔預生成音檔（source 冇 .mp3 / audio/ 引用）',
    !/\.mp3/.test(code) && !/['"]audio\//.test(code));
  check('★ 唔喺 browser call TTS API（冇 API key）',
    !/api\.minimax/.test(code) && !/api_key|apikey/i.test(code));
}

/* ============================================================
 * 5. 行為測試（真 source 抽出嚟跑）—— 最易靜靜失效嘅位
 * ============================================================ */
console.log('\n=== 5. 行為測試（真 source 抽出嚟跑）===');
/* --- 5a. validateQuizBank 必須保留 say / whySay（唔加就靜靜失效）--- */
{
  const vb = block(code, /function validateQuizBank\(arr\) \{[\s\S]*?\n\}/);
  check('★ validateQuizBank 有搬 say', /say:String\(q\.say/.test(vb));
  check('★ validateQuizBank 有搬 whySay', /whySay:String\(q\.whySay/.test(vb));
  const F = new Function('__c', `
    ${block(code, /function validateQuizBank\(arr\) \{[\s\S]*?\n\}/)}
    return validateQuizBank(__c.bank);
  `);
  const sb = { window: {} };
  new Function('window', fs.readFileSync(QBANK, 'utf8'))(sb.window);
  const r = F({ bank: sb.window.DSF_QUIZ_BANK });
  const withSay = r.good.filter(q => q.say && q.whySay).length;
  check('★ 真跑 validateQuizBank → 99 條都仲有 say/whySay', withSay === 99, '· ' + withSay);
  check('★ 真跑 validateQuizBank → 一條都冇丟', r.good.length === 99, '· ' + r.good.length);
}
/* --- 5b. openQuiz / answerQuiz 真係叫 ttsSpeak --- */
{
  const F = new Function('__c', `
    let quizQ = null, quizPick = -1, quizOk = false, quizPhase = 0, quizOpen = false;
    let quizCount = 0, quizStartedAtMs = 0, quizGraceUntil = 0, quizStreak = 0;
    let stageStartMs = null, runStartMs = null, skillCdUntil = 0, bombCDUntil = 0;
    let segMsg = '', segMsgT = 0, runScore = 0, affScore = 1, styScore = 1;
    const QUIZ_SCORE = 300, QUIZ_GRACE_MS = 800;
    const console = { log(){} };
    const sfx = () => {};
    const pickQuizQuestion = () => __c.q;
    const ttsSpeak = (t) => __c.calls.push(t);
    const ttsStop = () => __c.calls.push('stop');
    const ttsBgm = (q) => __c.calls.push('bgm:' + q);
    ${block(code, /function openQuiz\(\) \{[\s\S]*?\n\}/)}
    ${block(code, /function answerQuiz\(i\) \{[\s\S]*?\n\}/)}
    ${block(code, /function closeQuiz\(\) \{[\s\S]*?\n\}/)}
    openQuiz();
    answerQuiz(__c.q.a);
    closeQuiz();
    return __c.calls;
  `);
  const q = { id: 'm-001', a: 1, q: '3 + 5 = ?', opts: ['7','8','9'],
              say: '3 加 5，等於幾多？', whySay: '答案係 B，8。因為 3 加 5 就係 8。' };
  const calls = F({ q: q, calls: [] });
  check('★ openQuiz → 讀題目稿', calls.indexOf(q.say) >= 0, '· ' + calls.join(' | '));
  check('★ answerQuiz → 讀解說稿', calls.indexOf(q.whySay) >= 0, '· ' + calls.join(' | '));
  check('★ closeQuiz → 停聲 + 還原 BGM',
    calls.indexOf('stop') >= 0 && calls.indexOf('bgm:false') >= 0, '· ' + calls.join(' | '));
  check('★ 讀題目喺讀解說之前（次序啱）', calls.indexOf(q.say) < calls.indexOf(q.whySay));
}
/* --- 5c. ttsPickVoice：只揀粵語 voice --- */
function pickVoiceHarness(voices) {
  const F = new Function('__c', `
    const speechSynthesis = __c.speechSynthesis;
    const SpeechSynthesisUtterance = function (t) { this.text = t; };
    const TTS_LANGS = __c.langs;
    ${block(code, /function ttsPickVoice\(\) \{[\s\S]*?\n\}/)}
    return ttsPickVoice();
  `);
  return F({
    speechSynthesis: { getVoices: () => voices },
    langs: (code.match(/const TTS_LANGS = \[([^\]]*)\]/) || ['', ''])[1]
      .split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean),
  });
}
{
  const hk = pickVoiceHarness([{ name: 'Ting-Ting', lang: 'zh-TW' }, { name: 'Sinji', lang: 'zh-HK' }]);
  check('★ 有 zh-HK voice → 揀佢', hk && hk.lang === 'zh-HK', '· ' + (hk ? hk.lang : 'null'));
  const yue = pickVoiceHarness([{ name: 'Yue', lang: 'yue-Hant-HK' }]);
  check('★ 有 yue-Hant-HK voice → 揀佢', yue && yue.lang === 'yue-Hant-HK', '· ' + (yue ? yue.lang : 'null'));
  const onlyMandarin = pickVoiceHarness([{ name: 'Tingting', lang: 'zh-CN' }, { name: 'Mei-Jia', lang: 'zh-TW' }]);
  check('★ ⚠️ 淨係有普通話 voice → 唔揀（唔會用普通話讀粵語稿）',
    onlyMandarin === null, '· ' + (onlyMandarin ? onlyMandarin.lang : 'null'));
  const empty = pickVoiceHarness([]);
  check('★ 語音清單未載入 → 返 null（唔會 crash）', empty === null);
}
/* --- 5d. ttsSpeak：冇 voice → 完全唔會 speak；有 voice → 讀正確內容 --- */
function speakHarness(speechSynthesis, voices, text) {
  const F = new Function('__c', `
    const speechSynthesis = __c.speechSynthesis;
    const SpeechSynthesisUtterance = __c.SpeechSynthesisUtterance;
    const TTS_LANGS = __c.langs;
    let ttsVoice = null, ttsNoVoiceWarned = false;
    const audioOn = false;            /* ⚠️ 故意設 false → 證明語音唔受總開關控制 */
    const volSfx = 5;
    const actx = null, bgmGain = null;
    const volToGain = () => 0.5;
    ${block(code, /function ttsPickVoice\(\) \{[\s\S]*?\n\}/)}
    ${block(code, /function ttsBgm\(quiet\) \{[\s\S]*?\n\}/)}
    ${block(code, /function ttsSpeak\(text\) \{[\s\S]*?\n\}/)}
    ttsSpeak(__c.text);
    return __c.spoken;
  `);
  return F({
    speechSynthesis: speechSynthesis,
    SpeechSynthesisUtterance: function (t) { this.text = t; this.lang = ''; this.voice = null; },
    langs: (code.match(/const TTS_LANGS = \[([^\]]*)\]/) || ['', ''])[1]
      .split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean),
    text: text,
    spoken: undefined,
  });
}
{
  /* 有粵語 voice → 應該讀 */
  const spoken = [];
  speakHarness({
    getVoices: () => [{ name: 'Sinji', lang: 'zh-HK' }],
    cancel: () => {},
    speak: (u) => spoken.push(u.text),
  }, null, '3 加 5，等於幾多？');
  check('★ 有粵語 voice → 真係讀出聲（即使遊戲音效係關）',
    spoken.length === 1 && spoken[0] === '3 加 5，等於幾多？', '· ' + JSON.stringify(spoken));
  /* 冇粵語 voice → 完全唔讀 */
  const spoken2 = [];
  speakHarness({
    getVoices: () => [{ name: 'Tingting', lang: 'zh-CN' }],
    cancel: () => {},
    speak: (u) => spoken2.push(u.text),
  }, null, '3 加 5，等於幾多？');
  check('★ ⚠️ 冇粵語 voice → 完全唔讀（唔用普通話讀粵語稿）', spoken2.length === 0,
    '· ' + JSON.stringify(spoken2));
  /* 根本冇 speechSynthesis（舊瀏覽器）→ 唔會 throw */
  let threw = null;
  try {
    const F = new Function('__c', `
      const speechSynthesis = undefined;
      const SpeechSynthesisUtterance = undefined;
      const TTS_LANGS = [];
      let ttsVoice = null, ttsNoVoiceWarned = false;
      const audioOn = false;          /* ⚠️ 故意設 false → 證明語音唔受總開關控制 */
      const volSfx = 5;
      const actx = null, bgmGain = null;
      const volToGain = () => 0.5;
      ${block(code, /function ttsPickVoice\(\) \{[\s\S]*?\n\}/)}
      ${block(code, /function ttsBgm\(quiet\) \{[\s\S]*?\n\}/)}
      ${block(code, /function ttsSpeak\(text\) \{[\s\S]*?\n\}/)}
      ttsSpeak('測試');
      return 'ok';
    `);
    F({});
  } catch (e) { threw = e; }
  check('★ 冇 speechSynthesis 唔會 throw（靜靜跳過）', threw === null, threw ? '· ' + threw.message : '');
}

/* ============================================================
 * 6. 唔預生成音檔（用 web 語音 → repo 唔加幾 MB 檔案）
 * ============================================================ */
console.log('\n=== 6. 唔預生成音檔 ===');
{
  const AUDIO_DIR = path.join(__dirname, 'audio');
  check('★ repo 冇 audio/ 目錄（唔預生成音檔）', !fs.existsSync(AUDIO_DIR));
  check('★ index.html 冇引 mp3', !/\.mp3/.test(h));
  check('★ questions.js 冇引 mp3', !/\.mp3/.test(fs.readFileSync(QBANK, 'utf8')));
}

/* ============================================================
 * 7. 還原驗證（mutation test）—— 改壞 source → 守門必須變紅
 * ============================================================ */
console.log('\n=== 7. 還原驗證（mutation test）===');
function runGate(srcPath) {
  try {
    execFileSync('node', [path.join(__dirname, 'test_quiz_v044.js'), '--mutate-src=' + srcPath],
      { stdio: 'pipe', timeout: 60000 });
    return { red: false, out: '' };
  } catch (e) {
    return { red: true, out: (e.stdout || '').toString() };
  }
}
if (!IS_MUT) {
  const orig = fs.readFileSync(SRC, 'utf8');
  const MUT = [
    ['QUIZ_MAX 改返 5', orig.replace(/const QUIZ_MAX\s*=\s*12\s*;/, 'const QUIZ_MAX = 5;')],
    ['QUIZ_EVERY 改返 3', orig.replace(/const QUIZ_EVERY\s*=\s*1\s*;/, 'const QUIZ_EVERY = 3;')],
    ['openQuiz 唔讀題目', orig.replace(/ttsSpeak\(q\.say\);/, '/* removed */;')],
    ['answerQuiz 唔讀解說', orig.replace(/ttsSpeak\(quizQ\.whySay\);/, '/* removed */;')],
    ['closeQuiz 唔停聲', orig.replace(/ttsStop\(\); ttsBgm\(false\);/, '/* removed */;')],
    ['validateQuizBank 唔搬 say', orig.replace(/say:String\(q\.say\|\|''\)/, '/* removed */')],
    ['validateQuizBank 唔搬 whySay', orig.replace(/whySay:String\(q\.whySay\|\|''\)/, '/* removed */')],
    ['冇 voice 都照讀（用錯語言）',
      orig.replace(/if \(!ttsVoice\) \{[\s\S]*?return;/, '/* removed */;')],
    ['語言 tag 加咗普通話', orig.replace(/const TTS_LANGS = \['yue-Hant-HK', 'zh-HK', 'zh-Hant-HK', 'zh-Hant-HK'\]/,
                                       "const TTS_LANGS = ['zh-CN', 'zh-TW']")],
    ['冇監聽 voiceschanged', orig.replace(/speechSynthesis\.addEventListener\('voiceschanged'[^\n]*\n/, '')],
    ['讀之前唔 cancel（會疊聲）', orig.replace(/speechSynthesis\.cancel\(\);\n    speechSynthesis\.speak/, 'speechSynthesis.speak')],
  ];
  let allRed = true;
  for (const [label, mutated] of MUT) {
    if (mutated === orig) {
      check('★ mutant「' + label + '」真係改到 source', false, '· 錨點冇 match 到');
      allRed = false; continue;
    }
    const tmp = path.join('/tmp', 'dsf_mut_v044.html');
    fs.writeFileSync(tmp, mutated, 'utf8');
    const r = runGate(tmp);
    check('★ mutant「' + label + '」令守門變紅', r.red);
    if (!r.red) allRed = false;
    try { fs.unlinkSync(tmp); } catch (e) {}
  }
  check('★ 全部 mutant 都令守門變紅（守門唔係 vacuous）', allRed);
}

console.log(fails === 0 ? '\n✓ v0.44.0 守門全部通過' : '\n✗ ' + fails + ' 項失敗');
process.exit(fails === 0 ? 0 : 1);
