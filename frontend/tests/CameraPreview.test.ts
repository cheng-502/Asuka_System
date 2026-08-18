import { describe, expect, it, vi } from "vitest";
import { CameraPreview } from "../src/ui/CameraPreview";
import type { HandLandmarks } from "../src/hand/GestureEngine";

type FakeElement = {
  tagName: string;
  className: string;
  textContent: string;
  disabled: boolean;
  muted?: boolean;
  autoplay?: boolean;
  playsInline?: boolean;
  type?: string;
  children: FakeElement[];
  listeners: Record<string, () => void>;
  getContext?: () => CanvasRenderingContext2D;
  context?: CanvasRenderingContext2D;
  addEventListener(type: string, listener: () => void): void;
  replaceChildren(...children: FakeElement[]): void;
  setAttribute(): void;
};

function fakeElement(tagName: string): FakeElement {
  const element: FakeElement = {
    tagName,
    className: "",
    textContent: "",
    disabled: false,
    children: [],
    listeners: {},
    addEventListener(type, listener) {
      this.listeners[type] = listener;
    },
    replaceChildren(...children) {
      this.children = children;
    },
    setAttribute() {},
  };
  if (tagName === "canvas") {
    const canvasContext = {
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      strokeStyle: "",
      fillStyle: "",
      lineWidth: 0,
    } as unknown as CanvasRenderingContext2D;
    element.context = canvasContext;
    element.getContext = () => canvasContext;
  }
  return element;
}

describe("CameraPreview", () => {
  it("offers a mouse-mode close action while tracking is active", () => {
    const createElement = vi.fn((tagName: string) => fakeElement(tagName));
    vi.stubGlobal("document", { createElement });
    const container = fakeElement("section");
    const onDisable = vi.fn();
    const preview = new CameraPreview(container as unknown as HTMLElement, vi.fn(), onDisable);

    preview.setStarting();
    expect(container.children[3].disabled).toBe(true);
    preview.setActive(true);
    expect(container.children[4].textContent).toBe("Close camera · mouse mode");
    expect(container.children[4].disabled).toBe(false);

    container.children[4].listeners.click();
    expect(onDisable).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("shows one-hand detection and clears the overlay for an empty frame", () => {
    const createElement = vi.fn((tagName: string) => fakeElement(tagName));
    vi.stubGlobal("document", { createElement });
    const container = fakeElement("section");
    const preview = new CameraPreview(container as unknown as HTMLElement, vi.fn());
    const oneHand: HandLandmarks = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }));
    const canvas = container.children[1];
    const context = canvas.context!;

    preview.setLandmarks([oneHand]);
    expect(container.children[2].textContent).toBe("Hands detected: 1");
    expect(context.arc).toHaveBeenCalled();

    preview.setLandmarks(null);
    expect(container.children[2].textContent).toBe("Hands detected: 0");
    expect(context.clearRect).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
