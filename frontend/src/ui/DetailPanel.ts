import type { KnowledgeSpaceArtifact, KnowledgeSpaceLink, KnowledgeSpaceNode } from "../data/types";

export type DetailTab = "summary" | "wikilinks" | "semantic";

export function selectedNodeLinks(
  artifact: KnowledgeSpaceArtifact,
  nodeId: string,
  type: "wikilink" | "semantic",
): KnowledgeSpaceLink[] {
  return artifact.links
    .filter((link) => link.types.includes(type) && (link.source === nodeId || link.target === nodeId))
    .sort((left, right) => (right.similarity ?? -2) - (left.similarity ?? -2));
}

export class DetailPanel {
  private readonly container: HTMLElement;
  private readonly artifact: KnowledgeSpaceArtifact;
  private selectedNode: KnowledgeSpaceNode | null = null;
  private activeTab: DetailTab = "summary";

  constructor(container: HTMLElement, artifact: KnowledgeSpaceArtifact) {
    this.container = container;
    this.artifact = artifact;
    this.render();
  }

  setSelectedNode(nodeId: string | null): void {
    this.selectedNode = this.artifact.nodes.find((node) => node.id === nodeId) ?? null;
    this.activeTab = "summary";
    this.render();
  }

  private render(): void {
    this.container.replaceChildren();
    this.container.className = "detail-panel";

    const eyebrow = document.createElement("p");
    eyebrow.className = "eyebrow";
    eyebrow.textContent = "SELECTED KNOWLEDGE NODE";
    this.container.append(eyebrow);

    const title = document.createElement("h2");
    title.className = "detail-title";
    title.textContent = this.selectedNode?.title ?? "Select a knowledge node";
    this.container.append(title);

    const id = document.createElement("p");
    id.className = "detail-id";
    id.textContent = this.selectedNode?.id ?? "Pointer hover and click are ready";
    this.container.append(id);

    if (!this.selectedNode) return;

    const tabs = document.createElement("div");
    tabs.className = "detail-tabs";
    tabs.setAttribute("role", "tablist");
    const tabDefinitions: Array<[DetailTab, string]> = [
      ["summary", "Summary"],
      ["wikilinks", "Wikilinks"],
      ["semantic", "Semantic Neighbors"],
    ];
    for (const [tab, label] of tabDefinitions) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = tab === this.activeTab ? "detail-tab is-active" : "detail-tab";
      button.textContent = label;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", String(tab === this.activeTab));
      button.addEventListener("click", () => {
        this.activeTab = tab;
        this.render();
      });
      tabs.append(button);
    }
    this.container.append(tabs);

    const content = document.createElement("div");
    content.className = "detail-content";
    content.setAttribute("role", "tabpanel");
    if (this.activeTab === "summary") {
      content.textContent = this.selectedNode.summary || "No deterministic summary was extracted.";
    } else {
      const type = this.activeTab === "wikilinks" ? "wikilink" : "semantic";
      const links = selectedNodeLinks(this.artifact, this.selectedNode.id, type);
      const visibleLinks = type === "semantic" ? links.slice(0, 5) : links;
      if (!visibleLinks.length) {
        content.textContent = type === "wikilink" ? "No explicit Wikilinks." : "No semantic neighbors above the current threshold.";
      } else {
        const list = document.createElement("ul");
        for (const link of visibleLinks) {
          const item = document.createElement("li");
          const otherId = link.source === this.selectedNode.id ? link.target : link.source;
          item.textContent = link.is_unresolved
            ? `${otherId} · unresolved`
            : link.similarity === undefined
              ? otherId
              : `${otherId} · ${(link.similarity * 100).toFixed(1)}%`;
          list.append(item);
        }
        content.append(list);
      }
    }
    this.container.append(content);
  }
}
