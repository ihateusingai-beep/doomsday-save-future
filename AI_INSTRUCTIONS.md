# AI_INSTRUCTIONS — 末日救未來

> 建立日期：2026-10-24 · 對應 runtime **v0.23.1** · 對應 commit `3e96a8a`
> 呢份文件係**畀 AI 助手同新人類開發者睇嘅工作指引**，唔係遊戲設計規格。
> 設計規格喺 `PLAN.md`，交付層規格喺 `AUDIO_VIDEO_OPTIMIZATION.md`。

---

## 1. 專案一句話講完

瀏覽器垂直射擊遊戲（roguelike-lite）。**單檔 `index.html`**（207 KB，自帶依賴，`file://` 直接開）· Canvas 2D · WebAudio 全合成 · 零網絡請求 · 零存檔負擔（局內 roguelike，局外系統明確關閉）。

受眾：**智慧白板學生**。低耐性、3 秒要讀得明、觸控目標 ≥56px、唔用滑條。

---

## 2. 文檔地圖（邊份文件負責咩）

| 文件 | 負責範圍 | 邊啲嘢唔應該寫入去 |
|---|---|---|
| `PLAN.md` | **遊戲設計**唯一真實來源。參考表（#1–#81）凍結所有規格歧義 · 鎖定項目 · 關卡數據 · 改動紀錄 | 交付層實作細節、音訊架構細節 |
| `AUDIO_VIDEO_OPTIMIZATION.md` | **音訊／視訊交付層**唯一真實來源。現況架構 · 缺陷 · 音效地圖 · 音樂地圖 · 方案 · baseline 量度 | 遊戲設計決策（關卡數值、強化池） |
| `VISUAL_QUALITY_RUBRIC.md` | **視覺呈現標準**唯一真實來源。12 維度 rubric · 現況評分 · AAA 對照 · 視覺狀態矩陣 · 改進優先級 | 美術製作步驟、介面規則細節 |
| `ART_IMPLEMENTATION_GUIDE.md` | **美術製作規則**。palette · 命名 · pipeline · 尺寸比例 · 性能預算 · review 程序 | 評分、介面規格 |
| `UI_STYLE_GUIDE.md` | **介面規範**。字級 · 圖示語言 · 卡片／按鈕狀態表 · 版面分區 · 反例 · 檢查清單 | 美術繪製步驟、遊戲設計決策 |
| `AI_INSTRUCTIONS.md`（本檔） | 工作流 · 命名規則 · 驗證指令 · 架構邊界 · 常見陷阱 | 任何規格內容 |
| `art.px.js` | **sprite 定義唯一真實來源**（palette / sprite / sheet） | 唔好直接改 `index.html` 入面嘅 base64 |
| `test_*.js` | 測試。**測試係規格嘅可執行版本** | — |

**唔好開第二個真實來源。** 新議題：設計 → 改 `PLAN.md`；音訊／視訊 → 改 `AUDIO_VIDEO_OPTIMIZATION.md`；視覺標準 → 改 `VISUAL_QUALITY_RUBRIC.md`；美術製作 → 改 `ART_IMPLEMENTATION_GUIDE.md`；介面 → 改 `UI_STYLE_GUIDE.md`；工作流 → 改本檔。

### 2.1 美術層關鍵事實（唔使重新 recon）

| 事實 | 值 |
|---|---|
| sprite 定義源 | `art.px.js`（`pal()` 24 色 · `sheet("dsf_main", [...])` **107 格**） |
| 圖集 | **106×223 px PNG，3,559 bytes，base64 4,748 字元**（上限 120 格 / 260 px / 8 KB） |
| build 指令 | `node $HOME/.hermes/skills/creative/pxl-pixel-art/bin/pxl.js build art.px.js --out out` |
| **同步指令** | `node tools/sync_sheet.js`（寫回 `SPRITE` 座標表 + `SHEET_B64`） |
| 內部座標 | 320×480 邏輯 px · DPR backing store |
| palette | 24 色，命名 `k n N m c C d w y Y o p P g G r R b B s S h H t` |
| 角色語言 | 青 = 玩家 · 粉紅 = 敵 · 橙 = 環境危害 · 綠 = 增益 · 紅 = 生命／危險 · 紫 = 特殊 |
| icon | **29 個 `icon_*` sprite（10×10）**，取代原本嘅 emoji |
| 動畫 | **6 個家族、15 幀**（`anim_ship_a` `anim_grunt` `anim_elite` `anim_boss` `anim_bullet_p` `anim_bullet_e`） |
| 元素層（v0.27.0） | **5 元素 × 3 級**（火／冰／雷／光／暗）· 基底 + 副**雙元素疊加** · 13 個元素 sprite（`bullet_*` 5 / `hit_*` 5 / `p_*` 3） |

> ✅ **v0.24.0：座標表唔再要人手同步。** `tools/sync_sheet.js` 自動由 `out/dsf_main.json`
> + `out/dsf_main.png` 寫回 `index.html`，並讀返驗證一致。
> 座標錯位**唔會令任何測試失敗** —— 圖會靜靜哋錯位，所以呢個工具係唯一防線。
>
> ⚠️ **改 sprite 之後一定要跑 `node tools/sync_sheet.js`**，否則 `index.html` 用緊舊座標。

---

## 3. 架構邊界（越界就係錯）

### 3.1 硬約束

| 約束 | 理由 |
|---|---|
| **唔引入音訊檔** | 智慧白板係區網內開機，檔案越大首次載入越慢。WebAudio 即時合成令檔案零增長、零網絡請求、調音色唔使重新導出（`PLAN.md` #51） |
| **唔引入視訊** | 垂直射擊 + 智慧白板 + 零存檔負擔。視訊過場違反「開機即玩」課堂流程 |
| **唔加框架／建置步驟** | 單檔 `file://` 可開就係賣點。加 bundler 等於逼用戶裝嘢先玩到 |
| **唔加 Service Worker／CDN** | 單檔 202 KB，收益低、複雜度高；SW 會令更新變複雜 |
| **局外 meta 系統明確關閉** | 純局內 roguelike，零存檔負擔 |
| **唔加滑條** | 智慧白板要粗撳得中，一律用 −/+ 步進掣 |
| **`tick()` 內唔准建立 oscillator** | GC 壓力同爆音。只有明確事件先發聲 |

