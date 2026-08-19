export interface PointerPresenterConfig {
  cursorDiameterPx: number;
  hitRadiusPx: number;
}

export function shouldShowPointerForHandCount(handCount: number): boolean {
  return handCount === 1;
}

export class PointerPresenter {
  readonly element: HTMLDivElement;
  private hovered = false;
  private pinching = false;

  constructor(container: HTMLElement, config: PointerPresenterConfig) {
    this.element = document.createElement("div");
    this.element.setAttribute("aria-hidden", "true");
    this.element.style.setProperty("--cursor-diameter", `${config.cursorDiameterPx}px`);
    this.element.style.setProperty("--hit-diameter", `${config.hitRadiusPx * 2}px`);
    const hitRing = document.createElement("span");
    hitRing.className = "hand-pointer-hit-ring";
    const dot = document.createElement("span");
    dot.className = "hand-pointer-dot";
    this.element.replaceChildren(hitRing, dot);
    this.hide();
    container.appendChild(this.element);
  }

  show(normalizedX: number, normalizedY: number): void {
    this.element.style.left = `${clamp01(normalizedX) * 100}%`;
    this.element.style.top = `${clamp01(normalizedY) * 100}%`;
    this.element.hidden = false;
    this.updateClassName();
  }

  setHovered(hovered: boolean): void {
    this.hovered = hovered;
    this.updateClassName();
  }

  setPinching(pinching: boolean): void {
    this.pinching = pinching;
    this.updateClassName();
  }

  hide(): void {
    this.hovered = false;
    this.pinching = false;
    this.element.hidden = true;
    this.updateClassName();
  }

  private updateClassName(): void {
    this.element.className = `hand-pointer${this.hovered ? " is-hovering" : ""}${this.pinching ? " is-pinching" : ""}`;
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
