// 3D models on the head for the Studio preview (three.js) — mirrors the app's ModelProgram.kt.
// Models are placed in MediaPipe's face space (centimetres, origin at the top of the nose, x across
// the picture, y up, z out of the face) using each face's transformation matrix.

import * as THREE from "three";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";
import { FACE_EXTRA, FACE_EXTRA_ALPHA, FACE_TRIANGLES, FACE_UV } from "./facemesh.js";

// Face paint shading, as in the app's FaceMeshProgram: the skin under each pixel divided by the
// face's usual brightness (measured at the cheeks, forehead and nose bridge) lights the paint.
const SHADING = 0.85;
const REF_POINTS = [50, 280, 151, 6];
const MESH_VERTICES = 468 + FACE_EXTRA.length / 3;
const PAINT_VERTEX = `
  uniform vec2 uCrop;
  attribute float alpha;
  varying vec2 vUv;
  varying vec2 vSkin;
  varying float vAlpha;
  varying float vExt;
  void main() {
    vUv = uv;
    vAlpha = alpha;
    vExt = alpha < 1.0 ? 1.0 : 0.0; // the forehead/chin extension (it fades out)
    vSkin = 0.5 + position.xy * uCrop * 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }`;
const PAINT_FRAGMENT = `
  uniform sampler2D uTex;
  uniform sampler2D uSkin;
  uniform vec2 uCrop;
  uniform vec2 uRef[4];
  uniform float uSkinOn;
  uniform sampler2D uFaceSkin;
  uniform float uMaskOn;
  uniform float uShade;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec2 vSkin;
  varying float vAlpha;
  varying float vExt;
  float lum(vec2 p) { return dot(texture2D(uSkin, p).rgb, vec3(0.299, 0.587, 0.114)); }
  void main() {
    vec4 c = texture2D(uTex, vUv);
    vec3 rgb = c.rgb;
    if (uSkinOn > 0.5) {
      float usual = 0.0;
      for (int i = 0; i < 4; i++) {
        vec2 p = 0.5 + uRef[i] * uCrop * 0.5;
        usual += lum(p) + lum(p + vec2(0.006, 0.0)) + lum(p - vec2(0.006, 0.0))
          + lum(p + vec2(0.0, 0.006)) + lum(p - vec2(0.0, 0.006));
      }
      usual /= 20.0;
      float light = lum(vSkin) / max(usual, 0.05);
      rgb *= mix(1.0, clamp(light, 0.3, 1.6), uShade);
      // Without the skin mask: on the extension, much darker than the face usually means hair.
      if (uMaskOn < 0.5) c.a *= mix(1.0, smoothstep(0.35, 0.65, light), vExt);
    }
    // Face skin only (as in the app): hair, hands and things in front of the face stay clean.
    if (uMaskOn > 0.5) c.a *= smoothstep(0.15, 0.55, texture2D(uFaceSkin, vec2(vSkin.x, 1.0 - vSkin.y)).r);
    float a = c.a * uOpacity * vAlpha;
    gl_FragColor = vec4(rgb * a, a);
  }`;

// The head, roughly (same as the app): hides whatever of a model is behind it.
const HEAD = { y: 2.5, z: -6.5, rx: 7.8, ry: 12.5, rz: 9.5, roundness: 0.6 };

