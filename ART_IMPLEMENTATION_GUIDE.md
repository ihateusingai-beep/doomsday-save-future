# 美術實作指南 — 末日救未來

> 建立日期：2026-10-24 · 對應 runtime **v0.23.1** · 對應 asset 來源 `art.px.js`
> 評分標準同診斷喺 `VISUAL_QUALITY_RUBRIC.md` · 介面規則喺 `UI_STYLE_GUIDE.md`。
> 本文講**點樣做**，唔講**做得點**。

---

## 0. 三分鐘上手

```
改 sprite  →  編輯 art.px.js  →  build 圖集  →  貼回 index.html  →  跑測試
```

```bash
cd ~/workspace/doomsday-save-future

# 1. 改 art.px.js（唯一真實來源，唔好直接改 index.html 嘅 base64）

# 2. build 圖集
node $HOME/.hermes/skills/creative/pxl-pixel-art/bin/pxl.js build art.px.js --out out

# 3. 貼回 index.html（3 處要同步，見 §6.2）

# 4. 驗證
for f in test_*.js; do node "$f" >/dev/null || echo "FAIL $f"; done
node -e "const h=require('fs').readFileSync('index.html','utf8');
new Function(h.match(/<script>([\s\S]*?)<\/script>/)[1]);console.log('語法 OK')"
```

---

## 1. 風格鐵律

> 呢 8 條係**不可協商**。違反任何一條 = 唔好合併。

| # | 鐵律 | 點解 |
|---|---|---|
| **F1** | **所有 sprite 只能用 `art.px.js` `pal()` 內嘅 24 色** | 色彩語言係全遊戲最強嘅一環。一旦有第 25 個色,成個畫面就唔 coherent |
| **F2** | **所有 icon 必須係圖集 sprite,絕對唔可以用 emoji / Unicode 符號** | emoji 唔受 palette 控制、跨平台唔一致、寬度唔可預測（直接造成文字溢出） |
| **F3** | **玩家 = 青 · 敵方 = 粉紅 · 環境危害 = 橙 · 增益 = 綠 · 特殊 = 紫** | 玩家要唔使讀細節就知道邊個要打 |
| **F4** | **每個敵人家族必須有獨特剪影**,唔可以只靠換色 | 灰度測試要過 |
| **F5** | **唔可以用系統字體做圖示**（`sans-serif` 只准用於純文字） | 系統字體帶入系統配色 |
| **F6** | **唔加非必要新色去「救」一個 asset** | 加色 = 破壞 palette。改形狀先於改色 |
| **F7** | **sprite 唔好加隨機亮點填空間** | 冇目的嘅噪聲像素會削弱剪影 |
| **F8** | **改 asset 後一定要同步更新 `SPRITE` 座標表** | 座標錯 = 圖錯位，而且**唔會報錯** |

---

## 2. 現有美術系統解剖

### 2.1 檔案分工

| 檔案 | 角色 | 邊個係真實來源 |
|---|---|---|
| `art.px.js` | **sprite 定義源**（palette / sprite / sheet） | ✅ **唯一真實來源** |
| `out/dsf_main.png` | build 產物（99×96 px 圖集） | gitignore，唔入庫 |
| `out/dsf_main.json` | build 產物（座標表） | gitignore，唔入庫 |
| `index.html` 內 `SHEET_B64` | 圖集 base64（2064 字元 / 1547 bytes） | **派生物**，build 後貼返 |
| `index.html` 內 `SPRITE` | 座標表（33 格） | **派生物**，build 後貼返 |

> ⚠️ **目前 `SPRITE` 座標表同 `art.px.js` 嘅 `sheet()` 順序係人手同步嘅**，冇自動驗證。加 sprite 必須兩邊一齊改。

### 2.2 圖集現況（v0.25.0 更新）

```
圖集實際尺寸: 106 × 187 px
PNG 編碼後:  3,140 bytes
base64:       3,444 字元
格數:         83（32 個 icon + 3 個新敵人 + 6 個動畫家族共 15 幀 + 原有 33 個）
```