### 3.2 模組邊界

```
index.html（單檔）
  ├─ 1–12 段：設定 · 狀態機 · 繪圖 · 輸入 · 遊戲邏輯
  ├─ 音訊（PLAN v3.9 #50–#56）  ← 行 263 起，約 260 行
  │    ├─ ensureAudio()   延後建立 AudioContext（iOS #56）
  │    ├─ tone() / noise()  兩個合成原語
  │    ├─ SFX{}（12 個）  事件 → 音色
  │    ├─ sfx(name)       分派 + 節流 + 聲音預算
  │    └─ Bgm{}           lookahead 排程器，四層
  └─ drawAudioUi()       ← 行 3880，音量面板
```

**唔好**喺 `tick()` 內加 `new OscillatorNode()` / `new AudioBufferSourceNode()`。

### 3.3 元素層邊界（v0.27.0 新增）

元素層疊喺形態層**之上**，兩層**完全正交**：形態決定「彈點樣飛」，元素決定「命中之後發生咩事」。

```
形態層（5 種 + 基礎彈）        元素層（5 元素 × 3 級）
  ├─ 決定彈道 / 武器            ├─ 決定命中效果
  └─ 強化池 5 張形態卡 + 4 tag   └─ 基底 1 個 + 副 1 個，效果疊加
```

| 規則 | 內容 |
|---|---|
| **唯一掛鈎點** | 元素效果全部掛喺 `onPlayerBulletHit` → `applyElementEffects(target, bullet)`，基底 A 先、副 B 後 |
| **零配對特判** | 5 形態 × 5 元素 = 25 種配對**唔准**寫任何 `if (form === 'x' && elem === 'y')` |
| **唔准改操控層** | 元素只加效果，唔加掣、唔改移動、唔改射速 —— 白板學生唔使重新學操作 |
| **元素效果唔打 boss** | 灼燒／連鎖／爆發／光爆全部 skip `kind:'spiral'`（避免 boss HP 變負但永遠唔死）。boss 只會被玩家子彈直接打死；狀態類效果（緩速／凍結／麻痺／標記）boss 仍然食 |
| **元素唔取代形態** | 形態卡 5 張同 tag 4 個維持不變（延續「形態無關」原則） |
| **強化池不變** | 元素抉擇**獨立成 screen**，唔混入強化三選一 —— 26 張強化卡嘅出現率唔可以改 |
| **爆發深度守衛** | `elementBurstDepth > 3` —— 連鎖／爆發互相觸發唔可以無限遞歸 |

---

## 4. 命名同風格規則

### 4.1 語言

| 位置 | 語言 |
|---|---|
| 玩家可見文字（UI、HUD、提示、標題） | **全中文** |
| 程式碼註解 | **全中文** |
| `console.log` 日誌 | **全中文** |
| 實體按鍵名 | **保留英文**（Enter / Esc / T / R / WASD / Shift / A / B / C / 1 / 2 / 3 / Space / P） |
| 程式碼識別字 | 英文（`playerShot` / `spawnPlayerShot`） |

### 4.2 識別字

- 玩家彈 `p_*`，敵人彈 `e_*`，敵人 `gr_*`，強化 `up_*`，詞綴 `af_*`，裝備 `eq_*`
- 實體 id 全部有前綴 —— 防止命名撞擊造成死碼（`PLAN.md` F5）

### 4.3 玩家可讀輸出（硬規則）

任何玩家見到嘅內容都係**寫畀人睇**，唔係寫畀開發者睇：

- 用平實語言 + 遊戲術語，圖標 + 文字（意思含糊時）
- 每個提示要講**下一步做咩**
- 錯誤要講：發生咗咩事 · 進度安唔安全 · 玩家可以做咩
- **絕對唔可以出現**：例外堆疊、內部變數名、檔案路徑、除錯座標、未解釋嘅 HTTP status、伺服器實作細節、開發者 TODO、原始遙測
- 技術細節送去開發者 log／診斷／遙測，唔好攤喺玩家畫面

### 4.4 SemVer

- 版號喺 `index.html` 兩處：標題畫面 `ctx.fillText('vX.Y.Z · ...')` + 啟動日誌
- **改任何參考表一格 → 大版本（設計改動）或小版本（數值微調）**，並寫入 `PLAN.md` 改動紀錄
- 修 bug → patch 版號（例如 `v0.23.0` → `v0.23.1`）

---

## 5. 驗證指令

### 5.1 跑全套測試

```bash
cd ~/workspace/doomsday-save-future
for f in test_*.js; do node "$f" >/dev/null 2>&1 && echo "PASS $f" || echo "FAIL $f"; done
```

**17 個測試檔**，全部用 Node 直接跑（**冇測試框架，冇 npm install**）。每個檔案自己 `console.log` 逐項結果，最尾印 `✓ 全部通過`。

