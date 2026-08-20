import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { KnowledgeLayoutName, KnowledgeSpaceArtifact } from "../data/types";
import {
  applyEdgeVisibility,
  createDynamicEdges,
  setEdgeOpacityFactor,
  updateDynamicEdges,
  type SceneEdge,
} from "./edges";
import {
  createNodeMeshes,
  disposeNodeMesh,
  setNodeState,
  setOrdinaryLabelOpacity,
  updateNodeLabelVisibility,
  type NodeMesh,
} from "./nodes";
import { nextPinchSelection, normalizedPointerToNdc, pickNode } from "./raycast";
import { calculateCameraFrame } from "./cameraFrame";
import {
  KnowledgeLayoutState,
  COMPACT_TRANSITION_MS,
  LAYOUT_TRANSITION_MS,
  RetargetableVectorTransition,
} from "./LayoutTransition";
import { calculateEdgeVisibility } from "./visibility";
import { AutoRotationController } from "./AutoRotationController";
import { FrameMetrics } from "./FrameMetrics";

export class KnowledgeScene {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  readonly nodeMeshes: Map<string, NodeMesh>;
  readonly layoutState: KnowledgeLayoutState;
  private readonly nodeGroup = new THREE.Group();
  private readonly edgeGroup = new THREE.Group();
  private readonly contentGroup = new THREE.Group();
  private readonly container: HTMLElement;
  private animationFrame = 0;
  private readonly raycaster = new THREE.Raycaster();
  private hoveredNodeId: string | null = null;
  private selectedNodeId: string | null = null;
  private readonly onHover?: (nodeId: string | null) => void;
  private readonly onSelect?: (nodeId: string | null) => void;
  private readonly onLayoutChange?: (layout: KnowledgeLayoutName) => void;
  private readonly cameraTransition: RetargetableVectorTransition;
  private readonly labelOpacityTransition = new RetargetableVectorTransition(new Float64Array([1]));
  private readonly edgeOpacityTransition = new RetargetableVectorTransition(new Float64Array([1]));
  private readonly rotationTransition = new RetargetableVectorTransition(new Float64Array([0]));
  private readonly dynamicEdges: SceneEdge[];
  private readonly artifact: KnowledgeSpaceArtifact;
  private readonly autoRotation = new AutoRotationController();
  private readonly frameMetrics = new FrameMetrics();
  private metricsPublished = false;
  private readonly reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  private mouseDragging = false;
  private handTransformActive = false;
  private wheelActiveUntilMs = Number.NEGATIVE_INFINITY;
  private pageHidden = document.hidden;
  private readonly controlOwners = new Set<"hand" | "layout">();
  private controlBaseState: { enabled: boolean; damping: boolean } | null = null;

