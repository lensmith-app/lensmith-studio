// Turns sticker art ({emoji} / {drawing} / {image}) into drawable canvases.
// The drawings are line-for-line ports of the app's StickerBitmaps.kt.

const cache = new Map();

/** @param assets Map of "assets/x.png" -> HTMLImageElement */
export function artCanvas(art, assets) {
  const key = art.emoji ? "e:" + art.emoji : art.drawing ? "d:" + art.drawing : "i:" + art.image;
  if (art.image) {
    const img = assets.get(art.image);
    if (!img || !img.complete || !img.naturalWidth) return null;
    return { canvas: img, aspect: img.naturalHeight / img.naturalWidth };
  }
  let entry = cache.get(key);
  if (!entry) {
    const canvas = art.emoji ? emoji(art.emoji) : drawing(art.drawing);
    entry = { canvas, aspect: canvas.height / canvas.width };
    cache.set(key, entry);
  }
  return entry;
}

function emoji(text) {
  const size = 220;
  const measure = document.createElement("canvas").getContext("2d");
  measure.font = `${size}px "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
  const m = measure.measureText(text);
  const w = Math.ceil(m.actualBoundingBoxLeft + m.actualBoundingBoxRight) || size;
  const h = Math.ceil(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) || size;
  const pad = 8;
  const c = makeCanvas(w + pad * 2, h + pad * 2);
  const ctx = c.getContext("2d");
  ctx.font = measure.font;
  ctx.fillText(text, pad + m.actualBoundingBoxLeft, pad + m.actualBoundingBoxAscent);
  return c;
}

/** Bold white text with a shadow, for scores and popups. */
export function textCanvas(text) {
  const key = "t:" + text;
  let entry = cache.get(key);
  if (entry) return entry;
  const font = `bold 120px system-ui, "Segoe UI", sans-serif`;
  const measure = document.createElement("canvas").getContext("2d");
  measure.font = font;
  const pad = 24;
  const c = makeCanvas(Math.ceil(measure.measureText(text).width) + pad * 2, 150 + pad * 2);
  const ctx = c.getContext("2d");
  ctx.font = font;
  ctx.fillStyle = "#fff";
  ctx.shadowColor = "rgba(0,0,0,0.67)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  ctx.textBaseline = "top";
  ctx.fillText(text, pad, pad);
  entry = { canvas: c, aspect: c.height / c.width };
  if (cache.size > 200) cache.clear();
  cache.set(key, entry);
  return entry;
}

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function drawing(name) {
  switch (name) {
    case "DogEarLeft": return dogEar(false);
    case "DogEarRight": return dogEar(true);
    case "DogNose": return dogNose();
    case "Tongue": return tongue();
    case "ClownNose": return clownNose();
    case "Blush": return blush();
    case "Crown": return crown();
    case "WoodPlank": return woodPlank();
    case "Nail": return nail();
    case "Bullet": return bullet();
    case "Pistol": return pistol();
    default: return emoji("❓");
  }
}

function dogEar(mirror) {
  const c = makeCanvas(240, 360);
  const g = c.getContext("2d");
  if (mirror) { g.translate(240, 0); g.scale(-1, 1); }
  g.fillStyle = "rgb(122,78,48)";
  g.beginPath();
  g.moveTo(70, 10);
  g.bezierCurveTo(190, -10, 250, 120, 210, 260);
  g.bezierCurveTo(185, 345, 90, 365, 45, 300);
  g.bezierCurveTo(0, 230, 0, 60, 70, 10);
  g.fill();
  g.fillStyle = "rgb(176,120,92)";
  g.beginPath();
  g.moveTo(85, 55);
  g.bezierCurveTo(160, 50, 195, 150, 170, 245);
  g.bezierCurveTo(155, 300, 100, 310, 75, 270);
  g.bezierCurveTo(45, 220, 45, 90, 85, 55);
  g.fill();
  return c;
}

function dogNose() {
  const c = makeCanvas(260, 190);
  const g = c.getContext("2d");
  g.fillStyle = "rgb(30,26,26)";
  g.beginPath();
  g.moveTo(130, 180);
  g.bezierCurveTo(60, 170, 5, 110, 15, 55);
  g.bezierCurveTo(25, 5, 235, 5, 245, 55);
  g.bezierCurveTo(255, 110, 200, 170, 130, 180);
  g.fill();
  g.fillStyle = "rgba(255,255,255,0.43)";
  g.beginPath();
  g.ellipse(95, 47.5, 35, 17.5, 0, 0, Math.PI * 2);
  g.fill();
  return c;
}

function tongue() {
  const c = makeCanvas(200, 260);
  const g = c.getContext("2d");
  g.fillStyle = "rgb(255,105,140)";
  g.beginPath();
  g.roundRect(20, -100, 160, 350, 80);
  g.fill();
  g.strokeStyle = "rgb(214,70,105)";
  g.lineWidth = 10;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(100, 20);
  g.lineTo(100, 170);
  g.stroke();
  return c;
}

function clownNose() {
  const c = makeCanvas(220, 220);
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(85, 80, 0, 85, 80, 130);
  grad.addColorStop(0, "rgb(255,120,110)");
  grad.addColorStop(1, "rgb(200,0,10)");
  g.fillStyle = grad;
  g.beginPath();
  g.arc(110, 110, 105, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "rgba(255,255,255,0.59)";
  g.beginPath();
  g.ellipse(80, 62.5, 25, 17.5, 0, 0, Math.PI * 2);
  g.fill();
  return c;
}

function blush() {
  const c = makeCanvas(220, 160);
  const g = c.getContext("2d");
  g.save();
  g.translate(110, 80);
  g.scale(1, 160 / 220);
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, 110);
  grad.addColorStop(0, "rgba(255,90,120,0.59)");
  grad.addColorStop(1, "rgba(255,90,120,0)");
  g.fillStyle = grad;
  g.beginPath();
  g.arc(0, 0, 110, 0, Math.PI * 2);
  g.fill();
  g.restore();
  return c;
}

function crown() {
  const c = makeCanvas(400, 260);
  const g = c.getContext("2d");
  const gold = g.createLinearGradient(0, 0, 0, 260);
  gold.addColorStop(0, "rgb(255,228,110)");
  gold.addColorStop(1, "rgb(214,150,20)");
  g.lineWidth = 8;
  g.lineJoin = "round";
  g.strokeStyle = "rgb(160,100,10)";
  g.fillStyle = gold;
  g.beginPath();
  [[30, 230], [14, 70], [105, 150], [150, 40], [200, 130], [250, 40], [295, 150], [386, 70], [370, 230]]
    .forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.fill();
  g.stroke();
  g.beginPath();
  g.roundRect(26, 196, 348, 52, 14);
  g.fill();
  g.stroke();
  const dot = (x, y, r, color) => { g.fillStyle = color; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
  for (const x of [14, 150, 250, 386]) dot(x, x === 14 || x === 386 ? 66 : 36, 16, "rgb(255,236,150)");
  dot(200, 222, 16, "rgb(220,20,60)");
  dot(120, 222, 12, "rgb(30,144,255)");
  dot(280, 222, 12, "rgb(30,144,255)");
  dot(200, 160, 14, "rgb(0,168,107)");
  return c;
}

// ---- Nail It game pieces (ports of the app's StickerBitmaps.kt) ----

function woodPlank() {
  const c = makeCanvas(160, 210);
  const g = c.getContext("2d");
  const base = g.createLinearGradient(0, 0, 160, 0);
  base.addColorStop(0, "rgb(222,160,82)");
  base.addColorStop(0.5, "rgb(240,186,104)");
  base.addColorStop(1, "rgb(222,160,82)");
  g.fillStyle = base;
  g.fillRect(0, 0, 160, 210);
  g.strokeStyle = "rgba(120,70,20,0.27)";
  g.lineWidth = 3;
  for (const x of [28, 61, 97, 131]) {
    g.beginPath();
    g.moveTo(x, 0);
    g.bezierCurveTo(x + 8, 70, x - 8, 140, x + 4, 210);
    g.stroke();
  }
  g.beginPath();
  g.ellipse(102, 87, 10, 17, 0, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = "rgb(150,92,38)";
  g.fillRect(0, 200, 160, 10);
  g.fillStyle = "rgba(255,230,180,0.35)";
  g.fillRect(0, 0, 160, 3);
  return c;
}

function nail() {
  const c = makeCanvas(300, 44);
  const g = c.getContext("2d");
  const steel = g.createLinearGradient(0, 12, 0, 32);
  steel.addColorStop(0, "rgb(235,238,242)");
  steel.addColorStop(1, "rgb(120,126,134)");
  g.fillStyle = steel;
  g.beginPath();
  [[0, 22], [22, 14], [280, 14], [280, 30], [22, 30]].forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.fill();
  const head = g.createLinearGradient(272, 0, 296, 0);
  head.addColorStop(0, "rgb(170,175,182)");
  head.addColorStop(1, "rgb(90,95,102)");
  g.fillStyle = head;
  g.beginPath();
  g.roundRect(272, 2, 24, 40, 6);
  g.fill();
  return c;
}

function bullet() {
  const c = makeCanvas(40, 100);
  const g = c.getContext("2d");
  const brass = g.createLinearGradient(4, 0, 36, 0);
  brass.addColorStop(0, "rgb(255,214,102)");
  brass.addColorStop(1, "rgb(196,140,30)");
  g.fillStyle = brass;
  g.fillRect(4, 42, 32, 56);
  g.fillStyle = "rgb(205,120,70)";
  g.beginPath();
  g.moveTo(4, 44);
  g.bezierCurveTo(4, 10, 20, 0, 20, 0);
  g.bezierCurveTo(20, 0, 36, 10, 36, 44);
  g.fill();
  g.fillStyle = "rgb(170,120,25)";
  g.fillRect(4, 90, 32, 8);
  return c;
}

function pistol() {
  const c = makeCanvas(200, 280);
  const g = c.getContext("2d");
  const rr = (x, y, w, h, r, color) => { g.fillStyle = color; g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); };
  rr(70, 0, 60, 170, 10, "rgb(60,64,72)");
  g.fillStyle = "rgb(35,37,43)";
  g.fillRect(88, 0, 24, 10);
  rr(60, 150, 80, 40, 12, "rgb(60,64,72)");
  g.fillStyle = "rgb(110,70,40)";
  g.beginPath();
  [[70, 180], [140, 180], [150, 275], [80, 275]].forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.fill();
  g.strokeStyle = "rgb(60,64,72)";
  g.lineWidth = 8;
  g.beginPath();
  g.arc(54, 200, 22, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = "rgba(255,255,255,0.31)";
  g.fillRect(78, 20, 6, 120);
  return c;
}
