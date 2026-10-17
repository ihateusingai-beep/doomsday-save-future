# 末日救未來 — PLAN v2
> 取代 v1(2026-10-16),v2 freeze 2026-10-17。 v2 = spec 不再變,改嘢要走 changelog + reference table 雙確認。

## Goal
瀏覽器垂直 STG(PC / iPad / Smart Board),一局 3–5 分,線性 5 關,局內 roguelite,計時對應分數。暫無局外成長。

## Path
`~/workspace/doomsday-save-future/index.html`(單檔,Self-contained, file:// 可開)

## Lock
| 項 | 定案 |
|---|---|
| 名 | 末日救未來 |
| 模式 | 垂直向上 scroll |
| 流程 | S1→S2→S3→S4→S5 線性 |
| 時長 | 全程 3–5 分(target 240s) |
| 成長 | 只局內三選一;meta 預留 null(明示關閉) |
| 失敗 | 死 → GAMEOVER modal + [Retry]/[Title] |
| 操作 | autofire + 拖移/WASD + Focus + Bomb |
| 音效 | **v1 silent**;v2 才考慮 WebAudio synth |
| 存檔 | localStorage 只存 `dsf.bestScore` + `dsf.bestTime` |

## Reference Table (single source of truth)
> 凍所有 spec ambiguity(per memory rule 13 §X.5)。改動唯一入口。

| # | 主題 | Freeze |
|---|---|---|
| 1 | ship 設計 | **1 ship × 3 chassis**:`A速`/`B盾`/`C火`,差在 baseSpeed / shield / fireRate 三軸 |
| 2 | upgrade 池 | **18 件 fixed**,no rolling。`UPGRADES = [{id, name, icon, stackable:true}]` |
| 3 | 三選一可疊加 | **re-offer 機制**:同一 id 第 2 次出現 = 可揀 = stack level +1 |
| 4 | timeBonus target | **全關總和**(classic STG) |
| 5 | timeBonus mult | `10`(per second under target) |
| 6 | focus | `4s` slow-mo(`factor=0.3`)+ `8s` CD |
| 7 | bomb | 全屏清子彈 + 1.5s i-frame + `12s` CD |
| 8 | 風險波 | 敵 HP ×2 + 持彈率 ×1.5;下一抽 rarity tier +1(uncommon→rare,rare→epic) |
| 9 | 雙 input | **last-write-wins**:touch drag 同 keyboard 寫同一個 target 變數,以最後一個為準 |
| 10 | render tech | **Canvas 2D**(零依賴) |
| 11 | 內部座標 | **320×480** portrait;CSS scale 適應 window |
| 12 | DPR | `canvas.width = 320 * dpr; canvas.style.width = 320+'px'` 每次 resize/orientation 重計 |
| 13 | timestep | **fixed 60 FPS accumulator**(`dt = 1/60`)`requestAnimationFrame` 只係 tick pump |
| 14 | entity cap | 600。超 cap 先 particle culling,再 enemy cull(最低 HP 優先) |
| 15 | input layer | **Pointer Events** + keyboard proxy normalize 成 `InputState = {moveX, moveY, focus, bomb}` |
| 16 | FSM | `TITLE → SHIP_SELECT → STAGE_n ∈ [1..5] → CHOICE → ... → GAMEOVER / VICTORY`,子狀態 `PAUSED` |
| 17 | tab visibility | `document.hidden → freeze `state=PAUSED`,timer + physics 唔跑;visible → unfreeze,resume 唔補時 |
| 18 | iPad 雙指 | drag 一指 priority,二指 reset drag 起點(避免跳位) |
| 19 | smart board 觸控 | drag 起始 8px tolerance,小郁動唔做 ship move(dodge 噪聲過濾) |
| 20 | 3-choice modal | 凍 state=PAUSED;3 cards,每張 ≥64×64 touch target;揀咗先 resume |
| 21 | data-driven | `STAGES / UPGRADES / SHIPS / BOSSES / WAVE_TEMPLATES` 全部 `const` table 在 game loop 外 |
| 22 | persist | `dsf.bestScore` (Number) + `dsf.bestTime` (Number, 秒)。讀寫試 try/catch 吞 quota 錯 |
| 23 | CHANGELOG | 改 §Reference 任何一格 → v2.x bump(major 表 design change,minor 表 number tweak) |

## Stage Stats

| # | 名 | targetSec | Waves | Boss HP | Theme |
|---|---|---|---|---|---|
| 1 | 維港起飛 | 50 | 3 | 80 | 港灣天際,直線彈幕 |
| 2 | 九龍煙柱 | 55 | 3 | 110 | 樓宇 fire/smoke,扇形 spread |
| 3 | 大氣層 | 60 | 3 | 150 | meteor 入 + 螺旋彈幕 |
| 4 | 軌道殘骸 | 65 | 3 | 200 | debris 隨機 + laser wall |
| 5 | 逃逸門 Final | 70 | 4 | 300 | escape gate + 全圖 boss 混彈 |

> Total target = 300s = 5 分,讓 3–5 分 budget 有 60s 緩衝(chance + boss 拖延)

## Game Flow

```
TITLE → [Tap] → SHIP_SELECT → [pick A/B/C] → STAGE_1 →
  WAVE_1..n + ELITE(1 詞綴) + [risk wave?] + BOSS →
  CHOICE → STAGE_2 → ... → STAGE_5 BOSS →
    VICTORY | GAMEOVER(hp=0)
```
子狀態 `PAUSED` 由四件事觸發:tab blur / modal 開 / SHIP_SELECT / CHOICE。

## Score / Timer

```js
// 每關
killScore      = enemy.type === 'elite' ? 200 : 100;
grazeScore     = grazeCount * 5;
grazeEnergy    = grazeCount * 0.5;            // 補 focus / bomb charge
// 全關結算
timeBonus      = max(0, targetTotal - runSec) * 10;
finalScore     = sum(killScore) + grazeScore + timeBonus;
bestScore      = max(localStorage.dsf.bestScore ?? 0, finalScore);
```
- Timer:count-up 全程,只在 `state === STAGE_n` 加;modal/blur freeze
- Graze 子彈擦身過彈 box 1px 內,為咗 energy + score 雙得

## Engine & Render
- **Canvas 2D** + 全 procedural draw(`fillRect`, `arc`, `polygon`)
- **Single sprite sheet = inline base64** 一張 64×64 集(無 CDN,no fetch)
- Backing store:`canvas.width = 320 * dpr`,`canvas.style.width = 320+'px'`, `ctx.scale(dpr, dpr)`
- Resize handler:`window.resize` + `orientationchange` 重計 CSS size + backing store
- Color:cyan / pink / white on black(iPad Smart Board 都睇得清)
- Touch target:任何 UI hit area **≥64×64 px**

## Input Layer
- **Pointer Events**(`pointerdown/move/up/cancel`)
- Keyboard proxy:`keydown/keyup` 維護 `InputState.keys = {up,down,left,right}`,同 touch drag 同寫去 `InputState.targetX/Y`
- `InputState.target` = `last-write-wins`,後寫入覆蓋前
- Drag 起始 `clientX/Y` → 內部座標 → ship `_dragOrigin`,`move` 時 offset 計 target
- iPad 雙指:`pointercancel` reset drag origin 唔跳位
- `preventDefault` on canvas `touchmove` 避瀏覽器 scroll/zoom

## Game State FSM

```js
state = {
  TITLE, SHIP_SELECT, STAGE_1..5, CHOICE,
  GAMEOVER, VICTORY, PAUSED
}
// transitions 受 state machine 子機鎖,所有 mutate 經 emit/reducer pattern
```
- `state = PAUSED` 設定時:raf 繼續但 `tick(dt) { if paused return; ... }`
- 重設 mandatory:每 state 進入要 reset `_frame`, `_enemyList`, `_bulletList` — F2 reset-on-render 防線
- Tab visibility → state = previous | PAUSED;resume → PAUSED

## Browser Matrix

| Target | Status | Note |
|---|---|---|
| iPad Safari 14+ | ✅ primary | pointer events + touch |
| Smart Board Chrome 100+ on Win | ✅ primary | USB touch,8px tolerance |
| macOS Safari 14+ | ✅ secondary | dev / verify |
| macOS Chrome 100+ | ✅ secondary | dev / verify |
| Android Chrome < 100 | ❌ | 唔測 |
| iOS Chrome | ❌ | 強用 Safari |
| IE / Edge Legacy | ❌ | 唔支援 |
| Firefox Mobile | ❌ | 唔測 |

## Sound (v1: silent)
- 完全冇音,純視覺
- iOS audio gesture trap(v2 才撞):第一次 user gesture unlock `audioContext.resume()`
- v2 候選:WebAudio synth 短 sine + noise burst = shoot / hit / bomb

## Persistence
- `localStorage` 兩個 key:`dsf.bestScore`(Number),`dsf.bestTime`(Number)
- 寫入 try/catch,quota 或 private mode 失敗 → 繼續行,只係冇 best
- 開機時讀;失敗 fallback `0`

## MVP Done — 10 POST conditions

```
- [ ] POST: iPad Safari drag → ship 跟手 + autofire
- [ ] POST: WASD hold → ship 走 + autofire
- [ ] POST: tab blur 5s 回 tab → timer 冇跳
- [ ] POST: death → GAMEOVER modal + [Retry] 即新 run / [Title] 回船選擇
- [ ] POST: 通 5 關 → VICTORY modal 顯示 score = kill + graze + timeBonus
- [ ] POST: clear localStorage → 仍可開機遊玩(no crash)
- [ ] POST: reload after best score → 顯示歷史最佳
- [ ] POST: CHOICE 出現 → state=PAUSED + 揀咗先 resume
- [ ] POST: Smart Board Chrome drag → ship 跟手
- [ ] POST: open file:// doomsday-save-future/index.html → console 0 error
```

## 5-bug-family risk pre-screen(per memory rule 13)

- **F1 default-state desync**:✅ mitigated by FSM single source of truth (`state` global)
- **F2 reset-on-render**:✅ mitigated by state entry reset hook
- **F3 enable-condition off-by-concept**:✅ mitigated by focus / bomb / risk wave freeze table(#6-#8)
- **F4 silent default data loss**:✅ mitigated by localStorage try/catch + UI fallback
- **F5 dead code via name collision**:✅ mitigated by all entity id prefixed(`stage_`, `elite_`, `upgrade_`, etc)

## Out of scope now
- 局外樹 / 每日任務 / 帳號 / 線上排行
- v1 冇 sound
- v1 冇 high score 排行(只 best)
- v1 冇難度選擇
- v1 冇 en/zh i18n

## Open Questions / 30 日 follow-up

1. 18 池實際 list 寫邊度? → S0 起手寫 `const UPGRADES = [...]`,放 index.html top
2. 5 關 boss pattern 邊個最先做? → S0 起手做 stage_1 boss = 8-way spiral + slow laser
3. Stage 2 嘅 fire/smoke theme 用 SVG inline 定 procedural? → procedural fillRect gradient
4. v2 sound 用 WebAudio synth 定 wav blob? → 押後
5. Smart Board 8px drag tolerance 寫死,定 auto-tune?

## Changelog (memory rule 3: SemVer single source)

- v2.0 (2026-10-17):freeze 23 ambiguity,加 §Reference Table / §Engine / §FSM / §Browser Matrix,MVP done 5→10
- v1.0 (2026-10-16):initial 54-line concept

---
> Trust hierarchy:disk > this file > agent memory > session。改 plan,先改 this file,再寫 progress;唔好靠 chat 回憶。