> **`test_visual_v024.js` 係 v0.24.0 視覺優化嘅守門測試**，覆蓋：
> 鍵盤選單唔會連跳兩級（行為測試，真係抽出 handler 跑）、em dash 零殘留、
> 48 個 icon 欄位全部係 sprite 名、字級 7 級、動畫幀齊、事件卡配色、卡片貼合內容、圖集預算。
>
> **`test_ships_v026.js` 係 v0.26.0 擴充嘅守門測試**（9 節），覆蓋：
> 5 架機定義完整 + 強化池仍然 26 張、D 機衛星跟機同自動開火（行為測試）、
> E 機散射扇形同「收束」（行為測試）、群傷／衛星齊射／炮台護盾三個被動
> （行為測試，抽出 `applyGroupBonus` / `applySatelliteBonus` / `applyTurretShield` 實際執行）、
> 通用技能 3 個同磁力場係數、三掣位幾何（x = 8/128/248）、2×3 揀機網格逐格對應 A→E、
> 4 種新敵人同波次投放範圍、13 個新欄位零死碼。
>
> **`test_elements_v027.js` 係 v0.27.0 元素層嘅守門測試**（15 節），覆蓋：
> 5 元素 × 3 級每級行為、基底 + 副元素效果疊加、元素效果**唔打 boss**、
> 「專精」+40% 實際加到傷害（行為測試，比較開／關專精嘅傷害數值）、
> 已攞咗專精就唔再出基底卡（零死卡）、2×3 揀元素網格幾何、元素欄位零死碼、
> 強化池仍然 26 張 + 形態卡 5 張 + tag 4 個（元素層零影響舊系統）。
>
> **`test_touch_v0271.js` 係 v0.27.1 觸控去重嘅守門測試**（4 節），覆蓋：
> 一次實體觸控只推一個 state（標題／難度／揀機／揀元素 4 個畫面）、
> 隔 300ms 嘅兩次獨立撳都要處理、**戰鬥中唔去重**（玩家要連續撳嚟移位）、
> `touchstart` 唔准再手寫 state 清單（必須用 `isMenuState()`）。
> ⚠️ **呢類 bug 唔會被桌面 mouse 測試捉到** —— mouse 測試唔會派發 `touchstart`，
> 必須用 Playwright WebKit + `hasTouch: true` + `touchscreen.tap()` 先重現到。
>
> **`test_v0272.js` 係 v0.27.2 修 bug 嘅守門測試**（6 節），覆蓋：
> ① **sprite key 唔可以當文字印**（全檔掃描 `fillText(...icon...)`，剝走註解先掃）；
> ② **`wrapText` 唔會喺數字／符號中間斷行**（抽出真 `wrapText` 喺 stub canvas 實際執行，
>    覆蓋 26 張強化卡 + 15 條元素描述全部文案，斷點檢查「符號同數字唔會分家」）；
> ③ **裝備掉落提示喺 CHOICE 畫面畫**（一定見到 + 唔撞詞綴橫幅 + 新局清走）；
> ④ **三卡畫面有底部操作提示、冇「[N] 點擊」殘留**；
> ⑤ **boss 死亡路徑統一**（`laserTick` 經 `killEnemy()`；`killEnemy` 對 boss 都 set `_dead`）；
> ⑥ 版號 >= v0.27.2。
>
> **`test_pool_v0273.js` 係 v0.27.3 強化卡池抽法嘅守門測試**（5 節），覆蓋：
> 「玩法卡」定義（5 形態 + 4 tag + 5 生存 = 14 張）**係單一真實來源**
> （`isOffenseStyleCard()` 收埋 form_/tag_ 前綴，`isPlayStyleCard()` 同 `upgradeWeight()` 都引用佢，
> **唔准任何一個函式自己再寫一套前綴判斷**）、加權同定義一致
> （行為驗證：**權重 > 1 ⟺ 玩法卡**，26 張逐張對）、
> 三個抽卡規則（只抽未見過 / 加權 / 保底）+ 保底邊界 fallback、
> 「已見過」清單**唔跨局**（揀機 + resetRunFresh 兩處清）、
> 形態卡「**轉職**」標記嘅行為、版號 >= v0.27.3。
> ⚠️ 詳細抽卡行為測試（5000 次抽卡保底 0 違例、跨次唔重複、2 萬局模擬零形態卡 < 1%）
> 喺 `test_upgrades.js` §6。
> ⚠️ `test_upgrades.js` eval 呢幾個 helper 時**順序有意義**：`isPlayStyleCard` 同 `upgradeWeight`
> 都引用 `isOffenseStyleCard`，所以要**先 eval `isOffenseStyleCard`**（自由變數喺 module scope 解析得到）。
>
> **`test_weapons.js` 最後一節係 v0.28.0 形態卡死卡修正嘅守門測試**（PLAN #111 / #112）：
> `bulletSurvivesHit()` 行為（rail / boomerang / missile 命中唔死 · bolt / wave 命中會死）、
> `bossOrNearest()` 行為（有 boss 鎖 boss · 冇 boss 追最近敵人）、
> `onPlayerBulletHit()` 實際執行（迴力鏢 / 導彈 / 光束 return false · 普通彈 return true 對照組），
> 加結構斷言（迴力鏢 `maxLife = 1800` · 轉向條件 `y < 40` · spawn 就初始化 `_hitSet` · 追蹤用 `bossOrNearest`）。
> ⚠️ 呢啲係**行為測試唔係 regex 掃描** —— 還原修正之後 5 條會 fail（已做還原驗證）。
>
> ### 5.1.1 抽出函數做行為測試（**兩個陷阱，2026-10-25 踩過**）
>
> 本 repo 嘅測試用 `makeFn(name, deps, consts)` 把函數抽出嚟喺 stub 環境實際執行。
> **注入依賴嗰陣有兩個必踩嘅坑**：
>
> | 陷阱 | 症狀 | 正確做法 |
> |---|---|---|
> | **注入 `makeFn` 嘅 wrapper** | wrapper 用 rest args 實作，注入後被內層 function 用 `dep(x)` 叫（冇帶依賴值）時，佢把 `x` 當成依賴值 → **own-arity 錯**（`isMenuState(s)` 收到 0 個 arg → 永遠 false） | 注入用 **`eval` 返個函數到測試檔 scope** —— scope 有同名 const 就自然解析到，own arity 保持原樣 |
> | **`new Function('dep', body)` 按位置綁定** | 「own args + dep args」嘅傳遞方式令自由變數（dep）撞到 own arg 嘅位置 | 同上 —— 用 `eval` + scope 閉包，唔好靠參數位置 |
>
> ```js
> const STATE = eval('(' + extractBlock('STATE') + ')');
> const realIsMenuState = eval('(' + extractFunction('isMenuState') + ')');
> ```
>
> ⚠️ **可變狀態要用 object 容器**（`const menuTapState = { ms: -1e9, x: 0, y: 0 }`）——
> 3 個 module 層 `let` 注入落去係 by-value，mutations 唔會寫返。

### 5.2 語法檢查

```bash
node -e "
const h=require('fs').readFileSync('index.html','utf8');
new Function(h.match(/<script>([\s\S]*?)<\/script>/)[1]);
console.log('index.html script block 語法 OK');
"
```

### 5.3 開發者模式

| URL query | 用途 |
|---|---|
| `?debug=1` | 顯示開發者 HUD（狀態 · 當前形態 · 已疊 tag · 場上玩家彈數 · seed） |
| `?god=1` | 無敵 |
| `?seed=N` | 鎖本局 seed（可複現） |

### 5.3.1 美術層驗證（改 sprite / 改介面後必跑）

