// Lensmith Studio — build filters in the browser with a live preview.

import * as M from "./model.js";
import { Renderer, affine } from "./render.js";
import { FaceTracker, measureFace } from "./face.js";
import { InteractionEngine, toUnits } from "./engine.js";
import { artCanvas } from "./art.js";
import { renderPanel } from "./panels.js";
import { openFile, saveLensmith, buildSubmission, download } from "./pkg.js";

const VIEW_ASPECT = 3 / 4; // width / height, like the phone's camera view
const MAX_VIEW_HEIGHT = 960;
const DRAFT_KEY = "lensmith-studio-draft";
const SCRIPT_KEY = "lensmith-studio-script";

const $ = (id) => document.getElementById(id);
const glCanvas = $("gl");
const overlay = $("overlay");
const ctx = overlay.getContext("2d");
const video = $("video");

const state = {
  filter: loadDraft() ?? M.defaultFilter(),
  assets: new Map(),       // "assets/x.png" -> Blob
  assetImages: new Map(),  // "assets/x.png" -> HTMLImageElement
  tab: "Style",
  tool: 0,
  selectedSticker: -1,
  selectedRule: -1,
  bgPhoto: null,
  codeArea: null,
  publish: { github: "", slug: "", description: "", tags: "", version: 1, thumbnailUrl: "", thumbnail: null },
  script: loadScript(),
};

let renderer = null;
const tracker = new FaceTracker();
let trackerReady = null;
const engine = new InteractionEngine();
let source = null; // video or a canvas holding a photo
let drawn = [];    // stickers drawn last frame, for dragging: {index, x, y, r, frame}
let showPoints = false;
const start = performance.now();

// ------------------------------------------------------------------ app callbacks (used by panels)

