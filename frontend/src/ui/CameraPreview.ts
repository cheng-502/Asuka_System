import type { HandLandmarks } from "../hand/GestureEngine";
import { renderHandLandmarks } from "../hand/landmarkOverlay";

export class CameraPreview {
  readonly root: HTMLElement;
  readonly video: HTMLVideoElement;
  readonly canvas: HTMLCanvasElement;
  private readonly status: HTMLElement;
  private readonly enableButton: HTMLButtonElement;
  private readonly closeButton: HTMLButtonElement;
  private readonly overlayContext: CanvasRenderingContext2D;

  constructor(container: HTMLElement, onEnable: () => void, onDisable: () => void = () => {}) {
    this.root = container;
    this.root.className = "camera-preview";
    this.video = document.createElement("video");
    this.video.autoplay = true;
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.setAttribute("aria-label", "Hand tracking camera preview");
    this.canvas = document.createElement("canvas");
    this.canvas.className = "camera-landmarks";
    this.canvas.width = 640;
    this.canvas.height = 480;
    const overlayContext = this.canvas.getContext("2d");
    if (!overlayContext) throw new Error("Camera landmark overlay is unavailable");
    this.overlayContext = overlayContext;
    this.status = document.createElement("span");
    this.status.className = "camera-status";
    this.status.textContent = "Camera idle";
    this.enableButton = document.createElement("button");
    this.enableButton.type = "button";
    this.enableButton.className = "camera-enable";
    this.enableButton.textContent = "Enable camera";
    this.enableButton.addEventListener("click", onEnable);
    this.closeButton = document.createElement("button");
    this.closeButton.type = "button";
    this.closeButton.className = "camera-close";
    this.closeButton.textContent = "Close camera · mouse mode";
    this.closeButton.addEventListener("click", onDisable);
    this.root.replaceChildren(
      this.video,
      this.canvas,
      this.status,
      this.enableButton,
      this.closeButton,
    );
    this.setIdle();
  }

  setStatus(message: string): void {
    this.status.textContent = message;
  }

  setLandmarks(hands: readonly HandLandmarks[] | null): void {
    this.syncCanvasSize();
    const validHands = hands?.filter((landmarks) => landmarks.length >= 21) ?? [];
    renderHandLandmarks(
      this.overlayContext,
      this.canvas.width,
      this.canvas.height,
      validHands,
    );
    this.status.textContent = `Hands detected: ${validHands.length}`;
  }

  setEnabled(enabled: boolean): void {
    this.enableButton.disabled = !enabled;
  }

  setStarting(): void {
    this.setLandmarks(null);
    this.enableButton.disabled = true;
    this.closeButton.disabled = true;
  }

  setActive(active: boolean): void {
    this.enableButton.disabled = active;
    this.closeButton.disabled = !active;
  }

  setIdle(): void {
    this.setLandmarks(null);
    this.status.textContent = "Camera idle";
    this.setActive(false);
  }

  private syncCanvasSize(): void {
    const width = this.video.videoWidth || 640;
    const height = this.video.videoHeight || 480;
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
  }
}