> **v0.26.0 變化**：83 格 → **94 格**（+2 機體 `ship_d`/`ship_e` · +2 機體技能 icon `icon_recall`/`icon_converge` · +3 通用技能 icon `icon_magnet`/`icon_recover`/`icon_overload` · +4 新敵人 `medic`/`chaser`/`bomber`/`turret`）。PNG 由 2,696 → **3,140 bytes**（+444），圖集 106×179 → **106×204**（+2 排，每排 13px）。⚠️ **高度上限由 200 上調到 210**（格數上限由 90 上調到 96）。
> **v0.25.0 變化**：80 格 → **83 格**（+3 個機體專屬技能 icon：`icon_dash` / `icon_bulwark` / `icon_overheat`）。PNG 由 2,582 → **2,696 bytes**（+114），圖集 106×187 → **106×179**（高度反而減咗 8px）。
> **v0.24.0 變化**：33 格 → 80 格（+47）。PNG 只由 1,547 → 2,582 bytes（+1,035），
> 遠低於 8 KB 預算 —— 因為 10×10 純色塊 icon 壓縮率極高。
> 圖集高度由 96 → 187（+91），**已超出原本建議嘅 140px 上限**，但寬度 106 仲好有餘裕。
> 見 §10.1 預算表（已同步更新上限）。

**關鍵限制**：圖集係 106×204。任何 sprite 超過 ~26px 高就會令圖集長一列，每加一列圖集 +13px 高 → PNG 體積線性上升。

### 2.3 Sprite 分佈

| 類別 | 格數 | 原生尺寸 | 顯示 scale | 顯示尺寸 |
|---|---|---|---|---|
| 玩家機 | 3 + 2 動畫幀 | 8–10×9–10 | 3.2 | 26–32 px |
| 玩家彈 | 1 + 2 動畫幀 | 7×12 | 1–1.4 | 7×12 px |
| 敵彈 | 1 + 2 動畫幀 | 9×9 | 1–1.2 | 9×9 px |
| 敵人 | 9（含 3 個新敵人） | 8–12×7–9 | 1 | 8–12 px |
| Boss | 1 + 4 動畫幀 | 12×10 | 2.5–2.6 | 30×25 px |
| **Icon** | **29** | **10×10** | **1–2** | **10–20 px** |
| 背景 | 5 | 10–26 px | 1.2–1.4 | 12–36 px |

---

## 3. Palette 規範

### 3.1 唯一色源

```javascript
// art.px.js
pal({
  k: "#000000",   // 純黑 — 只用於 outline
  n: "#070b18",   // 最深藍 — 背景底
  N: "#121a30",   // 深藍 — 面板底
  m: "#1c2744",   // 中藍 — 卡片底
  c: "#00f6ff",   // 亮青 — 玩家
  C: "#00a0c8",   // 青 — 玩家暗部
  d: "#006888",   // 深青 — 玩家陰影
  w: "#f8ffff",   // 白 — 高光 / 核心
  y: "#ffe566",   // 亮黃 — 精英 / 提示
  Y: "#ff9a18",   // 橙黃 — 火焰 / 環境
  o: "#ff6a20",   // 橙 — 危害 / 爆炸
  p: "#ff6ad5",   // 粉紅 — 敵方
  P: "#ff1a6a",   // 深粉 — 敵方暗部
  g: "#3dff8a",   // 亮綠 — 增益
  G: "#12a855",   // 綠 — 增益暗部
  r: "#ff4d5e",   // 紅 — 生命 / 危險
  R: "#a01028",   // 深紅
  b: "#4d8cff",   // 藍 — 護盾 / 中立
  B: "#1a4aaa",   // 深藍
  s: "#8aa0c8",   // 灰藍 — 次要文字
  S: "#3a4868",   // 深灰藍 — 結構
  h: "#2a3548",   // 暗灰藍 — 背景建築
  H: "#5a6a88",   // 中灰藍 — 背景建築亮部
  t: "#c8d8ff",   // 淡藍白 — 文字
})
```

> **「24 色」嘅準確定義（v0.26.0 核實）**
>
> | 數 | 值 | 說明 |
> |---|---|---|
> | **`pal()` 色鍵數** | **24** | `k n N m c C d w y Y o p P g G r R b B s S h H t` —— **呢個就係「24 色」嘅意思** |
> | pxl 內建 pico8 色 | 16 | `pal()` 係 **extend**（唔係覆蓋）內建 palette，所以總 key 數 = 37 |
> | 覆蓋 | 3 | `c` / `d` / `b` 撞正 pico8 嘅 `c` / `d` / `b`，被自訂色頂替 |
> | Ramp | 5 條 | 插值後**圖集實際出現 88 個色值**（PLTE 88 項） |
>
> ⚠️ **規則冇變**：新 asset **只准用上面呢 24 個 `pal()` 色鍵**（`.` = 透明、`_` = 擦除），**唔准自己寫 `#hex` 字面色**。呢個 24 唔係「仲有 2 個位可以加色」—— 加第 25 個就係加第 25 個色，直接違反 F1。

