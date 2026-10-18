// 末日救未來 — STG pixel pack (PLAN: cyan/pink/white on black)
// Build: node $HOME/.hermes/skills/creative/pxl-pixel-art/bin/pxl.js build art.px.js --out out

pal({
  k: "#000000",
  n: "#0a1020",
  N: "#142038",
  c: "#00f0ff",
  C: "#0090b8",
  w: "#f5ffff",
  y: "#ffe566",
  Y: "#ff9a1a",
  p: "#ff6ad5",
  P: "#ff1a6a",
  g: "#3dff8a",
  G: "#12a855",
  r: "#ff4d5e",
  R: "#a01028",
  b: "#4d8cff",
  B: "#1a4aaa",
})
ramps("knNCcw", "knRPPpy", "knRGGgw", "knBBbw")

/* ---- player ships (nose-up STG) ---- */
/* A 速 — slim interceptor */
sprite("ship_a_base", { mx: true, outline: "k" }, `
  .c
  cc
  Cc
  cC
  cy
  .Y`)
sprite("ship_a", { base: "ship_a_base" },
  px(3, 2, "w"), px(4, 4, "y"))

/* B 盾 — wider armored */
sprite("ship_b_base", { mx: true, outline: "k" }, `
  .c.
  cCc
  CCC
  cCc
  bYb
  .Y.`)
sprite("ship_b", { base: "ship_b_base" },
  px(4, 2, "w"), px(3, 3, "g"), px(5, 3, "g"))

/* C 火 — heavy cannon nose */
sprite("ship_c_base", { mx: true, outline: "k" }, `
  .y
  cy
  Cc
  CCC
  cPc
  .Y.`)
sprite("ship_c", { base: "ship_c_base" },
  px(4, 1, "w"), px(4, 3, "P"))

/* ---- projectiles ---- */
sprite("bullet_p", { w: 5, h: 8, outline: "k" },
  rect(1, 0, 3, 7, "c"),
  rect(2, 0, 1, 6, "w"),
  px(2, 7, "y"))

sprite("bullet_e", { w: 6, h: 6, outline: "k" },
  circ(2, 2, 2, "p"),
  px(2, 2, "w"),
  px(1, 1, "P"))

sprite("laser", { w: 8, h: 8, outline: "k" },
  rect(3, 0, 2, 8, "y"),
  rect(2, 1, 4, 6, "Y"),
  px(3, 0, "w"), px(4, 0, "w"))

/* ---- boss (spiral core) ---- */
sprite("boss_base", { mx: true, outline: "k" }, `
  ..p.
  .pPp
  pPRp
  PRRP
  pPPp
  .pp.`)
sprite("boss", { base: "boss_base" },
  px(5, 3, "w"), px(6, 3, "c"), px(5, 4, "c"),
  glow("pP", { r: 2, strength: 0.35, bands: 2 }))

/* ---- UI ability icons ---- */
sprite("ui_focus", { w: 14, h: 14, outline: "k" },
  circ(6, 6, 5, "N"),
  ring(6, 6, 5, "c"),
  ring(6, 6, 3, "C"),
  circ(6, 6, 1, "w"),
  glow("c", { r: 2, strength: 0.3, bands: 2 }))

sprite("ui_bomb", { w: 14, h: 14, outline: "k" },
  circ(6, 8, 4, "R"),
  circ(6, 8, 3, "P"),
  rect(5, 2, 3, 4, "Y"),
  px(6, 1, "y"),
  px(5, 7, "w"),
  glow("P", { r: 2, strength: 0.3, bands: 2 }))

/* ---- atlas ---- */
sheet("dsf_main", [
  "ship_a", "ship_b", "ship_c",
  "bullet_p", "bullet_e", "laser",
  "boss",
  "ui_focus", "ui_bomb",
], { pad: 1, cols: 5 })
