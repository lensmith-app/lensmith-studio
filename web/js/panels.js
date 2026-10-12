// The editor panel: Style, Adjust, Effects, Face, Interact, Background, Code, Publish.

import * as M from "./model.js";
import { artCanvas } from "./art.js";

export const TABS = ["Style", "Adjust", "Effects", "Face", "3D", "Interact", "Script", "Background", "Code", "Publish"];

/** Tiny DOM helper: h("div.class", {attrs/on*}, ...children). */
export function h(tag, props = {}, ...children) {
  const [name, ...classes] = tag.split(".");
  const el = document.createElement(name || "div");
  if (classes.length) el.className = classes.join(" ");
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "style") Object.assign(el.style, v);
    else if (k in el && k !== "list") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

/**
 * @param app {state, changed(structural), pickImage(): Promise<string|null>, choosePhoto(), takeThumbnail(), submit(), toast(msg)}
 */
export function renderPanel(app) {
  const { state } = app;
  const tabs = document.getElementById("tabs");
  tabs.replaceChildren(...TABS.map((t) => h("button" + (t === state.tab ? ".on" : ""), {
    onclick: () => { state.tab = t; renderPanel(app); },
  }, t)));
  const body = document.getElementById("tab");
  const content = {
    Style: styleTab, Adjust: adjustTab, Effects: effectsTab, Face: faceTab, "3D": modelsTab, Interact: interactTab,
    Script: scriptTab, Background: backgroundTab, Code: codeTab, Publish: publishTab,
  }[state.tab](app);
  // Optional controls are written as `cond && control`; drop the ones that are switched off.
  body.replaceChildren(...content.flat().filter((c) => c !== false && c !== null && c !== undefined));
}

// ------------------------------------------------------------------ shared controls

function slider(label, value, min, max, step, onInput, format) {
  const out = h("span", {}, format ? format(value) : pct(value, min, max));
  const input = h("input", {
    type: "range", min, max, step: step ?? (max - min) / 200, value,
    oninput: (e) => { const v = Number(e.target.value); out.textContent = format ? format(v) : pct(v, min, max); onInput(v); },
  });
  return h("div.slider", {}, h("div.top", {}, h("span", {}, label), out), input);
}
const pct = (v, min, max) => Math.round(((v - min) / (max - min)) * 100);

function chips(options, selected, label, onSelect) {
  return h("div.chips", {}, options.map((o) =>
    h("button.chip" + (o === selected ? ".on" : ""), { onclick: () => onSelect(o) }, label(o))));
}

const rgb = (c) => `rgb(${c.map((v) => Math.round(v * 255)).join(",")})`;

function swatches(selected, allowNone, onSelect) {
  return h("div.swatches", {},
    allowNone && h("button.swatch" + (selected ? "" : ".on"), { title: "None", onclick: () => onSelect(null), style: { background: "transparent" } }, "∅"),
    M.PALETTE.map((c) => h("button.swatch" + (selected && selected.join() === c.join() ? ".on" : ""), {
      onclick: () => onSelect(c), style: { background: rgb(c) },
    })));
}

export function artPreview(art, assets) {
  if (art.emoji) return h("span", {}, art.emoji);
  const a = artCanvas(art, assets);
  if (!a) return h("span", {}, "🖼️");
  if (a.canvas instanceof HTMLImageElement) return h("img", { src: a.canvas.src, alt: "" });
  const c = h("canvas", { width: a.canvas.width, height: a.canvas.height });
  c.getContext("2d").drawImage(a.canvas, 0, 0);
  return c;
}

/** Grid of emoji, built-in drawings, this filter's pictures, and "upload a picture". */
function artPicker(app, onPick) {
  const { state } = app;
  const tiles = [
    h("div.pick.add", {
      title: "Upload a PNG (transparent background works best)",
      onclick: async () => { const path = await app.pickImage(); if (path) onPick({ image: path }); },
    }, "+ your picture"),
    ...[...state.assetImages.keys()].map((path) => h("div.pick", { title: path, onclick: () => onPick({ image: path }) }, artPreview({ image: path }, state.assetImages))),
    ...M.DRAWINGS.map((d) => h("div.pick", { title: d, onclick: () => onPick({ drawing: d }) }, artPreview({ drawing: d }, state.assetImages))),
    ...M.EMOJI_CHOICES.map((e) => h("div.pick", { onclick: () => onPick({ emoji: e }) }, e)),
  ];
  return h("div.picker", {}, tiles);
}