### 3.2 Ramp 漸變規律

```javascript
ramps("knNmdCcw", "knRPPpyYo", "knRGGgw", "knBBbtsS", "khHS")
```

5 條 ramp 嘅結構一致：**黑 → 深 → 中 → 亮 → 純白**。新 asset 揀色時**先搵對應 ramp**，唔好跳級。

| Ramp | 用途 |
|---|---|
| `knNmdCcw` | 機體 / 冷色金屬（玩家） |
| `knRPPpyYo` | 敵機 / 熱色（粉→橙） |
| `knRGGgw` | 蟲類 / 綠色生物 |
| `knBBbtsS` | 護盾 / 藍色結構 |
| `khHS` | 背景建築（只有 3 階，故意扁平） |

### 3.3 顏色語意對照表

| 語意 | 色 | 嚴禁挪用 |
|---|---|---|
| 玩家自己 / 玩家子彈 | `c` `C` `d` | 唔可以俾敵方用 |
| 敵方 / 敵方子彈 | `p` `P` | 唔可以俾玩家用 |
| 環境危害（隕石、火） | `Y` `o` | 唔可以俾 UI 用 |
| 增益 / 強化 / 綠燈 | `g` `G` | — |
| 生命 / 紅色警告 | `r` `R` | 唔可以當裝飾色 |
| 護盾 / 中立結構 | `b` `B` | — |
| 精英 / 高價值提示 | `y` | 唔可以大面積鋪 |
| 純黑 | `k` | **只可以用作 outline**，唔可以大面積填充 |

### 3.4 自動檢查腳本

```bash
# 掃 index.html 有冇 palette 以外嘅字面色
node -e "
const fs=require('fs');
const pal=new Set(['#000000','#070b18','#121a30','#1c2744','#00f6ff','#00a0c8','#006888',
'#f8ffff','#ffe566','#ff9a18','#ff6a20','#ff6ad5','#ff1a6a','#3dff8a','#12a855',
'#ff4d5e','#a01028','#4d8cff','#1a4aaa','#8aa0c8','#3a4868','#2a3548','#5a6a88','#c8d8ff']);
const src=fs.readFileSync('index.html','utf8');
const found=new Set();
for(const m of src.matchAll(/#[0-9a-fA-F]{3,6}\b/g)) if(!pal.has(m[0].toLowerCase())) found.add(m[0]);
if(found.size){ console.log('⚠️ palette 外顏色:', [...found].join(' ')); process.exit(1); }
console.log('✓ 全部字面色在 palette 內');
"
```

> ⚠️ 呢個腳本**唔會計 emoji**（emoji 唔係 hex 色）。emoji 問題要用 `grep` 查 icon 欄位。

---

## 4. 命名規範

### 4.1 Sprite 命名

```
{類別}_{主體}[_{變體}][_{幀序號}]
```

| 段 | 允許值 |
|---|---|
| 類別 | `ship` `enemy` `bullet` `boss` `pickup` `fx` `ui` `bg` `icon` |
| 主體 | 小寫英文單數（`grunt` `dive` `elite` `sniper` `shield` `swarm` `splitter` `rammer` `lancer`） |
| 變體 | `_base`（無 glow 底圖）· `_alt`（變體） |
| 幀序號 | `_0` `_1` `_2`（**由 0 開始**） |

**實例**
```
ship_a          玩家機 A
ship_a_base     玩家機 A 底圖（畫光用）
thrust_0        推進器閃爍幀 0
bullet_p        玩家彈
bullet_e        敵彈
enemy_grunt     雜魚
enemy_ram_0     衝撞者幀 0
boss_core_0     Boss 核心幀 0
icon_hp         生命 icon
icon_rocket     導彈 icon
bg_tower        背景塔樓
```

### 4.2 現有命名嘅不一致（要改）

| 現況 | 問題 | 應改為 |
|---|---|---|
| `grunt` `dive` `elite` `sniper` `shield_e` `swarm` | 冇 `enemy_` 前綴 | `enemy_grunt` … |
| `bullet_p` `bullet_e` | `_p`/`_e` 語意不明 | `bullet_player` / `bullet_enemy` |
| `shield_e` | `_e` 令人誤以為係 enemy | `enemy_shield` |
| `boom_0/1/2` | 冇 `fx_` 前綴 | `fx_boom_0` |
| `ui_focus` `ui_bomb` | ✅ 前綴正確 | 保留 |
| `bldg` `tower` `meteor` `debris` `gate` | 冇 `bg_` 前綴 | `bg_bldg` … |

