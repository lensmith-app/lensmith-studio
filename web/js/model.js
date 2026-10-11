// The Lensmith filter model — mirrors the Android app (FilterSpec / FilterJson).
// Keep in sync with docs/filter-format.md.

export const FORMAT_VERSION = 2;
export const MIN_APP_VERSION = 3;

export const ANCHORS = ["Forehead", "BetweenEyes", "LeftEye", "RightEye", "NoseTip", "Mouth", "Chin", "LeftCheek", "RightCheek"];
export const ANCHOR_LABELS = {
  Forehead: "Forehead", BetweenEyes: "Between eyes", LeftEye: "Left eye", RightEye: "Right eye",
  NoseTip: "Nose", Mouth: "Mouth", Chin: "Chin", LeftCheek: "Left cheek", RightCheek: "Right cheek",
};
export const CONDITIONS = ["Always", "MouthOpen", "MouthClosed", "Smiling", "EyesClosed"];
export const CONDITION_LABELS = {
  Always: "Always", MouthOpen: "Mouth open", MouthClosed: "Mouth closed", Smiling: "Smiling", EyesClosed: "Eyes closed",
};
export const EFFECTS = ["None", "Mirror", "Pixelate", "Sketch", "Thermal", "Posterize", "Invert", "RgbSplit", "Toon", "Vhs"];
export const EFFECT_LABELS = { None: "None", RgbSplit: "Glitch", Posterize: "Comic", Vhs: "VHS" };
export const EFFECT_PARAMS = {
  Pixelate: { label: "Pixel count", min: 16, max: 120, step: 1, def: 48 },
  Posterize: { label: "Color levels", min: 2, max: 10, step: 1, def: 5 },
  RgbSplit: { label: "Split distance", min: 0.002, max: 0.03, step: 0.001, def: 0.012 },
  Toon: { label: "Strength", min: 0.2, max: 1, step: 0.05, def: 1 },
  Vhs: { label: "Strength", min: 0.3, max: 2, step: 0.05, def: 1 },
};
export const BACKGROUNDS = ["None", "Blur", "ColorPop", "Gradient", "Galaxy", "Image"];
export const BACKGROUND_LABELS = { None: "Normal", ColorPop: "Color pop", Image: "Green screen" };
export const TRIGGERS = ["Start", "MouthOpen", "MouthClose", "Blink", "Smile", "TiltLeft", "TiltRight", "Tap", "EveryTwoSeconds", "WhileMouthOpen", "WhileSmiling"];
export const TRIGGER_LABELS = {
  Start: "the filter starts", MouthOpen: "mouth opens", MouthClose: "mouth closes", Blink: "I blink", Smile: "I smile",
  TiltLeft: "head tilts left", TiltRight: "head tilts right", Tap: "I tap the screen", EveryTwoSeconds: "every 2 seconds",
  WhileMouthOpen: "while mouth is open", WhileSmiling: "while smiling",
};
export const CONTINUOUS_TRIGGERS = new Set(["WhileMouthOpen", "WhileSmiling"]);
export const BURST_STYLES = ["Explode", "Fountain", "Rain", "Stream"];
export const DRAWINGS = ["DogEarLeft", "DogEarRight", "DogNose", "Tongue", "ClownNose", "Blush", "Crown"];
export const FIRE_TRIGGERS = ["MouthOpen", "Tap", "Blink"];
export const FIRE_LABELS = { MouthOpen: "Opening mouth", Tap: "Tapping", Blink: "Blinking" };
/** The Nail It game needs this app version (versionCode) or newer. */
export const NAIL_GAME_APP_VERSION = 4;
/** Filters with a script need this app version (versionCode) or newer. */
export const SCRIPT_APP_VERSION = 5;
export const V6_APP_VERSION = 6; // Toon/VHS effects, immersive games
export const AI_APP_VERSION = 8; // lens.stylize (on-device AI styles)
export const SCRIPT_FILE = "script.js";

export const EMOJI_CHOICES = [
  "👑", "🕶️", "😎", "❤️", "💕", "💖", "✨", "⭐", "🌟", "🔥", "💯", "🌸", "🌼", "🌺", "🌻", "🍀",
  "🦋", "🐝", "🐱", "🐶", "🦄", "🐸", "🐼", "👽", "🤖", "👻", "💀", "🎃", "😈", "😇", "🤡", "🥸",
  "🎩", "🧢", "🎀", "💎", "🎉", "🎈", "☁️", "🌈", "⚡", "💧", "🍕", "🍩", "🍓", "🥑", "💋", "👀",
];
export const CATCH_CHOICES = ["🍔", "🍕", "🍩", "🍓", "🍪", "🍉", "🍭", "🌮", "🍟", "🧁", "⭐", "💎", "❤️", "🪙"];

