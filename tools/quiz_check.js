/* tools/quiz_check.js — 內置題庫內容校驗（PLAN #153 · v0.42.0）
 * 獨立於遊戲，喺落地前先捉內容錯誤（錯答案 / 簡體字 / 粵語字 / 英文 / 重複選項）。
 * 用法：node tools/quiz_check.js [questions.js]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const FILE = process.argv[2] || path.join(__dirname, '..', 'questions.js');

/* 常見簡體字 —— 只列**無歧義**嘅（里/只/系/干/台/面/後/發/復 等上下文敏感字唔列入，
   寧可漏捉都唔好誤報：誤報會令內容作者唔敢加真嘅繁體字）。 */
const SIMP = '这说时国会学语数题词义华单广东车马鸟鱼龙点热为来对开关无见现长门问头页风飞齿军农边过还进连远选适递邮郑铁银错钟钱纸练组细终经统继续结绝给罗联职脑脸苏药观觉讲议记访设证试济浏满灭灯烧爱爷环画疗监盘确离种积称稳竞笔筑类粮紧纪线织绕绘络绩绪绳维绵综绿缓编缘缩缴网罚罢肃脉脏舰舱艰艺节芦苹荣莲获营蓝虑虽蚀补装览规视计订认讨让训许论评识译话详误请读课谁调谈谊谋谐谢谣谱贝负贡财责贤败货质贵费资赛赞赠赢赵赶趋车轮转软轴轻载较辅辆达迁运违迟逊逻遗邻酱针钉钓钢钥铃铜铺链销锅锋锡锣键镇镜闪闭闯闲间闷闹闻阀阁阅阐阔队阴际陆陈陕险随隐难雏雾静韦韩顶项顺须顽顾顿颁预领颇颈频颗颜额飘饥饭饮饰饱养饺饼馆驾验骑骗惊鲁鲜鸡鸣鸭鹅鹰麦黄齐龟';
const SIMP_SET = new Set([...SIMP]);
/* 粵語口語字（項目規則：純中文標準書面語） */
const CANTONESE = ['嘅', '咗', '喺', '唔', '冇', '咁', '啲', '俾', '咩', '乜', '睇', '係', '攞', '掂', '嘢', '佢', '哋', '哋'];
/* 英文（側欄/介面守門：無英文） */
const EN = /[A-Za-z]/;
/* ⚠️ 中國數字（PLAN #154）：數學單元 1 嘅選項係「一二三四五六七八」——
   唔加呢張映射表，數學「答案唯一」檢查會把中文數字當成「唔係數值」而全部誤報。 */
const CN_NUM = { '一':1, '二':2, '三':3, '四':4, '五':5, '六':6, '七':7, '八':8 };
const hasCN = (s) => Object.prototype.hasOwnProperty.call(CN_NUM, String(s).trim());
/* 單元名（唯一真實來源喺 index.html 嘅 QUIZ_UNITS 表 · 呢度只做檢查用） */
const UNIT_NAMES = {
  chinese: ['詞語運用', '成語故事', '字形標點', '修辭手法'],
  math:    ['中國數字', '四則運算', '分數小數', '應用圖形'],
};

let fails = 0;
const bad = (msg) => { fails++; console.log('  ✗ ' + msg); };

/* 載入題庫（模擬瀏覽器 global） */
const src = fs.readFileSync(FILE, 'utf8');
const sandbox = { window: {} };
new Function('window', src)(sandbox.window);
const BANK = sandbox.window.DSF_QUIZ_BANK;
if (!Array.isArray(BANK)) { console.log('✗ 抽唔到 DSF_QUIZ_BANK'); process.exit(1); }

console.log('=== 題庫校驗（' + FILE.split('/').pop() + '）· ' + BANK.length + ' 條 ===');