```bash
cd ~/workspace/doomsday-save-future

# 0. 改完 art.px.js 先 build + 同步（v0.24.0 新增工具）
node $HOME/.hermes/skills/creative/pxl-pixel-art/bin/pxl.js build art.px.js --out out
node tools/sync_sheet.js

# 1. 圖集座標表一致性（工具自動做，呢個係人手複查）
node -e "
const fs=require('fs');
const order=[...fs.readFileSync('art.px.js','utf8').match(/sheet\(\"dsf_main\",\s*\[([\s\S]*?)\]/)[1].matchAll(/\"([^\"]+)\"/g)].map(x=>x[1]);
const spr=[...fs.readFileSync('index.html','utf8').match(/const SPRITE = Object.freeze\(\{([\s\S]*?)\n\}\);/)[1].matchAll(/^\s*(\w+):\s*\{/gm)].map(x=>x[1]);
console.log(JSON.stringify(order)===JSON.stringify(spr)?'✓ 座標表一致 ('+order.length+' 格)':'✗ 座標表唔一致');
"

# 2. palette 合規（sprite 只准用 24 色）
node -e "
const pal=new Set(['#000000','#070b18','#121a30','#1c2744','#00f6ff','#00a0c8','#006888','#f8ffff','#ffe566','#ff9a18','#ff6a20','#ff6ad5','#ff1a6a','#3dff8a','#12a855','#ff4d5e','#a01028','#4d8cff','#1a4aaa','#8aa0c8','#3a4868','#2a3548','#5a6a88','#c8d8ff']);
const bad=[...new Set([...require('fs').readFileSync('art.px.js','utf8').matchAll(/#[0-9a-fA-F]{3,6}\b/g)].map(x=>x[0].toLowerCase()))].filter(c=>!pal.has(c));
console.log(bad.length?'✗ palette 外: '+bad.join(' '):'✓ palette 合規');
"

# 3. 圖集體積（預算 ≤ 8 KB PNG）
node -e "const h=require('fs').readFileSync('index.html','utf8');
console.log('圖集 PNG:', Buffer.from(h.match(/SHEET_B64 = '([^']+)'/)[1],'base64').length, 'bytes');"
```

### 5.3.2 介面層驗證

```bash
cd ~/workspace/doomsday-save-future

# 1. 字級收斂（**7 級**：9/10/12/14/16/24/32，最細 9px）
node -e "
const sizes=[...new Set([...require('fs').readFileSync('index.html','utf8').matchAll(/font = '[^']*?(\d+)px/g)].map(x=>+x[1]))].sort((a,b)=>a-b);
console.log('字級:', sizes.join(', '));
console.log(sizes.length<=7?'✓ 7 級以內':'✗ 超過 7 級');
console.log(sizes[0]<9?'✗ 有 9px 以下':'✓ 最細 9px+');
"

# 2. emoji icon 掃描（規則要求 0 命中）
grep -n "fillText(up.icon\|fillText(ev.icon\|fillText(st.icon\|fillText(sf.icon" index.html

# 2b. **v0.24.0**：icon 欄位全部要係 ASCII sprite 名（唔准 emoji 漏網）
node -e "
const v=[...require('fs').readFileSync('index.html','utf8').matchAll(/\bicon2?\s*:\s*'([^']*)'/g)].map(x=>x[1]);
const bad=v.filter(s=>!/^[A-Za-z0-9_]+\$/.test(s));
console.log(bad.length?'✗ 非 sprite 名: '+bad.join(' '):'✓ '+v.length+' 個 icon 欄位全部係 sprite 名');
"

# 3. 觸控目標尺寸（全部 ≥ 64）
grep -n "const w = \|const cardW = \|const cardH = \|w = 88\|w = 96" index.html | head

# 4. **v0.24.0**：玩家可見文字零 em dash（monospace 會渲染成似「一」嘅字形）
node -e "
const t=[...require('fs').readFileSync('index.html','utf8').matchAll(/fillText\('([^']*)'/g)].map(x=>x[1]).filter(s=>s.includes('—'));
console.log(t.length?'✗ em dash 殘留: '+t.join(' | '):'✓ 零 em dash');
"
```

### 5.4 交付前檢查清單

```
□ 全套 17 個測試檔 PASS
□ index.html 語法檢查 OK
□ 版號已 bump（兩處：標題畫面 + 啟動日誌）
□ PLAN.md 參考表已更新（如有設計改動）
□ PLAN.md 改動紀錄已加一條
□ 冇改動 player-facing 文案而冇同步 PLAN.md
□ git diff --cached --name-only 同手動 staged 清單一致
```

### 5.4.1 美術／介面改動額外檢查

```
□ node tools/sync_sheet.js 跑過（改咗 art.px.js 就必須）
□ 圖集座標表一致性 script 通過（§5.3.1）
□ palette 合規 script 通過（§5.3.1）
□ 圖集 PNG ≤ 8 KB · 格數 ≤ 120 · 圖集高度 ≤ 260
□ index.html ≤ 290 KB（按 h.length 字元數計，唔係 byte 數）
□ 字級 ≤ 7 級、最細 9px（§5.3.2）
□ 卡面 icon 零 emoji + 全部係 sprite 名（§5.3.2）
□ 玩家可見文字零 em dash（§5.3.2）
□ 灰度剪影測試通過（新敵人／新 icon）
□ 三秒可讀測試通過（每個改動嘅畫面）
□ 實機截圖覆核（至少桌面 Chromium；真機未驗證要標明）
□ **新增嘅效果／欄位全部有 game logic 讀**（零死卡）——
  ⚠️ 只檢查「欄位出現次數」捉唔到死卡，必須用行為測試比較實際數值
```

---

## 6. 改動工作流

### 6.1 標準次序

```
1. 改磁碟 PLAN.md（設計先落 disk，再落 code）
2. 改 index.html
3. 跑測試 + 語法檢查
4. 更新 PLAN.md 改動紀錄
5. commit（作者見 git log）
6. push
```

**改 spec 前先改磁碟 PLAN.md。** 唔好靠聊天回憶做決策。

### 6.2 Commit

- 每個 feature 配自己嘅 smoke test，**先做下一個**
- 改動紀錄要講：改咗咩 · 點解 · 驗收方法 · 測試結果
- commit 前跑 `git diff --cached --name-only`，對手動 staged 清單

