import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult,
} from "@mediapipe/tasks-vision";
import type {
  HandFrame,
  Handedness,
  NormalizedLandmark,
  TrackedHand,
} from "./HandFrame";

export const DEFAULT_HAND_MODEL_PATH = "/models/hand_landmarker.task";
export const DEFAULT_WASM_PATH = "/wasm";
export const MAX_HANDS = 2;

export interface HandTrackerOptions {
  modelPath?: string;
  wasmPath?: string;
  onFrame: (frame: HandFrame) => void;
  onStatus?: (message: string) => void;
}

export class HandTracker {
  private readonly options: Required<Pick<HandTrackerOptions, "modelPath" | "wasmPath">> & HandTrackerOptions;
  private landmarker: HandLandmarker | null = null;
  private stream: MediaStream | null = null;
  private animationFrame = 0;
  private video: HTMLVideoElement | null = null;
  private running = false;

  constructor(options: HandTrackerOptions) {
    this.options = {
      ...options,
      modelPath: options.modelPath ?? DEFAULT_HAND_MODEL_PATH,
      wasmPath: options.wasmPath ?? DEFAULT_WASM_PATH,
    };
  }

  async start(video: HTMLVideoElement): Promise<void> {
    this.stop();
    this.video = video;
    try {
      this.options.onStatus?.("Loading local Hand Landmarker…");
      const vision = await FilesetResolver.forVisionTasks(this.options.wasmPath);
      this.landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: this.options.modelPath },
        runningMode: "VIDEO",
        numHands: MAX_HANDS,
        minHandDetectionConfidence: 0.6,
        minHandPresenceConfidence: 0.6,
        minTrackingConfidence: 0.6,
      });
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      video.srcObject = this.stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      this.running = true;
      this.options.onStatus?.("Hand tracking ready");
      this.tick();
    } catch (error) {
      this.stop();
      throw error;
    }
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.animationFrame);
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video?.pause();
    if (this.video) this.video.srcObject = null;
    this.landmarker?.close();
    this.landmarker = null;
  }

  private readonly tick = (): void => {
    if (!this.running || !this.video || !this.landmarker) return;
    if (this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      const timestampMs = performance.now();
      const result = this.landmarker.detectForVideo(this.video, timestampMs);
      const frame = handFrameFromResult(
        result,
        timestampMs,
        this.video.videoWidth || 640,
        this.video.videoHeight || 480,
      );
      if (frame) this.options.onFrame(frame);
    }
    if (this.running) this.animationFrame = requestAnimationFrame(this.tick);
  };
}

export function handFrameFromResult(
  result: HandLandmarkerResult,
  timestampMs: number,
  frameWidth: number,
  frameHeight: number,
): HandFrame | null {
  if (!Number.isFinite(timestampMs) || timestampMs < 0
    || !Number.isFinite(frameWidth) || frameWidth <= 0
    || !Number.isFinite(frameHeight) || frameHeight <= 0) return null;

  const hands = result.landmarks.flatMap((landmarks, index): TrackedHand[] => {
    const normalized = landmarks.map(({ x, y, z }) => ({ x, y, z }));
    if (normalized.length !== 21 || !normalized.every(isValidLandmark)) return [];
    const category = result.handedness?.[index]?.[0] ?? result.handednesses?.[index]?.[0];
    return [{
      landmarks: normalized,
      handedness: normalizeHandedness(category?.categoryName),
      confidence: Number.isFinite(category?.score) ? clamp01(category.score) : 0,
    }];
  });

  return { timestampMs, frameWidth, frameHeight, hands };
}

function normalizeHandedness(value: string | undefined): Handedness {
  return value === "Left" || value === "Right" ? value : "Unknown";
}

function isValidLandmark(landmark: NormalizedLandmark): boolean {
  return Number.isFinite(landmark.x)
    && Number.isFinite(landmark.y)
    && (landmark.z === undefined || Number.isFinite(landmark.z));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
