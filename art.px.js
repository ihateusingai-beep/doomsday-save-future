// 末日救未來 — STG pixel pack v2 (beautify pass)
// Build: node $HOME/.hermes/skills/creative/pxl-pixel-art/bin/pxl.js build art.px.js --out out

pal({
  k: "#000000",
  n: "#070b18",
  N: "#121a30",
  m: "#1c2744",
  c: "#00f6ff",
  C: "#00a0c8",
  d: "#006888",
  w: "#f8ffff",
  y: "#ffe566",
  Y: "#ff9a18",
  o: "#ff6a20",
  p: "#ff6ad5",
  P: "#ff1a6a",
  g: "#3dff8a",
  G: "#12a855",
  r: "#ff4d5e",
  R: "#a01028",
  b: "#4d8cff",
  B: "#1a4aaa",
  s: "#8aa0c8",
  S: "#3a4868",
  h: "#2a3548",
  H: "#5a6a88",
  t: "#c8d8ff",
})
ramps("knNmdCcw", "knRPPpyYo", "knRGGgw", "knBBbtsS", "khHS")

/* ========== SHIPS (nose-up) ========== */
sprite("ship_a_base", { mx: true, outline: "k" }, `
  ..c
  .cc
  cCc
  cCc
  ccC
  c.y
  .Y.`)
sprite("ship_a", { base: "ship_a_base" },
  px(4, 2, "w"), px(3, 4, "c"), px(5, 5, "y"),
  glow("c", { r: 1, strength: 0.25, bands: 1 }))

sprite("ship_b_base", { mx: true, outline: "k" }, `
  ..c.
  .cCc
  cCCC
  CCCC
  cCCc
  bbYb
  .bYb
  ..Y.`)
sprite("ship_b", { base: "ship_b_base" },
  px(5, 2, "w"), px(4, 3, "g"), px(6, 3, "g"),
  glow("b", { r: 1, strength: 0.2, bands: 1 }))

sprite("ship_c_base", { mx: true, outline: "k" }, `
  ..y
  .cy
  cYy
  cCc
  CCCC
  cPcP
  .cYc
  ..Y.`)
sprite("ship_c", { base: "ship_c_base" },
  px(5, 1, "w"), px(5, 4, "P"),
  glow("Y", { r: 1, strength: 0.25, bands: 1 }))

/* thruster flicker frames (stamp under ship) */
sprite("thrust_0", { w: 5, h: 6 },
  rect(1, 0, 3, 3, "y"), rect(2, 0, 1, 5, "Y"), px(2, 5, "o"))
sprite("thrust_1", { w: 5, h: 6 },
  rect(1, 0, 3, 4, "Y"), rect(2, 0, 1, 6, "o"), px(1, 2, "y"), px(3, 3, "y"))

/* ========== PROJECTILES ========== */
sprite("bullet_p", { w: 5, h: 10, outline: "k" },
  rect(1, 0, 3, 9, "c"),
  rect(2, 0, 1, 8, "w"),
  px(2, 9, "y"),
  glow("c", { r: 1, strength: 0.3, bands: 1 }))

sprite("bullet_e", { w: 7, h: 7, outline: "k" },
  circ(3, 3, 2, "p"),
  circ(3, 3, 1, "P"),
  px(3, 3, "w"),
  glow("p", { r: 1, strength: 0.25, bands: 1 }))

sprite("laser", { w: 10, h: 10, outline: "k" },
  rect(4, 0, 2, 10, "y"),
  rect(3, 1, 4, 8, "Y"),
  rect(2, 3, 6, 4, "o"),
  px(4, 0, "w"), px(5, 0, "w"),
  glow("yY", { r: 2, strength: 0.35, bands: 2 }))

/* ========== BOSS ========== */
sprite("boss_base", { mx: true, outline: "k" }, `
  ...p.
  ..pPp
  .pPRp
  pPRRp
  PRRRp
  pPPPp
  .pppp
  ..pp.`)
sprite("boss", { base: "boss_base" },
  px(6, 3, "w"), px(7, 3, "c"), px(6, 4, "c"), px(5, 5, "P"),
  glow("pP", { r: 2, strength: 0.4, bands: 2 }))

