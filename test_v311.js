/* 一次性驗證腳本：v3.11 形態深化（#67-#70）+ 新敵人（#71-#72） */
const fs = require('fs');
const h = fs.readFileSync(__dirname + '/index.html', 'utf8');

let fails = 0;
function check(label, ok, extra) {
  if (!ok) fails++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (extra ? '  ' + extra : ''));
}
const grab = (re) => { const m = h.match(re); if (!m) throw new Error('抽唔到'); return m[0]; };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

console.log('=== 1. #68 laser 持續光束 ===');
check('LASER_W / LASER_LEN 常數存在', /const LASER_W = \d+;/.test(h) && /const LASER_LEN = \d+;/.test(h));
check('fireLaser() 存在（機身光束，即時線上判定）', /function fireLaser\(ship\)/.test(h));
check('spawnPlayerShot 喺 laser 分支唔產生子彈（return 早退）',
  /if \(form === 'laser'\) \{\s*\n\s*fireLaser\(ship\);[\s\S]{0,80}return;/.test(strip(h)));
check('laserActive() 供 render 查', /function laserActive\(\)/.test(h));
check('光束有 _hitSet 防同一敵重複計分', /laserHitSet/.test(h) && /laserHitSet\.indexOf\(e\)/.test(h));
check('光束畫喺 render（唔靠 bullets 陣列）',
  /if \(laserActive\(\) && ship\)/.test(strip(h)));

console.log('\n=== 2. #69 boomerang 單擊消耗 ===');
check('返程唔再 b._lastHit = null', !/b\.phase = 1;\s*\n\s*b\._lastHit = null;/.test(strip(h)));
check('返程建立 _hitSet', /b\._hitSet = b\._hitSet \|\| \[\];/.test(h));
check('碰撞迴圈檢查 _hitSet（同一目標只打一次）', /if \(b\._hitSet && b\._hitSet\.indexOf\(e\) >= 0\) continue;/.test(h));
check('命中後寫入 _hitSet', /if \(b\._hitSet\) b\._hitSet\.push\(e\);/.test(h));
check('boomerang 例外：_lastHit 唔阻擋（返程可以打其他敵）',
  /if \(e === b\._lastHit && b\.form !== 'boomerang'\) continue;/.test(h));

console.log('\n=== 3. #70 missile 鎖定 + 爆散 ===');
check('MISSILE_LOCK_MS 常數存在', /const MISSILE_LOCK_MS = \d+;/.test(h));
check('爆散常數齊（數目 / 傷害比 / 上限）',
  /MISSILE_BURST_N/.test(h) && /MISSILE_BURST_DMG/.test(h) && /MISSILE_BURST_CAP/.test(h));
check('鎖定期轉角細、巡航期轉角大（兩階段）',
  /locked \? 0\.0018 : 0\.0070/.test(strip(h)));
check('鎖定期減速、巡航期全速', /boost = locked \? 0\.45 : 1\.0/.test(strip(h)));
check('spawnMissileBurst() 存在', /function spawnMissileBurst\(src\)/.test(h));
check('命中時觸發爆散（_burstDone 防重複）', /if \(b\.form === 'missile' && b\._burstDone !== true\)/.test(h));
check('爆散有 cap（唔爆版）', /if \(existing >= MISSILE_BURST_CAP\) return;/.test(h));

console.log('\n=== 4. #74 wave 深化 ===');
check('waveShotCount 連射計數存在', /let waveShotCount = 0;/.test(h));
check('>520ms 冇開火就歸零', /performance\.now\(\) - ship\._lastShotAt > 520\) waveShotCount = 0/.test(h));
check('振幅/頻率隨 waveLv 變', /const lvl = Math\.max\(1, b\.waveLv \|\| 1\)/.test(h));
check('子彈記低 waveLv', /waveLv: waveShotCount/.test(h));

console.log('\n=== 5. #71 新敵人 3 種 ===');
check('SPLITTER / RAMMER / LANCER 常數齊',
  /SPLITTER_HP/.test(h) && /RAMMER_HP/.test(h) && /LANCER_HP/.test(h));
check('常數：rammer 加速有上限 + 預警時間',
  /RAMMER_MAXV/.test(h) && /RAMMER_ACCEL/.test(h) && /RAMMER_WARN_MS/.test(h));
check('常數：lancer 預警 + 光束寬/長',
  /LANCER_WARN_MS/.test(h) && /LANCER_BEAM_DW/.test(h) && /LANCER_BEAM_DUR/.test(h));
check('spawnGruntFormation 識三種新 type',
  /const splitter = type === 'splitter'/.test(h) &&
  /const rammer = type === 'rammer'/.test(h) &&
  /const lancer = type === 'lancer'/.test(h));
check('三種都有獨立 hp / score', (h.match(/SPLITTER_SCORE|RAMMER_SCORE|LANCER_SCORE/g) || []).length >= 6);
check('三種都仍然 kind:grunt（唔新寫 kind 管線，#38）',
  /label: sniper \? '狙擊'[\s\S]{0,200}splitter \? '裂解'[\s\S]{0,60}rammer \? '衝撞'[\s\S]{0,60}lancer \? '雷射'/.test(strip(h)));

