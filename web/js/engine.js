// Interactive filters: a port of the app's InteractionEngine.kt.
// Works in "screen width" units: x 0..1 across, y 0..aspect pointing UP (like the app).

import { artCanvas, textCanvas } from "./art.js";
import { CONTINUOUS_TRIGGERS } from "./model.js";
import { BUILT_IN, BUILT_IN_MUSIC, DEFAULT_MUSIC_VOLUME } from "./sound.js";
import { scriptBody } from "./body.js";

const TILT_DEGREES = 18;
const STREAM_INTERVAL_MS = 60;
const MAX_PARTICLES = 220;
const POPUP_SECONDS = 1.3;
const BULLET_SPEED = 1.9;
// The Studio shows the whole frame (the phone may crop the sides), so everything is visible.
const VISIBLE_WIDTH = 1;
const VISIBLE_HEIGHT = 1;
const rand = Math.random;

/**
 * Runs a filter's script.js in the browser — the same Lensmith Script API the app runs with
 * Rhino (ScriptRuntime.kt). See docs/scripting.md.
 */
export class ScriptRuntime {
  constructor(source, host) {
    this.host = host;
    this.commands = [];
    this.pending = [];
    this.error = null;
    this.started = false;
    this.time = 0;
    this.stylizeCallbacks = new Map();
    this.stylizeResults = [];
    const lens = {
      stylize: (style = "face-paint", done) => {
        const id = host.stylize(String(style));
        if (id >= 0 && typeof done === "function") this.stylizeCallbacks.set(id, done);
        return id >= 0;
      },
      sprite: (art, x, y, width = 0.1, angle = 0, alpha = 1) => { this.pending.push({ kind: "sprite", art: String(art), x: +x, y: +y, width: +width, angle: +angle, alpha: +alpha }); },
      text: (text, x, y, height = 0.08, alpha = 1) => { this.pending.push({ kind: "text", text: String(text), x: +x, y: +y, height: +height, alpha: +alpha }); },
      burst: (art, x, y, count = 10, style = "Explode", size = 0.12) => host.burst(String(art), +x, +y, count | 0, String(style), +size),
      popup: (text) => host.popup(String(text)),
      flash: (r = 1, g = 1, b = 1) => host.flash(+r, +g, +b),
      sound: (name, volume = 1, pitch = 1) => host.sound(String(name), +volume, +pitch),
      music: (name, volume = DEFAULT_MUSIC_VOLUME) => host.music(name == null ? null : String(name), +volume),
      sounds: [...BUILT_IN],
      songs: [...BUILT_IN_MUSIC],
      random: (lo = 0, hi = 1) => lo + Math.random() * (hi - lo),
      log: (...args) => host.log(args.map(String).join(" ")),
      anchors: ["Forehead", "BetweenEyes", "LeftEye", "RightEye", "NoseTip", "Mouth", "Chin", "LeftCheek", "RightCheek"],
    };
    this.lens = lens;
    try {
      // Same shape as the app: top-level code runs once; start/update/tap are looked up by name.
      const factory = new Function("lens", `${source}
;return { start: typeof start === "function" ? start : null,
          update: typeof update === "function" ? update : null,
          tap: typeof tap === "function" ? tap : null };`);
      this.fns = factory(lens);
    } catch (e) {
      throw new Error(describe(e));
    }
  }

  get handlesTaps() { return !!this.fns?.tap; }

  /** A finished lens.stylize(): art to draw, or null and an error message. */
  deliverStylized(id, art, err) { this.stylizeResults.push([id, art, err]); }

  update(dt, screen, face, body = null) {
    if (this.error) return;
    this.time += dt;
    this.pending = [];
    Object.assign(this.lens, {
      screen: { ...screen, width: screen.right - screen.left, height: screen.top - screen.bottom },
      time: this.time,
      face,
      ...scriptBody(body),
    });
    this.call(() => {
      if (!this.started) { this.started = true; this.fns.start?.(this.lens); }
      for (const [id, art, err] of this.stylizeResults.splice(0)) {
        const done = this.stylizeCallbacks.get(id);
        this.stylizeCallbacks.delete(id);
        done?.(this.lens, art, err);
      }
      this.fns.update?.(this.lens, dt);
    });
    this.commands = this.pending;
  }