/* ========== FX ========== */
sprite("spark", { w: 5, h: 5 },
  px(2, 2, "w"), px(1, 2, "y"), px(3, 2, "y"), px(2, 1, "c"), px(2, 3, "c"))
sprite("boom_0", { w: 12, h: 12, outline: "k" },
  circ(5, 5, 3, "Y"), circ(5, 5, 1, "w"),
  glow("Y", { r: 2, strength: 0.4, bands: 2 }))
sprite("boom_1", { w: 14, h: 14, outline: "k" },
  circ(6, 6, 5, "o"), circ(6, 6, 3, "Y"), circ(6, 6, 1, "w"),
  glow("oY", { r: 2, strength: 0.35, bands: 2 }))
sprite("boom_2", { w: 16, h: 16 },
  circ(7, 7, 6, "R"), circ(7, 7, 4, "P"), circ(7, 7, 2, "y"),
  px(3, 3, "y"), px(11, 4, "y"), px(5, 11, "o"), px(12, 10, "o"))

/* ========== UI ========== */
sprite("ui_focus", { w: 14, h: 14, outline: "k" },
  circ(6, 6, 5, "N"),
  ring(6, 6, 5, "c"),
  ring(6, 6, 3, "C"),
  circ(6, 6, 1, "w"),
  glow("c", { r: 2, strength: 0.35, bands: 2 }))

sprite("ui_bomb", { w: 14, h: 14, outline: "k" },
  circ(6, 8, 4, "R"),
  circ(6, 8, 3, "P"),
  rect(5, 2, 3, 4, "Y"),
  px(6, 1, "y"),
  px(5, 7, "w"),
  glow("P", { r: 2, strength: 0.35, bands: 2 }))

sprite("ui_card", { w: 20, h: 12, outline: "k" },
  rect(0, 0, 20, 12, "N"),
  rect(1, 1, 18, 10, "m"),
  hline(1, 1, 18, "c"),
  hline(1, 10, 18, "d"))

/* ========== ICON FAMILY（卡面圖示）==========
   全部 10×10，只用 pal() 26 色，語意色按分類。
   ⚠️ 呢批係為咗取代卡面上嘅 emoji（emoji 脫離 palette + 跨平台唔一致
      + 直接造成文字溢出）。改 icon 之前先睇 ART_IMPLEMENTATION_GUIDE.md §7.1。
   每個 icon：剪影可辨 · 單一語意色 + 高光/暗部 · 有 outline。*/

sprite("icon_hp", { w: 10, h: 10, outline: "k" }, `
  ..rr....
  .rwwr...
  .rwwr...
  .rrrr...
  ..rr....
  ..rr....
  ...r....`)

sprite("icon_shield", { w: 10, h: 10, outline: "k" }, `
  ..bbbb...
  .bwwbb...
  .bwwbb...
  .bwwbb...
  .bwwbb...
  ..bbbb...
  ...bb....`)

sprite("icon_speed", { w: 10, h: 10, outline: "k" }, `
  ...g.....
  ..ggg....
  .ggggg...
  ggggggg..
  .ggggg...
  ..ggg....
  ...g.....`)

sprite("icon_rapid", { w: 10, h: 10, outline: "k" }, `
  .y........
  .yy.......
  .yyy......
  .yyyy.....
  .yyy......
  .yy.......
  .y........`)

sprite("icon_multi", { w: 10, h: 10, outline: "k" }, `
  ..y...y...
  ..y...y...
  ..y...y...
  ..y...y...
  ..y...y...
  ..y...y...
  ..y...y...`)

sprite("icon_damage", { w: 10, h: 10, outline: "k" }, `
  ....oo....
  ...oYo....
  ..oYYo....
  .oYYoo....
  .oYYoo....
  ..oYYo....
  ...oYo....`)

sprite("icon_bomb", { w: 10, h: 10, outline: "k" }, `
  ...y......
  ...YY.....
  ..YYYY....
  .PPPPPP...
  .PPPPPP...
  ..PPPP....
  ...PP.....`)

