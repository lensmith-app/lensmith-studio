/**
 * Style models in the browser — the same ONNX files the app downloads (lensmith-models repo),
 * run with ONNX Runtime Web. Loaded only when a script calls lens.stylize().
 *
 * Two kinds (see lensmith-models/README.md): "style" models restyle the whole picture; "portrait"
 * models (DCT-Net) restyle the picture with a background model and each face with a head model.
 */
const ORT_VERSION = "1.20.1";
const ORT_DIST = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
export const MODELS_URL = "https://lensmith-app.github.io/lensmith-models/";

// Eyes, nose tip and mouth centre in DCT-Net's square 112-px reference face.
const REFERENCE = [[39.29459953, 52.69630051], [74.53179932, 52.50139999], [57.02519989, 72.73660278], [57.13960075, 93.28480148]];

let ortModule = null;
let catalog = null;
const sessions = new Map();
const masks = new Map();

async function ort() {
  ortModule ??= import(ORT_DIST + "ort.wasm.min.mjs").then((m) => {
    m.env.wasm.wasmPaths = ORT_DIST;
    return m;
  });
  return ortModule;
}

async function entries() {
  catalog ??= fetch(MODELS_URL + "models.json").then((r) => r.json()).then((j) => new Map(j.models.map((m) => [m.id, m])));
  return catalog;
}

async function session(file, onStatus) {
  if (!sessions.has(file)) {
    onStatus("Downloading style…");
    const o = await ort();
    const created = o.InferenceSession.create(MODELS_URL + file);
    created.catch(() => sessions.delete(file));
    sessions.set(file, created);
  }
  return sessions.get(file);
}

/**
 * Styles [canvas] with model [style]. [faces] are [[eyeL, eyeR, nose, mouth] as [x, y]] in canvas
 * pixels (used by portrait models). Resolves to a new canvas of the same size.
 */
export async function stylize(style, canvas, faces = [], onStatus = () => {}) {
  const entry = (await entries()).get(style);
  if (!entry) throw new Error(`Unknown style "${style}"`);
  if (entry.type === "portrait") return portrait(entry, canvas, faces, onStatus);

  const o = await ort();
  const s = await session(entry.file, onStatus);
  onStatus("Cartoonizing…");
  const w = canvas.width, h = canvas.height, plane = w * h;
  const px = canvas.getContext("2d").getImageData(0, 0, w, h).data;
  const input = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    input[i] = px[i * 4] / 127.5 - 1;
    input[plane + i] = px[i * 4 + 1] / 127.5 - 1;
    input[2 * plane + i] = px[i * 4 + 2] / 127.5 - 1;
  }
  const out = await s.run({ [s.inputNames[0]]: new o.Tensor("float32", input, [1, 3, h, w]) });
  const y = out[s.outputNames[0]].data;
  const c = (v) => Math.max(0, Math.min(255, (v + 1) * 127.5));
  return toCanvas(w, h, (i) => [c(y[i]), c(y[plane + i]), c(y[2 * plane + i]), 255]);
}

// ------------------------------------------------------------------ portrait (DCT-Net)

async function portrait(entry, canvas, faces, onStatus) {
  const o = await ort();
  const [head, bg, mask] = await Promise.all([session(entry.head.file, onStatus), session(entry.bg.file, onStatus), loadMask(entry)]);
  onStatus("Cartoonizing…");
  const w = canvas.width, h = canvas.height;
  const pw = Math.ceil(w / 16) * 16, ph = Math.ceil(h / 16) * 16;
  const padded = makeCanvas(pw, ph, "#fff");
  padded.getContext("2d").drawImage(canvas, 0, 0);
  const styledBg = await runBgr(o, bg, padded);
  const result = makeCanvas(w, h);
  const ctx = result.getContext("2d");
  ctx.drawImage(styledBg, 0, 0);

  const box = entry.box ?? 288, ratio = entry.ratio ?? 0.75;
  const ref = REFERENCE.map(([x, y]) => [((x - 56) * ratio + 56) * box / 112, ((y - 56) * ratio + 56) * box / 112]);
  for (const pts of faces) {
    const [a, b, tx, ty] = similarity(pts, ref);
    const crop = makeCanvas(box, box, "#fff");
    const cc = crop.getContext("2d");
    cc.setTransform(a, b, -b, a, tx, ty);
    cc.drawImage(canvas, 0, 0);
    const styledHead = await runBgr(o, head, crop);
    // The mask becomes the head's alpha, so drawing it back blends it with the background.
    const hc = styledHead.getContext("2d");
    const img = hc.getImageData(0, 0, box, box);
    for (let i = 0; i < box * box; i++) img.data[i * 4 + 3] = mask[i];
    hc.putImageData(img, 0, 0);
    // Inverse of [a -b tx; b a ty].
    const det = a * a + b * b;
    const ia = a / det, ib = -b / det;
    ctx.save();
    ctx.setTransform(ia, ib, -ib, ia, -(ia * tx - ib * ty), -(ib * tx + ia * ty));
    ctx.drawImage(styledHead, 0, 0);
    ctx.restore();
  }
  return result;
}

/** DCT-Net graphs: float32 HWC BGR 0..255 in, uint8 HWC BGR out. */
async function runBgr(o, s, canvas) {
  const w = canvas.width, h = canvas.height, n = w * h;
  const px = canvas.getContext("2d").getImageData(0, 0, w, h).data;
  const input = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    input[i * 3] = px[i * 4 + 2];
    input[i * 3 + 1] = px[i * 4 + 1];
    input[i * 3 + 2] = px[i * 4];
  }
  const out = await s.run({ [s.inputNames[0]]: new o.Tensor("float32", input, [h, w, 3]) });
  const y = out[s.outputNames[0]].data;
  return toCanvas(w, h, (i) => [y[i * 3 + 2], y[i * 3 + 1], y[i * 3], 255]);
}

async function loadMask(entry) {
  const file = entry.mask.file, box = entry.box ?? 288;
  if (!masks.has(file)) {
    masks.set(file, (async () => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = MODELS_URL + file;
      await img.decode();
      const c = makeCanvas(box, box);
      c.getContext("2d").drawImage(img, 0, 0, box, box);
      const d = c.getContext("2d").getImageData(0, 0, box, box).data;
      return Uint8ClampedArray.from({ length: box * box }, (_, i) => d[i * 4]);
    })());
  }
  return masks.get(file);
}

/** Least-squares similarity transform mapping src onto dst: returns [a, b, tx, ty] for [a -b tx; b a ty]. */
function similarity(src, dst) {
  const n = src.length;
  const mean = (p) => [p.reduce((s, q) => s + q[0], 0) / n, p.reduce((s, q) => s + q[1], 0) / n];
  const [sx, sy] = mean(src), [dx, dy] = mean(dst);
  let n1 = 0, n2 = 0, den = 0;
  for (let i = 0; i < n; i++) {
    const ax = src[i][0] - sx, ay = src[i][1] - sy, bx = dst[i][0] - dx, by = dst[i][1] - dy;
    n1 += ax * bx + ay * by;
    n2 += ax * by - ay * bx;
    den += ax * ax + ay * ay;
  }
  const a = n1 / den, b = n2 / den;
  return [a, b, dx - (a * sx - b * sy), dy - (b * sx + a * sy)];
}

function makeCanvas(w, h, fill) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  if (fill) {
    const g = c.getContext("2d");
    g.fillStyle = fill;
    g.fillRect(0, 0, w, h);
  }
  return c;
}

function toCanvas(w, h, pixel) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) img.data.set(pixel(i), i * 4);
  ctx.putImageData(img, 0, 0);
  return c;
}