  tap(x, y) {
    if (!this.error) this.call(() => this.fns.tap?.(this.lens, x, y));
  }

  call(block) {
    try { block(); } catch (e) { this.error = describe(e); this.host.log("Script error: " + this.error); }
  }
}

function describe(e) {
  // new Function() adds 2 lines before the script, so shift line numbers back.
  const m = /<anonymous>:(\d+):(\d+)/.exec(e.stack || "");
  return m ? `${e.message} (line ${Number(m[1]) - 2})` : e.message || String(e);
}

/** "drawing:Nail", "assets/gun.png" or an emoji -> art object. */
function scriptArt(name) {
  if (name.startsWith("drawing:")) return { drawing: name.slice(8) };
  if (name.startsWith("assets/")) return { image: name };
  return { emoji: name };
}

export class InteractionEngine {
  constructor() {
    this.filter = null;
    this.taps = [];
    this.aspect = 4 / 3;
  }

  /** A tap at (x, y) on the displayed preview, 0..1 with y down. */
  tap(x, y) {
    this.taps.push([x, y]);
  }

  /** Mirrors x across the frame when the preview is mirrored (its own inverse). */
  toScreenX(x) {
    return this.mirrored ? 1 - x : x;
  }

  /** The current script source (from the Script tab). A change restarts the filter. */
  setScript(source) {
    if (source !== this.scriptSource) {
      this.scriptSource = source;
      this.filter = null;
    }
  }

  /** Styles the current camera picture (set captureView from the page) with a style model. */
  startStylize(style) {
    if (this.stylizeBusy || !this.captureView) return -1;
    const view = this.captureView();
    if (!view) return -1;
    // Face points (eyes, nose tip, mouth) in capture pixels, for portrait models. Units are y-up.
    const k = view.width;
    const facePoints = (this.faces ?? []).map((fc) =>
      ["LeftEye", "RightEye", "NoseTip", "Mouth"].map((n) => [fc.anchors[n][0] * k, (this.aspect - fc.anchors[n][1]) * k]));
    this.stylizeBusy = true;
    const id = (this.stylizeCounter = (this.stylizeCounter ?? 0) + 1);
    const script = this.script;
    const status = (text) => { this.popupText = text; this.popupAge = 0; };
    import("./ai.js")
      .then((ai) => ai.stylize(style, view, facePoints, status))
      .then((canvas) => {
        const name = "styled:" + id;
        (this.styled ??= new Map()).set(name, canvas);
        if (this.popupText === "Cartoonizing…" || this.popupText === "Downloading style…") this.popupText = null;
        script?.deliverStylized(id, name, null);
      }, (e) => script?.deliverStylized(id, null, e.message || "Couldn't apply the style"))
      .finally(() => { this.stylizeBusy = false; });
    return id;
  }

  isStickerVisible(i) {
    return this.visible?.[i] ?? true;
  }

  reset(f) {
    this.filter = f;
    this.sounds?.stopAll();
    this.scriptError = null;
    this.script = null;
    this.styled = new Map();
    this.stylizeBusy = false;
    if (f.script && this.scriptSource) {
      try {
        this.script = new ScriptRuntime(this.scriptSource, {
          burst: (art, x, y, count, style, size) => this.burst({ ...scriptArt(art), count, style, size: size / 0.35 }, null, [this.toScreenX(x), y]),
          popup: (text) => { this.popupText = text; this.popupAge = 0; },
          flash: (r, g, b) => { this.flashColor = [r, g, b]; this.flashAlpha = 0.8; },
          log: (msg) => console.log("[lens]", msg),
          stylize: (style) => this.startStylize(style),
          sound: (name, volume, pitch) => this.sounds?.play(name, volume, pitch),
          music: (name, volume) => this.sounds?.playMusic(name, volume),
        });
      } catch (e) {
        this.scriptError = e.message;
      }
    }
    this.visible = f.stickers.map((s) => !s.hidden);
    this.particles = [];
    this.items = [];
    this.lastFired = new Map();
    this.taps = [];
    this.started = false;
    this.score = 0;
    this.showScore = false;
    this.popupText = null;
    this.popupAge = 0;
    this.flashAlpha = 0;
    this.flashColor = [1, 1, 1];
    this.gameState = "Waiting";
    this.lastMs = -1;
    this.prev = { mouth: false, blink: false, smile: false, tilt: 0 };
    this.nails = [];
    this.bullets = [];
    this.nailState = "Waiting";
    this.nailTime = 0;
    this.nailScore = 0;
    this.nailOverTime = 0;
    this.gunX = 0.5;
    this.gunKick = 0;
  }