> ⚠️ **改名成本**：`SPRITE` 座標表 + `art.px.js` + `drawSprite()` 全部 call site + `test_*.js` 引用。**建議下次重排圖集時一齊做**，唔好逐個改。

### 4.3 圖示（Icon）命名

```
icon_{概念}
```

必須覆蓋嘅概念清單見 §7.2。

---

## 5. 尺寸與比例規範

### 5.1 三個尺寸級別

| 級別 | 用途 | 尺寸 | 顯示 scale | 設計規則 |
|---|---|---|---|---|
| **S** | 玩家彈、粒子 | 5–9 px | 1 | 3 色以內，1px 輪廓 |
| **M** | 敵人、UI icon | 8–16 px | 1–1.4 | 4–6 色，**剪影可辨** |
| **L** | 玩家機、Boss、背景 | 10–28 px | 1.4–3.2 | 6–8 色，可用 glow |

### 5.2 輪廓規則

```javascript
sprite("name", { mx: true, outline: "k" }, `...`)
```

- `mx: true` = 水平鏡像（左右對稱造型用）
- `outline: "k"` = 自動加 1px 純黑外框 → **強烈建議所有會出現喺戰場上嘅物件都用**
- 外框令物件喺複雜背景上仍然跳得出

### 5.3 Glow 規則

```javascript
glow("c", { r: 1, strength: 0.25, bands: 1 })
```

| 參數 | 意義 | 規則 |
|---|---|---|
| `r` | glow 半徑（像素） | 小物件 r=1 · 大物件 r=2 |
| `strength` | 強度 0–1 | **≤ 0.4**。> 0.4 會令物件糊埋 |
| `bands` | 光暈層數 | 1 或 2。3 會過曝 |

**限制**：glow 只可以俾「高能物件」（玩家彈、激光、爆炸、精英、Boss）。**普通雜魚唔應該有 glow** —— 否則敵人會搶走玩家注意力。

### 5.4 玩家機 vs 敵人

| 項目 | 玩家機 | 敵人 |
|---|---|---|
| 原生高 | 9–10 px | 7–9 px |
| 顯示 scale | 3.2 | 1 |
| 顯示高 | 29–32 px | 7–9 px |
| 色 | 青／藍／黃 | 粉紅／橙／綠／金 |
| 輪廓 | ✅ | ✅ |

**比例規則**：玩家機顯示高度 = 敵人 3–4 倍。呢個比例係**核心可讀性**，唔好因為「想睇清敵人」而縮細玩家機。

---

## 6. Pipeline

### 6.1 完整流程（**v0.24.0 自動化**）

```
1. 編輯 art.px.js
      ├─ pal()      加色 → 要更新 §3.4 檢查腳本
      ├─ sprite()   加／改 sprite
      └─ sheet()    加格

2. build
      node $HOME/.hermes/skills/creative/pxl-pixel-art/bin/pxl.js build art.px.js --out out

3. 同步落 index.html（**一個指令**，見 §6.2）
      node tools/sync_sheet.js

4. 驗證
      ├─ 13 個測試檔全綠
      ├─ index.html 語法檢查
      ├─ 圖集座標表同 sheet() 順序一致（sync_sheet.js 自動做，見 §6.3）
      └─ 實機截圖覆核（見 §9）
```

### 6.2 同步落 index.html：**用工具，唔好手改**

**v0.24.0 新增 `tools/sync_sheet.js`** —— 自動讀 `out/dsf_main.json` + `out/dsf_main.png`，
寫回 `index.html` 嘅 `SPRITE` 座標表同 `SHEET_B64`。

```bash
node tools/sync_sheet.js
```

| # | 位置 | 內容 | 邊個寫 |
|---|---|---|---|
| 1 | `const SPRITE = Object.freeze({...})` | 座標表（x / y / w / h） | **工具** |
| 2 | `const SHEET_B64 = '...'` | base64 圖集 | **工具** |
| 3 | `console.log('[貼圖] 圖集就緒 ·', ...)` | 格數 | 自動計，唔使手改 |

> ⚠️ **唔好再手動同步座標表。** 座標錯位唔會令任何測試失敗 —— 圖會靜靜哋錯位，
> 而且搵返要逐格對。本工具令呢個風險歸零。

### 6.3 座標表一致性驗證（**工具自動做，唔使再人手跑**）