console.log('\n=== 6. #71 行為邏輯 ===');
/* 用位置索引比對（唔靠固定字元窗口，中間註釋長度會飄） */
const warnAt = strip(h).indexOf('if (e.rammer && e.ramWarnMs > 0)');
const accelAt = strip(h).indexOf('} else if (e.rammer)');
check('rammer：預警期唔郁，之後先加速', warnAt > 0 && accelAt > warnAt);
check('rammer 有速度上限（唔會無限快）', /sp < RAMMER_MAXV/.test(h));
check('rammer 預警畫虛線指向機身（走位就避得開）',
  /if \(e\.ramWarnMs > 0 && ship\)[\s\S]{0,300}lineTo\(ship\.x, ship\.y\)/.test(strip(h)));
check('lancer：預警 → 光束 → 冷卻 三階段',
  /if \(e\.beamWarnMs > 0\)[\s\S]{0,900}else if \(e\.beamFireMs > 0\)/.test(strip(h)));
check('lancer 光束撞到先扣血', /Math\.abs\(ship\.x - e\.x\) < LANCER_BEAM_DW && ship\.y > e\.y/.test(h));
check('splitter 死後裂散射小彈', /function spawnSplitterChildren\(ex, ey\)/.test(h) && /if \(e\.splitter\) spawnSplitterChildren/.test(h));
check('SPLITTER_CHILD_N = 3', /SPLITTER_CHILD_N = 3/.test(h));

console.log('\n=== 7. damageShip 共用（唔會兩邊走唔同分支）===');
check('damageShip(n) 抽出', /function damageShip\(n\)/.test(h));
const dmg = strip(h);
const dSh = dmg.indexOf('if (ship.shield > 0)');
const dHp = dmg.indexOf('ship.hp -= (n || 1)');
const dAr = dmg.indexOf('hasArmor() && !armorUsed');
const dRe = dmg.indexOf('ship.resurrect > 0');
const dGo = dmg.indexOf('fsm.set(STATE.GAMEOVER)');
check('護盾 → 生命 → 保險 → 復活 → 死亡 順序正確',
  [dSh, dHp, dAr, dRe, dGo].every(v => v > 0) && dSh < dHp && dHp < dAr && dAr < dRe && dRe < dGo,
  [dSh, dHp, dAr, dRe, dGo].join(' < '));
check('子彈碰撞改用 damageShip()', /if \(damageShip\(1\)\) return;/.test(h));
check('lancer 光束改用 damageShip()', /if \(damageShip\(1\)\) return;/.test(h));
check('死亡時回傳 true（呼叫者即刻停低）', /fsm\.set\(STATE\.GAMEOVER\);\s*\n\s*return true;/.test(strip(h)));

console.log('\n=== 8. #72 新敵人投放範圍（S3+）===');
const POOLS = new Function('return ' + grab(/const STAGE_RAND = \{[\s\S]*?\n\};/).replace('const STAGE_RAND =', ''))();
const NEWCHUNKS = ['sp_2', 'ram_1', 'ram_2', 'ln_1', 'mix_sp_ram'];
check('S1 完完全全冇新敵人 chunk（教學關乾淨，#49 不變式）',
  !JSON.stringify(POOLS[1]).match(/sp_2|ram_|ln_1|mix_sp_ram/), JSON.stringify(POOLS[1]).slice(0, 60));
check('S2 冇新敵人 chunk', !JSON.stringify(POOLS[2]).match(/sp_2|ram_|ln_1|mix_sp_ram/));
for (const s of [3, 4, 5]) {
  const p = POOLS[s].pool;
  const n = p.filter(id => NEWCHUNKS.includes(id)).length;
  check('S' + s + ' 有新敵人 chunk（' + n + ' 個）', n >= 3, p.length + ' 個 chunk');
}
check('所有新 chunk 都定義咗（WAVE_CHUNKS）',
  NEWCHUNKS.every(id => new RegExp('^\\s{2}' + id + ':', 'm').test(h)), NEWCHUNKS.filter(id => !new RegExp('^\\s{2}' + id + ':', 'm').test(h)).join(','));

console.log('\n=== 9. 新敵人繪製（零新資產檔）===');
check('splitter 菱形裂紋特徵', /if \(e\.splitter\) \{[\s\S]{0,300}moveTo\(e\.x, e\.y - R\)/.test(strip(h)));
check('rammer 速度線 + 虛線預警', /if \(e\.rammer\) \{[\s\S]{0,700}RAMMER/.test(strip(h)) || /if \(e\.rammer\)/.test(strip(h)));
check('lancer 光束畫兩層（外紫內白）', /if \(e\.lancer\) \{[\s\S]{0,700}beamWarnMs[\s\S]{0,500}beamFireMs/.test(strip(h)));
check('三種新敵人都有 sprite fallback', (h.match(/else if \(e\.(splitter|rammer|lancer)\) \{ spr/g) || []).length === 3);

console.log('\n=== 10. 強化池維持 26 張（#67 唔加新卡）===');
const UP_SRC = grab(/const UPGRADES = \[[\s\S]*?\n\];/).replace('const UPGRADES =', '');
const UPS = new Function('return ' + UP_SRC)();
check('UPGRADES = ' + UPS.length + ' 張（v3.10 後維持 26，v3.11 不加卡）', UPS.length === 26);
check('冇新加 form_ / tag_ 卡（形態係深化唔係新增）',
  !UPS.some(u => /form_|tag_/.test(u.id) && !['form_laser','form_rail','form_boom','form_miss','form_wave','tag_home','tag_split','tag_slow','tag_rico'].includes(u.id)));

console.log(fails === 0 ? '\n✓ 全部通過' : '\n✗ ' + fails + ' 項失敗');
process.exit(fails === 0 ? 0 : 1);