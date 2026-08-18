export class CameraPreview {
  readonly root: HTMLElement;
  readonly video: HTMLVideoElement;
  private readonly status: HTMLElement;
  private readonly enableButton: HTMLButtonElement;

  constructor(container: HTMLElement, onEnable: () => void) {
    this.root = container;
    this.root.className = "camera-preview";
    this.video = document.createElement("video");
    this.video.autoplay = true;
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.setAttribute("aria-label", "Hand tracking camera preview");
    this.status = document.createElement("span");
    this.status.className = "camera-status";
    this.status.textContent = "Camera idle";
    this.enableButton = document.createElement("button");
    this.enableButton.type = "button";
    this.enableButton.className = "camera-enable";
    this.enableButton.textContent = "Enable camera";
    this.enableButton.addEventListener("click", onEnable);
    this.root.replaceChildren(this.video, this.status, this.enableButton);
  }

  setStatus(message: string): void {
    this.status.textContent = message;
  }

  setEnabled(enabled: boolean): void {
    this.enableButton.disabled = !enabled;
  }
}