`tools/sync_sheet.js` 每次都會：
1. 由 `out/dsf_main.json` 讀出 sprite 順序同座標
2. 由 `out/dsf_main.png` 讀出新 PNG
3. 重寫 `index.html` 嘅 `SPRITE` 表同 `SHEET_B64`
4. 讀返 `index.html` 驗證兩者一致，唔一致就 `exit 1`

> 舊嘅人手 script（比較 `art.px.js` `sheet()` 順序 vs `index.html` `SPRITE` 順序）
> 已由工具取代。手動驗證仍然可以跑，但唔再係必須。

### 6.4 新增 sprite 嘅檢查清單

```
□ art.px.js 加咗 sprite 定義
□ palette 只用咗 24 色內嘅色
□ outline: "k" 已加（戰場物件）
□ glow strength ≤ 0.4
□ sheet() 順序已更新
□ node tools/sync_sheet.js 跑過（座標表 + SHEET_B64 自動同步）
□ 圖集體積無爆升（記錄新體積）
□ 實機截圖覆核（尤其新 sprite 喺實際背景上嘅可讀性）
□ 測試全綠 + 語法 OK
```

---

## 7. 新增資產需求（按優先）

### 7.1 Icon family（**v0.25.0 —— 32 個全部畫好**）

> 解決 `VISUAL_QUALITY_RUBRIC.md` §5.6 —— emoji 係最低分項目（V7 = 4/10）。

**v0.26.0 全部 37 個 icon 已畫好**（每個 10×10 px，3–4 色，全部喺 24 色 palette 內）：

> **v0.25.0 全部 32 個 icon 已畫好**（每個 10×10 px，3–4 色，全部喺 24 色 palette 內）：

| 概念 | 對應卡 | sprite |
|---|---|---|
| 生命 | `hp_s` `hp_l` | `icon_hp` |
| 護盾 | `shd_s` `shd_l` | `icon_shield` |
| 速度 | `spd_s` `spd_l` | `icon_speed` |
| 射速 | `fr_s` `fr_l` | `icon_rapid` |
| 多重彈 | `gun_2` `gun_3` | `icon_multi` |
| 傷害 | `dmg_s` | `icon_damage` |
| 炸彈 | `bomb_cd` | `icon_bomb` |
| 技能快 | `focus_d` | `icon_focus` |
| 衝刺（A 機技能） | `SHIPS.A.skillIcon` | `icon_dash` |
| 護盾（B 機技能） | `SHIPS.B.skillIcon` | `icon_bulwark` |
| 過熱（C 機技能） | `SHIPS.C.skillIcon` | `icon_overheat` |
| 召回（D 機技能） | `SHIPS.D.skillIcon` | `icon_recall` |
| 收束（E 機技能） | `SHIPS.E.skillIcon` | `icon_converge` |
| 磁力場（通用技能） | `UNIVERSAL_SKILLS.magnet.icon` | `icon_magnet` |
| 迴氣（通用技能） | `UNIVERSAL_SKILLS.recover.icon` | `icon_recover` |
| 過載護盾（通用技能） | `UNIVERSAL_SKILLS.overload.icon` | `icon_overload` |
| 貫穿 | `pierce` | `icon_pierce` |
| 擦彈 | `graze_s` | `icon_graze` |
| 復活 | `life_st` | `icon_revive` |
| 大師 | `master` | `icon_master` |
| 激光 | `form_laser` | `icon_laser` |
| 軌道炮 | `form_rail` | `icon_rail` |
| 迴力鏢 | `form_boom` | `icon_boomerang` |
| 導彈 | `form_miss` | `icon_rocket` |
| 波動彈 | `form_wave` | `icon_wave` |
| 追蹤 | `tag_home` | `icon_homing` |
| 分裂 | `tag_split` | `icon_split` |
| 緩速 | `tag_slow` | `icon_slow` |
| 彈牆 | `tag_rico` | `icon_bounce` |
| 物資 | 事件 | `icon_supply` |
| 引擎 | 事件 | `icon_repair` |
| 賭博 | 事件 | `icon_gamble` |
| 逆風 | 詞綴 | `icon_wind` |
| 鐵壁 | 詞綴 | `icon_iron` |
| 蟲潮 | 詞綴 | `icon_swarm` |
| 停電 | 詞綴 | `icon_blackout` |
| 玻璃 | 詞綴 | `icon_glass` |
| 靜電 | 詞綴 | `icon_static` |

**畫法**：用 `icon()` DSL helper（`art.px.js`），每個 10×10，跟 `icon_hp` 嘅結構模板。
**唔准**逐個手畫 —— 用同一個 helper 出，令線粗同風格一致。