  /**
   * @param faces faces from measureFace(), converted with toUnits()
   * @param mirror the preview is shown mirrored (selfie)
   */
  update(f, faces, aspect, mirror, timeMs, body = null) {
    if (f !== this.filter) this.reset(f);
    this.faces = faces;
    this.aspect = aspect;
    this.mirrored = mirror;
    const dt = this.lastMs < 0 ? 0 : Math.min(Math.max(timeMs - this.lastMs, 0), 100) / 1000;
    this.lastMs = timeMs;
    const face = faces[0];

    const fired = [];
    if (!this.started) {
      this.started = true;
      this.lastEveryMs = timeMs;
      fired.push(["Start", null]);
    }
    const p = this.prev;
    if (face) {
      if (face.mouthOpen && !p.mouth) fired.push(["MouthOpen", null]);
      if (!face.mouthOpen && p.mouth) fired.push(["MouthClose", null]);
      if (face.eyesClosed && !p.blink) fired.push(["Blink", null]);
      if (face.smiling && !p.smile) fired.push(["Smile", null]);
      const tilt = face.tiltDegrees > TILT_DEGREES ? 1 : face.tiltDegrees < -TILT_DEGREES ? -1 : 0;
      if (tilt === 1 && p.tilt !== 1) fired.push(["TiltLeft", null]);
      if (tilt === -1 && p.tilt !== -1) fired.push(["TiltRight", null]);
      if (face.mouthOpen) fired.push(["WhileMouthOpen", null]);
      if (face.smiling) fired.push(["WhileSmiling", null]);
      Object.assign(p, { mouth: face.mouthOpen, blink: face.eyesClosed, smile: face.smiling, tilt });
    } else {
      Object.assign(p, { mouth: false, blink: false, smile: false, tilt: 0 });
    }
    for (const [tx, ty] of this.taps.splice(0)) {
      const x = mirror ? 1 - tx : tx;
      fired.push(["Tap", [x, (1 - ty) * aspect]]);
      this.script?.tap(this.toScreenX(x), (1 - ty) * aspect);
    }
    if (timeMs - this.lastEveryMs >= 2000) {
      this.lastEveryMs = timeMs;
      fired.push(["EveryTwoSeconds", null]);
    }

    f.rules.forEach((rule, i) => {
      for (const [trigger, point] of fired) {
        if (trigger !== rule.trigger) continue;
        const cooldown = CONTINUOUS_TRIGGERS.has(trigger) ? STREAM_INTERVAL_MS : rule.cooldownMs;
        const last = this.lastFired.get(i);
        if (last === undefined || timeMs - last >= cooldown || trigger === "Tap") {
          this.lastFired.set(i, timeMs);
          rule.actions.forEach((a) => this.run(a, face, point));
        }
      }
    });

    if (this.script) {
      // Scripts work in what-you-see coordinates, so a mirrored preview mirrors the face too.
      const swap = { LeftEye: "RightEye", RightEye: "LeftEye", LeftCheek: "RightCheek", RightCheek: "LeftCheek" };
      const at = (name) => {
        const q = face.anchors[mirror ? swap[name] ?? name : name];
        return { x: this.toScreenX(q[0]), y: q[1] };
      };
      const faceInfo = face && {
        ...at("NoseTip"), width: face.width, tilt: mirror ? -face.tiltDegrees : face.tiltDegrees,
        mouthOpen: face.mouthOpen, smiling: face.smiling, eyesClosed: face.eyesClosed,
        anchors: Object.fromEntries(Object.keys(face.anchors).map((n) => [n, at(n)])),
      };
      // Hands and body as you see them too.
      const flip = ([x, y]) => [this.toScreenX(x), y];
      const bodyInfo = body && {
        hands: body.hands.map((h) => ({ ...h, points: h.points.map(flip) })),
        pose: body.pose && { ...body.pose, points: body.pose.points.map(flip) },
      };
      this.script.update(dt, { left: 0, right: 1, bottom: 0, top: aspect }, faceInfo || null, bodyInfo);
      if (this.script.error && !this.scriptError) {
        this.scriptError = this.script.error;
        this.popupText = "Script error";
        this.popupAge = 0;
      }
    }
    if (f.game?.type === "nails") {
      this.updateNails(f.game, face, dt, fired.some(([t]) => t === f.game.fire));
    } else if (f.game) {
      this.updateGame(f.game, face, dt, fired.some(([t]) => t === "MouthOpen"));
    }
    this.animate(dt);
  }

