/**
 * Style models in the browser — the same ONNX files the app downloads (lensmith-models repo),
 * run with ONNX Runtime Web. Loaded only when a script calls lens.stylize().
 */
const ORT_VERSION = "1.20.1";
const ORT_DIST = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
export const MODELS_URL = "https://lensmith-app.github.io/lensmith-models/";

let ortModule = null;
const sessions = new Map();

async function ort() {
  ortModule ??= import(ORT_DIST + "ort.wasm.min.mjs").then((m) => {
    m.env.wasm.wasmPaths = ORT_DIST;
    return m;
  });
  return ortModule;
}

/**
 * Styles [canvas] with model [style] ("face-paint", "paprika", "celeba"). Resolves to a new
 * canvas of the same size. [onStatus] gets progress messages.
 */
export async function stylize(style, canvas, onStatus = () => {}) {
  if (!/^[a-z0-9-]+$/.test(style)) throw new Error(`Unknown style "${style}"`);
  const o = await ort();
  if (!sessions.has(style)) {
    onStatus("Downloading style…");
    const created = o.InferenceSession.create(MODELS_URL + style + ".onnx");
    created.catch(() => sessions.delete(style));
    sessions.set(style, created);
  }
  const session = await sessions.get(style);
  onStatus("Cartoonizing…");

  const w = canvas.width, h = canvas.height, plane = w * h;
  const px = canvas.getContext("2d").getImageData(0, 0, w, h).data;
  const input = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    input[i] = px[i * 4] / 127.5 - 1;
    input[plane + i] = px[i * 4 + 1] / 127.5 - 1;
    input[2 * plane + i] = px[i * 4 + 2] / 127.5 - 1;
  }
  const out = await session.run({ [session.inputNames[0]]: new o.Tensor("float32", input, [1, 3, h, w]) });
  const y = out[session.outputNames[0]].data;

  const result = document.createElement("canvas");
  result.width = w;
  result.height = h;
  const ctx = result.getContext("2d");
  const img = ctx.createImageData(w, h);
  const c = (v) => Math.max(0, Math.min(255, (v + 1) * 127.5));
  for (let i = 0; i < plane; i++) {
    img.data[i * 4] = c(y[i]);
    img.data[i * 4 + 1] = c(y[plane + i]);
    img.data[i * 4 + 2] = c(y[2 * plane + i]);
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return result;
}
