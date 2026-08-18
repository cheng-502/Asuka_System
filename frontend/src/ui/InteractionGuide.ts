export interface InteractionGuideItem {
  label: string;
  cue: string;
  description: string;
}

export const INTERACTION_GUIDE: readonly InteractionGuideItem[] = [
  { label: "Pointer", cue: "食指", description: "伸出食指移动指针" },
  { label: "Pinch", cue: "捏合", description: "拇指 + 食指选择节点" },
  { label: "Open Palm", cue: "张开手掌", description: "取消选择并收起详情" },
  { label: "Zoom", cue: "双手分合", description: "双手张开/靠近缩放" },
  { label: "Rotate", cue: "双手扭转", description: "旋转两根食指连线" },
  { label: "No Hand", cue: "离开画面", description: "15s 后自动回到鼠标模式" },
  { label: "Mouse", cue: "鼠标", description: "拖动旋转 · 滚轮缩放 · 点击选择" },
];

export class InteractionGuide {
  readonly root: HTMLElement;

  constructor(container: HTMLElement) {
    this.root = container;
    this.root.className = "interaction-guide";
    this.root.setAttribute("aria-label", "Gesture and mouse controls");

    const heading = document.createElement("h2");
    heading.className = "interaction-guide-title";
    heading.textContent = "Interaction guide";
    this.root.append(heading);

    const list = document.createElement("ul");
    list.className = "interaction-guide-list";
    for (const item of INTERACTION_GUIDE) {
      const row = document.createElement("li");
      row.className = "interaction-guide-row";

      const label = document.createElement("span");
      label.className = "interaction-guide-label";
      label.textContent = item.label;

      const detail = document.createElement("span");
      detail.className = "interaction-guide-detail";
      detail.innerHTML = `<strong>${item.cue}</strong><span>${item.description}</span>`;

      row.append(label, detail);
      list.append(row);
    }
    this.root.append(list);
  }
}