// ------------------------------------------------------------------ tabs

function styleTab(app) {
  const f = app.state.filter;
  const looks = M.LOOKS.map((look) => {
    const plain = M.defaultFilter();
    const tone = (r, g, b) => {
      const sat = look.saturation ?? 1, warm = look.warmth ?? 0, tint = look.tint ?? 0, fade = look.fade ?? 0;
      const l = 0.3 * r + 0.59 * g + 0.11 * b;
      let c = [r, g, b].map((v) => l + (v - l) * sat);
      c = [c[0] + warm * 0.15, c[1] - tint * 0.08, c[2] - warm * 0.15];
      if (look.colorizeAmount) c = c.map((v, i) => v + (look.colorize[i] * l - v) * look.colorizeAmount);
      return rgb(c.map((v) => Math.min(1, Math.max(0, v * 0.85 + fade * 0.15))));
    };
    void plain;
    return h("div.look" + (M.hasLook(f, look) ? ".on" : ""), {
      onclick: () => { M.applyLook(f, look); app.changed(true); },
    }, h("div.sw", { style: { background: `linear-gradient(135deg, ${tone(0.95, 0.6, 0.45)}, ${tone(0.25, 0.45, 0.7)})` } }), look.name);
  });
  return [
    h("h3", {}, "Looks"),
    h("div.looks", {}, looks),
    h("h3", {}, "Color wash"),
    swatches(f.colorizeAmount ? f.colorize : null, true, (c) => {
      if (!c) f.colorizeAmount = 0;
      else { f.colorize = c; if (!f.colorizeAmount) f.colorizeAmount = 0.6; }
      app.changed(true);
    }),
    f.colorizeAmount > 0 && slider("Wash strength", f.colorizeAmount, 0, 1, 0.01, (v) => { f.colorizeAmount = v; app.changed(); }),
  ];
}

function adjustTab(app) {
  const { state } = app;
  const f = state.filter;
  const tool = M.TOOLS[state.tool] ?? M.TOOLS[0];
  return [
    h("div.tools", {}, M.TOOLS.map((t, i) => h("div.tool" + (i === state.tool ? ".on" : ""), {
      onclick: () => { state.tool = i; app.changed(true); },
    }, h("span.ic", {}, t.icon), t.label, h("span.dot" + (f[t.key] !== t.neutral ? ".changed" : ""))))),
    h("h3", {}, tool.label),
    slider(tool.label, f[tool.key], tool.min, tool.max, 0.01, (v) => { f[tool.key] = v; app.changed(); }),
    h("div.row", {},
      h("button.ghost.small-btn", { onclick: () => { f[tool.key] = tool.neutral; app.changed(true); } }, `Reset ${tool.label.toLowerCase()}`),
      h("button.ghost.small-btn", { onclick: () => { M.TOOLS.forEach((t) => (f[t.key] = t.neutral)); app.changed(true); } }, "Reset all")),
  ];
}

function effectsTab(app) {
  const f = app.state.filter;
  const param = M.EFFECT_PARAMS[f.effect];
  return [
    h("h3", {}, "Special effect"),
    chips(M.EFFECTS, f.effect, (e) => M.EFFECT_LABELS[e] ?? e, (e) => {
      f.effect = e;
      f.effectParam = M.EFFECT_PARAMS[e]?.def ?? 0;
      app.changed(true);
    }),
    param && slider(param.label, f.effectParam, param.min, param.max, param.step, (v) => { f.effectParam = v; app.changed(); }, (v) => v.toFixed(param.step < 1 ? 3 : 0)),
  ];
}