/* 1. 基本結構 */
const ids = new Set();
let structBad = 0;
for (const q of BANK) {
  const tag = (q && q.id) || '(no id)';
  if (!q || typeof q.id !== 'string' || !q.id) { bad('id 缺失或唔係字串：' + tag); continue; }
  if (ids.has(q.id)) bad('id 重複：' + q.id);
  ids.add(q.id);
  if (q.subj !== 'chinese' && q.subj !== 'math') bad(q.id + ' · subj 唔啱：' + q.subj);
  if (typeof q.level !== 'number') bad(q.id + ' · level 唔係數字');
  if (typeof q.q !== 'string' || !q.q) bad(q.id + ' · q 缺失');
  if (!Array.isArray(q.opts) || q.opts.length < 2 || q.opts.length > 4) bad(q.id + ' · opts 數量 ' + (q.opts ? q.opts.length : 'n/a'));
  if (typeof q.a !== 'number' || !Number.isInteger(q.a) || q.a < 0 || q.a >= (q.opts ? q.opts.length : 0)) bad(q.id + ' · a 越界：' + q.a);
  if (typeof q.why !== 'string' || !q.why) bad(q.id + ' · why 缺失');
}
/* 2. 選項唔可以重複 */
for (const q of BANK) {
  if (!q || !Array.isArray(q.opts)) continue;
  const set = new Set(q.opts.map(String));
  if (set.size !== q.opts.length) bad(q.id + ' · opts 有重複：' + q.opts.join('/'));
}
/* 3. 字數上限 */
for (const q of BANK) {
  if (!q || typeof q.q !== 'string') continue;
  if (q.q.length > 40) bad(q.id + ' · q ' + q.q.length + ' 字 > 40');
  (q.opts || []).forEach((o, i) => { if (String(o).length > 12) bad(q.id + ' · opts[' + i + '] ' + String(o).length + ' 字 > 12'); });
  if (q.why && q.why.length > 60) bad(q.id + ' · why ' + q.why.length + ' 字 > 60');
}
/* 4. 簡體字 / 粵語字 / 英文 */
for (const q of BANK) {
  if (!q) continue;
  const all = [q.q, q.why, ...(q.opts || [])].filter(x => typeof x === 'string').join('');
  for (const ch of all) {
    if (SIMP_SET.has(ch)) bad(q.id + ' · 簡體字：' + ch);
  }
  for (const c of CANTONESE) {
    if (all.indexOf(c) >= 0) bad(q.id + ' · 粵語字：' + c);
  }
  if (EN.test(all)) bad(q.id + ' · 內含英文');
}
/* 5. 數學答案唯一（把 opts 數值化，答案值唔可以同其他選項重複） */
for (const q of BANK) {
  if (!q || q.subj !== 'math' || !Array.isArray(q.opts)) continue;
  const num = (s) => {
    const t = String(s).trim();
    if (hasCN(t)) return CN_NUM[t];            /* 中國數字（一…八） */
    const t2 = t.replace(/[^0-9.\/−]/g, '').replace('−', '-');
    if (t2 === '') return null;
    if (/^\d+\/\d+$/.test(t2)) { const [a, b] = t2.split('/').map(Number); return b === 0 ? null : a / b; }
    const v = parseFloat(t2);
    return isNaN(v) ? null : v;
  };
  const vals = q.opts.map(num);
  const av = vals[q.a];
  if (av === null) { bad(q.id + ' · 答案選項唔係數值：' + q.opts[q.a]); continue; }
  const dup = vals.filter((v, i) => v !== null && i !== q.a && Math.abs(v - av) < 1e-9);
  if (dup.length) bad(q.id + ' · 答案唔唯一（另一個選項同值 ' + dup[0] + '）：' + q.opts.join('/'));
}
/* 6. 語文題必有解說 */
for (const q of BANK) {
  if (q && q.subj === 'chinese' && (!q.why || q.why.length < 4)) bad(q.id + ' · 語文解說太短');
}
/* 6b. 簡單算式題：答案要真係等於算式結果（捉「答案 index 指錯」） */
{
  const OPS = { '+': (a, b) => a + b, '−': (a, b) => a - b, '-': (a, b) => a - b, '×': (a, b) => a * b, '÷': (a, b) => a / b };
  let checked = 0;
  for (const q of BANK) {
    if (!q || q.subj !== 'math' || typeof q.q !== 'string') continue;
    const m = q.q.match(/^(\d+(?:\.\d+)?)\s*([+−×÷])\s*(\d+(?:\.\d+)?)\s*=\s*\?$/);
    if (!m) continue;
    checked++;
    const want = OPS[m[2]](parseFloat(m[1]), parseFloat(m[3]));
    const got = parseFloat(String(q.opts[q.a]));
    if (isNaN(got) || Math.abs(got - want) > 1e-9) {
      bad(q.id + ' · 答案錯：' + q.q + ' 應該係 ' + want + '，但指咗「' + q.opts[q.a] + '」');
    }
  }
  console.log('  算式題自動驗算：' + checked + ' 條');
}
/* 6c. 分數題：a/b ± c/d = ? 驗算 */
{
  let checked = 0;
  for (const q of BANK) {
    if (!q || q.subj !== 'math' || typeof q.q !== 'string') continue;
    const m = q.q.match(/^(\d+)\/(\d+)\s*([+−])\s*(\d+)\/(\d+)\s*=\s*\?$/);
    if (!m) continue;
    checked++;
    const a = +m[1] / +m[2], b = +m[4] / +m[5];
    const want = m[3] === '+' ? a + b : a - b;
    const optStr = String(q.opts[q.a]);
    const mo = optStr.match(/^(\d+)\/(\d+)$/);
    const got = mo ? (+mo[1] / +mo[2]) : parseFloat(optStr);
    if (isNaN(got) || Math.abs(got - want) > 1e-9) {
      bad(q.id + ' · 答案錯：' + q.q + ' 應該係 ' + want + '，但指咗「' + optStr + '」');
    }
  }
  console.log('  分數題自動驗算：' + checked + ' 條');
}
/* 6d. 中國數字題（PLAN #154 單元 1）：答案自動驗算 + 方向檢查 */
{
  let checked = 0, cnQ = 0;
  const pos = { 0: 0, 1: 0, 2: 0 };
  for (const q of BANK) {
    if (!q || !Array.isArray(q.tags) || q.tags.indexOf('中國數字') < 0) continue;
    cnQ++;
    if (!Array.isArray(q.opts) || q.opts.length !== 3) bad(q.id + ' · 中國數字題一定要 3 選');
    const m = q.q.match(/「([0-9一二三四五六七八])」/);
    if (!m) { bad(q.id + ' · 中國數字題抽唔到目標數字：' + q.q); continue; }
    const ch = m[1];
    const isCn = hasCN(ch);
    const target = isCn ? CN_NUM[ch] : parseInt(ch, 10);
    checked++;
    if (target < 1 || target > 8) bad(q.id + ' · 目標數字 ' + target + ' 唔喺 1–8');
    const ans = String(q.opts[q.a]).trim();
    const ansIsCn = hasCN(ans);
    const got = ansIsCn ? CN_NUM[ans] : parseFloat(ans);
    if (isNaN(got) || got !== target) {
      bad(q.id + ' · 答案錯：應該係 ' + target + '，但指咗「' + ans + '」');
    }
    /* 方向：題目俾阿拉伯數字 → 答案用中國數字；反之亦然 */
    if (!isCn && !ansIsCn) bad(q.id + ' · 方向錯：題目係阿拉伯數字，答案應該用中國數字');
    if (isCn && ansIsCn) bad(q.id + ' · 方向錯：題目係中國數字，答案應該用阿拉伯數字');
    if (pos[q.a] !== undefined) pos[q.a]++;
  }
  console.log('  中國數字題自動驗算：' + checked + ' / ' + cnQ + ' 條');
  /* 答案位置要平均分布 —— 全部擺同一個位 = 學生可以無腦揀一個掣 */
  if (cnQ >= 3 && (pos[0] < 2 || pos[1] < 2 || pos[2] < 2)) {
    bad('中國數字題答案位置分布不均（a ' + pos[0] + ' · b ' + pos[1] + ' · c ' + pos[2] + '）');
  }
}
/* 7. unit 欄（PLAN #154）：喺 0–4 · 每個單元都要有題 · 1–4 加埋要等於全部 */
{
  for (const q of BANK) {
    if (!q) continue;
    if (typeof q.unit !== 'number' || !Number.isInteger(q.unit) || q.unit < 0 || q.unit > 4) {
      bad(q.id + ' · unit 唔啱：' + q.unit);
    }
  }
  const byUnit = {};
  for (const q of BANK) {
    if (!q) continue;
    const k = q.subj + '/' + q.unit;
    byUnit[k] = (byUnit[k] || 0) + 1;
  }
  for (const subj of ['chinese', 'math']) {
    const tot = BANK.filter(q => q && q.subj === subj).length;
    let sum = 0;
    const parts = [];
    for (let u = 1; u <= 4; u++) {
      const n = byUnit[subj + '/' + u] || 0;
      sum += n;
      parts.push('單元' + u + ' ' + UNIT_NAMES[subj][u - 1] + ' ' + n);
      if (n === 0) bad(subj + ' 單元 ' + u + '（' + UNIT_NAMES[subj][u - 1] + '）一條題都冇 → 會變成永遠冇題嘅範疇');
    }
    if (sum !== tot) bad(subj + '：單元 1–4 加埋 ' + sum + ' ≠ 全部 ' + tot + '（有題冇歸單元）');
    console.log('  ' + (subj === 'chinese' ? '語文' : '數學') + '：全部 ' + tot + ' · ' + parts.join(' · '));
  }
}
/* 7. 分佈 */
const bySubj = {};
for (const q of BANK) bySubj[q.subj] = (bySubj[q.subj] || 0) + 1;
console.log('  分佈：' + Object.keys(bySubj).map(k => k + ' ' + bySubj[k]).join(' · '));
if (!bySubj.chinese || !bySubj.math) bad('科目唔齊全（要語文 + 數學）');
if (bySubj.chinese < 20) bad('語文題太少（' + bySubj.chinese + ' < 20）');
if (bySubj.math < 20) bad('數學題太少（' + bySubj.math + ' < 20）');

