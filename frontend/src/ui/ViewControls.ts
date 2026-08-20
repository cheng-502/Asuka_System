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
    collapse: false,
  };
}

export class ViewControls {
  private readonly layoutButtons = new Map<KnowledgeLayoutName, HTMLButtonElement>();

  constructor(
    viewContainer: HTMLElement,
    toolbarContainer: HTMLElement,
    artifact: KnowledgeSpaceArtifact,
    onLayout: (layout: "semantic" | "galaxy") => void,
  ) {
    const availability = viewControlAvailability(artifact);
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
      button.addEventListener("click", () => onLayout(layout));
      viewContainer.append(button);
      this.layoutButtons.set(layout, button);
    }

    toolbarContainer.className = "function-toolbar";
    toolbarContainer.setAttribute("aria-label", "Knowledge-space functions");
    toolbarContainer.append(this.toolbarButton("收拢为知识球", "◎", availability.collapse));
    for (const icon of ["＋", "◇", "⋯"]) {
      toolbarContainer.append(this.toolbarButton("Future function", icon, false));
    }
  }

  setLayout(layout: KnowledgeLayoutName): void {
    this.layoutButtons.forEach((button, name) => {
      button.setAttribute("aria-pressed", String(name === layout));
    });
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
