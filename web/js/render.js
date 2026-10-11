// WebGL renderer: the same filter shader the Android app uses (ported from FilterProgram.kt),
// so the Studio preview matches the phone.

const VERTEX = `
attribute vec2 aPosition;
attribute vec2 aTexCoord;
uniform mat4 uOutToView;
varying vec2 vUv;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
  vUv = (uOutToView * vec4(aTexCoord, 0.0, 1.0)).xy;
}`;

const FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform mat4 uTexMatrix;
uniform vec2 uResolution;
uniform float uTime;
uniform float uBrightness;
uniform float uContrast;
uniform float uSaturation;
uniform float uWarmth;
uniform float uTint;
uniform float uFade;
uniform float uVignette;
uniform float uGrain;
uniform vec3 uColorize;
uniform float uColorizeAmount;
uniform int uEffect;
uniform float uEffectParam;
uniform vec4 uWarps[8];
uniform int uWarpCount;
uniform sampler2D uMask;
uniform mat4 uMaskMatrix;
uniform int uBgMode;
uniform vec3 uBgTop;
uniform vec3 uBgBottom;
uniform sampler2D uBgImage;
uniform mat4 uBgMatrix;

vec3 cam(vec2 uv) {
    return texture2D(uTex, (uTexMatrix * vec4(uv, 0.0, 1.0)).xy).rgb;
}
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }

vec3 heat(float t) {
    vec3 c1 = vec3(0.0, 0.0, 0.5);
    vec3 c2 = vec3(0.0, 0.8, 1.0);
    vec3 c3 = vec3(1.0, 1.0, 0.0);
    vec3 c4 = vec3(1.0, 0.0, 0.0);
    if (t < 0.33) return mix(c1, c2, t / 0.33);
    if (t < 0.66) return mix(c2, c3, (t - 0.33) / 0.33);
    return mix(c3, c4, (t - 0.66) / 0.34);
}

// Bulge or pinch the image around face points (big eyes etc).
vec2 warp(vec2 uv) {
    vec2 aspect = vec2(1.0, uResolution.y / uResolution.x);
    for (int i = 0; i < 8; i++) {
        if (i >= uWarpCount) break;
        vec4 w = uWarps[i];
        vec2 d = (uv - w.xy) * aspect;
        float dist = length(d);
        if (dist < w.z) {
            // Flat in the middle, easing out to the edge: the whole eye scales evenly.
            float f = 1.0 - (dist * dist) / (w.z * w.z);
            uv = w.xy + (d * (1.0 - w.w * f)) / aspect;
        }
    }
    return uv;
}

// Soft background blur: 32 samples on a golden-angle spiral.
vec3 blurred(vec2 uv) {
    vec2 aspect = vec2(1.0, uResolution.x / uResolution.y);
    vec3 sum = vec3(0.0);
    for (int i = 0; i < 32; i++) {
        float fi = float(i) + 0.5;
        float a = fi * 2.39996;
        vec2 offset = vec2(cos(a), sin(a)) * sqrt(fi / 32.0) * 0.035;
        sum += cam(uv + offset * aspect);
    }
    return sum / 32.0;
}

vec3 galaxy(vec2 uv) {
    vec3 c = mix(vec3(0.02, 0.0, 0.08), vec3(0.12, 0.02, 0.25), uv.y);
    float n = sin(uv.x * 6.0 + uTime * 0.3) * sin(uv.y * 5.0 - uTime * 0.2);
    c += vec3(0.35, 0.1, 0.5) * smoothstep(0.2, 1.0, n) * 0.6;
    vec2 cell = floor(uv * uResolution / 4.0);
    float star = step(0.996, rand(cell));
    c += star * (0.6 + 0.4 * sin(uTime * 3.0 + rand(cell + 1.0) * 6.28));
    return c;
}

// Toon: edge-preserving smoothing, soft cel shading and ink lines (animated-movie look).
vec3 toon(vec2 uv) {
    vec2 aspect = vec2(1.0, uResolution.x / uResolution.y);
    vec3 center = cam(uv);
    vec3 sum = center;
    float wsum = 1.0;
    for (int i = 0; i < 24; i++) {
        float fi = float(i) + 0.5;
        float a = fi * 2.39996;
        vec3 s = cam(uv + vec2(cos(a), sin(a)) * sqrt(fi / 24.0) * 0.014 * aspect);
        vec3 diff = s - center;
        float w = exp(-dot(diff, diff) * 30.0);
        sum += s * w;
        wsum += w;
    }
    vec3 c = sum / wsum;
    vec2 px = 2.0 / uResolution;
    float gx = luma(cam(uv + vec2(px.x, 0.0))) - luma(cam(uv - vec2(px.x, 0.0)));
    float gy = luma(cam(uv + vec2(0.0, px.y))) - luma(cam(uv - vec2(0.0, px.y)));
    float edge = smoothstep(0.10, 0.30, length(vec2(gx, gy)));
    float l = luma(c);
    float q = floor(l * 6.0 + 0.5) / 6.0;
    c *= mix(1.0, (q + 0.03) / (l + 0.03), 0.45);
    c = mix(vec3(luma(c)), c, 1.3) * 1.06 + 0.03;
    return mix(c, c * 0.3, edge * 0.55);
}

