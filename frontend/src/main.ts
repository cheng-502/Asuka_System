import "./style.css";

import { loadArtifact } from "./data/loadArtifact";
import { KnowledgeScene } from "./scene/KnowledgeScene";
import { GestureEngine } from "./hand/GestureEngine";
import { HandTracker } from "./hand/HandTracker";
import { mirrorHandLandmarks } from "./hand/CoordinateMapper";
import {
  gestureConfigFromCalibration,
  loadInteractionCalibration,
} from "./hand/InteractionCalibration";
import { InteractionController } from "./app/InteractionController";
import { DetailPanel } from "./ui/DetailPanel";
import { CameraPreview } from "./ui/CameraPreview";
import { InteractionGuide } from "./ui/InteractionGuide";

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
    <aside id="guide-root" aria-label="Gesture and mouse controls"></aside>
  </main>
`;

const sceneRoot = document.querySelector<HTMLElement>("#scene-root");
const statusCopy = document.querySelector<HTMLElement>("#status-copy");
const statusPill = document.querySelector<HTMLElement>("#status-pill");

async function boot(): Promise<void> {
  if (!sceneRoot || !statusCopy || !statusPill) return;

  try {
    const artifactPath = new URLSearchParams(window.location.search).get("artifact") ?? "/data/knowledge-space.json";
    const [artifact, calibrationResult] = await Promise.all([
      loadArtifact(artifactPath),
      loadInteractionCalibration(),
    ]);
    const detailRoot = document.querySelector<HTMLElement>("#detail-root");
    const cameraRoot = document.querySelector<HTMLElement>("#camera-root");
    const guideRoot = document.querySelector<HTMLElement>("#guide-root");
    const detailPanel = detailRoot ? new DetailPanel(detailRoot, artifact) : null;
    if (guideRoot) new InteractionGuide(guideRoot);
    const scene = new KnowledgeScene(sceneRoot, artifact, {
      onSelect: (nodeId) => detailPanel?.setSelectedNode(nodeId),
    });
    const gestureEngine = new GestureEngine(
      gestureConfigFromCalibration(calibrationResult.profile),
    );
    let cameraPreview: CameraPreview | null = null;
    let tracker: HandTracker | null = null;

    function stopCamera(): void {
      tracker?.stop();
      gestureEngine.reset();
      scene.clearHover();
      cameraPreview?.setIdle();
      cameraPreview?.setStatus("Camera off · mouse mode");
    }

    const interaction = new InteractionController(scene, {
      onCollapse: () => detailPanel?.setSelectedNode(null),
      onExit: stopCamera,
    });
    cameraPreview = cameraRoot
      ? new CameraPreview(cameraRoot, () => void startCamera(), stopCamera)
      : null;
    if (calibrationResult.warning) {
      cameraPreview?.setStatus("Default interaction calibration active");
    }
    tracker = new HandTracker({
      onFrame: (frame) => {
        const rawHands = frame.hands.map((hand) => hand.landmarks);
        cameraPreview?.setLandmarks(rawHands.length ? rawHands : null);
        const displayHands = rawHands.map(mirrorHandLandmarks);
        for (const event of gestureEngine.update(
          displayHands.length ? displayHands : null,
          frame.timestampMs,
        )) interaction.handle(event);
      },
      onStatus: (message) => cameraPreview?.setStatus(message),
    });

    async function startCamera(): Promise<void> {
      if (!cameraPreview) return;
      cameraPreview.setStarting();
      gestureEngine.reset();
      try {
        await tracker?.start(cameraPreview.video);
        cameraPreview.setActive(true);
      } catch (error) {
        cameraPreview.setStatus(error instanceof Error ? error.message : "Camera unavailable");
        cameraPreview.setIdle();
      }
    }
    window.addEventListener("beforeunload", () => tracker?.stop());
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
