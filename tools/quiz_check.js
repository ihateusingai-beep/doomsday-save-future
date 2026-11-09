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
    const t = String(s).replace(/[^0-9.\/−]/g, '').replace('−', '-');
    if (t === '') return null;
    if (/^\d+\/\d+$/.test(t)) { const [a, b] = t.split('/').map(Number); return b === 0 ? null : a / b; }
    const v = parseFloat(t);
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
/* 7. 分佈 */
const bySubj = {};
for (const q of BANK) bySubj[q.subj] = (bySubj[q.subj] || 0) + 1;
console.log('  分佈：' + Object.keys(bySubj).map(k => k + ' ' + bySubj[k]).join(' · '));
if (!bySubj.chinese || !bySubj.math) bad('科目唔齊全（要語文 + 數學）');
if (bySubj.chinese < 20) bad('語文題太少（' + bySubj.chinese + ' < 20）');
if (bySubj.math < 20) bad('數學題太少（' + bySubj.math + ' < 20）');

console.log(fails === 0 ? '✓ 題庫全部通過' : '✗ ' + fails + ' 項失敗');
process.exit(fails === 0 ? 0 : 1);
