import { describe, expect, it } from "vitest";
import {
  KnowledgeLayoutState,
  RetargetableVectorTransition,
} from "../src/scene/LayoutTransition";
import type { KnowledgeSpaceNode } from "../src/data/types";

describe("RetargetableVectorTransition", () => {
  it("finishes at exact targets after a timestamp-based transition", () => {
    const transition = new RetargetableVectorTransition(new Float64Array([0, 10]));
    transition.retarget(new Float64Array([10, 20]), 100, 800, false);

    expect(Array.from(transition.sample(100))).toEqual([0, 10]);
    expect(Array.from(transition.sample(500))).toEqual([5, 15]);
    expect(Array.from(transition.sample(900))).toEqual([10, 20]);
    expect(transition.active).toBe(false);
  });

  it("retargets and reverses from the current interpolated values without jumps", () => {
    const transition = new RetargetableVectorTransition(new Float64Array([0]));
    transition.retarget(new Float64Array([10]), 0, 800, false);
    const interrupted = transition.sample(300)[0];

    transition.retarget(new Float64Array([0]), 300, 800, false);

    expect(transition.sample(300)[0]).toBe(interrupted);
    expect(transition.sample(1100)[0]).toBe(0);
  });

  it("applies reduced-motion targets immediately", () => {
    const transition = new RetargetableVectorTransition(new Float64Array([1, 2, 3]));
    transition.retarget(new Float64Array([4, 5, 6]), 0, 800, true);

    expect(Array.from(transition.current)).toEqual([4, 5, 6]);
    expect(transition.active).toBe(false);
  });

  it("never moves backward when timestamps roll back, including before retarget", () => {
    const transition = new RetargetableVectorTransition(new Float64Array([0]));
    transition.retarget(new Float64Array([10]), 100, 800, false);
    const forward = transition.sample(500)[0];

    expect(transition.sample(400)[0]).toBe(forward);
    transition.retarget(new Float64Array([20]), 350, 800, false);
    expect(transition.current[0]).toBe(forward);
    expect(transition.sample(1300)[0]).toBe(20);
  });
});

describe("KnowledgeLayoutState", () => {
  it("switches persisted semantic and galaxy targets while preserving node identity", () => {
    const nodes = [runtimeNode("a", 0, 10), runtimeNode("b", 1, 20)];
    const state = new KnowledgeLayoutState(nodes, ["semantic", "galaxy"]);

    state.retarget("galaxy", 0, false);
    state.sample(800);

    expect(state.layout).toBe("galaxy");
    expect(state.nodeIds).toEqual(["a", "b"]);
    expect(Array.from(state.current)).toEqual([10, 0, 0, 20, 0, 0]);
    expect(() => state.retarget("compact", 900, false)).toThrow("not available");
  });
});

function runtimeNode(id: string, semanticX: number, galaxyX: number): KnowledgeSpaceNode {
  return {
    id,
    title: id,
    summary: "",
    domain: "test",
    position: { x: semanticX, y: 0, z: 0 },
    layouts: {
      semantic: { x: semanticX, y: 0, z: 0 },
      galaxy: { x: galaxyX, y: 0, z: 0 },
      compact: { x: 0, y: 0, z: 0 },
    },
    hierarchy: null,
    explicit_link_count: 0,
    is_virtual: false,
  };
}