function faceTab(app) {
  const { state } = app;
  const f = state.filter;
  const s = f.stickers[state.selectedSticker];
  const out = [h("h3", {}, "Stickers")];
  if (!f.stickers.length) out.push(h("p.muted", {}, "Add stickers, then drag them into place on the preview."));
  out.push(h("div.list", {}, f.stickers.map((st, i) => h("div.item" + (i === state.selectedSticker ? ".on" : ""), {
    onclick: () => { state.selectedSticker = i; app.changed(true); },
  },
  h("div.art", {}, artPreview(st, state.assetImages)),
  h("div.label", {}, M.ANCHOR_LABELS[st.anchor], h("small", {}, M.CONDITION_LABELS[st.showWhen] + (st.hidden ? " · starts hidden" : ""))),
  h("button.x", {
    title: "Remove", onclick: (e) => {
      e.stopPropagation();
      f.stickers.splice(i, 1);
      state.selectedSticker = -1;
      app.changed(true);
    },
  }, "✕")))));

  out.push(h("h3", {}, "Add a sticker"), artPicker(app, (art) => {
    f.stickers.push(M.defaultSticker(art));
    state.selectedSticker = f.stickers.length - 1;
    app.changed(true);
  }));

  if (s) {
    out.push(
      h("h3", {}, "Attach to"),
      chips(M.ANCHORS, s.anchor, (a) => M.ANCHOR_LABELS[a], (a) => { s.anchor = a; app.changed(true); }),
      slider("Size", s.width, 0.05, 1.4, 0.01, (v) => { s.width = v; app.changed(); }),
      slider("Left / right", s.offsetX, -1, 1, 0.01, (v) => { s.offsetX = v; app.changed(); }, (v) => v.toFixed(2)),
      slider("Up / down", s.offsetY, -1, 1, 0.01, (v) => { s.offsetY = v; app.changed(); }, (v) => v.toFixed(2)),
      slider("Rotate", s.rotation, -180, 180, 1, (v) => { s.rotation = v; app.changed(); }, (v) => `${Math.round(v)}°`),
      h("h3", {}, "Show when"),
      chips(M.CONDITIONS, s.showWhen, (c) => M.CONDITION_LABELS[c], (c) => { s.showWhen = c; app.changed(true); }),
      h("label.check", { style: { marginTop: "10px" } },
        h("input", { type: "checkbox", checked: s.hidden, onchange: (e) => { s.hidden = e.target.checked; app.changed(true); } }),
        " Start hidden (a rule can show it)"),
    );
  }

  out.push(h("h3", {}, "Face shape"));
  f.warps.forEach((w, i) => out.push(h("div.card", {},
    h("div.head", {}, M.ANCHOR_LABELS[w.anchor], h("button.x", { onclick: () => { f.warps.splice(i, 1); app.changed(true); } }, "✕")),
    chips(M.ANCHORS, w.anchor, (a) => M.ANCHOR_LABELS[a], (a) => { w.anchor = a; app.changed(true); }),
    slider("Area", w.radius, 0.08, 0.5, 0.01, (v) => { w.radius = v; app.changed(); }),
    slider("Shrink ↔ Grow", w.strength, -0.6, 0.6, 0.01, (v) => { w.strength = v; app.changed(); }, (v) => v.toFixed(2)))));
  out.push(h("div.row", {},
    h("button.ghost.small-btn", { onclick: () => { f.warps.push({ anchor: "LeftEye", radius: 0.25, strength: 0.5 }, { anchor: "RightEye", radius: 0.25, strength: 0.5 }); app.changed(true); } }, "+ Big eyes"),
    h("button.ghost.small-btn", { onclick: () => { f.warps.push({ anchor: "Mouth", radius: 0.25, strength: 0.4 }); app.changed(true); } }, "+ Shape point")));
  return out;
}

/** The Studio's own 3D models (web/models), with a placement that suits each. */
const MODEL_LIBRARY = [
  { name: "party-hat", label: "🎉 Party hat", position: [-3, 21, -3], rotation: [-10, 0, 12], size: 17 },
  { name: "top-hat", label: "🎩 Top hat", position: [0, 17, -4], rotation: [-8, 0, 0], size: 22 },
  { name: "crown", label: "👑 Crown", position: [0, 17, -4], rotation: [-6, 0, 0], size: 16 },
  { name: "sunglasses", label: "🕶️ Sunglasses", position: [0, 1.5, 2.5], rotation: [0, 0, 0], size: 15 },
  { name: "halo", label: "😇 Halo", position: [0, 19, -4], rotation: [-15, 0, 0], size: 17 },
];

