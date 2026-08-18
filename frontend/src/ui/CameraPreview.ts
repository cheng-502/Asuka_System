export class CameraPreview {
  readonly root: HTMLElement;
  readonly video: HTMLVideoElement;
  private readonly status: HTMLElement;
  private readonly enableButton: HTMLButtonElement;
  private readonly closeButton: HTMLButtonElement;

  constructor(container: HTMLElement, onEnable: () => void, onDisable: () => void = () => {}) {
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
    this.closeButton = document.createElement("button");
    this.closeButton.type = "button";
    this.closeButton.className = "camera-close";
    this.closeButton.textContent = "Close camera · mouse mode";
    this.closeButton.addEventListener("click", onDisable);
    this.root.replaceChildren(this.video, this.status, this.enableButton, this.closeButton);
    this.setIdle();
  }

  setStatus(message: string): void {
    this.status.textContent = message;
  }

  setEnabled(enabled: boolean): void {
    this.enableButton.disabled = !enabled;
  }

  setStarting(): void {
    this.enableButton.disabled = true;
    this.closeButton.disabled = true;
  }

  setActive(active: boolean): void {
    this.enableButton.disabled = active;
    this.closeButton.disabled = !active;
  }

  setIdle(): void {
    this.setActive(false);
  }
}
