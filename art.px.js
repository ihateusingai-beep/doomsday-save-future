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

/* ========== ATLAS ========== */
sheet("dsf_main", [
  "ship_a", "ship_b", "ship_c",
  "thrust_0", "thrust_1",
  "bullet_p", "bullet_e", "laser",
  "boss",
  "grunt", "dive", "elite",
  "sniper", "shield_e", "swarm",
  "spark", "boom_0", "boom_1", "boom_2",
  "ui_focus", "ui_bomb", "ui_card", "ui_heart", "ui_shield",
  "star_0", "star_1", "star_2",
  "bldg", "tower", "meteor", "debris", "gate",
  "logo_mark",
], { pad: 1, cols: 7 })