  run(a, face, point) {
    switch (a.type) {
      case "burst": this.burst(a, face, point); break;
      case "show": this.setVisible(a.index, true); break;
      case "hide": this.setVisible(a.index, false); break;
      case "toggle": this.setVisible(a.index, !this.isStickerVisible(a.index)); break;
      case "score": this.score += a.points; this.showScore = true; break;
      case "popup": this.popupText = a.text; this.popupAge = 0; break;
      case "flash": this.flashColor = a.color; this.flashAlpha = 0.8; break;
    }
  }

  setVisible(i, v) {
    if (i >= 0 && i < this.visible.length) this.visible[i] = v;
  }

  burst(b, face, point) {
    const faceWidth = face?.width ?? 0.35;
    const origin = b.anchor && face ? face.anchors[b.anchor] : point ?? [0.5, this.aspect / 2];
    const size = b.size * faceWidth;
    const art = b.emoji ? { emoji: b.emoji } : b.drawing ? { drawing: b.drawing } : { image: b.image };
    const n = Math.min(Math.max(b.count, 1), 60);
    for (let i = 0; i < n; i++) {
      const spin = rand() * 4 - 2;
      const P = (x, y, vx, vy, s, grow, gravity, life, spinK = 1) =>
        this.particles.push({ art, x, y, vx, vy, size: s, grow, angle: 0, spin: spin * spinK, gravity, life });
      switch (b.style) {
        case "Fountain":
          P(origin[0], origin[1], rand() * 0.5 - 0.25, 0.8 + rand() * 0.5, size, 0, 1.8, 1.8);
          break;
        case "Rain":
          P(rand(), this.aspect + 0.05 + rand() * 0.3, 0, -(0.35 + rand() * 0.35), size, 0, 0.15, 3.5, 0.3);
          break;
        case "Stream": {
          const down = face ? [-face.up[0], -face.up[1]] : [0, 1];
          const spread = rand() * 0.6 - 0.3;
          const dx = down[0] * Math.cos(spread) - down[1] * Math.sin(spread);
          const dy = down[0] * Math.sin(spread) + down[1] * Math.cos(spread);
          const speed = 0.35 + rand() * 0.3;
          P(origin[0], origin[1], dx * speed, dy * speed, size * 0.6, size * 1.4, -0.1, 0.8);
          break;
        }
        default: {
          const a = rand() * Math.PI * 2;
          const speed = 0.25 + rand() * 0.45;
          P(origin[0], origin[1], Math.cos(a) * speed, Math.sin(a) * speed, size, 0, 0.5, 1.3);
        }
      }
    }
    if (this.particles.length > MAX_PARTICLES) this.particles.splice(0, this.particles.length - MAX_PARTICLES);
  }