export const PALETTE = [
  [1, 0.78, 0.55], [1, 0.55, 0.3], [1, 0.85, 0.3], [1, 0.45, 0.6], [0.75, 0.45, 1], [0.45, 0.15, 0.55],
  [0.4, 0.7, 1], [0.2, 0.3, 0.7], [0.5, 1, 0.7], [0.55, 1, 0.5], [0.1, 0.1, 0.12], [1, 1, 1],
];

/** Adjust tools: one slider each. */
export const TOOLS = [
  { key: "brightness", label: "Brightness", icon: "☀️", min: -0.4, max: 0.4, neutral: 0 },
  { key: "contrast", label: "Contrast", icon: "◐", min: 0.5, max: 1.6, neutral: 1 },
  { key: "saturation", label: "Saturation", icon: "💧", min: 0, max: 2, neutral: 1 },
  { key: "warmth", label: "Warmth", icon: "🌡️", min: -1, max: 1, neutral: 0 },
  { key: "tint", label: "Tint", icon: "🎨", min: -1, max: 1, neutral: 0 },
  { key: "fade", label: "Fade", icon: "🌫️", min: 0, max: 1, neutral: 0 },
  { key: "vignette", label: "Vignette", icon: "⭕", min: 0, max: 1, neutral: 0 },
  { key: "grain", label: "Grain", icon: "▦", min: 0, max: 1, neutral: 0 },
];

const LOOK_KEYS = ["brightness", "contrast", "saturation", "warmth", "tint", "fade", "vignette", "grain", "colorize", "colorizeAmount"];

/** One-tap looks, the same as the app's Style tab. */
export const LOOKS = [
  { name: "None" },
  { name: "Vivid", saturation: 1.4, contrast: 1.1 },
  { name: "Golden", warmth: 0.7, saturation: 1.1, fade: 0.1, vignette: 0.35 },
  { name: "Retro", warmth: 0.35, saturation: 0.75, fade: 0.45, grain: 0.5, vignette: 0.45 },
  { name: "Noir", saturation: 0, contrast: 1.35, vignette: 0.55, grain: 0.25 },
  { name: "Sepia", saturation: 0, colorize: [1, 0.78, 0.55], colorizeAmount: 1, fade: 0.15, vignette: 0.3 },
  { name: "Frost", warmth: -0.7, tint: -0.1, brightness: 0.03 },
  { name: "Dreamy", brightness: 0.05, contrast: 0.85, fade: 0.3, tint: 0.35, saturation: 1.1 },
];

export function applyLook(filter, look) {
  const plain = defaultFilter();
  for (const k of LOOK_KEYS) filter[k] = clone(look[k] ?? plain[k]);
}

export function hasLook(filter, look) {
  const plain = defaultFilter();
  return LOOK_KEYS.filter((k) => k !== "colorize").every((k) => (look[k] ?? plain[k]) === filter[k]);
}

export function defaultFilter() {
  return {
    formatVersion: FORMAT_VERSION,
    minAppVersion: MIN_APP_VERSION,
    // Same prefix as filters made in the app, so they open under "Mine" and stay editable.
    id: "user_" + Math.random().toString(36).slice(2, 10),
    name: "My filter",
    brightness: 0, contrast: 1, saturation: 1, warmth: 0, tint: 0, fade: 0, vignette: 0, grain: 0,
    colorize: [1, 1, 1], colorizeAmount: 0,
    effect: "None", effectParam: 0,
    stickers: [], warps: [],
    background: "None", backgroundTop: [1, 0.55, 0.3], backgroundBottom: [0.45, 0.15, 0.55],
    rules: [],
    doubleTapFlip: true,
  };
}

export function defaultSticker(art) {
  const d = art.drawing;
  const base = { anchor: "Forehead", offsetX: 0, offsetY: 0.3, width: 0.35, rotation: 0, showWhen: "Always", hidden: false };
  const presets = {
    DogEarLeft: { offsetX: -0.55, offsetY: 0.2, width: 0.45, rotation: -15 },
    DogEarRight: { offsetX: 0.55, offsetY: 0.2, width: 0.45, rotation: 15 },
    DogNose: { anchor: "NoseTip", offsetY: 0, width: 0.3 },
    ClownNose: { anchor: "NoseTip", offsetY: 0, width: 0.22 },
    Tongue: { anchor: "Mouth", offsetY: -0.16, width: 0.24, showWhen: "MouthOpen" },
    Blush: { anchor: "LeftCheek", offsetY: 0, width: 0.3 },
    Crown: { offsetY: 0.32, width: 0.8 },
  };
  return { ...artOnly(art), ...base, ...(d ? presets[d] : {}) };
}