sprite("icon_focus", { w: 10, h: 10, outline: "k" }, `
  ..cccc....
  .cCCCCc...
  .cCwwCc...
  .cCwwCc...
  .cCCCCc...
  ..cccc....
  ...cc.....`)

/* ---- v0.25.0：三架機專屬主動技能 icon（#88）----
   原本「聚焦」全機共用，所以淨係得一個 icon_focus。
   而家左掣變成每架機專屬技能，需要三個一眼分得出嘅 icon。
   語意色：dash = 玩家青 c · bulwark = 防禦藍 b + 玩家青外框 · overheat = 火橙 o + 亮黃 y */
sprite("icon_dash", { w: 10, h: 10, outline: "k" }, `
  ...ccc....
  ..ccwwc...
  .ccwwwc..
  cccwwwccc.
  .ccwwwc..
  ..ccwwc...
  ...ccc....`)

sprite("icon_bulwark", { w: 10, h: 10, outline: "k" }, `
  ...ccc....
  ..cbbb....
  .cbwwbc...
  .cbwwbc...
  .cbwwbc...
  ..cbbb....
  ...ccc....`)

sprite("icon_overheat", { w: 10, h: 10, outline: "k" }, `
  ....r.....
  ...ror....
  ...roy....
  ..rooy....
  ..royo....
  .rooyy....
  .royy.....
  .roy......`)

sprite("icon_pierce", { w: 10, h: 10, outline: "k" }, `
  .y........
  .YY.......
  .YYY......
  .YYY......
  .YYY......
  .YY.......
  .y........`)

sprite("icon_graze", { w: 10, h: 10, outline: "k" }, `
  ..g....g..
  .g......g.
  g........g
  ..........
  g........g
  .g......g.
  ..g....g..`)

sprite("icon_revive", { w: 10, h: 10, outline: "k" }, `
  ...ww.....
  ...ww.....
  ...ww.....
  .wwwwww...
  ...ww.....
  ...ww.....
  ...ww.....`)

sprite("icon_master", { w: 10, h: 10, outline: "k" }, `
  ...y......
  ..yyy.....
  ..yyy.....
  .yyyyy....
  .yyyyy....
  ..yyy.....
  ...y......`)

sprite("icon_laser", { w: 10, h: 10, outline: "k" }, `
  ...YY.....
  ...YY.....
  ...YY.....
  ...YY.....
  ...YY.....
  ...YY.....
  ...YY.....`)

sprite("icon_rail", { w: 10, h: 10, outline: "k" }, `
  ..ooo.....
  ..ooo.....
  ..ooo.....
  ..ooo.....
  ..ooo.....
  ..ooo.....
  ..ooo.....`)

sprite("icon_boomerang", { w: 10, h: 10, outline: "k" }, `
  .p........
  pp........
  p.p.......
  .pp.......
  ..pp......
  ...pp.....
  ....pp....`)

sprite("icon_rocket", { w: 10, h: 10, outline: "k" }, `
  ...w......
  ..www.....
  ..www.....
  ..www.....
  ...w......
  ...w......
  ...o......`)

sprite("icon_wave", { w: 10, h: 10, outline: "k" }, `
  .........
  ..c..c...
  .c..c..c.
  c..c..c..
  .........
  c..c..c..
  .c..c..c.`)

sprite("icon_homing", { w: 10, h: 10, outline: "k" }, `
  ..ccc.....
  .cCCCc....
  .cCwcC....
  .cCCCc....
  ..ccc.....
  ...c......
  ...c......`)

sprite("icon_split", { w: 10, h: 10, outline: "k" }, `
  ..c...c...
  .c.....c..
  c.......c.
  ..c...c...
  .c.....c..
  c.......c.
  .........`)

sprite("icon_slow", { w: 10, h: 10, outline: "k" }, `
  ...c......
  ..c.......
  .c...c....
  .c...c....
  .c...c....
  ..c.......
  ...c......`)

sprite("icon_bounce", { w: 10, h: 10, outline: "k" }, `
  ..g...g...
  .g.....g..
  g.......g.
  .........
  g.......g.
  .g.....g..
  ..g...g...`)