### 6.3 強化池驗收（硬規則）

> **零死卡** —— 每個 `mod()` / `cost()` 寫入嘅欄位，都要有 game logic 讀。

寫完強化卡要逐個欄位 grep 一次。寫咗但冇人讀 = 死碼 = 唔合格。

---

## 7. 常見陷阱

| 陷阱 | 症狀 | 對策 |
|---|---|---|
| **`Math.random()` 喺 `tick()` 內** | 同 seed 同波次，但彈幕擺位唔一樣 | 用 seeded RNG stream（`stageRngFor(runSeed, 11000 + stageId)`） |
| **逐個 spawn 項各自 roll** | 同一波入面互相矛盾（例如 `mix_gr_sn` 同鄰波撞車） | 喺 **chunk 層級** roll 一次，唔喺個項度 roll |
| **剝註釋嘅 regex** | 註釋文字被當成代碼匹配，測試假綠 | 一律先剝註釋，再用位置索引比對 |
| **單檔 HTML 嘅 `</script>`** | HTML parser byte-match 截斷，JS context 失效 | 字串入面唔好出現 `</script>` |
| **const TDZ** | 早期 `console.log` 引用下面先 `const` 嘅綁定 → `ReferenceError`，成個 IIFE 死掉，**所有 click handler 失效** | 診斷 log 入面直接做 `document.getElementById()` 查找，唔好引用後面嘅 const |
| **聲音預算係「丟棄新聲」唔係 queue** | 超過 12 個直接唔發，唔排隊 | 唔好假設音效會排隊播 |
| **同類音效 60ms 去重** | 一發打中兩隻 → 第二隻完全無聲（已記錄 `PLAN.md` #77） | 實作修正方案時見 `AUDIO_VIDEO_OPTIMIZATION.md` §13 批次 A1 |
| **BGM 單一 7.5 秒 loop** | 一局播 23–37 次，長時間機械化 | 修正方案見審計 §13 批次 B1（改 gain 參數，零新資產） |
| **`rm` / `mv` 被權限閘擋** | 刪唔到磁盤殘留檔（例如 `.t_wave_test.js`） | 用 `cp` 覆寫做廢；真刪要人手喺 terminal 做 |
| **emoji 做卡面 icon** | 脫離像素風 + 跨平台唔一致 + 文字溢出 | 用圖集 sprite（`ART_IMPLEMENTATION_GUIDE.md` §7.1 完整清單）—— **v0.24.0 已做** |
| **背景貼地線用 `VIEW_H - 10`** | 場景 100% 落喺能力掣區（y 408–472）底下 → **玩家由頭到尾未見過**，但 code 睇落完全正常、零 console error | 貼地線用 `BG_FLOOR = PLAY_BOTTOM = 396`；改完用「開／關 props 兩次渲染相減」實測 prop 像素落喺邊（唔靠顏色閾值猜）—— **v0.32.0 已做**（PLAN #120） |
| **掃描線喺邏輯空間畫固定 3 px 週期** | 3 × DPR 2.4875 = 7.46 物理 px（非整數）→ 反鋸齒 → 實測 137 條線 out-of-grid、週期 7/8 混合、覆蓋率 33.3% → 42.9% = 真機變雜訊網 | 喺 **backing store** 畫：`setTransform(1,0,0,1,0,0)` + 週期/線高都用 `round(scale)` —— **v0.32.0 已做**（PLAN #121） |
| **量測腳本兩次渲染唔喺同一 transform** | 第二張圖只覆蓋左上角 → 「行距唔一致 / 深淺離散 90%」全部係**量測假象**，會令你改錯地方 | 兩次都喺同一 transform 底下畫；驗掃描線用**相對變暗量 + 線結構**（暗行必須落喺 k×P 網格上），唔用絕對 delta（被天空漸變干擾） |
| **中文靠字元數斷行** | 卡面文字溢出框（88px 卡面 9 字 = 90px > 可用 74px） | 用 `ctx.measureText()` 逐字累加斷行 —— **v0.24.0 已做**（`wrapText()`） |
| **逐字斷行會拆走數字** | 「−25%」變成「−」/「25%」、「+20%」變成「+2」/「0%」—— 符號同數字分兩行，低耐性學生讀唔啱 | `wrapText()` 改用**原子**切法（符號 + 數字 + 小數 + 百分比 = 一個原子）—— **v0.27.2 已做** |
| **sprite key 當文字印出嚟** | 玩家見到「icon_iron 鐵壁」—— 內部變數名洩漏到畫面 | 一律用 `drawIconWithText()`（icon 係圖集 sprite，文字淨係得個名）；掃描守門：**全檔 `fillText(...icon...)` = 0**（掃前先剝註解） |
| **橫幅只喺「戰鬥畫面」畫，但掉落發生喺 boss 死嗰刻** | boss 死即刻跳 modal，所以正常節奏下橫幅**根本睇唔到**；就算睇到仲會同另一條橫幅撞位 | 提示要喺**玩家真正會停留嘅畫面**畫（掉落 → CHOICE modal）；唔好靠「2.6 秒內要行完幾個選單」呢類假設 |
| **強化卡池純隨機抽** | 一局 12 個卡位只見到 10.08/26 張卡，**6.87% 嘅局零形態卡** → 玩家感覺「無 build concept」（唔係卡設計差，係**出卡率**問題） | 三規則：① 只抽本局未見過嘅卡 ② 玩法卡加權 ③ 每次 boss 強化保底 1 張玩法卡 → 零形態卡 6.87% → **0.16%**（v0.27.3 已做）。⚠️ 玩法卡定義要**單一真實來源**（`isOffenseStyleCard()` 收埋 form_/tag_ 前綴，`isPlayStyleCard()` 同 `upgradeWeight()` 都引用佢，唔准各自寫一套） |
| **畫面畫成光束，但命中判定用點撞** | 光束喺畫面由機身畫到畫面頂，但判定用 `|b.y - e.y| < hh`，而嗰類子彈**根本唔郁**（只 `life -= dtMs`）→ 實際只打中貼住機身嗰十幾像素 = **死卡**（揀咗嗰張卡之後 boss 永遠唔死，關卡卡死 200+ 秒） | 命中判定要**同畫面一致**：光束類彈體用「柱 + 長度」（`playerBulletHits()`），唔用普通彈嗰套點撞。⚠️ 呢類 bug **實機跑完整一局**先捉到（蒙地卡羅只驗證分佈，驗證唔到卡嘅機制本身壞咗） |
| **「命中即刪彈」令返程／追擊根本唔存在** | 迴力鏢畫成會返嚟、導彈畫成會追，但 `onPlayerBulletHit()` 一律 `return true` 刪彈 → 撞到第一隻雜魚就死 → **boss 血量 0 跌幅**（實機：92 秒 boss 血量一個位都冇跌過，關卡永久卡死） | 命中規則要**同畫面一致**：`bulletSurvivesHit(b)` 列出「命中唔死」嘅彈體（`rail` / `boomerang` / `missile`），護盾同護罩炮台分支都要同步；同一目標只打一次靠 `_hitSet`（**由 spawn 就初始化**，唔係轉向時先建） |
| **慢速子彈每幀改追「最近嘅敵人」** | boss 橫向游走（x 振幅 ±80、最快 133px/s），而雜魚永遠比 boss 近 → 慢速彈體 100% 撞唔到 boss（實機：導彈全部死喺機身上方 10–25px） | 慢速形態卡用 `bossOrNearest(x, y)`：**場上有 boss 就鎖 boss**；而「命中唔死」先可以令佢穿過雜魚繼續追 |
| **彈體射程唔夠打唔到 boss** | 迴力鏢轉向條件「生命過半」（1000ms）→ 只飞到 y ≈ 158，而 boss 喺 y = 51–109（下沿 122）→ **物理上入唔到 boss 嘅 y 範圍** | 射程要對住 boss 嘅實際位置調（boss 位置 = `e.y = 80 + sin(e.t/400) × 30`）；轉向條件用**位置**（飛到畫面頂）而唔係**時間**，並且 `maxLife` 要夠往返 |
| **「加速」只做咗減速嗰半** | v3.11 寫「① 鎖定期慢速微追 ② **巡航期加速**」，但程式只喺鎖定期降速一次（`_lockSpd`），之後**永久停喺 45%** → 導彈要 2826ms 先飛到 boss，但 `life` 只有 2200ms → **物理上飛唔到** | 每個「兩階段」機制都要睇**兩半都做咗冇**；減速嗰半用 `_lockSpd` 做一次性旗標，加速嗰半要喺階段切換時**還原**（並用另一個旗標，唔好重複做） |
| **爆散碎屑喺 boss 身上爆開 → 即時再打中 boss** | 碎屑 `Math.max(1, dmg×0.4)` 令每粒最少 1 傷，3 粒 = 3 傷，即係每發導彈實際 2.2 + 3 = 5.2 傷（實測 DPS 8.84，比同儕強 5 倍） | 碎屑類「對群體有實質價值」嘅效果要標記 `noBoss`，碰撞時跳過 boss（同「連鎖閃電唔打 boss」一致）；boss 只食主彈傷害 |
| **同一個死亡流程有兩條路** | `laserTick` 直接叫 `onBossDown()` 唔經 `killEnemy()` → 冇爆炸、`_dead` 唔 set、同一幀第二個傷害源會**再觸發一次**（掉兩件裝備 + 分數雙計） | 所有傷害出口一律經 `killEnemy()`；`killEnemy` 對 boss 都要 set `_dead` |
| **圖集座標表 drift** | 圖靜靜哋錯位，**測試全部照過** | `node tools/sync_sheet.js` —— **v0.24.0 已解** |
| **加咗 sprite 但唔更新 `SPRITE`** | 圖錯位 / 空白格 | 跑 `node tools/sync_sheet.js`，唔好手改座標表 |
| **palette 外加色** | 成個畫面唔 coherent | 24 色唯一色源；改形狀先於改色 |
| **卡面兩個掣同權重** | 玩家唔知揀邊個 | 主行動實心填充 + 次行動描邊 —— **v0.24.0 已做** |
| **em dash `—` 喺 monospace** | fallback 去中文字體，渲染成**似「一」嘅水平線**，玩家以為係錯字 | 玩家可見單行文字唔用 em dash；用全形冒號 `：` 或直接刪走 |
| **keydown handler 用 `if` 串連選單分支** | 一次按鍵連跳兩級：難度→機體、強化→風格，**玩家見唔到嗰兩個畫面** | 每個選單分支**必須 `return`**（觸控路徑 `handleMenuTap` 已經有 `return true`） |
| **卡片高度唔貼合內容** | 卡底留白過半，睇落似未填完 | 卡高按內容收；觸控目標仍 ≥64×64 |
| **機制層欄位只寫唔讀** | 強化／機制改咗但效果冇生效，測試又照過（死代碼） | 每個新欄位都要有 game logic 讀 —— `test_ships_v025.js` §8 守門（14 個欄位逐個驗） |
| **用 wall-clock 判定「玩家連續做緊某動作」** | 主迴圈係固定時間步累加器，掉幀時 wall-clock 會跳一大截 → 誤判成「停手」 | 連續性用**遊戲時間**（`gameClockMs`）判定 —— **v0.25.0 已修**（A 機連射加速原本喺低 FPS 永遠升唔到 ×1.6） |
| **文字疊喺背景 sprite 上面冇底條** | 灰色字喺灰色大樓上完全睇唔清 | 任何疊喺背景圖上面嘅文字都要自己嘅暗色底條 |
| **底部中央加咗掣，唔記得搬走原本擺喺底部中央嘅 HUD** | 節奏 chip 被新掣蓋住（v0.25.0 已經撞過一次「暫停」掣） | 加底部掣之前，先畫低畫面分區圖（`UI_STYLE_GUIDE.md` §2.1）同現有 HUD 位置對一次 |
| **頂部 HUD 蓋住 boss 本體同血條** | HUD 中央帶由 y 6 蓋到 y 67，而 boss 本體 y 37–123、血條 y 26–91 → boss 行到中間就**整個俾 HUD 蓋住，學生睇唔到 boss 血量變化**（核心反饋冇咗）；玩家子彈全部喺 x = 160 正中央，頂段被蓋 → 子彈「消失喺字下面」 | 加任何 HUD 元素都要對 `UI_STYLE_GUIDE.md` §2.1 分區圖；**boss 本體 + 血條必須完全喺 HUD 帶之下**（v0.30.0 已把帶壓到 y 0–31）。守門 = `test_layout.js` 做**幾何關係斷言**（唔係死字串），郁任何一邊都會 fail。⚠️ **唔好用「改 boss 位置」嚟解** —— 改 boss 距離 = 改戰鬥平衡（迴力鏢／導彈射程按 boss y 51–109 調校，見 #111/#112） |
| **詞綴橫幅只顯示 2.6 秒（閱讀時間唔夠）** | 橫幅係本關詞綴嘅**唯一一次詳細解釋**（PLAN #43「零選擇、只顯示」），收埋之後玩家只靠 debug HUD 回憶 → **學生睇唔完就過咗，本關 modifier 變成完全冇存在過** | 閱讀時間 = 認 icon 0.3s + 讀名 0.4s + 讀兩個數值 1.6s + 理解 0.5s ≈ **3.6s**。舊版總長 2.6s 而 fade 2.0s 就開始 → **完整可讀只有 2.0s**。v0.31.0 #116：總長 → **4200ms**、fade → **3600ms**。⚠️ **唔改成「關卡前靜態停頓」**（每關多一次撳掣，對低耐性學生係淨負擔）。⚠️ **延長前一定要逐關量遮擋代價**（真實入關時刻起逐 40ms 取樣，統計中心點落喺橫幅矩形內嘅實體）：**S1 雜魚 0ms · S2 雜魚 0ms · S3 雜魚 760ms（首次入框 2.95s）· S4 雜魚 600ms（首次 3.98s）；敵彈全部 0ms**。⚠️ **唔好因為「S1 係零」就當全部關都係零** —— S3/S4 因為 pool 有俯衝／快落雜魚（0.0495 px/ms vs S1 教學關 0.0225）就會入框。⚠️ 分開睇：敵彈（致命威脅）被遮先係真問題；雜魚被遮只佔其下落全程 ~10%（之後仲有 ~6.5 秒落向玩家） |
| **停電暗幕 alpha 過深（雜魚跌落可讀性門檻）** | `affDark` 蓋一層暗幕 → 雜魚對比跌到 **3.01:1**（零餘量，啱啱卡喺 WCAG 1.4.11 非文字 3:1 門檻），低耐性學生 + 智慧白板 = **睇唔到就等於冇**；但因為「停電」冇分數乘數，睇唔到 = 玩家白白食咗個代價 | v0.31.0 #117：alpha 0.42 → **0.22**（雜魚 **4.60:1**、玩家子彈 **5.13:1**，過 AA 4.5:1）。⚠️ **減 alpha 前要量「暗幕仲有冇訊號」**：全畫面平均亮度跌 14.7%、背景跌 18.3%、89% 像素有變化 → 「畫面暗」仍然明顯（唔會變成死詞綴）。⚠️ **五關 sky 本身已經近黑** → 減 alpha 對「暗」嘅感覺影響極細，正因為咁先值得減。⚠️ **唔好只睇程式碼估** —— 呢類要靠逐像素對比實測 |
| **icon 用 palette 最暗色，喺深色底上等於冇** | `icon_blackout` 原本成個框都用 `'N'`（#121a30），而詞綴橫幅底色 ≈ #011327 → 實測對比 **1.08:1**（完全睇唔到），其餘 5 個詞綴 icon 都 7–14.7:1。⚠️ **諷刺位**：呢個正正就係「停電」詞綴嘅 icon —— 停電生效嗰刻個 icon 係全畫面唯一一個睇唔到嘅圖形 | v0.31.0 #119：改成 **白框 + 深色內部**（熄咗嘅屏），對比 **→ 18.46:1**。⚠️ **改 icon 唔可以改尺寸**（改尺寸 = 圖集格大細變 = **推走之後所有 sprite 嘅座標**）→ 只改用邊隻色畫，座標就 100% 唔郁。⚠️ **改完必驗三樣**：① 逐格座標表比對（107 格全部不變）② 圖集逐像素比對（只准 icon 嗰格有變）③ 實機量 icon 對比。守門 = `test_readability.js`（自己寫 PNG 解碼器，直接解 index.html 入面嵌嘅圖集量真實像素） |
| **新狀態唔喺 `onStateEnter` 加分支** | 揀完卡之後直接入關，`skillOffer` 未初始化 → 揀唔到 / 畫面空白 | 每個新 `STATE` 都要喺 `onStateEnter` 有對應分支（清場 / 候選初始化 / tip 文案） |
| **`spdMul` 只乘咗 `formSpd` 冇乘 `vx/vy`** | bolt 形態（預設）速度唔變 → 「收束」變成淨係加傷唔加速 | 速度係數要同時乘入子彈初速同形態派生速度 |
| **效果層欄位只寫唔讀（死卡）** | 卡面寫住「+40%」但實際傷害冇加 —— 玩家見到嘅承諾同實際效果唔一致 | 每個效果欄位都要有 game logic 讀。⚠️ **只檢查「欄位出現次數」捉唔到**（v0.27.0 嘅 `elementMaster` 就係咁漏咗）—— 必須用**行為測試比較實際數值**（開／關效果兩次嘅傷害差） |
| **屏幕效果每幀觸發** | 連鎖／灼燒每幀都閃 → 畫面一直跳，低 FPS 裝置更卡 | 每種屏幕效果**獨立冷卻**（`screenFxCd`），同一時間只有一個 screenFx；粒子總量有上限（`PARTICLE_CAP = 260`） |
| **`ctx.filter` 做染色** | 低 FPS 智慧白板裝置會慢到拖死 | 用 offscreen canvas + `source-atop` + Map 快取（`getTintedSprite`） |
| **一次實體觸控被處理兩次** | 選單一次撳**連跳兩級**（撳難度卡直接入關、撳機卡跳過揀元素）—— 玩家見到「冇主頁、冇揀機，一入去就係戰鬥」 | 喺支援 Pointer Events 嘅裝置，一次撳會派發 **`pointerdown` + `touchstart`** 兩個事件，**兩個 handler 都叫 `handleMenuTap()`**。修正 = `handleMenuTap` 入口加 `isDuplicateMenuTap()` 去重（120ms + 32px 容差），**而且只喺 `isMenuState(fsm.cur)` 時生效**（戰鬥中玩家要連續撳嚟移位，一齊去重就移唔到）。⚠️ **桌面 mouse 測試唔會派發 `touchstart`，所以捉唔到** —— 必須用 Playwright WebKit + `hasTouch: true` + `touchscreen.tap()` |
| **多份 state 清單各自維護** | 加新 state 時漏改其中一份 → 某啲畫面喺觸控裝置唔 `preventDefault`、或者處理唔到 | 抽 `isMenuState(s)` 做**唯一真實來源**，所有 handler 引用佢（v0.21.2 起 `touchstart` 手寫一份白名單、`handleMenuTap` 又按分支寫另一份，v0.26.0 / v0.27.0 加 state 時就開始漂移） |
| **形態卡用「絕對射速乘數」做代價** | 機體基礎射速差 **3.75 倍**（A 15/s ↔ C 4/s）→ 同一個乘數喺唔同機體效果差幾倍 → `boom`/`miss`/`wave` 喺 **5/5 機體全部 <1×**（揀咗之後 DPS 反而跌過唔揀） | 代價要**相對該機體**：每張形態卡 × 每架機體一格**傷害乘數**（`FORM_DPS_MUL`），用 12 秒 boss 窗口實測校準。⚠️ **只改傷害、唔改射速** → 各形態嘅節奏身份（導彈慢 / 迴力鏢往返 / 軌道炮一發一線）保留；⚠️ `laser` 嘅 DPS 由光束 tick 率主導、**完全唔受 fireRate 影響** → 必須用傷害乘數 —— **v0.33.0 已做** |
| **投射物生命期寫死一個數** | 導彈初速跟機體 `bulletSpd`（A 0.44 · B 0.26）→ 慢機體飛到 boss 要 2600ms+ 但 `life` 寫死 2200ms → **物理上飛唔到**（實測 B 機 12 秒得 0.44 次命中、DPS 0.06×；加 32× 傷害都係 0.000×） | 生命期要**按實際飛行時間計**（`MISSILE_LOCK_MS + 距離 ÷ 巡航速`）；校正時間 = 初速 × 0.55（導彈） × 1.15（鎖定期後恢復） —— **v0.33.0 已做** |
| **量測用 `setInterval` 對齊目標** | 主執行緒一忙 interval 就被餓住 → 跟隨滯後飄走 → 命中率飄 → 同一配置重測離散 **20–50%**（實測軌道炮喺 rAF 對齊係 3.82×、interval 對齊得 1.71×） | 對齊／跟隨邏輯要行喺 **`requestAnimationFrame`**（同遊戲主循環同頻 → 滯後 ≤ 1 幀）—— v0.33.0 校準已做 |
| **切換量測配置唔清場上殘留物體** | 上一個窗口嘅子彈仲喺場上（導彈生命期 2.8s）→ 喺新窗口開頭繼續造成傷害 = **跨配置污染**（導彈 → 迴力鏢 最嚴重） | 每個窗口開始前 `bullets.length = 0`（清走上一個配置嘅殘留彈體）—— v0.33.0 校準已做 |
| **比值用「平均 ÷ 平均」計** | boss 8 字形游走嘅相位會隨時間飄 → 各配置嘅相位誤差**疊加**（唔會互相抵銷）→ 同一張卡 5 架機嘅比值離散可以差 3 倍 | **逐 rep 配對**計比值（同一 rep 入面 base 窗口同 form 窗口相隔 ~8 秒，而 boss 8 字形週期 3770ms → 兩者相位幾乎相同 → 誤差互相抵銷）；並且用**輪轉式**（base → 卡A → 卡B → … → base）順序量 —— v0.33.0 校準已做 |
| **量測窗口太短，喺「離散命中」形態上會量到假象** | boom / missile / wave 嘅傷害係**一發打一次**（非連續）→ 8 秒窗口內只有 5–7 次命中 → 命中數係整數 → **離散可以去到 300%**。實測 B 機 boom 喺 8 秒窗口量到 **[0, 0, 2.8]（比值 0.00×）**，但長窗口（45 秒 = boss 8 字形週期 12 倍）實測係 **1.72×** —— 差 4 倍，**但產品冇問題** | 校準用**長窗口**（≥45 秒）令窗口覆蓋多個 boss 週期（相位平均）同足夠命中數；⚠️ **量到離散 >20% 先唔好信個數**；⚠️ **離散大唔等於產品有 bug** —— 先查量測方法（窗口長度 / 對齊方式 / 殘留物體 / 配對方式），排除咗方法坑之後先係真嘅不確定性。v0.33.0 校準已改用 45 秒窗口 |

