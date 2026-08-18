import "./style.css";

import { loadArtifact } from "./data/loadArtifact";
import { KnowledgeScene } from "./scene/KnowledgeScene";
import { GestureEngine } from "./hand/GestureEngine";
import { HandTracker } from "./hand/HandTracker";
import { InteractionController } from "./app/InteractionController";
import { DetailPanel } from "./ui/DetailPanel";
import { CameraPreview } from "./ui/CameraPreview";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root element was not found");
}

app.innerHTML = `
  <main class="shell" aria-labelledby="page-title">
    <div id="scene-root" class="scene-root" aria-label="3D knowledge space"></div>
    <section class="status-card" id="status-card" aria-live="polite">
      <p class="eyebrow">MVP-1 · GESTURE-CONTROLLED KNOWLEDGE SPACE</p>
      <h1 id="page-title">Auaka System</h1>
      <p class="status-copy" id="status-copy">Loading the versioned knowledge-space artifact…</p>
      <div class="status-pill" role="status" id="status-pill">
        <span class="status-dot" aria-hidden="true"></span>
        Loading artifact
      </div>
    </section>
    <section id="camera-root" aria-label="Camera preview"></section>
    <aside id="detail-root" aria-label="Selected knowledge node details"></aside>
  </main>
`;

const sceneRoot = document.querySelector<HTMLElement>("#scene-root");
const statusCopy = document.querySelector<HTMLElement>("#status-copy");
const statusPill = document.querySelector<HTMLElement>("#status-pill");

async function boot(): Promise<void> {
  if (!sceneRoot || !statusCopy || !statusPill) return;

  try {
    const artifact = await loadArtifact();
    const detailRoot = document.querySelector<HTMLElement>("#detail-root");
    const cameraRoot = document.querySelector<HTMLElement>("#camera-root");
    const detailPanel = detailRoot ? new DetailPanel(detailRoot, artifact) : null;
    const scene = new KnowledgeScene(sceneRoot, artifact, {
      onSelect: (nodeId) => detailPanel?.setSelectedNode(nodeId),
    });
    const interaction = new InteractionController(scene, {
      onCollapse: () => detailPanel?.setSelectedNode(null),
    });
    const gestureEngine = new GestureEngine();
    const cameraPreview = cameraRoot ? new CameraPreview(cameraRoot, () => void startCamera()) : null;
    const tracker = new HandTracker({
      onLandmarks: (landmarks) => {
        for (const event of gestureEngine.update(landmarks)) interaction.handle(event);
        if (!landmarks) detailPanel?.setSelectedNode(null);
      },
      onStatus: (message) => cameraPreview?.setStatus(message),
    });

    async function startCamera(): Promise<void> {
      if (!cameraPreview) return;
      cameraPreview.setEnabled(false);
      try {
        await tracker.start(cameraPreview.video);
      } catch (error) {
        cameraPreview.setStatus(error instanceof Error ? error.message : "Camera unavailable");
        cameraPreview.setEnabled(true);
      }
    }
    window.addEventListener("beforeunload", () => tracker.stop());
    statusCopy.textContent = `${artifact.nodes.length} notes loaded from the versioned artifact. Mouse orbit is available while hand tracking is offline.`;
    statusPill.classList.add("is-ready");
    statusPill.lastChild!.textContent = " Knowledge space ready";
  } catch (error) {
    statusCopy.textContent = error instanceof Error ? error.message : "Could not load the knowledge-space artifact.";
    statusPill.classList.add("is-error");
    statusPill.lastChild!.textContent = " Artifact unavailable";
  }
}

void boot();