sprite("icon_supply", { w: 10, h: 10, outline: "k" }, `
  .yyyyyy...
  .y....y...
  .yyyyyy...
  .y....y...
  .y....y...
  .yyyyyy...
  ..........`)

sprite("icon_repair", { w: 10, h: 10, outline: "k" }, `
  ..www.....
  ..w.......
  ..w.......
  wwwwwww...
  ..w.......
  ..w.......
  ..www.....`)

sprite("icon_gamble", { w: 10, h: 10, outline: "k" }, `
  ..wwww....
  .w....w...
  .w.y..w...
  .w..y.w...
  .w.y..w...
  .w....w...
  ..wwww....`)

sprite("icon_wind", { w: 10, h: 10, outline: "k" }, `
  ...t......
  ..tt......
  .ttt......
  ..tt......
  ...t......
  ..tt......
  ...t......`)

sprite("icon_iron", { w: 10, h: 10, outline: "k" }, `
  .ssssssss.
  .s......s.
  .s.ssss.s.
  .s.s..s.s.
  .s.ssss.s.
  .s......s.
  .ssssssss.`)

sprite("icon_swarm", { w: 10, h: 10, outline: "k" }, `
  .g..g..g..
  ..g..g..g.
  .g..g..g..
  ..g..g..g.
  .g..g..g..
  ..g..g..g.
  .g..g..g..`)

sprite("icon_blackout", { w: 10, h: 10, outline: "k" }, `
  .NNNNNNNN.
  .N......N.
  .N......N.
  .N......N.
  .N......N.
  .N......N.
  .NNNNNNNN.`)

sprite("icon_glass", { w: 10, h: 10, outline: "k" }, `
  ..cccc....
  .c....c...
  c......c..
  c......c..
  c......c..
  .c....c...
  ..cccc....`)

sprite("icon_static", { w: 10, h: 10, outline: "k" }, `
  .y..y..y..
  ..y..y..y.
  .y..y..y..
  ..y..y..y.
  .y..y..y..
  ..y..y..y.
  .y..y..y..`)

sprite("ui_heart", { mx: "c", outline: "k" }, `
  .rr
  rwr
  rrr
  .rr
  ..r`)

sprite("ui_shield", { w: 9, h: 10, outline: "k" },
  poly([4, 0, 8, 2, 8, 6, 4, 9, 0, 6, 0, 2], "b"),
  poly([4, 2, 6, 3, 6, 5, 4, 7, 2, 5, 2, 3], "c"),
  px(4, 4, "w"))

sprite("star_0", { w: 3, h: 3 }, px(1, 1, "w"))
sprite("star_1", { w: 5, h: 5 },
  px(2, 2, "t"), px(2, 1, "s"), px(2, 3, "s"), px(1, 2, "s"), px(3, 2, "s"))
sprite("star_2", { w: 5, h: 5 },
  px(2, 2, "c"), px(2, 0, "C"), px(2, 4, "C"), px(0, 2, "C"), px(4, 2, "C"))

/* stage props (silhouettes for BG stamp) */
sprite("bldg", { w: 12, h: 20, outline: "k" },
  rect(0, 4, 12, 16, "h"),
  rect(1, 0, 4, 4, "H"),
  rect(6, 2, 5, 2, "S"),
  px(2, 6, "y"), px(4, 8, "y"), px(8, 7, "y"), px(3, 12, "y"), px(9, 14, "y"))

sprite("tower", { w: 8, h: 28, outline: "k" },
  rect(2, 0, 4, 28, "S"),
  rect(1, 6, 6, 4, "h"),
  rect(0, 20, 8, 8, "H"),
  px(3, 2, "c"), px(4, 2, "c"), px(3, 10, "y"), px(4, 16, "y"))

sprite("meteor", { w: 10, h: 10, outline: "k" },
  circ(4, 5, 3, "S"),
  circ(4, 5, 2, "h"),
  px(3, 4, "H"),
  rect(5, 0, 2, 4, "o"),
  px(6, 0, "y"),
  glow("o", { r: 1, strength: 0.3, bands: 1 }))

