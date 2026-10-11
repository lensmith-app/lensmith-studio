// Hand and body tracking for the Studio preview: the same MediaPipe models the Android app
// downloads for lens.hands / lens.pose (BodyTracker.kt), served from lensmith-models.

import {
  FilesetResolver,
  GestureRecognizer,
  PoseLandmarker,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODELS = "https://lensmith-app.github.io/lensmith-models/";

/** MediaPipe's gesture names -> the names scripts see (same as the app). */
const GESTURES = {
  Open_Palm: "open", Closed_Fist: "fist", Pointing_Up: "point", Thumb_Up: "thumbsUp",
  Thumb_Down: "thumbsDown", Victory: "peace", ILoveYou: "loveYou",
};

/** Pose point names in MediaPipe's order (the person's own left and right). */
export const POSE_POINTS = [
  "nose", "leftEyeInner", "leftEye", "leftEyeOuter", "rightEyeInner", "rightEye", "rightEyeOuter",
  "leftEar", "rightEar", "mouthLeft", "mouthRight", "leftShoulder", "rightShoulder", "leftElbow",
  "rightElbow", "leftWrist", "rightWrist", "leftPinky", "rightPinky", "leftIndex", "rightIndex",
  "leftThumb", "rightThumb", "leftHip", "rightHip", "leftKnee", "rightKnee", "leftAnkle",
  "rightAnkle", "leftHeel", "rightHeel", "leftFootIndex", "rightFootIndex",
];

export class BodyTracker {
  constructor() {
    this.hands = null;
    this.pose = null;
    this.loading = { hands: null, pose: null };
    this.lastTs = 0;
    this.onStatus = () => {};
  }

  /** Starts loading what a filter needs. */
  prepare(wantHands, wantPose) {
    const fileset = () => (this.fileset ??= FilesetResolver.forVisionTasks(WASM));
    const make = async (create) => {
      try { return await create("GPU"); } catch { return await create("CPU"); }
    };
    if (wantHands && !this.loading.hands) {
      this.onStatus("Loading hand tracking…");
      this.loading.hands = fileset().then((fs) => make((delegate) => GestureRecognizer.createFromOptions(fs, {
        baseOptions: { modelAssetPath: MODELS + "gesture_recognizer.task", delegate },
        runningMode: "VIDEO", numHands: 2,
      }))).then((r) => { this.hands = r; this.onStatus(""); }, (e) => this.onStatus("Hand tracking unavailable: " + e.message));
    }
    if (wantPose && !this.loading.pose) {
      this.onStatus("Loading body tracking…");
      this.loading.pose = fileset().then((fs) => make((delegate) => PoseLandmarker.createFromOptions(fs, {
        baseOptions: { modelAssetPath: MODELS + "pose_landmarker_lite.task", delegate },
        runningMode: "VIDEO", numPoses: 1,
      }))).then((r) => { this.pose = r; this.onStatus(""); }, (e) => this.onStatus("Body tracking unavailable: " + e.message));
    }
  }

  /**
   * Runs the models on one frame. Points are [x, y] in 0..1 of the source, y down.
   * @returns {{hands: {points: number[][], side: string, gesture: string}[], pose: {points: number[][], visibility: number[]}|null}}
   */
  detect(source, wantHands, wantPose) {
    let ts = performance.now();
    if (ts <= this.lastTs) ts = this.lastTs + 1;
    this.lastTs = ts;
    const out = { hands: [], pose: null };
    if (wantHands && this.hands) {
      const r = this.hands.recognizeForVideo(source, ts);
      out.hands = r.landmarks.map((marks, i) => {
        // MediaPipe labels hands as if the picture were mirrored; the camera picture isn't.
        const label = r.handedness[i]?.[0]?.categoryName ?? r.handednesses?.[i]?.[0]?.categoryName ?? "";
        const top = r.gestures[i]?.[0];
        return {
          points: marks.map((m) => [m.x, m.y]),
          side: label === "Left" ? "right" : "left",
          gesture: top && top.score >= 0.5 ? GESTURES[top.categoryName] ?? "none" : "none",
        };
      });
    }
    if (wantPose && this.pose) {
      const r = this.pose.detectForVideo(source, ts);
      const marks = r.landmarks[0];
      if (marks) out.pose = { points: marks.map((m) => [m.x, m.y]), visibility: marks.map((m) => m.visibility ?? 1) };
    }
    return out;
  }
}

/** Script objects for lens.hands / lens.pose from points already in script units ([x, y], y up). */
export function scriptBody(body) {
  const pt = ([x, y]) => ({ x, y });
  const hands = (body?.hands ?? []).map((h) => {
    const p = h.points;
    const dist = (a, b) => Math.hypot(p[a][0] - p[b][0], p[a][1] - p[b][1]);
    const size = dist(0, 9) * 2;
    return {
      ...pt(p[9]), size, side: h.side, gesture: h.gesture, pinch: dist(4, 8) < size * 0.18,
      tip: pt(p[8]), thumb: pt(p[4]), points: p.map(pt),
    };
  });
  let pose = null;
  if (body?.pose) {
    pose = {};
    POSE_POINTS.forEach((name, i) => {
      const q = body.pose.points[i];
      if (q) pose[name] = { ...pt(q), visible: (body.pose.visibility[i] ?? 1) > 0.5 };
    });
  }
  return { hands, pose };
}