export class FaceModels {
  /**
   * [canvas] is the WebGL canvas for models; face paint is copied onto [paintCanvas] (a 2D canvas
   * under it), which blends with the picture through CSS mix-blend-mode the way the app's
   * FaceMeshProgram blends with the camera (a transparent WebGL canvas has nothing to multiply).
   */
  constructor(canvas, paintCanvas) {
    this.canvas = canvas;
    this.paintCanvas = paintCanvas;
    this.paintCtx = paintCanvas.getContext("2d");
    this.paintBlend = "normal";
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(63, 1, 1, 10000);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 1.3));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(0.3, 0.6, 0.75);
    this.scene.add(key);
    this.loader = new GLTFLoader();
    this.cache = new WeakMap();  // asset Blob -> Promise<THREE.Object3D|null> (a replaced file reloads)
    this.heads = [];             // one group per face
    this.occluderMaterial = new THREE.MeshBasicMaterial({ colorWrite: false });
    this.cleared = true;
    // Face paint: the face mesh drawn straight in clip space (positions come from the landmarks).
    this.renderer.autoClear = false;
    this.paintScene = new THREE.Scene();
    this.paintCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
    this.paintMeshes = [];
    this.paintTextures = new WeakMap(); // Blob -> THREE.Texture
  }

  /** The face-paint picture for [paint] (a Blob in assets, or the Studio's own builtin:name.png). */
  paintTexture(paint, assets) {
    const blob = assets.get(paint.image);
    const key = blob ?? paint.image;
    if (typeof key === "string") {
      this.builtinPaint ??= new Map();
      if (!this.builtinPaint.has(key)) {
        const tex = new THREE.TextureLoader().load(`facepaint/${key.replace(/^builtin:/, "")}`);
        tex.flipY = false; // the mesh's uv has v pointing down, like the picture
        this.builtinPaint.set(key, tex);
      }
      return this.builtinPaint.get(key);
    }
    if (!this.paintTextures.has(key)) {
      const tex = new THREE.Texture();
      tex.flipY = false; // the mesh's uv has v pointing down, like the picture
      createImageBitmap(key).then((bmp) => { tex.image = bmp; tex.needsUpdate = true; });
      this.paintTextures.set(key, tex);
    }
    return this.paintTextures.get(key);
  }

  /**
   * Builds the paint meshes for [paintFaces] (each: Float32Array of 468 x/y clip positions).
   * [source] is the camera picture and [sx]/[sy] the part of it the view shows, for shading.
   */
  preparePaint(paintFaces, paint, assets, source, sx, sy, skinMask) {
    this.paintMeshes.forEach((m) => m.visible = false);
    if (!paint || !paintFaces.length) return false;
    const tex = this.paintTexture(paint, assets);
    const blend = paint.blend ?? "Normal";
    if (source) {
      if (!this.skin || this.skin.image !== source) {
        this.skin?.dispose();
        this.skin = new THREE.Texture(source);
        this.skin.minFilter = this.skin.magFilter = THREE.LinearFilter;
        this.skin.generateMipmaps = false;
      }
      this.skin.needsUpdate = true;
    }
    if (skinMask) {
      const t = this.faceSkin;
      if (!t || t.image.width !== skinMask.width || t.image.height !== skinMask.height) {
        t?.dispose();
        this.faceSkin = new THREE.DataTexture(skinMask.data, skinMask.width, skinMask.height, THREE.RedFormat, THREE.UnsignedByteType);
        this.faceSkin.minFilter = this.faceSkin.magFilter = THREE.LinearFilter;
      } else {
        t.image.data = skinMask.data;
      }
      this.faceSkin.needsUpdate = true;
    }
    paintFaces.forEach((pos, i) => {
      let mesh = this.paintMeshes[i];
      if (!mesh) {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MESH_VERTICES * 3), 3));
        g.setAttribute("uv", new THREE.BufferAttribute(Float32Array.from(FACE_UV), 2));
        g.setAttribute("alpha", new THREE.BufferAttribute(Float32Array.from([...new Array(468).fill(1), ...FACE_EXTRA_ALPHA]), 1));
        g.setIndex(FACE_TRIANGLES);
        mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
          uniforms: {
            uTex: { value: null }, uSkin: { value: null }, uCrop: { value: new THREE.Vector2(1, 1) },
            uRef: { value: [0, 1, 2, 3].map(() => new THREE.Vector2()) }, uShade: { value: 0 }, uSkinOn: { value: 0 }, uFaceSkin: { value: null }, uMaskOn: { value: 0 }, uOpacity: { value: 1 },
          },
          vertexShader: PAINT_VERTEX,
          fragmentShader: PAINT_FRAGMENT,
          transparent: true, depthTest: false, depthWrite: false,
          blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
        }));
        mesh.frustumCulled = false;
        this.paintScene.add(mesh);
        this.paintMeshes.push(mesh);
      }
      const attr = mesh.geometry.attributes.position;
      for (let k = 0; k < 468; k++) attr.setXYZ(k, pos[k * 2], pos[k * 2 + 1], 0);
      // Up the forehead and under the chin: carried on outwards from the tracked outline (as in the app).
      for (let k = 0; k < FACE_EXTRA.length / 3; k++) {
        const o = FACE_EXTRA[k * 3], r = FACE_EXTRA[k * 3 + 1], e = FACE_EXTRA[k * 3 + 2];
        attr.setXYZ(468 + k, pos[o * 2] + (pos[o * 2] - pos[r * 2]) * e, pos[o * 2 + 1] + (pos[o * 2 + 1] - pos[r * 2 + 1]) * e, 0);
      }
      attr.needsUpdate = true;
      const u = mesh.material.uniforms;
      u.uTex.value = tex;
      u.uOpacity.value = paint.opacity ?? 1;
      // Same as the app: Normal and Screen paint take on the skin's light and texture (Multiply
      // already keeps it). uRef: where the face's usual brightness is measured.
      u.uShade.value = source && blend !== "Multiply" ? SHADING : 0;
      u.uSkin.value = this.skin ?? null;
      u.uSkinOn.value = source ? 1 : 0;
      u.uFaceSkin.value = skinMask ? this.faceSkin : null;
      u.uMaskOn.value = skinMask ? 1 : 0;
      u.uCrop.value.set(sx ?? 1, sy ?? 1);
      REF_POINTS.forEach((p, k) => u.uRef.value[k].set(pos[p * 2], pos[p * 2 + 1]));
      mesh.visible = true;
    });
    // Multiply / Screen happen when the paint canvas is composited (see the constructor).
    this.paintBlend = { Multiply: "multiply", Screen: "screen" }[blend] ?? "normal";
    return true;
  }

  /** Loads "assets/x.glb" from [assets] (path -> Blob). */
  model(path, assets) {
    const blob = assets.get(path);
    if (!blob) return Promise.resolve(null);
    if (!this.cache.has(blob)) {
      this.cache.set(blob, blob.arrayBuffer()
        .then((buf) => new Promise((ok, fail) => this.loader.parse(buf, "", ok, fail)))
        .then((gltf) => {
          const root = gltf.scene;
          // Centre on the bounding box and scale the largest side to 1 (size sets centimetres).
          const box = new THREE.Box3().setFromObject(root);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          const wrap = new THREE.Group();
          root.position.sub(center);
          wrap.add(root);
          wrap.userData.unit = 1 / Math.max(size.x, size.y, size.z, 1e-6);
          return wrap;
        })
        .catch((e) => { console.warn("[3D] couldn't load", path, e); return null; }));
    }
    return this.cache.get(blob);
  }

  /** Forget models (e.g. after a new file is opened). */
  reset() {
    this.cache = new WeakMap();
    this.heads.forEach((h) => this.scene.remove(h));
    this.heads = [];
  }

  /**
   * Draws [filter]'s models on [faces] (each with a .pose matrix). [sx]/[sy] are the fractions of
   * the source the view shows (a centred crop); [aspect] = source width / height.
   */
  render(faces, filter, assets, W, H, sx, sy, aspect, paintFaces = [], source = null, skinMask = null) {
    const models = filter.models ?? [];
    if (this.canvas.width !== W || this.canvas.height !== H) this.renderer.setSize(W, H, false);
    const posed = faces.filter((f) => f.pose);
    const painted = this.preparePaint(paintFaces, filter.facePaint, assets, source, sx, sy, skinMask);
    if (this.paintCanvas.width !== W || this.paintCanvas.height !== H) Object.assign(this.paintCanvas, { width: W, height: H });
    this.paintCtx.clearRect(0, 0, W, H);
    if (painted) {
      this.renderer.clear();
      this.renderer.render(this.paintScene, this.paintCamera);
      this.paintCtx.drawImage(this.canvas, 0, 0);
      this.paintCanvas.style.mixBlendMode = this.paintBlend;
      this.cleared = false;
    }
    if (!models.length || !posed.length) {
      if (!this.cleared) { this.renderer.clear(); this.cleared = true; }
      return;
    }
    this.renderer.clear();
    this.cleared = false;
    // MediaPipe's camera for the whole source, cropped to the view.
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.camera.projectionMatrix.premultiply(new THREE.Matrix4().makeScale(1 / sx, 1 / sy, 1));
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();

    while (this.heads.length < posed.length) {
      const g = new THREE.Group();
      g.matrixAutoUpdate = false;
      // A "superellipsoid" (same as the app): stays wide near the top like a real head with hair.
      const shape = new THREE.SphereGeometry(1, 20, 14);
      const pos = shape.attributes.position;
      for (let i = 0; i < pos.count; i++) for (let c = 0; c < 3; c++) {
        const v = pos.getComponent(i, c);
        pos.setComponent(i, c, Math.sign(v) * Math.pow(Math.abs(v), HEAD.roundness));
      }
      const occluder = new THREE.Mesh(shape, this.occluderMaterial);
      occluder.position.set(0, HEAD.y, HEAD.z);
      occluder.scale.set(HEAD.rx, HEAD.ry, HEAD.rz);
      occluder.renderOrder = -1;
      occluder.name = "occluder";
      g.add(occluder);
      this.scene.add(g);
      this.heads.push(g);
    }
    this.heads.forEach((g, i) => {
      const face = posed[i];
      g.visible = !!face;
      if (!face) return;
      g.matrix.fromArray(face.pose);
      g.matrixWorldNeedsUpdate = true;
      g.getObjectByName("occluder").visible = filter.occludeHead !== false;
      // Put this filter's models on the head (one copy per face).
      const key = JSON.stringify(models) + models.map((m) => assets.get(m.file)?.size ?? 0).join(",");
      if (g.userData.key !== key) {
        g.userData.key = key;
        g.children.filter((c) => c.name !== "occluder").forEach((c) => g.remove(c));
        models.forEach((m) => this.model(m.file, assets).then((proto) => {
          if (!proto || g.userData.key !== key) return;
          const obj = proto.clone();
          const [px, py, pz] = m.position ?? [0, 0, 0];
          const [rx, ry, rz] = (m.rotation ?? [0, 0, 0]).map((d) => (d * Math.PI) / 180);
          obj.position.set(px, py, pz);
          obj.rotation.set(rx, ry, rz, "XYZ");
          obj.scale.setScalar((m.size ?? 15) * proto.userData.unit);
          g.add(obj);
        }));
      }
    });
    this.renderer.render(this.scene, this.camera);
    this.cleared = false;
  }
}
