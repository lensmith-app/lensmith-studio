// Face tracking for the Studio preview: the same MediaPipe models the Android app uses
// (Face Landmarker + Selfie Segmenter), plus the app's face measurements (FaceGeometry.kt).

import {
  FilesetResolver,
  FaceLandmarker,
  ImageSegmenter,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const FACE_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const SEGMENT_MODEL = "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";

// MediaPipe face mesh landmark indices (same as the app).
const FOREHEAD = 10, CHIN = 152, NOSE_TIP = 1, BETWEEN_EYES = 168, UPPER_LIP = 13, LOWER_LIP = 14;
const EDGE_A = 234, EDGE_B = 454, EYE_A = [33, 133], EYE_B = [362, 263], CHEEK_A = 50, CHEEK_B = 280;

export class FaceTracker {
  constructor() {
    this.landmarker = null;
    this.segmenter = null;
    this.lastTs = 0;
    this.filters = [];
    this.mask = null;
    this.maskVersion = 0;
  }

  async init() {
    const fileset = await FilesetResolver.forVisionTasks(WASM);
    const make = async (delegate) => {
      this.landmarker = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: FACE_MODEL, delegate },
        runningMode: "VIDEO",
        numFaces: 3,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
      });
      this.segmenter = await ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: SEGMENT_MODEL, delegate },
        runningMode: "VIDEO",
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      });
    };
    try {
      await make("GPU");
    } catch {
      await make("CPU");
    }
  }

  /**
   * Runs the models on one frame.
   * @returns faces: [{landmarks: Float32Array (x,y pairs, 0..1, y down), jawOpen, smile, blink}]
   */
  detect(source, wantFaces, wantMask) {
    let ts = performance.now();
    if (ts <= this.lastTs) ts = this.lastTs + 1;
    this.lastTs = ts;

    let faces = [];
    if (wantFaces && this.landmarker) {
      const result = this.landmarker.detectForVideo(source, ts);
      const now = ts / 1000;
      const previous = this.filters;
      const nextFilters = [];
      const nextPose = new Map();
      faces = result.faceLandmarks.map((points, i) => {
        const raw = new Float32Array(points.length * 2);
        points.forEach((p, j) => { raw[j * 2] = p.x; raw[j * 2 + 1] = p.y; });
        // Keep each face's smoothing attached to the same face (nearest nose).
        let match = null;
        let best = 0.1;
        for (const f of previous) {
          const d = Math.hypot(f.value[2] - raw[2], f.value[3] - raw[3]);
          if (f.value.length === raw.length && d < best) { best = d; match = f; }
        }
        const filter = match ?? new OneEuro();
        const smoothed = filter.filter(raw, now);
        nextFilters.push(filter);
        // Head pose for 3D models, smoothed like the landmarks (translation in cm sets the speed).
        const rawPose = result.facialTransformationMatrixes?.[i]?.data;
        let pose = null;
        if (rawPose && rawPose.length === 16) {
          const pf = this.poseFilters?.get(filter) ?? new OneEuro(1.2, 0.4, 1.5, 6);
          nextPose.set(filter, pf);
          pose = pf.filter(Float32Array.from(rawPose), now);
        }
        const shapes = Object.fromEntries((result.faceBlendshapes?.[i]?.categories ?? []).map((c) => [c.categoryName, c.score]));
        return {
          landmarks: smoothed,
          jawOpen: shapes.jawOpen ?? 0,
          smile: ((shapes.mouthSmileLeft ?? 0) + (shapes.mouthSmileRight ?? 0)) / 2,
          blink: ((shapes.eyeBlinkLeft ?? 0) + (shapes.eyeBlinkRight ?? 0)) / 2,
          pose,
        };
      });
      this.filters = nextFilters;
      this.poseFilters = nextPose;
    }

    if (wantMask && this.segmenter) {
      this.segmenter.segmentForVideo(source, ts, (result) => {
        const m = result.confidenceMasks?.[0];
        if (!m) return;
        const floats = m.getAsFloat32Array();
        const bytes = new Uint8Array(floats.length);
        for (let i = 0; i < floats.length; i++) bytes[i] = Math.max(0, Math.min(255, floats[i] * 255));
        this.mask = { data: bytes, width: m.width, height: m.height };
        this.maskVersion++;
      });
    }
    return faces;
  }
}