**使用端**：`index.html` 嘅 `icon:` 欄位填 sprite 名（唔係 emoji 字串）。
雙重 icon 加 `icon2:` 欄位，`drawIconPair()` 左右並排（中間留 2px）。
**守門**：`test_visual_v024.js` §5 —— 48 個 icon 欄位全部 ASCII sprite 名、零 emoji、零缺失格。

### 7.2 敵人 sprite（**v0.26.0 已完成 —— 7 個全部畫好**）

| 敵人 | 剪影 | 尺寸 | 狀態 |
|---|---|---|---|
| `splitter` 裂解者 | 六角形 + 中心裂縫（暗示「會分裂」） | 10×8 | ✅ 已畫 |
| `rammer` 衝撞者 | 楔形撞角朝下（暗示「衝」） | 12×8 | ✅ 已畫 |
| `lancer` 雷射兵 | 細長槍管 + 底部能源點 | 8×12 | ✅ 已畫 |
| `medic` 醫護型 | 綠色圓環 + 白色核心（暗示「治療」） | 10×9 | ✅ 已畫 |
| `chaser` 追蹤型 | **紅色十字翼**（十字形＝追蹤範圍） | 10×8 | ✅ 已畫 |
| `bomber` 自爆型 | 尖刺球（尖刺＝即刻會爆） | 9×9 | ✅ 已畫 |
| `turret` 護罩炮台 | 闊身 + 向下炮管 + 白色護盾核心 | 12×9 | ✅ 已畫 |

每個都有 `_base`（底座，同原 sprite 對齊）同主 sprite 兩格。

> **v0.26.0 #97**：4 種新敵人全部有**專屬 base sprite**（唔重色舊 sprite）。
> ⚠️ **`chaser` 用十字形剪影**係刻意嘅——同其他敵人（三角 / 六角 / 楔形 / 長條 /
> 圓環 / 尖刺球 / 闊身）都唔撞；`medic` 嘅綠色圓環同 `swarm` 嘅綠色都唔同
> （medic 係「綠環 + 白心」，swarm 係「綠色實心」）。
> ⚠️ 新 sprite **冇用 `mx: true`**——pxl 嘅 `mx` 會喺鏡像軸插透明縫
> （`mx:true` = grid + 2px 縫 + reverse），會令連續機身被劈開；
> 新圖全部用 `{ w, h }` + 完整對稱 ascii（同一個 icon 家族嘅寫法）。

**要求**：剪影必須同 `enemy_grunt`（三角）明顯不同。做**剪影測試**（見 §8.2）。

> **保留程序化特徵**：新 sprite 只換 base，唔會取代每個敵人原本嘅程序化標記
> （裂解者嘅菱形裂紋、衝撞者嘅速度線、雷射兵嘅光束柱）——
> 咁 3 秒可辨識度先唔會跌。`index.html` 敵人 sprite 選擇已改：
> splitter→`splitter`、rammer→`rammer`、lancer→`lancer`（原本全部重色 grunt/swarm/shield_e）。
>
> **v0.26.0 新增程序化特徵**（同樣係 canvas 畫，零新資產檔）：
> 醫護 → 治療範圍圈 + 治療閃光圈 · 追蹤 → 指向玩家嘅紅色虛線 ·
> 自爆 → 越接近玩家越亮嘅紅色警告圈（公平提示）· 炮台 → 藍色護盾環（越薄越暗）。

### 7.3 動畫幀（**v0.24.0 已完成 —— 6 個家族、15 幀**）

| 物件 | 幀數 | fps | 狀態 |
|---|---|---|---|
| 玩家機（chassis A） | 2（引擎閃爍） | 8 | ✅ `anim_ship_a` |
| 普通雜魚 | 2（核心脈動） | 8 | ✅ `anim_grunt` |
| 精英 | 2（光環旋轉） | 6 | ✅ `anim_elite` |
| Boss | 4（核心脈動 + 姿態） | 6 | ✅ `anim_boss` |
| 玩家彈 | 2（拖尾） | 12 | ✅ `anim_bullet_p` |
| 敵彈 | 2（脈動） | 12 | ✅ `anim_bullet_e` |

**成本**：實際只係 +1,035 bytes PNG（30 個新幀嘅預估係 +1.2 KB），遠低於預算。

**畫法**：`art.px.js` 用 `anim()` 定義 —— **同一個 anim 定義一次過出曬所有幀**，
唔准逐個 sprite 各自畫（避免逐幀風格漂移）。