  updateGame(game, face, dt, mouthOpened) {
    if (this.gameState === "Waiting") {
      if (mouthOpened) this.startGame();
    } else if (this.gameState === "Playing") {
      this.gameTime += dt;
      this.nextSpawn -= dt;
      if (this.nextSpawn <= 0 && game.items.length) {
        this.nextSpawn = 0.55 + rand() * 0.4;
        const progress = Math.min(this.gameTime / game.durationSeconds, 1);
        this.items.push({
          art: game.items[Math.floor(rand() * game.items.length)],
          x: 0.1 + rand() * 0.8,
          y: this.aspect + 0.08,
          speed: 0.28 + progress * 0.3,
          angle: 0,
          spin: rand() * 2 - 1,
        });
      }
      const mouth = face && face.mouthOpen ? face.anchors.Mouth : null;
      const reach = (face?.width ?? 0) * 0.4;
      this.items = this.items.filter((item) => {
        item.y -= item.speed * dt;
        item.angle += item.spin * dt;
        if (mouth && Math.hypot(item.x - mouth[0], item.y - mouth[1]) < reach) {
          this.score++;
          this.burst({ emoji: "✨", count: 8, size: 0.12, style: "Explode" }, face, [item.x, item.y]);
          return false;
        }
        return item.y >= -0.1;
      });
      if (this.gameTime >= game.durationSeconds) {
        this.gameState = "Over";
        this.overTime = 0;
        this.items = [];
        this.popupText = `Score: ${this.score}`;
        this.popupAge = 0;
      }
    } else {
      this.overTime += dt;
      if (this.overTime > 1.5 && mouthOpened) this.startGame();
    }
  }

  // ---- Nail It (port of the app's InteractionEngine.kt) ----
  get visibleLeft() { return 0.5 - VISIBLE_WIDTH / 2; }
  get visibleRight() { return 0.5 + VISIBLE_WIDTH / 2; }
  get visibleBottom() { return this.aspect * (0.5 - VISIBLE_HEIGHT / 2); }
  get visibleTop() { return this.aspect * (0.5 + VISIBLE_HEIGHT / 2); }
  get wallWidth() { return 0.13 * VISIBLE_WIDTH; }
  get nailLength() { return 0.17 * VISIBLE_WIDTH; }
  get gunY() { return this.visibleBottom + 0.42 * this.aspect * VISIBLE_HEIGHT; }

  setUpNails(count) {
    const bottom = this.visibleBottom + 0.54 * this.aspect * VISIBLE_HEIGHT;
    const top = this.visibleTop - 0.13 * this.aspect * VISIBLE_HEIGHT;
    const left = Math.ceil(count / 2), right = Math.floor(count / 2);
    const step = (top - bottom) / Math.max(left, 1);
    this.nails = [];
    for (let i = 0; i < left; i++) this.nails.push({ leftWall: true, y: bottom + step * i, out: 1, hit: false });
    for (let i = 0; i < right; i++) this.nails.push({ leftWall: false, y: bottom + step * i + step / 2, out: 1, hit: false });
  }

  nailSpan(n) {
    const reach = this.nailLength * n.out + 0.02;
    if (n.leftWall) { const wall = this.visibleLeft + this.wallWidth; return [wall, wall + reach]; }
    const wall = this.visibleRight - this.wallWidth;
    return [wall - reach, wall];
  }

  updateNails(game, face, dt, fire) {
    if (!this.nails.length) this.setUpNails(game.nails);
    const lo = this.visibleLeft + this.wallWidth + 0.06, hi = this.visibleRight - this.wallWidth - 0.06;
    const target = Math.min(hi, Math.max(lo, face ? face.anchors.NoseTip[0] : 0.5));
    this.gunX += (target - this.gunX) * Math.min(dt * 14, 1);
    this.gunKick = Math.max(0, this.gunKick - dt * 6);

    if (this.nailState === "Waiting") {
      if (fire) { this.startNails(game); this.shoot(); }
    } else if (this.nailState === "Playing") {
      this.nailTime += dt;
      if (fire) this.shoot();
      this.bullets = this.bullets.filter((b) => {
        const before = b.y;
        b.y += BULLET_SPEED * dt;
        const hit = this.nails.find((n) => {
          const [from, to] = this.nailSpan(n);
          return !n.hit && n.y > before && n.y <= b.y && b.x >= from - 0.012 && b.x <= to + 0.012;
        });
        if (hit) {
          hit.hit = true;
          this.nailScore++;
          const [from, to] = this.nailSpan(hit);
          const headX = hit.leftWall ? to : from;
          this.burst({ emoji: "💥", count: 1, size: 0.5, style: "Explode" }, null, [headX, hit.y]);
          this.burst({ emoji: "✨", count: 6, size: 0.12, style: "Explode" }, null, [headX, hit.y]);
          return false;
        }
        return b.y <= this.visibleTop + 0.1;
      });
      if (this.nailScore >= this.nails.length) {
        this.nailState = "Over";
        this.nailOverTime = 0;
        this.bullets = [];
        this.popupText = "Nailed it! 🔨";
        this.popupAge = 0;
      }
    } else {
      this.nailOverTime += dt;
      if (this.nailOverTime > 2 && fire) this.startNails(game);
    }
    for (const n of this.nails) if (n.hit) n.out = Math.max(0, n.out - dt * 7);
  }