sprite("debris", { w: 10, h: 8, outline: "k" },
  rect(1, 2, 8, 4, "S"),
  rect(0, 3, 3, 2, "H"),
  px(6, 1, "c"), px(4, 4, "y"))

sprite("gate", { w: 24, h: 16, outline: "k" },
  rect(0, 0, 24, 16, "N"),
  rect(2, 2, 20, 12, "m"),
  ring(11, 7, 5, "c"),
  ring(11, 7, 3, "C"),
  circ(11, 7, 1, "w"),
  glow("c", { r: 2, strength: 0.35, bands: 2 }))

sprite("logo_mark", { w: 16, h: 16, outline: "k" },
  circ(7, 7, 6, "N"),
  ring(7, 7, 6, "c"),
  poly([7, 2, 11, 12, 3, 12], "c"),
  px(7, 6, "w"),
  glow("c", { r: 2, strength: 0.3, bands: 2 }))

/* ========== ENEMIES（機頭朝下，對玩家） ========== */
/* 普通雜魚：粉紅三角機，易認、細 */
sprite("grunt_base", { mx: true, outline: "k" }, `
  .pp
  pPpp
  PpPp
  p.p.
  .Y..`)
sprite("grunt", { base: "grunt_base" },
  px(3, 1, "w"), px(4, 2, "P"),
  glow("p", { r: 1, strength: 0.28, bands: 1 }))

/* 俯衝型：更尖、橙焰尾，讀作「快」 */
sprite("dive_base", { mx: true, outline: "k" }, `
  .p
  pP
  PPP
  pYp
  .Yo
  ..o`)
sprite("dive", { base: "dive_base" },
  px(3, 1, "w"), px(3, 3, "Y"),
  glow("oY", { r: 1, strength: 0.3, bands: 1 }))

/* 精英：大金機 + 裝甲肩 + 光環感 */
sprite("elite_base", { mx: true, outline: "k" }, `
  ..y.
  .yYy
  yYYYy
  YwYYy
  yYPYy
  .yYy.
  ..Y..`)
sprite("elite", { base: "elite_base" },
  px(5, 2, "w"), px(4, 3, "c"), px(6, 3, "c"),
  glow("yY", { r: 2, strength: 0.4, bands: 2 }))

/* 狙擊：細長機 + 青瞄準感 */
sprite("sniper_base", { mx: true, outline: "k" }, `
  .c.
  cNc
  .c.
  .Y.
  .Y.
  .o.`)
sprite("sniper", { base: "sniper_base" },
  px(2, 1, "w"),
  glow("cN", { r: 1, strength: 0.35, bands: 1 }))

/* 護盾機：寬體 + 藍盾面朝下 */
sprite("shield_base", { mx: true, outline: "k" }, `
  .bb.
  bBBb
  BbBBb
  b..b.
  .YY..`)
sprite("shield_e", { base: "shield_base" },
  px(3, 1, "w"), px(4, 2, "c"),
  glow("bB", { r: 2, strength: 0.35, bands: 2 }))

/* 分裂蟲：綠團，死後裂 */
sprite("swarm_base", { mx: true, outline: "k" }, `
  .g.
  gGg
  GgGg
  .gY.
  ..Y.`)
sprite("swarm", { base: "swarm_base" },
  px(2, 1, "w"),
  glow("gG", { r: 1, strength: 0.3, bands: 1 }))

/* ========== v3.11 新敵人 sprite ==========
   之前呢三種只靠程序化重色 + 幾何特徵，剪影同 grunt 一致 → 玩家
   分唔出（VISUAL_QUALITY_RUBRIC.md §5.4 判 V2 剪影 6/10）。
   而家每種一個獨立 base sprite，剪影設計原則：
     grunt    = 三角（尖上寬下）
     splitter = 六角（左右對稱 + 中心裂縫）
     rammer   = 楔形（撞角朝下，寬上窄下）
     lancer   = 長條（槍管，極瘦高）*/

sprite("splitter_base", { mx: true, outline: "k" }, `
  .pppp.
  pPwwPp
  pPwwPp
  .pPPp.
  ..YY..
  ..YY..`)