const app = {
  state,
  /** Something changed. Structural changes re-render the panel; slider moves don't. */
  changed(structural = false, { fromCode = false } = {}) {
    engine.filter = null; // restart interactions with the new rules
    $("name").value = state.filter.name;
    saveDraft();
    if (structural && !fromCode) renderPanel(app);
    else if (!fromCode && state.codeArea && state.tab === "Code") state.codeArea.value = JSON.stringify(state.filter, null, 2);
  },
  async pickImage() {
    const file = await chooseFile("image/png,image/webp,image/jpeg");
    if (!file) return null;
    if (file.size > 2 * 1024 * 1024) { toast("Pictures must be under 2 MB"); return null; }
    const img = await loadImage(URL.createObjectURL(file));
    if (Math.max(img.naturalWidth, img.naturalHeight) > 2048) { toast("Pictures must be at most 2048px"); return null; }
    const ext = file.name.split(".").pop().toLowerCase().replace("jpeg", "jpg");
    const path = `assets/${M.slugify(file.name.replace(/\.[^.]+$/, ""))}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
    state.assets.set(path, file);
    state.assetImages.set(path, img);
    return path;
  },
  async choosePhoto() {
    const file = await chooseFile("image/*");
    if (file) state.bgPhoto = await loadImage(URL.createObjectURL(file));
  },
  /** Uses a picture from the computer as the thumbnail (centre-cropped square, 512px). */
  async uploadThumbnail() {
    const file = await chooseFile("image/*");
    if (!file) return null;
    const img = await loadImage(URL.createObjectURL(file));
    const size = 512, side = Math.min(img.naturalWidth, img.naturalHeight);
    const c = document.createElement("canvas");
    c.width = c.height = size;
    c.getContext("2d").drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    return setThumbnail(await new Promise((r) => c.toBlob(r, "image/png")));
  },
  async takeThumbnail() {
    const size = 512;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d");
    const w = glCanvas.width, h = glCanvas.height, side = Math.min(w, h);
    // Mirrored, like the preview.
    g.translate(size, 0);
    g.scale(-1, 1);
    g.drawImage(glCanvas, (w - side) / 2, (h - side) / 2, side, side, 0, 0, size, size);
    g.drawImage(overlay, (w - side) / 2, (h - side) / 2, side, side, 0, 0, size, size);
    return setThumbnail(await new Promise((r) => c.toBlob(r, "image/png")));
  },
  async save() {
    download(await saveLensmith(state.filter, state.assets, state.script, state.publish.thumbnail), `${M.slugify(state.filter.name)}.lensmith`);
    toast("Saved — open it on your phone to add it to Lensmith");
  },
  async submit() {
    const p = state.publish;
    if (!/^[a-z0-9][a-z0-9-]{0,38}$/.test(p.github)) return toast("Enter your GitHub username first");
    const slug = p.slug || M.slugify(state.filter.name);
    if (!p.thumbnail && source) await app.takeThumbnail();
    const listing = {
      version: p.version,
      description: p.description.trim().slice(0, 200),
      tags: p.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 8),
    };
    const blob = await buildSubmission({ filter: state.filter, assets: state.assets, github: p.github, slug, listing, thumbnail: p.thumbnail, script: state.script });
    download(blob, `${p.github}-${slug}-submission.zip`);
    toast("Submission ready — follow the steps below");
  },
  toast,
};

/** The filter's picture (store and the phone's filter carousel); null clears it. */
function setThumbnail(blob) {
  state.publish.thumbnail = blob;
  state.publish.thumbnailUrl = blob ? URL.createObjectURL(blob) : "";
  return state.publish.thumbnailUrl;
}

// ------------------------------------------------------------------ header

$("name").value = state.filter.name;
$("name").addEventListener("input", (e) => { state.filter.name = e.target.value.slice(0, 24) || "My filter"; app.changed(); });
$("new").addEventListener("click", () => {
  if (!confirm("Start a new filter? Unsaved changes to this one will be lost.")) return;
  state.filter = M.defaultFilter();
  state.script = "";
  state.assets.clear();
  state.assetImages.clear();
  setThumbnail(null);
  state.selectedSticker = state.selectedRule = -1;
  app.changed(true);
});
$("open").addEventListener("click", () => $("openFile").click());
$("openFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const { filter, assets, script, thumbnail } = await openFile(file);
    setThumbnail(thumbnail);
    state.filter = filter;
    state.script = script;
    state.assets = assets;
    state.assetImages = new Map(await Promise.all([...assets].map(async ([p, b]) => [p, await loadImage(URL.createObjectURL(b))])));
    state.selectedSticker = state.selectedRule = -1;
    app.changed(true);
    toast(`Opened ${filter.name}`);
  } catch (err) {
    toast(err.message || "Couldn't open that file");
  }
});
$("save").addEventListener("click", () => app.save());

// ------------------------------------------------------------------ preview source

$("startCam").addEventListener("click", async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }, audio: false });
    video.srcObject = stream;
    await video.play();
    useSource(video, "Webcam");
  } catch {
    toast("Couldn't open the webcam — try “Use a photo instead”");
  }
});
$("usePhoto").addEventListener("click", () => $("photoFile").click());
$("switchSource").addEventListener("click", () => { $("startCard").hidden = false; });
$("photoFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  const img = await loadImage(URL.createObjectURL(file));
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  c.getContext("2d").drawImage(img, 0, 0);
  video.srcObject?.getTracks().forEach((t) => t.stop());
  useSource(c, "Photo");
});
$("showPoints").addEventListener("change", (e) => { showPoints = e.target.checked; });

function useSource(el, label) {
  source = el;
  $("startCard").hidden = true;
  $("switchSource").hidden = false;
  $("status").textContent = `${label} · loading face tracking…`;
  if (!renderer) {
    try {
      renderer = new Renderer(glCanvas);
    } catch (err) {
      $("status").textContent = err.message;
      return;
    }
  }
  trackerReady ??= tracker.init().then(
    () => { $("status").textContent = `${label} · face tracking on`; },
    () => { $("status").textContent = `${label} · face tracking unavailable`; },
  );
  trackerReady.then(() => { $("status").textContent = `${label} · face tracking on`; });
}

// ------------------------------------------------------------------ render loop

function frame() {
  requestAnimationFrame(frame);
  if (!source || !renderer) return;
  const sw = source.videoWidth || source.width, sh = source.videoHeight || source.height;
  if (!sw || !sh) return;

  // Crop the source to the phone's 3:4 portrait view.
  const srcAspect = sw / sh;
  const sx = srcAspect > VIEW_ASPECT ? VIEW_ASPECT / srcAspect : 1; // fraction of source width used
  const sy = srcAspect > VIEW_ASPECT ? 1 : srcAspect / VIEW_ASPECT;
  const H = Math.round(Math.min(sh * sy, MAX_VIEW_HEIGHT));
  const W = Math.round(H * VIEW_ASPECT);
  for (const c of [glCanvas, overlay]) if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  const crop = { texMatrix: affine(sx, 0, 0, sy, 0.5 - 0.5 * sx, 0.5 - 0.5 * sy) };
  const toView = (x, y) => [(0.5 + (x - 0.5) / sx) * W, (0.5 + (y - 0.5) / sy) * H];

  const f = state.filter;
  const time = (performance.now() - start) / 1000;
  const faces = tracker.landmarker ? tracker.detect(source, M.needsFaces(f) || showPoints, M.needsMask(f)) : [];
  const frames = faces.map((face) => measureFace(face, toView));

  // Face warps (view uv, y up; radius in view widths).
  const warps = new Float32Array(32);
  let warpCount = 0;
  for (const fr of frames) {
    for (const w of f.warps) {
      if (warpCount >= 8) break;
      const p = fr.anchors[w.anchor];
      warps.set([p[0] / W, 1 - p[1] / H, (w.radius * fr.width) / W, w.strength], warpCount * 4);
      warpCount++;
    }
  }
  renderer.draw(source, crop, f, {
    warps, warpCount, mask: tracker.mask, maskVersion: tracker.maskVersion,
    bgImage: state.bgPhoto, bgMatrix: backgroundMatrix(H / W, state.bgPhoto),
  }, time);

  // Stickers, interactions and HUD on the 2D overlay.
  ctx.clearRect(0, 0, W, H);
  drawn = [];
  engine.setScript(state.script);
  if (M.isInteractive(f)) engine.update(f, frames.map((fr) => toUnits(fr, W, H)), H / W, true, performance.now());
  for (const fr of frames) {
    f.stickers.forEach((s, i) => {
      if (!fr.matches(s.showWhen)) return;
      if (M.isInteractive(f) && !engine.isStickerVisible(i)) return;
      const a = artCanvas(s, state.assetImages);
      if (!a) return;
      const [x, y] = fr.point(s.anchor, s.offsetX, s.offsetY);
      const w = s.width * fr.width;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(fr.angle - (s.rotation * Math.PI) / 180);
      ctx.drawImage(a.canvas, -w / 2, (-w * a.aspect) / 2, w, w * a.aspect);
      if (i === state.selectedSticker && state.tab === "Face") {
        ctx.strokeStyle = "#ff8a3d";
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 6]);
        ctx.strokeRect(-w / 2, (-w * a.aspect) / 2, w, w * a.aspect);
      }
      ctx.restore();
      drawn.push({ index: i, x, y, r: Math.max(w, w * a.aspect) / 2, frame: fr });
    });
  }
  if (M.isInteractive(f)) engine.draw(ctx, W, H, state.assetImages);
  if (showPoints) drawPoints(frames);
}
requestAnimationFrame(frame);

/** Port of the app's green screen photo mapping (view uv -> photo uv), mirrored for selfies. */
function backgroundMatrix(viewAspect, img) {
  const photoAspect = img ? img.naturalHeight / img.naturalWidth : 1;
  const cover = Math.max(1, viewAspect / photoAspect);
  const w = cover, h = cover * photoAspect;
  const cx = 0.5, cy = viewAspect / 2;
  // u' = 1 - (u - cx)/w - 0.5 (mirrored), v' = 0.5 - (v*aspect - cy)/h
  return affine(-1 / w, 0, 0, -viewAspect / h, 0.5 + cx / w, 0.5 + cy / h);
}

function drawPoints(frames) {
  ctx.fillStyle = "#ff8a3d";
  for (const fr of frames) {
    for (const p of Object.values(fr.anchors)) {
      ctx.beginPath();
      ctx.arc(p[0], p[1], 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ------------------------------------------------------------------ dragging stickers & taps

let drag = null;

function canvasPoint(e) {
  const r = overlay.getBoundingClientRect();
  // The canvas is mirrored on screen, so flip x back.
  return [((r.right - e.clientX) / r.width) * overlay.width, ((e.clientY - r.top) / r.height) * overlay.height];
}

function hit(p) {
  for (let i = drawn.length - 1; i >= 0; i--) {
    const d = drawn[i];
    if (Math.hypot(p[0] - d.x, p[1] - d.y) <= d.r) return d;
  }
  return null;
}

overlay.addEventListener("pointerdown", (e) => {
  const p = canvasPoint(e);
  const d = hit(p);
  if (d) {
    const s = state.filter.stickers[d.index];
    drag = { d, start: p, ox: s.offsetX, oy: s.offsetY, moved: false };
    if (state.selectedSticker !== d.index || state.tab !== "Face") {
      state.selectedSticker = d.index;
      state.tab = "Face";
      renderPanel(app);
    }
    overlay.setPointerCapture(e.pointerId);
  } else {
    drag = { tap: true, start: p };
  }
});

overlay.addEventListener("pointermove", (e) => {
  const p = canvasPoint(e);
  overlay.classList.toggle("grab", !!hit(p));
  if (!drag || drag.tap) return;
  const { d } = drag;
  const dx = p[0] - drag.start[0], dy = p[1] - drag.start[1];
  if (Math.hypot(dx, dy) > 3) drag.moved = true;
  // Screen movement -> movement along the face's own axes, in face widths.
  const fr = d.frame;
  const s = state.filter.stickers[d.index];
  s.offsetX = round(drag.ox + (dx * fr.x[0] + dy * fr.x[1]) / fr.width);
  s.offsetY = round(drag.oy + (dx * fr.up[0] + dy * fr.up[1]) / fr.width);
});

overlay.addEventListener("pointerup", (e) => {
  if (drag?.tap) {
    // A click on the preview is a screen tap for interactive filters (0..1 of the displayed view).
    const r = overlay.getBoundingClientRect();
    engine.tap((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  } else if (drag?.moved) {
    app.changed(true);
  }
  drag = null;
});

overlay.addEventListener("wheel", (e) => {
  const d = hit(canvasPoint(e));
  if (!d) return;
  e.preventDefault();
  const s = state.filter.stickers[d.index];
  if (e.shiftKey) s.rotation = Math.round(((s.rotation + Math.sign(e.deltaY) * 5 + 540) % 360) - 180);
  else s.width = round(Math.min(1.4, Math.max(0.05, s.width * (e.deltaY > 0 ? 0.95 : 1.05))));
  state.selectedSticker = d.index;
  clearTimeout(overlay.wheelTimer);
  overlay.wheelTimer = setTimeout(() => app.changed(true), 200);
}, { passive: false });

const round = (v) => Math.round(v * 100) / 100;

// ------------------------------------------------------------------ helpers

function chooseFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => resolve(input.files[0] ?? null);
    input.click();
  });
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 3200);
}

function saveDraft() {
  try {
    // Custom pictures aren't kept between visits (they're files); everything else is.
    localStorage.setItem(DRAFT_KEY, JSON.stringify(state.filter));
    localStorage.setItem(SCRIPT_KEY, state.script);
  } catch { /* private mode etc. */ }
}

function loadScript() {
  try {
    return localStorage.getItem(SCRIPT_KEY) ?? "";
  } catch {
    return "";
  }
}

// Script errors (or "running") under the Script tab's editor.
setInterval(() => {
  const el = document.getElementById("scriptStatus");
  if (!el) return;
  const error = engine.scriptError;
  el.className = error ? "error" : state.script.trim() ? "ok" : "muted";
  el.textContent = error ? `Script error: ${error}` : state.script.trim() ? (source ? "✓ Running in the preview" : "Turn on the preview to run it") : "";
}, 400);

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? M.normalize(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

renderPanel(app);