/* 8. 粵語語音稿（PLAN #155 · v0.44.0）
 * ⚠️ **分欄位語言規則**：粵語口語檢查（嘅/咗/喺/唔/冇/咁/啲/俾/係/咩/乜/睇/攞/掂/嘢/佢/哋）
 *    **只喺 say / whySay 兩個欄位豁免**（佢哋係 TTS 讀稿，永遠唔會顯示）。
 *    ⚠️ 簡體字 / 英文 / 字數上限 **兩個欄位都要查** —— 唔可以放寬成個守門。
 *    屏幕欄位（q / opts / why）嘅粵語檢查**照舊生效**（見上面 §4）。
 */
{
  const LETTERS = 'ABCDEFGH';
  const OP_WORD = { '+': '加', '−': '減', '×': '乘', '÷': '除以' };
  const fracNorm = (s) => String(s).replace(/(\d+)\s*分之\s*(\d+)/g, '$1/$2');
  const AR_NUM = { '1':'一', '2':'二', '3':'三', '4':'四', '5':'五', '6':'六', '7':'七', '8':'八' };
  let cnLeak = 0, cnQ = 0;
  for (const q of BANK) {
    if (!q) continue;
    const tag = q.id;
    /* 8a. 欄位齊全 */
    if (typeof q.say !== 'string' || !q.say) bad(tag + ' · say 缺失（粵語題目讀稿）');
    if (typeof q.whySay !== 'string' || !q.whySay) bad(tag + ' · whySay 缺失（粵語解說讀稿）');
    if (!q.say || !q.whySay) continue;
    /* 8b. 字數上限（兩個欄位都要查） */
    if (q.say.length > 40) bad(tag + ' · say ' + q.say.length + ' 字 > 40');
    if (q.whySay.length > 60) bad(tag + ' · whySay ' + q.whySay.length + ' 字 > 60');
    /* 8c. 簡體字（粵語稿一樣唔准簡體） */
    for (const ch of q.say + q.whySay) {
      if (SIMP_SET.has(ch)) bad(tag + ' · 粵語稿含簡體字：' + ch);
    }
    /* 8d. 英文：只准答案字母 A–H（字母係實體按鍵名 · 項目規則明文保留） */
    for (const [nm, s] of [['say', q.say], ['whySay', q.whySay]]) {
      const letters = [...new Set(s.match(/[A-Za-z]/g) || [])];
      const other = letters.filter(l => LETTERS.indexOf(l) < 0);
      if (other.length) bad(tag + ' · ' + nm + ' 含非答案英文字母：' + other.join(''));
    }
    /* 8e. 答案字母 + 答案內容（分數要正規化「X 分之 Y」→「X/Y」） */
    const letter = LETTERS[q.a];
    if (!q.whySay.includes(letter)) bad(tag + ' · whySay 冇答案字母 ' + letter);
    const ansTxt = String(q.opts[q.a]);
    if (!fracNorm(q.whySay).includes(fracNorm(ansTxt))) {
      bad(tag + ' · whySay 冇答案內容「' + ansTxt + '」');
    }
    /* 8f. 運算詞一定要同題目一致（+加 · −減 · ×乘 · ÷除以） */
    if (q.subj === 'math' && typeof q.q === 'string') {
      for (const [sym, word] of Object.entries(OP_WORD)) {
        if (q.q.indexOf(sym) >= 0 && q.say.indexOf(word) < 0) {
          bad(tag + ' · 題目有「' + sym + '」但 say 冇讀「' + word + '」：' + q.say);
        }
      }
      for (const [sym, word] of Object.entries(OP_WORD)) {
        if (q.q.indexOf(sym) < 0 && q.say.indexOf(word) >= 0) {
          bad(tag + ' · 題目冇「' + sym + '」但 say 讀咗「' + word + '」：' + q.say);
        }
      }
    }
    /* 8g. 中國數字題嘅 say 必須含「阿拉伯數字」；其他數學題唔加呢個前綴 */
    const isCNq = /中國數字|阿拉伯數字/.test(q.q || '');
    if (isCNq) {
      cnQ++;
      if (q.say.indexOf('阿拉伯數字') < 0) {
        bad(tag + ' · 中國數字題嘅 say 冇「阿拉伯數字」（分唔到字形）：' + q.say);
      }
    } else if (q.subj === 'math' && q.say.indexOf('阿拉伯數字') >= 0) {
      bad(tag + ' · 非中國數字題嘅 say 唔應該有「阿拉伯數字」前綴：' + q.say);
    }
    /* 8h. ⚠️ 同音洩漏：粵語入面「1」同「一」同音（jat1）·「6」同「六」同音（luk6）
     *    答案選項如果係中國數字，而 say 讀出咗同一個數字 → 音頻等於**直接讀出答案**
     *    ⇒ say 唔可以出現嗰個阿拉伯數字（由屏幕顯示個數字）。 */
    const ansTrim = ansTxt.trim();
    if (hasCN(ansTrim)) {
      const digit = CN_NUM[ansTrim];
      if (new RegExp('(^|[^0-9])' + digit + '([^0-9]|$)').test(q.say)) {
        cnLeak++;
        bad(tag + ' · ⚠️ 同音洩漏：答案「' + ansTrim + '」嘅讀音（' + AR_NUM[ansTrim] + '）出現喺 say：' + q.say);
      }
    }
  }
  console.log('  粵語稿：' + BANK.length + ' 條 · 中國數字題 ' + cnQ + ' 條 · 同音洩漏 ' + cnLeak + ' 條');
}

/* 8i. 語音稿總數（PLAN #155：用 web 語音合成 · 唔預生成音檔 → 冇音檔要檢查）
 *    每題 2 段稿（say 題目 + whySay 解說）· 99 條 = 198 段。 */
{
  const total = BANK.reduce((n, q) => n + (q && q.say ? 1 : 0) + (q && q.whySay ? 1 : 0), 0);
  console.log('  語音稿：' + total + ' 段（' + BANK.length + ' 題 × 2）');
  if (total !== BANK.length * 2) bad('語音稿總數唔啱（應為 ' + BANK.length * 2 + '）');
}

console.log(fails === 0 ? '✓ 題庫全部通過' : '✗ ' + fails + ' 項失敗');
process.exit(fails === 0 ? 0 : 1);
