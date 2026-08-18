import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult,
} from "@mediapipe/tasks-vision";
import type { HandLandmark } from "./GestureEngine";

export const DEFAULT_HAND_MODEL_PATH = "/models/hand_landmarker.task";
export const DEFAULT_WASM_PATH = "/wasm";

export interface HandTrackerOptions {
  modelPath?: string;
  wasmPath?: string;
  onLandmarks: (landmarks: HandLandmark[] | null) => void;
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
        numHands: 1,
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
      const result = this.landmarker.detectForVideo(this.video, performance.now());
      this.options.onLandmarks(firstHandLandmarks(result));
    }
    if (this.running) this.animationFrame = requestAnimationFrame(this.tick);
  };
}

export function firstHandLandmarks(result: HandLandmarkerResult): HandLandmark[] | null {
  const landmarks = result.landmarks[0];
  return landmarks?.map(({ x, y, z }) => ({ x, y, z })) ?? null;
}
