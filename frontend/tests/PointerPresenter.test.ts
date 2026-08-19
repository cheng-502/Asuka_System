import { describe, expect, it, vi } from "vitest";
import { PointerPresenter, shouldShowPointerForHandCount } from "../src/ui/PointerPresenter";

type FakeElement = {
  className: string;
  hidden: boolean;
  style: Record<string, string> & { setProperty(name: string, value: string): void };
  children: FakeElement[];
  attributes: Record<string, string>;
  appendChild(child: FakeElement): void;
  replaceChildren(...children: FakeElement[]): void;
  setAttribute(name: string, value: string): void;
};

function fakeElement(): FakeElement {
  return {
    className: "",
    hidden: false,
    style: Object.assign({}, {
      setProperty(this: Record<string, string>, name: string, value: string) { this[name] = value; },
    }),
    children: [],
    attributes: {},
    appendChild(child) { this.children.push(child); },
    replaceChildren(...children) { this.children = children; },
    setAttribute(name, value) { this.attributes[name] = value; },
  };
}

describe("PointerPresenter", () => {
  it("only keeps the one-hand pointer visible for valid single-hand frames", () => {
    expect(shouldShowPointerForHandCount(1)).toBe(true);
    expect(shouldShowPointerForHandCount(2)).toBe(false);
    expect(shouldShowPointerForHandCount(0)).toBe(false);
  });

  it("renders a visible screen pointer and visual hit ring", () => {
    vi.stubGlobal("document", { createElement: () => fakeElement() });
    const container = fakeElement();
    const presenter = new PointerPresenter(container as unknown as HTMLElement, {
      cursorDiameterPx: 12,
      hitRadiusPx: 24,
    });

    presenter.show(0.25, 0.75);

    const pointer = container.children[0];
    expect(pointer.hidden).toBe(false);
    expect(pointer.style.left).toBe("25%");
    expect(pointer.style.top).toBe("75%");
    expect(pointer.style["--cursor-diameter"]).toBe("12px");
    expect(pointer.style["--hit-diameter"]).toBe("48px");
    expect(pointer.children).toHaveLength(2);
    vi.unstubAllGlobals();
  });

  it("shows hover feedback and hides cleanly when tracking is lost", () => {
    vi.stubGlobal("document", { createElement: () => fakeElement() });
    const container = fakeElement();
    const presenter = new PointerPresenter(container as unknown as HTMLElement, {
      cursorDiameterPx: 12,
      hitRadiusPx: 24,
    });

    presenter.show(0.5, 0.5);
    presenter.setHovered(true);
    expect(container.children[0].className).toContain("is-hovering");
    presenter.setPinching(true);
    expect(container.children[0].className).toContain("is-pinching");
    presenter.hide();
    expect(container.children[0].hidden).toBe(true);
    expect(container.children[0].className).not.toContain("is-hovering");
    expect(container.children[0].className).not.toContain("is-pinching");
    vi.unstubAllGlobals();
  });
});