  startNails(game) {
    this.setUpNails(game.nails);
    Object.assign(this, { bullets: [], nailState: "Playing", nailTime: 0, nailScore: 0, popupText: null });
  }

  shoot() {
    if (this.bullets.length >= 3) return;
    this.bullets.push({ x: this.gunX, y: this.gunY + 0.1 });
    this.gunKick = 1;
  }

  drawNailGame(sprite) {
    for (const n of this.nails) {
      const [from, to] = this.nailSpan(n);
      const len = this.nailLength + 0.03;
      const headX = n.leftWall ? to : from;
      sprite({ drawing: "Nail" }, n.leftWall ? headX - len / 2 : headX + len / 2, n.y, len, n.leftWall ? 0 : Math.PI);
    }
    const plankHeight = this.wallWidth * (210 / 160);
    for (let y = this.visibleBottom + plankHeight / 2; y - plankHeight / 2 < this.visibleTop; y += plankHeight) {
      sprite({ drawing: "WoodPlank" }, this.visibleLeft + this.wallWidth / 2, y, this.wallWidth, 0);
      sprite({ drawing: "WoodPlank" }, this.visibleRight - this.wallWidth / 2, y, this.wallWidth, 0);
    }
    for (const n of this.nails.filter((x) => x.out < 0.05)) {
      const headX = n.leftWall ? this.visibleLeft + this.wallWidth + 0.008 : this.visibleRight - this.wallWidth - 0.008;
      sprite({ drawing: "Nail" }, headX, n.y, 0.06, n.leftWall ? 0 : Math.PI);
    }
    for (const b of this.bullets) sprite({ drawing: "Bullet" }, b.x, b.y, 0.03, 0);
    sprite({ drawing: "Pistol" }, this.gunX, this.gunY - this.gunKick * 0.02, 0.13, 0);
  }

  startGame() {
    Object.assign(this, { gameState: "Playing", gameTime: 0, nextSpawn: 0.3, score: 0, items: [] });
  }

  animate(dt) {
    this.particles = this.particles.filter((p) => {
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.size += p.grow * dt;
      p.angle += p.spin * dt;
      p.life -= dt;
      return p.life > 0;
    });
    if (this.popupText !== null) {
      this.popupAge += dt;
      if (this.popupAge > POPUP_SECONDS && this.gameState !== "Over" && this.nailState !== "Over") this.popupText = null;
    }
    this.flashAlpha = Math.max(0, this.flashAlpha - dt * 3);
  }

  /** Draws particles, game items and the HUD onto a 2D canvas (y down). */
  draw(ctx, width, height, assets) {
    const f = this.filter;
    if (!f) return;
    const k = width;
    const Y = (y) => (this.aspect - y) * k; // up-units -> canvas pixels

    const sprite = (art, x, y, w, angle, alpha = 1, flip = false) => {
      const a = art.canvas ? { canvas: art.canvas, aspect: art.canvas.height / art.canvas.width } : artCanvas(art, assets);
      if (!a) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x * k, Y(y));
      ctx.rotate(-angle);
      if (flip) ctx.scale(-1, 1);
      ctx.drawImage(a.canvas, (-w * k) / 2, (-w * k * a.aspect) / 2, w * k, w * k * a.aspect);
      ctx.restore();
    };
    if (f.game?.type === "nails") this.drawNailGame(sprite);
    for (const c of this.script?.commands ?? []) {
      if (c.kind === "sprite") {
        const angle = ((this.mirrored ? -c.angle : c.angle) * Math.PI) / 180;
        // Styled camera pictures are part of the frame, so they mirror with it.
        const styled = c.art.startsWith("styled:");
        const art = styled ? { canvas: this.styled?.get(c.art) } : scriptArt(c.art);
        if (styled && !art.canvas) continue;
        sprite(art, this.toScreenX(c.x), c.y, c.width, angle, Math.min(Math.max(c.alpha, 0), 1), this.mirrored && !styled);
      }
    }
    for (const it of this.items) sprite(it.art, it.x, it.y, 0.16, it.angle);
    for (const p of this.particles) sprite(p.art, p.x, p.y, p.size, p.angle, Math.min(p.life / 0.35, 1));