/** The "One Euro" smoother (same as the app): steady when still, quick when moving. */
class OneEuro {
  constructor(minCutoff = 1.2, beta = 18, dCutoff = 1.5, speedIndex = 1) {
    Object.assign(this, { minCutoff, beta, dCutoff, speedIndex, value: null, deriv: null, last: 0 });
  }
  filter(input, t) {
    if (!this.value || this.value.length !== input.length || t <= this.last) {
      this.value = Float32Array.from(input);
      this.deriv = new Float32Array(input.length);
      this.last = t;
      return Float32Array.from(input);
    }
    const dt = t - this.last;
    this.last = t;
    const alpha = (cutoff) => 1 / (1 + 1 / (2 * Math.PI * cutoff) / dt);
    const aD = alpha(this.dCutoff);
    for (let i = 0; i < input.length; i++) this.deriv[i] += aD * ((input[i] - this.value[i]) / dt - this.deriv[i]);
    const speed = Math.hypot(this.deriv[this.speedIndex * 2], this.deriv[this.speedIndex * 2 + 1]);
    const a = alpha(this.minCutoff + this.beta * speed);
    for (let i = 0; i < input.length; i++) this.value[i] += a * (input[i] - this.value[i]);
    return Float32Array.from(this.value);
  }
}

/**
 * Measures a face in view pixels (y pointing down, like a 2D canvas).
 * @param toView (x, y) in source 0..1 -> [px, py] in the view
 */
export function measureFace(face, toView) {
  const lm = face.landmarks;
  const p = (i) => toView(lm[i * 2], lm[i * 2 + 1]);
  const avg = (...pts) => [pts.reduce((s, q) => s + q[0], 0) / pts.length, pts.reduce((s, q) => s + q[1], 0) / pts.length];

  const forehead = p(FOREHEAD);
  const chin = p(CHIN);
  const a = p(EDGE_A), b = p(EDGE_B);
  const width = Math.max(1, Math.hypot(b[0] - a[0], b[1] - a[1]));

  // "Up" runs chin -> forehead; "across" is up turned 90° (screen right when upright).
  let ux = forehead[0] - chin[0], uy = forehead[1] - chin[1];
  const len = Math.max(1e-3, Math.hypot(ux, uy));
  ux /= len; uy /= len;
  const up = [ux, uy];
  const x = [-uy, ux];

  const along = (v) => v[0] * x[0] + v[1] * x[1];
  const eyeA = avg(p(EYE_A[0]), p(EYE_A[1])), eyeB = avg(p(EYE_B[0]), p(EYE_B[1]));
  const cheekA = p(CHEEK_A), cheekB = p(CHEEK_B);
  const [leftEye, rightEye] = along(eyeA) <= along(eyeB) ? [eyeA, eyeB] : [eyeB, eyeA];
  const [leftCheek, rightCheek] = along(cheekA) <= along(cheekB) ? [cheekA, cheekB] : [cheekB, cheekA];

  const anchors = {
    Forehead: forehead, BetweenEyes: p(BETWEEN_EYES), LeftEye: leftEye, RightEye: rightEye,
    NoseTip: p(NOSE_TIP), Mouth: avg(p(UPPER_LIP), p(LOWER_LIP)), Chin: chin, LeftCheek: leftCheek, RightCheek: rightCheek,
  };
  // Screen-space angle (y down) of the "across" axis; canvas rotate() uses this directly.
  const angle = Math.atan2(x[1], x[0]);

  return {
    anchors, x, up, width, angle,
    mouthOpen: face.jawOpen > 0.3,
    smiling: face.smile > 0.5,
    eyesClosed: face.blink > 0.5,
    // Positive = tilted toward the screen's left (matches the app's TiltLeft).
    tiltDegrees: -angle * 180 / Math.PI,
    /** A point offset from an anchor in face widths (offsetY positive = toward the forehead). */
    point(anchor, ox, oy) {
      const q = anchors[anchor];
      return [q[0] + (x[0] * ox + up[0] * oy) * width, q[1] + (x[1] * ox + up[1] * oy) * width];
    },
    matches(condition) {
      switch (condition) {
        case "MouthOpen": return this.mouthOpen;
        case "MouthClosed": return !this.mouthOpen;
        case "Smiling": return this.smiling;
        case "EyesClosed": return this.eyesClosed;
        default: return true;
      }
    },
  };
}