// VHS: wobbling lines, colour bleed and scanlines.
vec3 vhs(vec2 uv) {
    float p = uEffectParam;
    float line = floor(uv.y * uResolution.y / 3.0);
    uv.x += (rand(vec2(line, floor(uTime * 24.0))) - 0.5) * 0.004 * p + sin(uv.y * 30.0 + uTime * 2.0) * 0.0015 * p;
    vec3 c = vec3(cam(uv + vec2(0.005 * p, 0.0)).r, cam(uv).g, cam(uv - vec2(0.005 * p, 0.0)).b);
    c *= 0.88 + 0.12 * sin(uv.y * uResolution.y * 1.2);
    return mix(c, vec3(luma(c)), 0.12);
}

void main() {
    vec2 uv = warp(vUv);

    if (uEffect == 1) {               // Mirror
        if (uv.x > 0.5) uv.x = 1.0 - uv.x;
    } else if (uEffect == 2) {        // Pixelate
        vec2 cells = vec2(uEffectParam, uEffectParam * uResolution.y / uResolution.x);
        uv = (floor(uv * cells) + 0.5) / cells;
    }

    vec3 c;
    if (uEffect == 3) {               // Sketch (edge detection)
        vec2 px = 1.5 / uResolution;
        float tl = luma(cam(uv + vec2(-px.x,  px.y)));
        float t  = luma(cam(uv + vec2( 0.0,   px.y)));
        float tr = luma(cam(uv + vec2( px.x,  px.y)));
        float l  = luma(cam(uv + vec2(-px.x,  0.0)));
        float r  = luma(cam(uv + vec2( px.x,  0.0)));
        float bl = luma(cam(uv + vec2(-px.x, -px.y)));
        float b  = luma(cam(uv + vec2( 0.0,  -px.y)));
        float br = luma(cam(uv + vec2( px.x, -px.y)));
        float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
        float gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
        float edge = length(vec2(gx, gy));
        c = vec3(1.0 - smoothstep(0.08, 0.35, edge));
    } else if (uEffect == 8) {        // Toon
        c = mix(cam(uv), toon(uv), uEffectParam);
    } else if (uEffect == 9) {        // VHS
        c = vhs(uv);
    } else if (uEffect == 7) {        // RGB split / glitch
        float o = uEffectParam * (1.0 + 0.5 * sin(uTime * 3.0));
        c = vec3(cam(uv + vec2(o, 0.0)).r, cam(uv).g, cam(uv - vec2(o, 0.0)).b);
    } else {
        c = cam(uv);
    }

    if (uEffect == 4) c = heat(luma(c));                                    // Thermal
    if (uEffect == 5) c = floor(c * uEffectParam + 0.5) / uEffectParam;     // Posterize
    if (uEffect == 6) c = 1.0 - c;                                          // Invert

    // Background effects: the mask says how much of each pixel is the person.
    if (uBgMode > 0) {
        vec2 m = (uMaskMatrix * vec4(vUv, 0.0, 1.0)).xy;
        float person = smoothstep(0.35, 0.75, texture2D(uMask, vec2(m.x, 1.0 - m.y)).r);
        vec3 bg;
        if (uBgMode == 1) bg = blurred(uv);
        else if (uBgMode == 2) bg = vec3(luma(c));
        else if (uBgMode == 3) bg = mix(uBgBottom, uBgTop, vUv.y);
        else if (uBgMode == 5) {
            vec2 p = (uBgMatrix * vec4(vUv, 0.0, 1.0)).xy;
            bool inside = p.x >= 0.0 && p.x <= 1.0 && p.y >= 0.0 && p.y <= 1.0;
            bg = inside ? texture2D(uBgImage, p).rgb : vec3(0.0);
        }
        else bg = galaxy(vUv);
        c = mix(bg, c, person);
    }

    // Colour adjustments
    c += uBrightness;
    c = (c - 0.5) * uContrast + 0.5;
    c = mix(vec3(luma(c)), c, uSaturation);
    c.r += uWarmth * 0.12;
    c.b -= uWarmth * 0.12;
    c.g -= uTint * 0.08;
    c = mix(c, uColorize * luma(c) * 1.15, uColorizeAmount);
    c = mix(c, c * 0.8 + 0.18, uFade);

    float d = distance(vUv, vec2(0.5));
    c *= 1.0 - uVignette * smoothstep(0.3, 0.85, d);

    c += (rand(vUv * uResolution + fract(uTime)) - 0.5) * uGrain * 0.25;

    gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;

const EFFECT_IDS = { None: 0, Mirror: 1, Pixelate: 2, Sketch: 3, Thermal: 4, Posterize: 5, Invert: 6, RgbSplit: 7, Toon: 8, Vhs: 9 };
const BACKGROUND_IDS = { None: 0, Blur: 1, ColorPop: 2, Gradient: 3, Galaxy: 4, Image: 5 };
const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl", { premultipliedAlpha: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error("This browser doesn't support WebGL.");
    this.gl = gl;
    this.program = link(gl, VERTEX, FRAGMENT);
    gl.useProgram(this.program);
    const locations = {};
    const n = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const name = gl.getActiveUniform(this.program, i).name;
      locations[name.replace("[0]", "")] = gl.getUniformLocation(this.program, name);
    }
    // Uniforms the compiler optimised away are simply skipped (null location).
    this.u = new Proxy(locations, { get: (m, k) => m[k] ?? null });

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 0, 0, 1, -1, 1, 0, -1, 1, 0, 1, 1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(this.program, "aPosition");
    const aTex = gl.getAttribLocation(this.program, "aTexCoord");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(aTex);
    gl.vertexAttribPointer(aTex, 2, gl.FLOAT, false, 16, 8);

    this.camTex = texture(gl);
    this.maskTex = texture(gl);
    this.bgTex = texture(gl);
    this.bgImage = null;
    this.maskVersion = -1;
  }

  /**
   * Draws one frame.
   * @param source   video / canvas / image with the camera picture
   * @param crop     {texMatrix} mapping view uv -> source uv
   * @param filter   the filter (model.js)
   * @param face     {warps: Float32Array(32), warpCount, mask, maskVersion, bgImage, bgMatrix}
   */
  draw(source, crop, filter, face, timeSeconds) {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.camTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.uniform1i(this.u.uTex, 0);

    // Person mask (rows top-first, as the shader expects).
    const hasMask = !!face.mask && filter.background !== "None";
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    if (hasMask && face.maskVersion !== this.maskVersion) {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, face.mask.width, face.mask.height, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, face.mask.data);
      this.maskVersion = face.maskVersion;
    }
    gl.uniform1i(this.u.uMask, 1);
    gl.uniformMatrix4fv(this.u.uMaskMatrix, false, crop.texMatrix);

    // Green screen photo (rows top-first).
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.bgTex);
    if (face.bgImage && face.bgImage !== this.bgImage) {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, face.bgImage);
      this.bgImage = face.bgImage;
    }
    gl.uniform1i(this.u.uBgImage, 2);
    gl.uniformMatrix4fv(this.u.uBgMatrix, false, face.bgMatrix);

    let bgMode = hasMask ? BACKGROUND_IDS[filter.background] ?? 0 : 0;
    if (bgMode === 5 && !face.bgImage) bgMode = 3; // green screen without a photo yet: gradient
    gl.uniform1i(this.u.uBgMode, bgMode);
    gl.uniform3fv(this.u.uBgTop, filter.backgroundTop);
    gl.uniform3fv(this.u.uBgBottom, filter.backgroundBottom);

    gl.uniformMatrix4fv(this.u.uOutToView, false, IDENTITY);
    gl.uniformMatrix4fv(this.u.uTexMatrix, false, crop.texMatrix);
    gl.uniform2f(this.u.uResolution, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.u.uTime, timeSeconds);
    for (const k of ["brightness", "contrast", "saturation", "warmth", "tint", "fade", "vignette", "grain", "colorizeAmount", "effectParam"]) {
      gl.uniform1f(this.u["u" + k[0].toUpperCase() + k.slice(1)], filter[k]);
    }
    gl.uniform3fv(this.u.uColorize, filter.colorize);
    gl.uniform1i(this.u.uEffect, EFFECT_IDS[filter.effect] ?? 0);
    gl.uniform4fv(this.u.uWarps, face.warps);
    gl.uniform1i(this.u.uWarpCount, face.warpCount);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}

function texture(gl) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
  return t;
}

function link(gl, vs, fs) {
  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}

/** Column-major 4x4 for a 2D affine map: x' = a*x + c*y + e, y' = b*x + d*y + f. */
export function affine(a, b, c, d, e, f) {
  return new Float32Array([a, b, 0, 0, c, d, 0, 0, 0, 0, 1, 0, e, f, 0, 1]);
}
