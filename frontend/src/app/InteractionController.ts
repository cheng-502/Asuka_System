import type { GestureEvent } from "../hand/GestureEngine";

export interface GestureInteractionTarget {
  setPointer(x: number, y: number): void;
  selectAtPointer(x: number, y: number): void;
  clearSelection(): void;
  clearHover(): void;
}

export class InteractionController {
  private readonly target: GestureInteractionTarget;
  private readonly onCollapse?: () => void;
  private readonly onExit?: () => void;

  constructor(
    target: GestureInteractionTarget,
    callbacks: { onCollapse?: () => void; onExit?: () => void } = {},
  ) {
    this.target = target;
    this.onCollapse = callbacks.onCollapse;
    this.onExit = callbacks.onExit;
  }

  handle(event: GestureEvent): void {
    if (event.type === "pointer") this.target.setPointer(event.x, event.y);
    if (event.type === "pinch") this.target.selectAtPointer(event.x, event.y);
    if (event.type === "open_palm") {
      this.target.clearSelection();
      this.target.clearHover();
      this.onCollapse?.();
    }
    if (event.type === "no_hand") this.target.clearHover();
    if (event.type === "auto_exit") {
      this.target.clearHover();
      this.onExit?.();
    }
  }
}