    const text = (s, x, y, h, alpha = 1) => {
      const t = textCanvas(s);
      const w = Math.min(h / t.aspect, 0.9 * k);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, y);
      if (this.mirrored) ctx.scale(-1, 1); // pre-mirror so it reads right in the mirrored preview
      ctx.drawImage(t.canvas, -w / 2, (-w * t.aspect) / 2, w, w * t.aspect);
      ctx.restore();
    };

    for (const c of this.script?.commands ?? []) {
      if (c.kind === "text") text(c.text, this.toScreenX(c.x) * k, Y(c.y), c.height * k, Math.min(Math.max(c.alpha, 0), 1));
    }

    const hudY = 0.12 * k;
    if (f.game?.type === "nails") {
      const action = { MouthOpen: "Open your mouth", Tap: "Tap", Blink: "Blink" }[f.game.fire];
      if (this.nailState === "Waiting") {
        text(`0/${f.game.nails}`, k / 2, hudY, 0.11 * k);
        text(`${action} to shoot!`, k / 2, hudY + 0.12 * k, 0.06 * k);
      } else if (this.nailState === "Playing") {
        text(`${this.nailScore}/${this.nails.length}`, k / 2, hudY, 0.11 * k);
      } else {
        text(`${this.nailTime.toFixed(1)}s`, k / 2, hudY, 0.09 * k);
        if (this.nailOverTime > 2) text(`${action} to play again`, k / 2, hudY + 0.11 * k, 0.055 * k);
      }
    } else if (f.game) {
      if (this.gameState === "Waiting") text("Open your mouth to play!", k / 2, hudY, 0.07 * k);
      else if (this.gameState === "Playing") {
        const left = Math.max(0, Math.floor(f.game.durationSeconds - this.gameTime));
        const icon = f.game.items[0]?.emoji ?? "⭐";
        text(`${icon} ${this.score}    ⏱ ${left}`, k / 2, hudY, 0.08 * k);
      } else if (this.overTime > 1.5) text("Open your mouth to play again", k / 2, hudY, 0.06 * k);
    } else if (this.showScore) {
      text(`⭐ ${this.score}`, k / 2, hudY, 0.08 * k);
    }

    if (this.popupText !== null) {
      const pop = 1 + 0.35 * (1 - Math.min(this.popupAge / 0.15, 1));
      const fade = this.gameState === "Over" || this.nailState === "Over" ? 1 : Math.min(Math.max((POPUP_SECONDS - this.popupAge) / 0.4, 0), 1);
      text(this.popupText, k / 2, height / 2, 0.13 * k * pop, fade);
    }

    if (this.flashAlpha > 0) {
      const [r, g, b] = this.flashColor.map((v) => Math.round(v * 255));
      ctx.fillStyle = `rgba(${r},${g},${b},${this.flashAlpha})`;
      ctx.fillRect(0, 0, width, height);
    }
  }
}

/** Converts a measured face (pixels, y down) to engine units (width units, y up). */
export function toUnits(face, width, height) {
  const k = 1 / width;
  const aspect = height / width;
  const conv = (p) => [p[0] * k, aspect - p[1] * k];
  return {
    ...face,
    anchors: Object.fromEntries(Object.entries(face.anchors).map(([n, p]) => [n, conv(p)])),
    up: [face.up[0], -face.up[1]],
    width: face.width * k,
  };
}