**使用端**：
- `index.html` 有 `ANIM_FPS` 常數表 + `animFrame(name, tMs)`（按時間揀幀）
  + `drawSpriteAnim(animName, staticName, cx, cy, scale, tMs)`（冇動畫就自動退回靜態圖）
- 所有 anim 共用同一條 `animT` 時間軸（`render()` 開頭 `animT = performance.now()`），
  令 boss 同雜魚嘅閃爍同步，唔會各閃各的
- `ship_b` / `ship_c` 同 dive/sniper/shield/swarm 暫時靜態 —— 成本 vs 收益

---

## 8. 驗證程序

### 8.1 灰度可讀性測試

```javascript
// 臨時：把所有 sprite 畫成純黑剪影，排在白色背景
// 目的：驗證剪影可辨（V2）
```

**手動方法**：截圖後用任何圖片工具轉灰度 → 敵人家族仲要分得開。

### 8.2 剪影測試（3 個新敵人）

```
1. 從 art.px.js 抽出 enemy_grunt / enemy_splitter / enemy_ram / enemy_lancer 嘅 base
2. 全部填純黑，縮放同實際顯示倍數（1×）
3. 排成一列
4. 睇：任何兩個都唔可以撞形
```

### 8.3 玩家/敵方子彈分辨測試

```
1. 截一張彈幕密度最高嘅畫面（彈幕關）
2. 轉灰度
3. 目標：玩家彈（直長條）同敵彈（圓點）仲要分得出，靠**形狀**唔係只靠顏色
```

### 8.4 像素銳利檢查

```
1. 放大截圖到 400%
2. 檢查邊緣：像素應該係硬邊，唔應該有插值灰邊
3. 如果有 → 檢查 drawSprite() 嘅 imageSmoothingEnabled
```

### 8.5 高 DPR 檢查

```
1. 喺 DPR 2 / 3 螢幕截圖（iPad Retina）
2. 檢查掃描線：應該似掃描線，唔似格紋
3. 檢查 halo / glow：唔應該有 banding
```

### 8.6 自動檢查（每次改 asset 必跑）

```bash
cd ~/workspace/doomsday-save-future

# 1. 座標表一致性
node -e "
const fs=require('fs');
const art=fs.readFileSync('art.px.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const order=[...art.match(/sheet\(\"dsf_main\",\s*\[([\s\S]*?)\]/)[1].matchAll(/\"([^\"]+)\"/g)].map(x=>x[1]);
const sprOrder=[...html.match(/const SPRITE = Object.freeze\(\{([\s\S]*?)\n\}\);/)[1].matchAll(/^\s*(\w+):\s*\{/gm)].map(x=>x[1]);
console.log(JSON.stringify(order)===JSON.stringify(sprOrder)?'✓ 座標表一致':'✗ 座標表唔一致');
"

# 2. palette 合規
node -e "
const pal=new Set(['#000000','#070b18','#121a30','#1c2744','#00f6ff','#00a0c8','#006888','#f8ffff','#ffe566','#ff9a18','#ff6a20','#ff6ad5','#ff1a6a','#3dff8a','#12a855','#ff4d5e','#a01028','#4d8cff','#1a4aaa','#8aa0c8','#3a4868','#2a3548','#5a6a88','#c8d8ff']);
const src=require('fs').readFileSync('art.px.js','utf8');
const bad=[...new Set([...src.matchAll(/#[0-9a-fA-F]{3,6}\b/g)].map(x=>x[0].toLowerCase()))].filter(c=>!pal.has(c));
console.log(bad.length? '✗ palette 外: '+bad.join(' ') : '✓ palette 合規');
"

# 3. 測試 + 語法
for f in test_*.js; do node "$f" >/dev/null 2>&1 || echo "FAIL $f"; done
node -e "const h=require('fs').readFileSync('index.html','utf8');
new Function(h.match(/<script>([\s\S]*?)<\/script>/)[1]);console.log('✓ 語法 OK')"
```

---

## 9. Review 程序

### 9.1 美術變更 review 門檻

| 變更類型 | 需要 |
|---|---|
| 加／改 sprite | 灰度剪影測試 + 實機截圖 + 座標表 script |
| 加色 | §3.4 palette script + 更新 §3.1 色源 |
| 改卡面 icon | 文字溢出檢查 + 跨平台 emoji 一致性（**唔用 emoji 就冇呢個問題**） |
| 改背景 | 每關截圖 + 深度感對比 |
| 改 UI 佈局 | `UI_STYLE_GUIDE.md` §狀態表逐項覆核 |

### 9.2 實機覆核清單

