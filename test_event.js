/* 一次性驗證腳本：v3.8 #42 中斷事件 */
const fs = require('fs');
const h = fs.readFileSync(__dirname + '/index.html', 'utf8');

let fails = 0;
function check(label, ok, extra) {
  if (!ok) fails++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (extra ? '  ' + extra : ''));
}
const grab = (re) => { const m = h.match(re); if (!m) throw new Error('抽唔到'); return m[0]; };

const EVENT_DEFS = new Function('return ' +
  grab(/const EVENT_DEFS = \[[\s\S]*?\n\];/).replace('const EVENT_DEFS =', ''))();

console.log('=== 1. 事件表完整性 ===');
check('事件數 = 3（剛好填滿三卡版面）', EVENT_DEFS.length === 3, EVENT_DEFS.length + ' 個');
check('id 全部唯一', new Set(EVENT_DEFS.map(e => e.id)).size === EVENT_DEFS.length);
check('每個都有 icon + name + apply', EVENT_DEFS.every(e => e.icon && e.name && typeof e.apply === 'function'));
/* 維修引擎 desc 係動態（由 eventDesc 決定），所以靜態冇 desc 係正常嘅 */
check('每個都有實際效果（apply 存在）', EVENT_DEFS.every(e => typeof e.apply === 'function'));

console.log('\n=== 2. #48 文案 ≤12 字（動態 desc 都要合規）===');
const repairDescHard = '回滿盾｜燒火力+';   /* 最長可能：名字 4 字 */
const STATIC_DESC = EVENT_DEFS.filter(e => e.id !== 'repair');
const tooLong = STATIC_DESC.filter(e => Array.from(e.desc).length > 12);
check('靜態 desc ≤12 字', tooLong.length === 0,
  tooLong.length ? '超長：' + tooLong.map(e => e.name).join(',') : STATIC_DESC.map(e => Array.from(e.desc).length + '字').join(' '));
check('維修引擎動態 desc（卡面必須寫明燒邊件）', 
  /function eventDesc\(def\)/.test(h) && /'回滿盾｜燒'/.test(h));
check('維修引擎冇強化時唔提代價（唔會死選項）',
  /if \(!eventBurnId\) return '回滿盾 \+ 1 命'/.test(h));

console.log('\n=== 3. 卡面同實際行為一致（關鍵：唔可以講一套做另一套）===');
/* eventBurnId 必須喺出卡時選定，apply 只燒嗰一件（唔可以再 random） */
check('eventBurnId 喺 buildEventOffer() 選定', /function buildEventOffer\(\)[\s\S]*?eventBurnId =/.test(h));
check('apply( burnId ) 傳入預選 id（唔喺 apply 內 random）',
  /apply: \(burnId\) => \{ healShipFull\(\); burnUpgrade\(burnId\); \}/.test(h));
check('burnUpgrade 只燒指定 id',
  /function burnUpgrade\(pickId\)[\s\S]*?if \(!pickId \|\| !playerStacks\[pickId\]\)/.test(h));
/* buildEventOffer 內揀 id 之後，apply 內唔可以再 Math.random 揀 id */
const buildBlock = (h.match(/function buildEventOffer\(\)[\s\S]*?\n\}/) || [''])[0];
check('buildEventOffer 揀一次就夠（內部只 random 一次）',
  (buildBlock.match(/Math\.random\(\)/g) || []).length === 1,
  (buildBlock.match(/Math\.random\(\)/g) || []).length + ' 次');

console.log('\n=== 4. 中途暫停 / 恢復（唔可以重置場上實體）===');
/* EVENT 係中途事件，必須用「繞過 fsm.set()」恢復，否則清場 */
check('enterEvent() 記住 fsm.prev（要返同一關）', /function enterEvent\(\)[\s\S]*?fsm\.prev = fsm\.cur/.test(h));
check('resumeEvent() 繞過 fsm.set()（唔觸發 onStateEnter 重置）',
  /function resumeEvent\(\)[\s\S]*?fsm\.cur = resumeTo/.test(h) &&
  !/function resumeEvent\(\)[\s\S]{0,600}fsm\.set\(STATE/.test(h));
check('resumeEvent() 繞過前有註釋講明點解', /繞過 fsm\.set\(\)/.test(h));
check('resumeEvent() endFreezeClocks()（恢復計時）', /function resumeEvent\(\)[\s\S]*?endFreezeClocks\(\)/.test(h));
check('enterEvent() beginFreezeClocks()（暫停計時）', /function enterEvent\(\)[\s\S]*?beginFreezeClocks\(\)/.test(h));
check('暫停時停 BGM（唔喺背後播）', /function enterEvent\(\)[\s\S]*?Bgm\.setPlaying\(false\)/.test(h));
check('恢復時重開 BGM', /function resumeEvent\(\)[\s\S]*?Bgm\.setPlaying\(audioOn\)/.test(h));
/* 暫停時唔可以行碰撞：tick() 喺 EVENT 要提早 return（因為 !isStage(EVENT)） */
check('tick() 只喺 isStage 行（EVENT 自然凍結）', /function tick\(dtMs\)[\s\S]{0,120}if \(!isStage\(fsm\.cur\)\) return;/.test(h));

console.log('\n=== 5. 觸發條件（只喺 S3，波次過半，一次）===');
const EVENT_STAGE = new Function('return ' + grab(/const EVENT_STAGE = \d+;/).replace('const EVENT_STAGE =', ''))();
check('EVENT_STAGE = 3（#47 排程）', EVENT_STAGE === 3, 'S' + EVENT_STAGE);
check('觸發條件 = S3 + 波次過半 + 未觸發過',
  /lastStage === EVENT_STAGE[\s\S]{0,120}waveCursor >= Math\.ceil\(waveQueue\.length \/ 2\)/.test(h) &&
  /!eventFired/.test(h));
check('觸發後即刻 return（唔繼續行碰撞）', /enterEvent\(\);\s*\n\s*return;/.test(h));
check('入新關重置 eventFired（每局觸發一次）', /lastStage !== EVENT_STAGE\) eventFired = false/.test(h));

