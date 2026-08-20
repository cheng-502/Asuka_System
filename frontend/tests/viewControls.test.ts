import { describe, expect, it } from "vitest";
import v1Fixture from "../../contracts/fixtures/knowledge-space.fixture.json";
import v2Fixture from "../../contracts/fixtures/knowledge-space-v2.fixture.json";
import publicV2Fixture from "../public/data/knowledge-space-v2.fixture.json";
import { normalizeArtifact } from "../src/data/loadArtifact";
import { ViewControls, viewControlAvailability } from "../src/ui/ViewControls";
import { vi } from "vitest";

describe("view control availability", () => {
  it("keeps legacy v1 semantic-only and enables compact capability for nonempty v2", () => {
    expect(viewControlAvailability(normalizeArtifact(v1Fixture))).toEqual({
      semantic: true,
      galaxy: false,
      collapse: false,
    });
    expect(viewControlAvailability(normalizeArtifact(v2Fixture))).toEqual({
      semantic: true,
      galaxy: true,
      collapse: true,
    });
  });

  it("disables every action for an empty runtime artifact", () => {
    const artifact = normalizeArtifact(v2Fixture);
    artifact.source.note_count = 0;
    artifact.nodes = artifact.nodes.filter((node) => node.is_virtual);
    expect(viewControlAvailability(artifact)).toEqual({
      semantic: false,
      galaxy: false,
      collapse: false,
    });
  });

  it("keeps the public browser fixture aligned with the canonical fixture", () => {
    expect(publicV2Fixture).toEqual(v2Fixture);
  });

  it("renders pressed and disabled state and forwards layout clicks", () => {
    vi.stubGlobal("document", { createElement: (tag: string) => fakeElement(tag) });
    const view = fakeElement("nav");
    const toolbar = fakeElement("aside");
    const onLayout = vi.fn();
    const controls = new ViewControls(
      view as unknown as HTMLElement,
      toolbar as unknown as HTMLElement,
      normalizeArtifact(v2Fixture),
      onLayout,
    );

    expect(view.children[0].attributes["aria-pressed"]).toBe("true");
    expect(view.children[1].disabled).toBe(false);
    expect(toolbar.children[0].disabled).toBe(true);
    view.children[1].listeners.click();
    expect(onLayout).toHaveBeenCalledWith("galaxy");
    expect(toolbar.children[0].disabled).toBe(true);
    controls.setLayout("galaxy");
    expect(view.children[1].attributes["aria-pressed"]).toBe("true");
    expect(toolbar.children[0].disabled).toBe(false);
    toolbar.children[0].listeners.click();
    expect(onLayout).toHaveBeenCalledWith("compact");
    controls.setLayout("compact");
    expect(view.children[1].attributes["aria-pressed"]).toBe("true");
    expect(toolbar.children[0].attributes["aria-label"]).toBe("展开主题星系");
    toolbar.children[0].listeners.click();
    expect(onLayout).toHaveBeenCalledWith("galaxy");
    expect(toolbar.children.slice(1).every((button) => button.disabled && button.tabIndex === -1)).toBe(true);
    vi.unstubAllGlobals();
  });
});

type FakeElement = {
  className: string; textContent: string; disabled: boolean; tabIndex: number;
  title: string; type: string; children: FakeElement[];
  listeners: Record<string, () => void>; attributes: Record<string, string>;
  append(child: FakeElement): void;
  setAttribute(name: string, value: string): void;
  addEventListener(type: string, listener: () => void): void;
};

function fakeElement(_tag: string): FakeElement {
  return {
    className: "", textContent: "", disabled: false, tabIndex: 0, title: "", type: "",
    children: [], listeners: {}, attributes: {},
    append(child) { this.children.push(child); },
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(type, listener) { this.listeners[type] = listener; },
  };
}