/** Only the art fields of an object ({emoji} / {drawing} / {image}). */
export function artOnly(o) {
  if (o.emoji) return { emoji: o.emoji };
  if (o.drawing) return { drawing: o.drawing };
  if (o.image) return { image: o.image };
  return { emoji: "✨" };
}

export function artKey(o) {
  return o.emoji ? "emoji:" + o.emoji : o.drawing ? "drawn:" + o.drawing : "image:" + o.image;
}

/** Fills in anything missing, so the editor and renderer can rely on every field. */
export function normalize(raw) {
  const f = { ...defaultFilter(), ...raw };
  f.formatVersion = FORMAT_VERSION;
  f.minAppVersion = Math.max(MIN_APP_VERSION, raw.minAppVersion ?? 0);
  f.stickers = (raw.stickers ?? []).map((s) => ({ ...defaultSticker(s), ...s, ...artOnly(s) }));
  f.warps = (raw.warps ?? []).map((w) => ({ anchor: "LeftEye", radius: 0.25, strength: 0.4, ...w }));
  f.rules = (raw.rules ?? []).map((r) => ({ trigger: "Tap", cooldownMs: 250, ...r, actions: (r.actions ?? []).map(normalizeAction) }));
  if (raw.game?.type === "nails") {
    f.game = { type: "nails", nails: Math.min(16, Math.max(2, raw.game.nails ?? 10)), fire: raw.game.fire ?? "MouthOpen" };
  } else if (raw.game) {
    f.game = { type: "catch", items: (raw.game.items ?? []).map(artOnly), durationSeconds: raw.game.durationSeconds ?? 30 };
  } else delete f.game;
  f.minAppVersion = requiredAppVersion(f);
  return f;
}

export function normalizeAction(a) {
  switch (a.type) {
    case "burst": return { type: "burst", ...artOnly(a), ...(a.anchor ? { anchor: a.anchor } : {}), count: a.count ?? 12, style: a.style ?? "Explode", size: a.size ?? 0.18 };
    case "show": case "hide": case "toggle": return { type: a.type, index: a.index ?? 0 };
    case "score": return { type: "score", points: a.points ?? 1 };
    case "popup": return { type: "popup", text: a.text ?? "Wow!" };
    case "flash": return { type: "flash", color: a.color ?? [1, 1, 1] };
    default: return null;
  }
}

export function newAction(type) {
  return normalizeAction(type === "burst" ? { type, emoji: "✨" } : { type });
}

/** The oldest app that can show this filter. */
export const requiredAppVersion = (f, script = "") =>
  f.script && /stylize\s*\(/.test(script) ? AI_APP_VERSION : f.immersive || f.effect === "Toon" || f.effect === "Vhs" ? V6_APP_VERSION : f.script ? SCRIPT_APP_VERSION : f.game?.type === "nails" ? NAIL_GAME_APP_VERSION : MIN_APP_VERSION;

/** Pictures a script refers to by name, e.g. lens.sprite("assets/gun.png", ...). */
export const scriptAssets = (source) => [...new Set((source || "").match(/assets\/[A-Za-z0-9._-]+/g) || [])];

/** Rules (or a game) that use taps switch off double-tap-to-flip in the app. */
export const usesTaps = (f, script = "") =>
  f.rules.some((r) => r.trigger === "Tap") || (f.game?.type === "nails" && f.game.fire === "Tap") || /function\s+tap\s*\(/.test(script);
export const isInteractive = (f) => f.rules.length > 0 || !!f.game || !!f.script;
export const needsFaces = (f) => f.stickers.length > 0 || f.warps.length > 0 || isInteractive(f);
export const needsMask = (f) => f.background !== "None";

/** Every picture the filter uses. */
export function imagePaths(f) {
  const out = new Set();
  const visit = (o) => { if (o && o.image) out.add(o.image); };
  f.stickers.forEach(visit);
  f.rules.forEach((r) => r.actions.forEach(visit));
  f.game?.items?.forEach(visit);
  return [...out];
}

export const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

export function slugify(name) {
  return (name || "filter").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 39) || "filter";
}
