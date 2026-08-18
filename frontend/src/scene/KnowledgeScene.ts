import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { KnowledgeSpaceArtifact } from "../data/types";
import { createRelationshipEdges } from "./edges";
import { createNodeMeshes, setNodeState, type NodeMesh } from "./nodes";
import { normalizedPointerToNdc, pickNode } from "./raycast";

export class KnowledgeScene {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  readonly nodeMeshes: Map<string, NodeMesh>;
  private readonly nodeGroup = new THREE.Group();
  private readonly edgeGroup = new THREE.Group();
  private readonly container: HTMLElement;
  private animationFrame = 0;
  private readonly raycaster = new THREE.Raycaster();
  private hoveredNodeId: string | null = null;
  private selectedNodeId: string | null = null;
  private readonly onHover?: (nodeId: string | null) => void;
  private readonly onSelect?: (nodeId: string | null) => void;

  constructor(
    container: HTMLElement,
    artifact: KnowledgeSpaceArtifact,
    callbacks: { onHover?: (nodeId: string | null) => void; onSelect?: (nodeId: string | null) => void } = {},
  ) {
    this.container = container;
    this.onHover = callbacks.onHover;
    this.onSelect = callbacks.onSelect;
    this.scene.background = new THREE.Color(0x07111f);
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    this.camera.position.set(0, 0, 8);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x07111f, 1);
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 0, 0);
    this.scene.add(this.nodeGroup, this.edgeGroup);
    this.nodeMeshes = createNodeMeshes(artifact, this.nodeGroup);
    createRelationshipEdges(artifact, this.nodeMeshes, this.edgeGroup);
    this.scene.add(new THREE.AmbientLight(0x9cc8ff, 1.8));
    const keyLight = new THREE.PointLight(0x8bdcff, 30, 30);
    keyLight.position.set(3, 4, 6);
    this.scene.add(keyLight);
    this.resize();
    window.addEventListener("resize", this.resize);
    this.renderer.domElement.addEventListener("pointermove", this.handlePointerMove);
    this.renderer.domElement.addEventListener("pointerleave", this.handlePointerLeave);
    this.renderer.domElement.addEventListener("pointerdown", this.handlePointerDown);
    this.animate();
  }

  dispose(): void {
    cancelAnimationFrame(this.animationFrame);
    window.removeEventListener("resize", this.resize);
    this.renderer.domElement.removeEventListener("pointermove", this.handlePointerMove);
    this.renderer.domElement.removeEventListener("pointerleave", this.handlePointerLeave);
    this.renderer.domElement.removeEventListener("pointerdown", this.handlePointerDown);
    this.controls.dispose();
    this.nodeMeshes.forEach((mesh) => {
      mesh.geometry.dispose();
      mesh.material.dispose();
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
    this.applySelectedState(null);
    this.onSelect?.(null);
  }

  selectNode(nodeId: string | null): void {
    this.applySelectedState(nodeId);
    this.onSelect?.(nodeId);
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
    this.updateHoveredNode(pickNode(this.camera, normalizedPointerToNdc(x, y), this.nodeMeshes, this.raycaster));
  };

  private readonly handlePointerLeave = (): void => this.updateHoveredNode(null);

  private readonly handlePointerDown = (): void => {
    this.selectNode(this.hoveredNodeId);
  };

  private readonly resize = (): void => {
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  };

  private readonly animate = (): void => {
    this.animationFrame = requestAnimationFrame(this.animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };
}
