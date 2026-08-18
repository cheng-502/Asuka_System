import { describe, expect, it, vi } from "vitest";
import { CameraPreview } from "../src/ui/CameraPreview";

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
  addEventListener(type: string, listener: () => void): void;
  replaceChildren(...children: FakeElement[]): void;
  setAttribute(): void;
};

function fakeElement(tagName: string): FakeElement {
  return {
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
}

describe("CameraPreview", () => {
  it("offers a mouse-mode close action while tracking is active", () => {
    const createElement = vi.fn((tagName: string) => fakeElement(tagName));
    vi.stubGlobal("document", { createElement });
    const container = fakeElement("section");
    const onDisable = vi.fn();
    const preview = new CameraPreview(container as unknown as HTMLElement, vi.fn(), onDisable);

    preview.setStarting();
    expect(container.children[2].disabled).toBe(true);
    preview.setActive(true);
    expect(container.children[3].textContent).toBe("Close camera · mouse mode");
    expect(container.children[3].disabled).toBe(false);

    container.children[3].listeners.click();
    expect(onDisable).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