sprite("splitter", { base: "splitter_base" },
  px(5, 2, "w"), px(3, 3, "P"),
  glow("pP", { r: 1, strength: 0.3, bands: 1 }))

sprite("rammer_base", { mx: true, outline: "k" }, `
  .pppp.
  pPPPPp
  .pPPp.
  ..PP..
  ..PP..
  ..YY..`)
sprite("rammer", { base: "rammer_base" },
  px(4, 1, "w"), px(5, 2, "P"),
  glow("p", { r: 1, strength: 0.32, bands: 1 }))

sprite("lancer_base", { mx: true, outline: "k" }, `
  ..c..
  .cCc.
  .cNc.
  .cNc.
  .cCc.
  ..c..
  ..YY.`)
sprite("lancer", { base: "lancer_base" },
  px(4, 2, "w"), px(4, 3, "c"),
  glow("cN", { r: 1, strength: 0.35, bands: 1 }))

/* ========== 動畫幀（anim）==========
   v3.13：之前圖集只有 5 格動畫（thrust / boom），全部機體靜態
   → VISUAL_QUALITY_RUBRIC.md §5.9 判 V6 動畫 3/10。
   ⚠️ 全部用同一個 anim 定義一次過出曬所有幀，唔逐個 sprite 各自畫，
      避免逐幀風格漂移（sprite-pipeline skill 核心原則）。
   動畫幀喺 sheet() 會展開成 name_0 / name_1 / ... */

anim("anim_ship_a", { fps: 8, frames: 2, base: "ship_a" },
  frame({ ms: 90 }),
  frame({ ms: 90 }, rect(2, 8, 3, 1, "d")))

anim("anim_grunt", { fps: 8, frames: 2, base: "grunt" },
  frame({ ms: 120 }),
  frame({ ms: 120 }, rect(2, 4, 2, 1, "P")))

anim("anim_elite", { fps: 6, frames: 2, base: "elite" },
  frame({ ms: 160 }),
  frame({ ms: 160 }, px(5, 1, "y")))

anim("anim_boss", { fps: 6, frames: 4, base: "boss" },
  frame({ ms: 140 }),
  frame({ ms: 140 }, px(6, 4, "w")),
  frame({ ms: 140 }, px(5, 4, "c"), px(7, 4, "c")),
  frame({ ms: 140 }, px(6, 4, "w")))

anim("anim_bullet_p", { fps: 12, frames: 2, base: "bullet_p" },
  frame({ ms: 70 }),
  frame({ ms: 70 }, rect(1, 0, 3, 1, "w")))

anim("anim_bullet_e", { fps: 12, frames: 2, base: "bullet_e" },
  frame({ ms: 70 }),
  frame({ ms: 70 }, px(3, 3, "P")))

/* ========== ATLAS ========== */
sheet("dsf_main", [
  "ship_a", "ship_b", "ship_c",
  "thrust_0", "thrust_1",
  "bullet_p", "bullet_e", "laser",
  "boss",
  "grunt", "dive", "elite",
  "sniper", "shield_e", "swarm",
  "splitter", "rammer", "lancer",
  "spark", "boom_0", "boom_1", "boom_2",
  "ui_focus", "ui_bomb", "ui_card", "ui_heart", "ui_shield",
  "icon_hp", "icon_shield", "icon_speed", "icon_rapid",
  "icon_multi", "icon_damage", "icon_bomb", "icon_focus",
  "icon_pierce", "icon_graze", "icon_revive", "icon_master",
  "icon_laser", "icon_rail", "icon_boomerang", "icon_rocket",
  "icon_wave", "icon_homing", "icon_split", "icon_slow",
  "icon_bounce", "icon_supply", "icon_repair", "icon_gamble",
  "icon_wind", "icon_iron", "icon_swarm", "icon_blackout",
  "icon_glass", "icon_static",
  "icon_dash", "icon_bulwark", "icon_overheat",
  "star_0", "star_1", "star_2",
  "bldg", "tower", "meteor", "debris", "gate",
  "logo_mark",
  "anim_ship_a", "anim_grunt", "anim_elite", "anim_boss",
  "anim_bullet_p", "anim_bullet_e",
], { pad: 1, cols: 7 })
