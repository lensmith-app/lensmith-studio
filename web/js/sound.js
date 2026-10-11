// Filter sounds for the Studio preview (Web Audio) — mirrors the app's SoundEngine.
// Built-in sounds live in web/sounds/<name>.ogg (music: music-<name>.ogg).

export const BUILT_IN = [
  "pop", "chomp", "coin", "jump", "boom", "swish", "whoosh", "click", "ding", "buzz",
  "win", "lose", "laser", "bounce", "splash", "tick", "kick", "snare", "hihat", "sparkle",
  "shutter", "whip", "powerup",
];
export const BUILT_IN_MUSIC = ["arcade", "chill", "beat"];
export const DEFAULT_MUSIC_VOLUME = 0.6;

const base = new URL("../sounds/", import.meta.url);

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.buffers = new Map();   // url -> Promise<AudioBuffer|null>
    this.music = null;          // { url, source, gain }
    this.enabled = true;
    /** "assets/x.ogg" -> Blob, set by the page. */
    this.assets = new Map();
    this.assetUrls = new Map();
  }

  /** Browsers only allow sound after a click or key press: call from one. */
  unlock() {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === "suspended") this.ctx.resume();
  }

  /** A script's sound name as a URL, or null. */
  url(name, music) {
    if (name.startsWith("assets/")) {
      const blob = this.assets.get(name);
      if (!blob) return null;
      if (!this.assetUrls.has(name)) this.assetUrls.set(name, URL.createObjectURL(blob));
      return this.assetUrls.get(name);
    }
    if (music) return BUILT_IN_MUSIC.includes(name) ? new URL(`music-${name}.ogg`, base).href : null;
    return BUILT_IN.includes(name) ? new URL(`${name}.ogg`, base).href : null;
  }

  load(url) {
    if (!this.buffers.has(url)) {
      this.unlock();
      this.buffers.set(url, fetch(url).then((r) => r.arrayBuffer()).then((b) => this.ctx.decodeAudioData(b)).catch((e) => {
        console.warn("[lens] couldn't load sound", url, e);
        return null;
      }));
    }
    return this.buffers.get(url);
  }

  play(name, volume = 1, pitch = 1) {
    const url = this.url(String(name), false);
    if (!url || !this.enabled) return;
    const asked = performance.now();
    this.load(url).then((buffer) => {
      if (!buffer || !this.ctx || performance.now() - asked > 400) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = Math.min(2, Math.max(0.5, +pitch || 1));
      const gain = this.ctx.createGain();
      gain.gain.value = Math.min(1, Math.max(0, +volume));
      src.connect(gain).connect(this.ctx.destination);
      src.start();
    });
  }

  playMusic(name, volume = DEFAULT_MUSIC_VOLUME) {
    const url = name == null ? null : this.url(String(name), true);
    if (name != null && !url) return;
    const v = Math.min(1, Math.max(0, +volume));
    if (url && this.music?.url === url) {
      this.music.volume = v;
      if (this.music.gain) this.music.gain.gain.value = v;
      return;
    }
    this.stopMusic();
    if (!url || !this.enabled) return;
    const entry = { url, source: null, gain: null, volume: v };
    this.music = entry;
    this.load(url).then((buffer) => {
      if (!buffer || this.music !== entry) return;
      entry.source = this.ctx.createBufferSource();
      entry.source.buffer = buffer;
      entry.source.loop = true;
      entry.gain = this.ctx.createGain();
      entry.gain.gain.value = entry.volume;
      entry.source.connect(entry.gain).connect(this.ctx.destination);
      entry.source.start();
    });
  }

  stopMusic() {
    try { this.music?.source?.stop(); } catch { /* not started */ }
    this.music = null;
  }

  stopAll() { this.stopMusic(); }
}
