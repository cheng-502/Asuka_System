import type { KnowledgeLayoutName, KnowledgeSpaceArtifact } from "../data/types";

export interface ViewControlAvailability {
  semantic: boolean;
  galaxy: boolean;
  collapse: boolean;
}

export function viewControlAvailability(
  artifact: KnowledgeSpaceArtifact,
): ViewControlAvailability {
  const nonempty = artifact.source.note_count > 0;
  return {
    semantic: nonempty,
    galaxy: nonempty && artifact.capabilities.hierarchy,
    collapse: nonempty && artifact.capabilities.hierarchy && artifact.capabilities.layouts.includes("compact"),
  };
}

export class ViewControls {
  private readonly layoutButtons = new Map<KnowledgeLayoutName, HTMLButtonElement>();
  private readonly collapseButton: HTMLButtonElement;
  private readonly collapseAvailable: boolean;
  private currentLayout: KnowledgeLayoutName = "semantic";

  constructor(
    viewContainer: HTMLElement,
    toolbarContainer: HTMLElement,
    artifact: KnowledgeSpaceArtifact,
    onLayout: (layout: KnowledgeLayoutName) => void,
  ) {
    const availability = viewControlAvailability(artifact);
    this.collapseAvailable = availability.collapse;
    viewContainer.className = "view-switcher";
    viewContainer.setAttribute("role", "group");
    viewContainer.setAttribute("aria-label", "Knowledge-space view");
    for (const [layout, label] of [["semantic", "语义空间"], ["galaxy", "主题星系"]] as const) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "view-switcher-button";
      button.textContent = label;
      button.disabled = !availability[layout];
      button.setAttribute("aria-pressed", String(layout === "semantic"));
      button.addEventListener("click", () => {
        onLayout(layout);
      });
      viewContainer.append(button);
      this.layoutButtons.set(layout, button);
    }

    toolbarContainer.className = "function-toolbar";
    toolbarContainer.setAttribute("aria-label", "Knowledge-space functions");
    this.collapseButton = this.toolbarButton("收拢为知识球", "◎", false);
    this.collapseButton.addEventListener("click", () => {
      const target = this.currentLayout === "compact" ? "galaxy" : "compact";
      onLayout(target);
      this.setLayout(target);
    });
    toolbarContainer.append(this.collapseButton);
    for (const icon of ["＋", "◇", "⋯"]) {
      toolbarContainer.append(this.toolbarButton("Future function", icon, false));
    }
  }

  setLayout(layout: KnowledgeLayoutName): void {
    this.currentLayout = layout;
    this.layoutButtons.forEach((button, name) => {
      button.setAttribute("aria-pressed", String(name === layout || (layout === "compact" && name === "galaxy")));
    });
    const expanded = layout === "compact";
    const label = expanded ? "展开主题星系" : "收拢为知识球";
    this.collapseButton.title = label;
    this.collapseButton.setAttribute("aria-label", label);
    this.collapseButton.disabled = !this.collapseAvailable || layout === "semantic";
    this.collapseButton.tabIndex = this.collapseButton.disabled ? -1 : 0;
  }

  private toolbarButton(label: string, icon: string, enabled: boolean): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "function-toolbar-button";
    button.textContent = icon;
    button.title = label;
    button.setAttribute("aria-label", label);
    button.disabled = !enabled;
    if (!enabled) button.tabIndex = -1;
    return button;
  }
}
