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
| `PLAN.md` | **遊戲設計**唯一真實來源。參考表（#1–#78）凍結所有規格歧義 · 鎖定項目 · 關卡數據 · 改動紀錄 | 交付層實作細節、音訊架構細節 |
| `AUDIO_VIDEO_OPTIMIZATION.md` | **音訊／視訊交付層**唯一真實來源。現況架構 · 缺陷 · 音效地圖 · 音樂地圖 · 方案 · baseline 量度 | 遊戲設計決策（關卡數值、强化池） |
| `AI_INSTRUCTIONS.md`（本檔） | 工作流 · 命名規則 · 驗證指令 · 架構邊界 · 常見陷阱 | 任何規格內容 |
| `test_*.js` | 測試。**測試係規格嘅可執行版本** | — |

**唔好開第二個真實來源。** 新議題：設計 → 改 `PLAN.md`；音訊／視訊 → 改 `AUDIO_VIDEO_OPTIMIZATION.md`；工作流 → 改本檔。

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

12 個測試檔，全部用 Node 直接跑（**冇測試框架，冇 npm install**）。每個檔案自己 `console.log` 逐項結果，最尾印 `✓ 全部通過`。

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

### 5.4 交付前檢查清單

```
□ 全套 12 個測試檔 PASS
□ index.html 語法檢查 OK
□ 版號已 bump（兩處：標題畫面 + 啟動日誌）
□ PLAN.md 參考表已更新（如有設計改動）
□ PLAN.md 改動紀錄已加一條
□ 冇改動 player-facing 文案而冇同步 PLAN.md
□ git diff --cached --name-only 同手動 staged 清單一致
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