```
□ iPad Safari（智慧白板主目標）
□ 智慧白板 Chrome（Win）
□ macOS Safari
□ macOS Chrome
□ DPR 1 / 2 / 3
□ 直向 / 橫向
```

> ⚠️ **現況：以上全部未做過**（`VISUAL_QUALITY_RUBRIC.md` §9）。

### 9.3 評分回歸

改完 asset 之後，重新跑 `VISUAL_QUALITY_RUBRIC.md` 嘅 12 維度評分，對比改動前後。**每個 fix 應該喺對應維度有可見提升** —— 如果冇，代表改錯咗地方。

---

## 10. 性能預算

### 10.1 現況（實測基礎 · v0.24.0 更新）

| 項目 | 現況 | 預算上限 | 狀態 |
|---|---|---|---|
| 圖集 PNG | **3,140 bytes** | ≤ 8 KB | ✅ 餘 61% |
| base64 字串 | **3,444 字元** | ≤ 11 KB | ✅ |
| 圖集格數 | **94** | ≤ 96 | ✅ 餘 2 格（⚠️ 接近滿） |
| 圖集尺寸 | **106 × 204 px** | ≤ 160 × 210 px | ✅（寬度原上限 140 已改 200；高度上限 v0.26.0 由 200 改 210） |
| `index.html` 總大小 | **222.9 KB** | ≤ 225 KB | ⚠️ 餘 2.1 KB（接近上限，下次加嘢要同步檢查） |
| 每幀 sprite 繪製呼叫 | ~40–60 | ≤ 120 | ✅ |
| 背景 sprite 實例 | 3–5 | ≤ 12 | ✅ |
| 星點 | 48 | ≤ 80 | ✅ |

> **圖集高度上限由 140 改 200**：29 個 10×10 icon 令高度由 96 → 187。
> 寬度 106 仲好有餘裕（上限 160）。真正嘅樽頸係**格數 90**（仲餘 10 格）——
> 再加 icon 之前要諗下可唔可以複用（見 §10.3 第 2 點）。

### 10.2 為咩有硬上限

**智慧白板係區網內開機**，檔案越大首次載入越慢。而且 `index.html` 係單檔 —— 圖集係**唯一**嘅額外位元組負擔（音訊全部即時合成，零位元組）。

**預算超標 = 直接影響學生開機等幾秒**。

### 10.3 優化次序（省位元組）

1. **唔加新色**（每色 ~2–4 bytes PNG，但會令壓縮率變差）
2. **複用已有 sprite**（`icon_hp` 同 `ui_heart` 係同概念；格數只剩 10 個餘量）
3. **用 `outline` 自動外框**（比手畫省）
4. **png 壓縮**（build tool 應該已做，確認 `--out` 冇開 uncompressed）

---

## 11. 已知限制

| 限制 | 影響 | v0.24.0 狀態 |
|---|---|---|
| **`art.px.js` 靠外部工具** | `pxl.js` 喺 `~/.hermes/skills/`，唔喺 repo 內 —— **換機器就 build 唔到**。建議盡早 vendor 落 `tools/` | 未解 |
| **冇真機視覺驗證** | 投影 gamma 偏差未知 | 未解（冇 iPad / 智慧白板硬件） |
| **冇專業字體** | 純文字用系統 monospace，唔受 palette 控制 | 未解 |
| **座標表人手同步** | 冇自動驗證，靠 §6.3 script 防 | ✅ **已解** —— `tools/sync_sheet.js` |
| **冇 sprite 動畫幀（大部分）** | 表現力最大缺口（V6 = 3/10） | ✅ **部分解** —— 6 個家族 15 幀；ship_b/c 同 dive/sniper/shield/swarm 仍靜態 |
| **動畫幀喺靜態截圖無法證明** | 連續幀驗證要人手睇 | 未解 |
| **圖集 106×204 接近高度上限** | 加 sprite 容易爆格數 | ⚠️ 餘 2 格，要複用優先 |

---

## 12. 相關文檔

| 文件 | 角色 |
|---|---|
| `art.px.js` | **sprite 定義唯一真實來源** |
| `VISUAL_QUALITY_RUBRIC.md` | 評分標準 + 現況診斷 + 改進優先級 |
| `UI_STYLE_GUIDE.md` | 介面規則（icon 用法、字級、卡片規格） |
| `AUDIO_VIDEO_OPTIMIZATION.md` | 音訊交付層（視覺預警特效同音訊要對齊） |
| `AI_INSTRUCTIONS.md` | 整體工作流 + 驗證指令 |
| `PLAN.md` | 遊戲設計唯一真實來源 |