function modelsTab(app) {
  const { state } = app;
  const f = state.filter;
  const models = f.models ?? [];
  const set = (list) => {
    if (list.length) f.models = list; else { delete f.models; delete f.occludeHead; }
    f.minAppVersion = M.requiredAppVersion(f, state.script);
    app.changed(true);
  };
  const out = [
    h("h3", {}, "3D models"),
    h("p.muted", {}, "Real 3D hats, glasses and more that turn with your head (Lensmith 0.11+). Positions are in centimetres from the top of the nose: left/right, up/down, and forward (out of the face)."),
    h("div.row", {}, MODEL_LIBRARY.map((m) => h("button.ghost.small-btn", {
      onclick: async () => {
        const file = await app.addLibraryModel(m.name);
        set([...models, { file, position: [...m.position], rotation: [...m.rotation], size: m.size }]);
      },
    }, m.label))),
    h("div.row", {}, h("button.ghost.small-btn", {
      onclick: async () => {
        const file = await app.pickModel?.();
        if (file) set([...models, { file, position: [0, 0, 0], rotation: [0, 0, 0], size: 15 }]);
      },
    }, "Upload a .glb"), h("span.muted", {}, " binary glTF, under 5 MB and 60,000 triangles")),
  ];
  models.forEach((m, i) => out.push(h("div.card", {},
    h("div.head", {}, m.file.replace(/^assets\//, ""), h("button.x", { onclick: () => set(models.filter((_, k) => k !== i)) }, "✕")),
    slider("Size", m.size, 2, 40, 0.5, (v) => { m.size = v; app.changed(); }, (v) => `${v.toFixed(1)} cm`),
    slider("Left / right", m.position[0], -20, 20, 0.5, (v) => { m.position[0] = v; app.changed(); }, (v) => `${v.toFixed(1)} cm`),
    slider("Up / down", m.position[1], -20, 30, 0.5, (v) => { m.position[1] = v; app.changed(); }, (v) => `${v.toFixed(1)} cm`),
    slider("Forward / back", m.position[2], -20, 20, 0.5, (v) => { m.position[2] = v; app.changed(); }, (v) => `${v.toFixed(1)} cm`),
    slider("Tilt", m.rotation[0], -180, 180, 1, (v) => { m.rotation[0] = v; app.changed(); }, (v) => `${Math.round(v)}°`),
    slider("Turn", m.rotation[1], -180, 180, 1, (v) => { m.rotation[1] = v; app.changed(); }, (v) => `${Math.round(v)}°`),
    slider("Lean", m.rotation[2], -180, 180, 1, (v) => { m.rotation[2] = v; app.changed(); }, (v) => `${Math.round(v)}°`))));
  if (models.length) {
    out.push(h("label.check", { style: { marginTop: "10px" } },
      h("input", { type: "checkbox", checked: f.occludeHead !== false, onchange: (e) => {
        if (e.target.checked) delete f.occludeHead; else f.occludeHead = false;
        app.changed();
      } }),
      " Hide what's behind the head (e.g. the back of a hat brim)"));
  }
  return out;
}

function actionTitle(a) {
  return { burst: "Burst", show: "Show sticker", hide: "Hide sticker", toggle: "Toggle sticker", score: "Add to score", popup: "Show text", flash: "Flash screen" }[a.type];
}

function actionSummary(a) {
  switch (a.type) {
    case "burst": return "burst " + (a.emoji ?? (a.drawing ? "drawing" : "picture"));
    case "score": return `+${a.points} score`;
    case "popup": return `"${a.text}"`;
    case "flash": return "flash";
    default: return `${a.type} sticker ${a.index + 1}`;
  }
}

function interactTab(app) {
  const { state } = app;
  const f = state.filter;
  const out = [h("h3", {}, "Rules")];
  if (!f.rules.length) out.push(h("p.muted", {}, "Make your filter react: \"When I blink → burst hearts\", \"When I tap → confetti\"…"));
  out.push(h("div.list", {}, f.rules.map((r, i) => h("div.item" + (i === state.selectedRule ? ".on" : ""), {
    onclick: () => { state.selectedRule = i; app.changed(true); },
  }, h("div.label", {}, h("b", {}, "When " + M.TRIGGER_LABELS[r.trigger]), h("small", {}, r.actions.map(actionSummary).join(" · ") || "Nothing yet")),
  h("button.x", { onclick: (e) => { e.stopPropagation(); f.rules.splice(i, 1); state.selectedRule = -1; app.changed(true); } }, "✕")))));
  out.push(h("div.row", { style: { marginTop: "8px" } }, h("button.ghost.small-btn", {
    onclick: () => {
      f.rules.push({ trigger: "Tap", cooldownMs: 250, actions: [M.newAction("burst")] });
      f.rules.at(-1).actions[0].emoji = "🎉";
      state.selectedRule = f.rules.length - 1;
      app.changed(true);
    },
  }, "+ Add rule")));

  const r = f.rules[state.selectedRule];
  if (r) {
    out.push(h("h3", {}, "When…"), chips(M.TRIGGERS, r.trigger, (t) => M.TRIGGER_LABELS[t], (t) => { r.trigger = t; app.changed(true); }));
    out.push(slider("Wait between triggers", r.cooldownMs, 0, 3000, 50, (v) => { r.cooldownMs = v; app.changed(); }, (v) => `${(v / 1000).toFixed(2)}s`));
    out.push(h("h3", {}, "Do…"));
    r.actions.forEach((a, ai) => out.push(h("div.card", {},
      h("div.head", {}, actionTitle(a), h("button.x", { onclick: () => { r.actions.splice(ai, 1); app.changed(true); } }, "✕")),
      ...actionEditor(app, a))));
    const types = ["burst", ...(f.stickers.length ? ["show", "hide", "toggle"] : []), "score", "popup", "flash"];
    out.push(h("div.row", {}, types.map((t) => h("button.ghost.small-btn", {
      onclick: () => { r.actions.push(M.newAction(t)); app.changed(true); },
    }, "+ " + actionTitle({ type: t })))));
  }

  out.push(h("h3", {}, "Screen taps"));
  const tapRule = M.usesTaps(f);
  out.push(h("label.check", {},
    h("input", { type: "checkbox", checked: f.doubleTapFlip && !tapRule, disabled: tapRule, onchange: (e) => { f.doubleTapFlip = e.target.checked; app.changed(); } }),
    " Double-tap flips camera", tapRule ? h("span.muted", {}, " — off automatically, this filter reacts to taps") : ""));

  out.push(h("h3", {}, "Mini-game"));
  const kind = f.game?.type === "nails" ? "Nail It" : f.game ? "Catch" : "None";
  out.push(chips(["None", "Catch", "Nail It"], kind, (x) => x, (x) => {
    if (x === "Catch") f.game = { type: "catch", items: [{ emoji: "🍔" }, { emoji: "🍕" }, { emoji: "🍩" }], durationSeconds: 30 };
    else if (x === "Nail It") f.game = { type: "nails", nails: 10, fire: "MouthOpen" };
    else delete f.game;
    f.minAppVersion = M.requiredAppVersion(f);
    app.changed(true);
  }));
  out.push(h("p.muted", {}, {
    Catch: "Things fall — move your head and open your mouth to eat them.",
    "Nail It": "Wooden walls full of nails. The gun follows your nose — shoot every nail into the wall. Needs Lensmith 0.4+.",
    None: "Add a game to your filter.",
  }[kind]));
  if (f.game?.type === "nails") {
    const g = f.game;
    out.push(slider("Nails", g.nails, 4, 16, 1, (v) => { g.nails = v; app.changed(); }, (v) => String(v)));
    out.push(h("div.muted", { style: { margin: "4px 0" } }, "Shoot by"));
    out.push(chips(M.FIRE_TRIGGERS, g.fire, (x) => M.FIRE_LABELS[x], (x) => { g.fire = x; app.changed(true); }));
  } else if (f.game) {
    const g = f.game;
    const has = (art) => g.items.some((it) => M.artKey(it) === M.artKey(art));
    const toggle = (art) => {
      const items = has(art) ? g.items.filter((it) => M.artKey(it) !== M.artKey(art)) : [...g.items, art];
      if (items.length) { g.items = items; app.changed(true); }
    };
    out.push(h("div.chips", { style: { marginTop: "8px" } },
      M.CATCH_CHOICES.map((e) => h("button.chip" + (has({ emoji: e }) ? ".on" : ""), { onclick: () => toggle({ emoji: e }) }, e)),
      [...state.assetImages.keys()].map((p) => h("button.chip" + (has({ image: p }) ? ".on" : ""), { onclick: () => toggle({ image: p }), title: p }, "🖼️"))));
    out.push(slider("Round length", g.durationSeconds, 10, 60, 1, (v) => { g.durationSeconds = v; app.changed(); }, (v) => `${v}s`));
  }
  return out;
}

function actionEditor(app, a) {
  const f = app.state.filter;
  switch (a.type) {
    case "burst": {
      let open = false;
      const pickerHost = h("div");
      return [
        h("div.row", {},
          h("div.item", { style: { flex: "0 0 auto" }, onclick: () => {
            open = !open;
            pickerHost.replaceChildren(open ? artPicker(app, (art) => {
              delete a.emoji; delete a.drawing; delete a.image;
              Object.assign(a, art);
              app.changed(true);
            }) : "");
          } }, h("div.art", {}, artPreview(a, app.state.assetImages))),
          h("span.muted", {}, "Click to change what bursts")),
        pickerHost,
        h("div.muted", { style: { margin: "8px 0 4px" } }, "From"),
        chips([null, ...M.ANCHORS], a.anchor ?? null, (x) => (x ? M.ANCHOR_LABELS[x] : "Tap / center"), (x) => {
          if (x) a.anchor = x; else delete a.anchor;
          app.changed(true);
        }),
        h("div.muted", { style: { margin: "8px 0 4px" } }, "Movement"),
        chips(M.BURST_STYLES, a.style, (x) => x, (x) => { a.style = x; app.changed(true); }),
        slider("How many", a.count, 1, 40, 1, (v) => { a.count = v; app.changed(); }, (v) => String(v)),
        slider("Size", a.size, 0.05, 0.5, 0.01, (v) => { a.size = v; app.changed(); }),
      ];
    }
    case "show": case "hide": case "toggle":
      if (!f.stickers.length) return [h("p.muted", {}, "Add stickers in the Face tab first.")];
      return [h("div.row", {}, f.stickers.map((s, i) => h("div.item" + (i === a.index ? ".on" : ""), {
        style: { flex: "0 0 auto" }, onclick: () => { a.index = i; app.changed(true); },
      }, h("div.art", {}, artPreview(s, app.state.assetImages)))))];
    case "score":
      return [slider("Points", a.points, 1, 10, 1, (v) => { a.points = v; app.changed(); }, (v) => String(v))];
    case "popup":
      return [h("input", { value: a.text, maxLength: 30, style: { width: "100%" }, oninput: (e) => { a.text = e.target.value; app.changed(); } })];
    case "flash":
      return [swatches(a.color, false, (c) => { a.color = c; app.changed(true); })];
    default:
      return [];
  }
}

function backgroundTab(app) {
  const f = app.state.filter;
  const out = [
    h("h3", {}, "Behind you"),
    chips(M.BACKGROUNDS, f.background, (b) => M.BACKGROUND_LABELS[b] ?? b, (b) => { f.background = b; app.changed(true); }),
  ];
  if (f.background === "Gradient") {
    out.push(h("h3", {}, "Top color"), swatches(f.backgroundTop, false, (c) => { f.backgroundTop = c; app.changed(true); }));
    out.push(h("h3", {}, "Bottom color"), swatches(f.backgroundBottom, false, (c) => { f.backgroundBottom = c; app.changed(true); }));
  }
  if (f.background === "Image") {
    out.push(h("p.muted", {}, "On the phone, people pick their own photo for the green screen. Try one here:"),
      h("button.ghost.small-btn", { onclick: () => app.choosePhoto() }, "Choose a test photo"));
  }
  out.push(h("p.muted", { style: { marginTop: "12px" } }, "Background effects find you automatically and change everything behind you."));
  return out;
}

const TEMPLATES = [
  { name: "Starter game", file: "templates/starter.js" },
  { name: "Nail It (Shoot the Nails)", file: "templates/nail-it.js" },
  { name: "Cartoon Me (AI)", file: "templates/cartoon-me.js" },
  { name: "Hands", file: "templates/hands.js" },
];

/** Write a game or effect in JavaScript — the Lensmith Script API. */
function scriptTab(app) {
  const { state } = app;
  const f = state.filter;
  const setScript = (source) => {
    state.script = source;
    if (source.trim()) f.script = "script.js";
    else delete f.script;
    f.minAppVersion = M.requiredAppVersion(f, source);
    app.changed(false);
  };
  const area = h("textarea.code", {
    spellcheck: false,
    placeholder: "// Pick a template above, or write start(lens), update(lens, dt) and tap(lens, x, y).",
    value: state.script,
    oninput: (e) => setScript(e.target.value),
  });
  return [
    h("h3", {}, "Script"),
    h("p.muted", {}, "Build your own games and effects in JavaScript. The preview runs it live; the phone runs the same script (Lensmith 0.5+)."),
    h("div.row", {}, h("span.muted", {}, "Start from:"), TEMPLATES.map((t) => h("button.ghost.small-btn", {
      onclick: async () => {
        if (state.script.trim() && !confirm(`Replace your script with “${t.name}”?`)) return;
        const source = await fetch(t.file).then((r) => r.text());
        area.value = source;
        setScript(source);
        app.toast(`Loaded ${t.name} — tap the preview to play`);
      },
    }, t.name))),
    area,
    h("div.muted", { id: "scriptStatus" }, ""),
    h("div.row", {},
      h("button.ghost.small-btn", { onclick: async () => {
        const path = await app.pickImage();
        if (path) { navigator.clipboard?.writeText(`"${path}"`); app.toast(`Added ${path} (copied) — use it in lens.sprite`); }
      } }, "Add picture"),
      h("button.ghost.small-btn", { onclick: async () => {
        const path = await app.pickSound?.();
        if (path) { navigator.clipboard?.writeText(`"${path}"`); app.toast(`Added ${path} (copied) — use it in lens.sound or lens.music`); }
      } }, "Add sound file")),
    h("label.check", {},
      h("input", { type: "checkbox", checked: !!app.state.filter.immersive, onchange: (e) => {
        if (e.target.checked) app.state.filter.immersive = true; else delete app.state.filter.immersive;
        app.changed();
      } }),
      " Full-screen game", h("span.muted", {}, " — hides the filter carousel while playing (Lensmith 0.6+)")),
    h("details", { style: { marginTop: "10px" } },
      h("summary", { style: { cursor: "pointer", color: "var(--ember)" } }, "API reference"),
      h("pre", { style: { whiteSpace: "pre-wrap", fontSize: "12px", color: "var(--muted)" } }, API_HELP)),
  ];
}

const API_HELP = `Define any of these functions:
  start(lens)            once, when the filter turns on
  update(lens, dt)       every frame — dt is seconds since the last frame
  tap(lens, x, y)        the screen was tapped at (x, y)

Coordinates are in screen widths: x goes across, y goes UP.
  lens.screen   { left, right, bottom, top, width, height } — the visible area
  lens.face     null, or { x, y (nose), width, tilt, mouthOpen, smiling,
                eyesClosed, anchors: { Forehead: {x, y}, Mouth: … } }
  lens.time     seconds since the filter started

Drawing (call every frame from update):
  lens.sprite(art, x, y, width, angleDegrees = 0, alpha = 1)
      art: an emoji "⭐", a drawing "drawing:Crown" (DogEarLeft, DogEarRight,
      DogNose, Tongue, ClownNose, Blush, Crown, WoodPlank, Nail, Bullet,
      Pistol), or one of your pictures "assets/name.png"
  lens.text(text, x, y, height = 0.08, alpha = 1)

Effects:
  lens.burst(art, x, y, count = 10, style = "Explode", size = 0.12)
      style: Explode, Fountain, Rain, Stream
  lens.popup(text)        big text for a moment
  lens.flash(r, g, b)     flash the screen (0..1)
  lens.random(min, max)   lens.log(...)

Sound (Lensmith 0.10+; click the preview once so the browser allows sound):
  lens.sound(name, volume = 1, pitch = 1)    a short effect; pitch 0.5..2
      built in: pop chomp coin jump boom swish whoosh click ding buzz win
      lose laser bounce splash tick kick snare hihat sparkle shutter whip
      powerup — or your own file "assets/name.ogg" (Add sound file)
  lens.music(name, volume = 0.6)   loops: "arcade", "chill", "beat" or a file
  lens.music(null)                 stops the music
  Sounds are added to videos people record. lens.sounds / lens.songs list
  the built-in names.

Hands and body (Lensmith 0.10+; the models download the first time):
  lens.hands   [] or up to 2 hands: { x, y (palm), size, side: "left"/"right",
               gesture: "open" "fist" "point" "thumbsUp" "thumbsDown" "peace"
               "loveYou" "none", pinch (thumb + index touching), tip (index
               fingertip {x, y}), thumb, points: 21 × {x, y} }
  lens.pose    null or { nose, leftShoulder, rightShoulder, leftElbow,
               rightElbow, leftWrist, rightWrist, leftHip, rightHip, leftKnee,
               rightKnee, leftAnkle, rightAnkle, … } — each { x, y, visible }
  Left/right are the person's own. Positions are where you see them on screen.

AI (on the device, Lensmith 0.8+):
  lens.stylize(style, function (lens, picture, error) { … })
      turns the camera picture into a cartoon in the background (a few
      seconds). style: "cartoon-3d", "cartoon-handdrawn", "cartoon-anime" (portraits), "face-paint", "paprika", "celeba". Draw the result
      full screen: lens.sprite(picture, 0.5, lens.screen.top / 2, 1)

Keep to classic JavaScript (var, function, objects, arrays, Math) — the phone's
engine doesn't support every new feature (no classes or async).`;

function codeTab(app) {
  const { state } = app;
  const status = h("div.muted", {}, "Edit filter.json directly — changes apply as you type.");
  const area = h("textarea.code", {
    spellcheck: false,
    value: JSON.stringify(state.filter, null, 2),
    oninput: (e) => {
      try {
        const parsed = JSON.parse(e.target.value);
        if (typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("filter.json must be an object");
        state.filter = M.normalize(parsed);
        status.className = "ok";
        status.textContent = "✓ Applied";
        app.changed(false, { fromCode: true });
      } catch (err) {
        status.className = "error";
        status.textContent = err.message;
      }
    },
  });
  state.codeArea = area;
  return [
    h("h3", {}, "filter.json"),
    area,
    status,
    h("p.muted", {}, "Format reference: ",
      h("a", { href: "https://github.com/lensmith-app/lensmith-studio/blob/main/docs/filter-format.md", target: "_blank" }, "filter-format.md"),
      " · ", h("a", { href: "schema/filter.schema.json", target: "_blank" }, "JSON Schema")),
  ];
}

function publishTab(app) {
  const { state } = app;
  const p = state.publish;
  const thumb = h("img.thumb", { src: p.thumbnailUrl || undefined, alt: "" });
  return [
    h("h3", {}, "Share on your phone"),
    h("p.muted", {}, "Save a .lensmith file and open it on your phone — Lensmith adds it under Mine."),
    h("button", { onclick: () => app.save() }, "Save .lensmith"),

    h("h3", {}, "Publish to the Lensmith Store"),
    h("label.field", {}, "Your GitHub username", h("input", { value: p.github, placeholder: "e.g. janedoe", oninput: (e) => { p.github = e.target.value.trim().toLowerCase(); } })),
    h("label.field", {}, "Short name (folder)", h("input", { value: p.slug || M.slugify(state.filter.name), oninput: (e) => { p.slug = M.slugify(e.target.value); } })),
    h("label.field", {}, "Description (shown in the store)", h("textarea", { rows: 2, maxLength: 200, value: p.description, oninput: (e) => { p.description = e.target.value; } })),
    h("label.field", {}, "Tags (comma separated)", h("input", { value: p.tags, oninput: (e) => { p.tags = e.target.value; } })),
    h("label.field", {}, "Version (raise it for updates)", h("input", { type: "number", min: 1, value: p.version, oninput: (e) => { p.version = Math.max(1, parseInt(e.target.value || "1", 10)); } })),
    h("div.row", { style: { margin: "10px 0" } }, thumb,
      h("div", {}, h("p.muted", {}, "Thumbnail — shown in the store and on the phone's filter carousel. Saved .lensmith files include it too (Lensmith 0.7+)."),
        h("div.row", {},
          h("button.ghost.small-btn", { onclick: async () => { thumb.src = await app.takeThumbnail(); } }, "Take from preview"),
          h("button.ghost.small-btn", { onclick: async () => { const u = await app.uploadThumbnail(); if (u) thumb.src = u; } }, "Upload image")))),
    h("button", { onclick: () => app.submit() }, "Download submission"),
    h("ol.steps", {},
      h("li", {}, h("b", {}, "Unzip"), " the download — you'll get a ", h("code", {}, "filters"), " folder."),
      h("li", {}, "Open ", h("a", { href: "https://github.com/lensmith-app/lensmith-filters/upload/main", target: "_blank" }, "the store's upload page"),
        " and ", h("b", {}, "drag the filters folder"), " onto it. GitHub makes your copy of the repository for you."),
      h("li", {}, "Choose ", h("b", {}, "Create a new branch… and start a pull request"), ", then ", h("b", {}, "Propose changes"), "."),
      h("li", {}, "Automatic checks run; once a maintainer approves, your filter is in the store.")),
  ];
}
