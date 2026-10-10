// Interactive filters: a port of the app's InteractionEngine.kt.
// Works in "screen width" units: x 0..1 across, y 0..aspect pointing UP (like the app).

import { artCanvas, textCanvas } from "./art.js";
import { CONTINUOUS_TRIGGERS } from "./model.js";

const TILT_DEGREES = 18;
const STREAM_INTERVAL_MS = 60;
const MAX_PARTICLES = 220;
const POPUP_SECONDS = 1.3;
const rand = Math.random;

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

  isStickerVisible(i) {
    return this.visible?.[i] ?? true;
  }

  reset(f) {
    this.filter = f;
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
  }

  /**
   * @param faces faces from measureFace(), converted with toUnits()
   * @param mirror the preview is shown mirrored (selfie)
   */
  update(f, faces, aspect, mirror, timeMs) {
    if (f !== this.filter) this.reset(f);
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

    if (f.game) this.updateGame(f.game, face, dt, fired.some(([t]) => t === "MouthOpen"));
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
      if (this.popupAge > POPUP_SECONDS && this.gameState !== "Over") this.popupText = null;
    }
    this.flashAlpha = Math.max(0, this.flashAlpha - dt * 3);
  }

  /** Draws particles, game items and the HUD onto a 2D canvas (y down). */
  draw(ctx, width, height, assets) {
    const f = this.filter;
    if (!f) return;
    const k = width;
    const Y = (y) => (this.aspect - y) * k; // up-units -> canvas pixels

    const sprite = (art, x, y, w, angle, alpha = 1) => {
      const a = artCanvas(art, assets);
      if (!a) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x * k, Y(y));
      ctx.rotate(-angle);
      ctx.drawImage(a.canvas, (-w * k) / 2, (-w * k * a.aspect) / 2, w * k, w * k * a.aspect);
      ctx.restore();
    };
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

    const hudY = 0.12 * k;
    if (f.game) {
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
      const fade = this.gameState === "Over" ? 1 : Math.min(Math.max((POPUP_SECONDS - this.popupAge) / 0.4, 0), 1);
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