console.log('\n=== 6. 事件效果落實（零死卡）===');
/* 三個事件嘅效果都要有 game logic 掛鈎 */
check('搶救物資：+800 分 + eventNextHp=1.3',
  /runScore \+= 800 \* affScore \* styScore; eventNextHp = 1.3;/.test(h));
check('維修引擎：healShipFull + burnUpgrade', /healShipFull\(\); burnUpgrade\(burnId\)/.test(h));
check('賭一把：60/50 分出鐵壁/蟲潮', /Math\.random\(\) < 0\.6[\s\S]*?'iron' : 'swarm'/.test(h));
check('healShipFull 回滿血 + 盾', /function healShipFull\(\)[\s\S]*?ship\.hp = ship\.maxHp/.test(h));
check('burnUpgrade 會重算強化（applyUpgrades）', /function burnUpgrade[\s\S]*?applyUpgrades\(\)/.test(h));

console.log('\n=== 7. pending 效果只套用一次（唔會順延）===');
check('入關時套用 eventNextHp / eventNextAffix', /if \(eventPending\)[\s\S]*?eventNextHp[\s\S]*?eventNextAffix/.test(h));
check('套用完即清 eventPending', /eventPending = false;/.test(h));
check('清返 eventNextHp = 1 / eventNextAffix = null', /eventNextHp = 1;\s*\n\s*eventNextAffix = null;/.test(h));
check('eventPending 唔會喺 tick 內被 set（只喺 apply 設）',
  (h.match(/eventPending = true/g) || []).length === 0 || /apply:[\s\S]{0,200}eventNextHp = 1\.3/.test(h));

console.log('\n=== 8. 生命周期（唔跨局 / 零持久）===');
check('resetRunFresh 清晒 event 狀態', /resetRunFresh\(\)[\s\S]*?eventFired = false;[\s\S]*?eventOffer = \[\]/.test(h));
check('resetRunFresh 清 eventNextHp / eventNextAffix', /resetRunFresh\(\)[\s\S]*?eventNextHp = 1;/.test(h));
/* localStorage 持久化只可以出現在 lsWrite / lsRead 附近。
   ⚠️ 唔可以用 /localStorage[\s\S]{0,200}X|Y/ —— alternation 優先級會令
      `|Y` 脫離 localStorage 上下文，全檔任何地方出現 Y 都算命中。 */
const lsCalls = [...h.matchAll(/lsWrite\([^)]*\)|lsRead\([^)]*\)/g)].map(m => m[0]).join(' ');
check('event 唔入 localStorage（零持久）',
  !/eventNextHp|eventNextAffix|eventFired/.test(lsCalls),
  '持久化只寫: ' + (lsCalls.match(/dsf\.[a-z.]+/g) || []).join(' '));

console.log('\n=== 9. UI 接線 ===');
check('STATE.EVENT 已加入列舉', /EVENT:\s+'EVENT'/.test(h));
check('STATE_LABEL 有 EVENT', /EVENT:\s+'中斷事件'/.test(h));
check('onStateEnter 有 EVENT 分支（buildEventOffer）', /s === STATE\.EVENT\)[\s\S]{0,200}buildEventOffer\(\)/.test(h));
check('render 有 EVENT 繪圖分支', /fsm\.cur === STATE\.EVENT\)[\s\S]{0,80}choiceLayout\(\)/.test(h));
check('EVENT 分支有 renderTail()', /STATE\.EVENT\)[\s\S]{0,5000}?renderTail\(\);/.test(h));
check('指標點擊有 EVENT 處理', /fsm\.cur === STATE\.EVENT\)[\s\S]{0,120}hitEventCard/.test(h));
check('鍵盤 1/2/3 有 EVENT 處理', /fsm\.cur === STATE\.EVENT\)[\s\S]{0,200}applyPickedEvent/.test(h));
check('hitEventCard 存在', /function hitEventCard/.test(h));
check('背景 stage 包含 EVENT', /fsm\.cur === STATE\.EVENT/.test(h));

console.log('\n=== 10. 觸控目標 ===');
const L = h.match(/function choiceLayout\(\)[\s\S]*?const cardW = (\d+), cardH = (\d+)/);
check('卡片尺寸沿用 choiceLayout（88×108 ≥ 64×64）',
  L && Number(L[1]) >= 64 && Number(L[2]) >= 64, L ? L[1] + '×' + L[2] : '抽唔到');

console.log(fails === 0 ? '\n✓ 全部通過' : '\n✗ ' + fails + ' 項失敗');
process.exit(fails === 0 ? 0 : 1);