---

## 8. 平台支援矩陣

| 目標 | 狀態 | 備註 |
|---|---|---|
| iPad Safari 14+ | ✅ 主要 | Pointer Events + 觸控 |
| 智慧白板 Chrome 100+（Win） | ✅ 主要 | USB 觸控、8px 容差 |
| macOS Safari 14+ | ✅ 次要 | 開發／驗證 |
| macOS Chrome 100+ | ✅ 次要 | 開發／驗證 |
| Android Chrome < 100 | ❌ | 不測試 |
| iOS Chrome | ❌ | 須用 Safari |
| 舊版 Edge / IE | ❌ | 不支援 |
| Firefox Mobile | ❌ | 不測試 |

**冇** Electron／Tauri 封裝，**冇**主機（console／PC）目標。

---

## 9. 已知限制（唔好當已做）

| 限制 | 詳情 |
|---|---|
| 真機音訊**未驗證** | 冇 iPad／智慧白板／藍牙耳機，冇玩家實際音量偏好數據。baseline 係用 Node 假 `AudioContext` 量度 |
| 真瀏覽器音訊延遲**未量度** | Browser 工具 timeout，改用假 context 推進時間軸 |
| 審計建議**全部未實作** | `AUDIO_VIDEO_OPTIMIZATION.md` §13 批次 A–D 全部係方案，唔係已存在嘅音效 |
| 音效覆蓋只係「12 個已定義」 | 12/12 掛鉤覆蓋率 = 100%，但**缺口係未建立**，唔係「建立了但冇用」 |
| 難度未經真人實測 | 靜止唔郁嘅玩家 15 秒死喺第一關 |
| 目標秒數未重新校準 | 現時單關實測 35–55 秒，目標寫 50–70 秒 |