  constructor(
    container: HTMLElement,
    artifact: KnowledgeSpaceArtifact,
    callbacks: {
      onHover?: (nodeId: string | null) => void;
      onSelect?: (nodeId: string | null) => void;
      onLayoutChange?: (layout: KnowledgeLayoutName) => void;
    } = {},
  ) {
    this.container = container;
    this.artifact = artifact;
    this.onHover = callbacks.onHover;
    this.onSelect = callbacks.onSelect;
    this.onLayoutChange = callbacks.onLayoutChange;
    this.scene.background = new THREE.Color(0x07111f);
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    this.camera.position.set(0, 0, 8);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x07111f, 1);
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.enableZoom = true;
    this.controls.zoomSpeed = 1.25;
    this.controls.panSpeed = 0.8;
    this.contentGroup.add(this.nodeGroup, this.edgeGroup);
    this.scene.add(this.contentGroup);
    this.nodeMeshes = createNodeMeshes(artifact, this.nodeGroup);
    this.layoutState = new KnowledgeLayoutState(artifact.nodes, artifact.capabilities.layouts);
    this.dynamicEdges = createDynamicEdges(artifact, this.nodeMeshes, this.edgeGroup);
    this.refreshEdgeVisibility();
    const frame = calculateCameraFrame(
      Array.from(this.nodeMeshes.values(), (mesh) => mesh.position),
      this.camera.fov,
    );
    const viewDirection = new THREE.Vector3(0.72, 0.42, 1).normalize();
    this.camera.position.copy(frame.center).addScaledVector(viewDirection, frame.distance);
    this.camera.near = frame.near;
    this.camera.far = frame.far;
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(frame.center);
    this.controls.minDistance = frame.minDistance;
    this.controls.maxDistance = frame.maxDistance;
    this.controls.update();
    this.cameraTransition = new RetargetableVectorTransition(this.cameraValues());
    this.scene.add(new THREE.AmbientLight(0x9cc8ff, 1.8));
    const keyLight = new THREE.PointLight(0x8bdcff, 30, 30);
    keyLight.position.set(3, 4, 6);
    this.scene.add(keyLight);
    this.resize();
    window.addEventListener("resize", this.resize);
    this.renderer.domElement.addEventListener("pointermove", this.handlePointerMove);
    this.renderer.domElement.addEventListener("pointerleave", this.handlePointerLeave);
    this.renderer.domElement.addEventListener("pointerdown", this.handlePointerDown);
    window.addEventListener("pointerup", this.handlePointerEnd);
    window.addEventListener("pointercancel", this.handlePointerEnd);
    this.renderer.domElement.addEventListener("wheel", this.handleWheel, { passive: true });
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    this.animate(performance.now());
  }

  dispose(): void {
    cancelAnimationFrame(this.animationFrame);
    window.removeEventListener("resize", this.resize);
    this.renderer.domElement.removeEventListener("pointermove", this.handlePointerMove);
    this.renderer.domElement.removeEventListener("pointerleave", this.handlePointerLeave);
    this.renderer.domElement.removeEventListener("pointerdown", this.handlePointerDown);
    window.removeEventListener("pointerup", this.handlePointerEnd);
    window.removeEventListener("pointercancel", this.handlePointerEnd);
    this.renderer.domElement.removeEventListener("wheel", this.handleWheel);
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    this.controls.dispose();
    this.nodeMeshes.forEach((mesh) => {
      disposeNodeMesh(mesh);
    });
    this.edgeGroup.traverse((object) => {
      if (object instanceof THREE.Line) {
        object.geometry.dispose();
        (object.material as THREE.Material).dispose();
      }
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  clearSelection(): void {
    if (!shouldApplySelectionDuringLayout(this.layoutState.isTransitioning)) return;
    this.applySelectedState(null);
    this.refreshEdgeVisibility();
    this.onSelect?.(null);
  }

  clearHover(): void {
    this.updateHoveredNode(null);
  }

  beginHandTransform(): void {
    this.handTransformActive = true;
    this.acquireControlOwnership("hand");
  }

  applyHandTransform(zoomLogDelta: number, rotationDeltaRad: number): void {
    if (this.controlOwners.has("layout")) return;
    if (zoomLogDelta > 0) this.controls.dollyIn(handZoomScale(zoomLogDelta));
    if (zoomLogDelta < 0) this.controls.dollyOut(handZoomScale(zoomLogDelta));
    if (rotationDeltaRad !== 0) this.controls.rotateLeft(rotationDeltaRad);
  }

  endHandTransform(): void {
    this.handTransformActive = false;
    this.releaseControlOwnership("hand");
  }

  setPointer(normalizedX: number, normalizedY: number): void {
    this.updateHoveredNode(
      pickNode(
        this.camera,
        normalizedPointerToNdc(normalizedX, normalizedY),
        this.nodeMeshes,
        this.raycaster,
      ),
    );
  }

  selectAtPointer(normalizedX: number, normalizedY: number): void {
    this.setPointer(normalizedX, normalizedY);
    const nextSelection = nextPinchSelection(this.selectedNodeId, this.hoveredNodeId);
    if (nextSelection !== this.selectedNodeId) this.selectNode(nextSelection);
  }

  selectNode(nodeId: string | null): void {
    if (!shouldApplySelectionDuringLayout(this.layoutState.isTransitioning)) return;
    this.applySelectedState(nodeId);
    this.refreshEdgeVisibility();
    this.onSelect?.(nodeId);
  }

  setLayout(
    layout: KnowledgeLayoutName,
    timestampMs = performance.now(),
    reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  ): void {
    const targetPositions = this.layoutState.target(layout);
    if (!Number.isFinite(timestampMs)) throw new RangeError("layout timestamp must be finite");
    if (layout === "compact" && !canRequestCompact(this.layoutState.layout)) {
      throw new Error("compact layout is available only after Topic Galaxy is reached");
    }
    const compactRelated = layout === "compact"
      || this.layoutState.layout === "compact"
      || this.labelOpacityTransition.current[0] < 1;
    const durationMs = compactRelated ? COMPACT_TRANSITION_MS : LAYOUT_TRANSITION_MS;
    const targetFrame = calculateCameraFrame(positionsFromBuffer(targetPositions), this.camera.fov);
    this.acquireControlOwnership("layout");
    try {
      this.layoutState.retarget(layout, timestampMs, reducedMotion);
      const compactTarget = layout === "compact";
      const expandingFromCompletedCompact = !compactTarget && this.layoutState.layout === "compact";
      if (expandingFromCompletedCompact) {
        this.refreshEdgeVisibility(layout);
        const completedCompactFactor = this.selectedNodeId ? 0.55 : 0;
        this.edgeOpacityTransition.reset(new Float64Array([completedCompactFactor]));
        setEdgeOpacityFactor(this.dynamicEdges, completedCompactFactor);
      }
      this.labelOpacityTransition.retarget(
        new Float64Array([compactTarget ? 0 : 1]),
        timestampMs,
        durationMs,
        reducedMotion,
      );
      this.edgeOpacityTransition.retarget(
        new Float64Array([compactTarget ? (this.selectedNodeId ? 0.55 : 0) : 1]),
        timestampMs,
        durationMs,
        reducedMotion,
      );
      this.rotationTransition.reset(new Float64Array([this.contentGroup.rotation.y]));
      if (!compactTarget) {
        this.rotationTransition.retarget(
          new Float64Array([0]),
          timestampMs,
          durationMs,
          reducedMotion,
        );
      }
      const viewDirection = this.camera.position.clone().sub(this.controls.target);
      if (viewDirection.lengthSq() === 0) viewDirection.set(0.72, 0.42, 1);
      viewDirection.normalize();
      const targetCameraPosition = targetFrame.center.clone().addScaledVector(
        viewDirection,
        targetFrame.distance,
      );
      this.cameraTransition.reset(this.cameraValues());
      this.cameraTransition.retarget(
        new Float64Array([
          targetCameraPosition.x,
          targetCameraPosition.y,
          targetCameraPosition.z,
          targetFrame.center.x,
          targetFrame.center.y,
          targetFrame.center.z,
          targetFrame.minDistance,
          targetFrame.maxDistance,
          targetFrame.near,
          targetFrame.far,
        ]),
        timestampMs,
        durationMs,
        reducedMotion,
      );
      if (reducedMotion) {
        applyNodePositionBuffer(this.layoutState.nodeIds, this.layoutState.current, this.nodeMeshes);
        updateDynamicEdges(this.dynamicEdges, this.nodeMeshes);
        this.applyCameraValues(this.cameraTransition.current);
        this.contentGroup.rotation.y = this.rotationTransition.current[0];
        this.releaseControlOwnership("layout");
        this.refreshEdgeVisibility();
        this.edgeOpacityTransition.reset(new Float64Array([1]));
        setEdgeOpacityFactor(this.dynamicEdges, 1);
        this.onLayoutChange?.(this.layoutState.layout);
      }
    } catch (error) {
      this.releaseControlOwnership("layout");
      throw error;
    }
  }

  private readonly applySelectedState = (nodeId: string | null): void => {
    if (this.selectedNodeId && this.nodeMeshes.has(this.selectedNodeId)) {
      setNodeState(this.nodeMeshes.get(this.selectedNodeId)!, this.selectedNodeId === this.hoveredNodeId ? "hover" : "idle");
    }
    this.selectedNodeId = nodeId;
    if (nodeId && this.nodeMeshes.has(nodeId)) setNodeState(this.nodeMeshes.get(nodeId)!, "selected");
  };

  private readonly updateHoveredNode = (nodeId: string | null): void => {
    if (nodeId === this.hoveredNodeId) return;
    if (this.hoveredNodeId && this.nodeMeshes.has(this.hoveredNodeId)) {
      setNodeState(this.nodeMeshes.get(this.hoveredNodeId)!, this.hoveredNodeId === this.selectedNodeId ? "selected" : "idle");
    }
    this.hoveredNodeId = nodeId;
    if (nodeId && nodeId !== this.selectedNodeId) setNodeState(this.nodeMeshes.get(nodeId)!, "hover");
    this.onHover?.(nodeId);
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    this.setPointer(x, y);
  };

  private readonly handlePointerLeave = (): void => this.updateHoveredNode(null);

  private readonly handlePointerDown = (): void => {
    this.mouseDragging = true;
    this.selectNode(this.hoveredNodeId);
  };

  private readonly handlePointerEnd = (): void => {
    this.mouseDragging = false;
  };

  private readonly handleWheel = (): void => {
    this.wheelActiveUntilMs = performance.now() + 150;
  };

  private readonly handleVisibilityChange = (): void => {
    this.pageHidden = document.hidden;
    const timestampMs = performance.now();
    this.autoRotation.update(timestampMs, this.autoRotationConditions(timestampMs));
  };

  private readonly resize = (): void => {
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  };

  private readonly animate = (timestampMs: number): void => {
    this.animationFrame = requestAnimationFrame(this.animate);
    this.frameMetrics.record(timestampMs);
    if (!this.metricsPublished && this.frameMetrics.snapshot) {
      this.metricsPublished = true;
      this.container.dataset.performanceFrames = String(this.frameMetrics.snapshot.frames);
      this.container.dataset.performanceDurationMs = this.frameMetrics.snapshot.durationMs.toFixed(2);
      this.container.dataset.performanceFps = this.frameMetrics.snapshot.fps.toFixed(2);
      this.container.dataset.performanceMaxFrameMs = this.frameMetrics.snapshot.maxFrameMs.toFixed(2);
    }
    this.applyTransitions(timestampMs);
    const rotation = this.autoRotation.update(timestampMs, this.autoRotationConditions(timestampMs));
    this.contentGroup.rotation.y += rotation.angleDeltaRad;
    if (shouldUpdateOrbitControls(this.controlOwners)) this.controls.update();
    updateNodeLabelVisibility(this.nodeMeshes, this.camera, this.selectedNodeId, this.hoveredNodeId);
    setOrdinaryLabelOpacity(
      this.nodeMeshes,
      this.labelOpacityTransition.current[0],
      this.selectedNodeId,
      this.hoveredNodeId,
    );
    this.renderer.render(this.scene, this.camera);
  };

  private applyTransitions(timestampMs: number): void {
    const wasTransitioning = this.layoutState.isTransitioning;
    const positions = this.layoutState.sample(timestampMs);
    if (wasTransitioning || this.layoutState.isTransitioning) {
      applyNodePositionBuffer(this.layoutState.nodeIds, positions, this.nodeMeshes);
      updateDynamicEdges(this.dynamicEdges, this.nodeMeshes);
    }
    const cameraWasTransitioning = this.cameraTransition.active;
    const camera = this.cameraTransition.sample(timestampMs);
    if (cameraWasTransitioning || this.cameraTransition.active) {
      this.applyCameraValues(camera);
    }
    this.labelOpacityTransition.sample(timestampMs);
    const edgeOpacity = this.edgeOpacityTransition.sample(timestampMs)[0];
    setEdgeOpacityFactor(this.dynamicEdges, edgeOpacity);
    const rotationWasTransitioning = this.rotationTransition.active;
    const rotation = this.rotationTransition.sample(timestampMs)[0];
    if (rotationWasTransitioning || this.rotationTransition.active) {
      this.contentGroup.rotation.y = rotation;
    }
    if (
      this.controlOwners.has("layout")
      && !this.layoutState.isTransitioning
      && !this.cameraTransition.active
      && !this.rotationTransition.active
    ) {
      this.releaseControlOwnership("layout");
      this.refreshEdgeVisibility();
      this.edgeOpacityTransition.reset(new Float64Array([1]));
      setEdgeOpacityFactor(this.dynamicEdges, 1);
      this.onLayoutChange?.(this.layoutState.layout);
    }
  }

  private cameraValues(): Float64Array {
    return new Float64Array([
      this.camera.position.x,
      this.camera.position.y,
      this.camera.position.z,
      this.controls.target.x,
      this.controls.target.y,
      this.controls.target.z,
      this.controls.minDistance,
      this.controls.maxDistance,
      this.camera.near,
      this.camera.far,
    ]);
  }

  private autoRotationConditions(timestampMs: number) {
    return {
      compactTransitionComplete: this.layoutState.layout === "compact" && !this.layoutState.isTransitioning,
      mouseDragging: this.mouseDragging,
      wheelActive: timestampMs < this.wheelActiveUntilMs,
      handActive: this.handTransformActive,
      selectionActive: this.selectedNodeId !== null,
      hidden: this.pageHidden,
      reducedMotion: this.reducedMotionQuery.matches,
    };
  }

  private applyCameraValues(values: Float64Array): void {
    this.camera.position.set(values[0], values[1], values[2]);
    this.controls.target.set(values[3], values[4], values[5]);
    this.controls.minDistance = values[6];
    this.controls.maxDistance = values[7];
    this.camera.near = values[8];
    this.camera.far = values[9];
    this.camera.updateProjectionMatrix();
  }

  private acquireControlOwnership(owner: "hand" | "layout"): void {
    if (this.controlOwners.has(owner)) return;
    if (this.controlOwners.size > 0) {
      if (owner === "layout") this.flushControlInertia();
      this.controlOwners.add(owner);
      return;
    }
    const baseState = { enabled: this.controls.enabled, damping: this.controls.enableDamping };
    try {
      this.flushControlInertia();
      this.controls.enabled = false;
      this.controlBaseState = baseState;
      this.controlOwners.add(owner);
    } catch (error) {
      this.controls.enabled = baseState.enabled;
      this.controls.enableDamping = baseState.damping;
      this.controlBaseState = null;
      throw error;
    }
  }

  private releaseControlOwnership(owner: "hand" | "layout"): void {
    if (!this.controlOwners.delete(owner) || this.controlOwners.size > 0) return;
    if (this.controlBaseState !== null) {
      this.controls.enabled = this.controlBaseState.enabled;
      this.controls.enableDamping = this.controlBaseState.damping;
      this.controlBaseState = null;
    }
  }

  private flushControlInertia(): void {
    const position = this.camera.position.clone();
    const target = this.controls.target.clone();
    const zoom = this.camera.zoom;
    this.controls.enableDamping = false;
    this.controls.update();
    this.camera.position.copy(position);
    this.controls.target.copy(target);
    this.camera.zoom = zoom;
    this.camera.updateProjectionMatrix();
  }

  private refreshEdgeVisibility(layout: KnowledgeLayoutName = this.layoutState.layout): void {
    applyEdgeVisibility(
      this.dynamicEdges,
      calculateEdgeVisibility(
        this.dynamicEdges,
        this.artifact.nodes,
        this.selectedNodeId,
        layout,
        this.artifact.capabilities.hierarchy,
      ),
    );
    updateDynamicEdges(this.dynamicEdges, this.nodeMeshes);
  }
}

export function handZoomScale(zoomLogDelta: number): number {
  return Math.exp(Math.abs(zoomLogDelta));
}

export function shouldUpdateOrbitControls(
  owners: ReadonlySet<"hand" | "layout">,
): boolean {
  return !owners.has("layout");
}

export function canRequestCompact(currentLayout: KnowledgeLayoutName): boolean {
  return currentLayout === "galaxy" || currentLayout === "compact";
}

export function shouldApplySelectionDuringLayout(isTransitioning: boolean): boolean {
  return !isTransitioning;
}

export function applyNodePositionBuffer(
  nodeIds: readonly string[],
  positions: Float64Array,
  meshes: ReadonlyMap<string, THREE.Object3D>,
): void {
  if (positions.length !== nodeIds.length * 3) throw new RangeError("node position buffer length mismatch");
  nodeIds.forEach((nodeId, index) => {
    const mesh = meshes.get(nodeId);
    if (!mesh) throw new Error(`node mesh is missing: ${nodeId}`);
    mesh.position.set(positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]);
  });
}

function positionsFromBuffer(values: Float64Array): THREE.Vector3[] {
  const positions: THREE.Vector3[] = [];
  for (let index = 0; index < values.length; index += 3) {
    positions.push(new THREE.Vector3(values[index], values[index + 1], values[index + 2]));
  }
  return positions;
}
