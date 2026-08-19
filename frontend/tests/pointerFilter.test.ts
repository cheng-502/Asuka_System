import { describe, expect, it } from "vitest";
import { PointerFilter } from "../src/hand/PointerFilter";

const config = {
  minCutoff: 1,
  beta: 0.007,
  derivativeCutoff: 1,
  deadzonePx: 4,
};

describe("PointerFilter", () => {
  it("keeps the first sample and suppresses sub-deadzone jitter", () => {
    const filter = new PointerFilter(config);

    expect(filter.update(0, { x: 0.5, y: 0.5 }, { width: 1000, height: 1000 })).toEqual({ x: 0.5, y: 0.5 });
    expect(filter.update(16, { x: 0.502, y: 0.501 }, { width: 1000, height: 1000 })).toEqual({ x: 0.5, y: 0.5 });
  });

  it("responds to deliberate movement without jumping to the raw sample", () => {
    const filter = new PointerFilter(config);
    filter.update(0, { x: 0.2, y: 0.2 }, { width: 1000, height: 1000 });

    const moved = filter.update(16, { x: 0.8, y: 0.8 }, { width: 1000, height: 1000 });

    expect(moved.x).toBeGreaterThan(0.2);
    expect(moved.x).toBeLessThan(0.8);
    expect(moved.y).toBeGreaterThan(0.2);
    expect(moved.y).toBeLessThan(0.8);
  });

  it("resets safely on non-monotonic timestamps and explicit reset", () => {
    const filter = new PointerFilter(config);
    filter.update(100, { x: 0.2, y: 0.2 }, { width: 1000, height: 1000 });
    filter.update(116, { x: 0.8, y: 0.8 }, { width: 1000, height: 1000 });

    expect(filter.update(90, { x: 0.4, y: 0.4 }, { width: 1000, height: 1000 })).toEqual({ x: 0.4, y: 0.4 });
    filter.reset();
    expect(filter.update(200, { x: 0.7, y: 0.7 }, { width: 1000, height: 1000 })).toEqual({ x: 0.7, y: 0.7 });
  });

  it("produces similar final positions for equivalent 30 and 60 FPS motion", () => {
    const run = (stepMs: number) => {
      const filter = new PointerFilter(config);
      let output = { x: 0.1, y: 0.5 };
      for (let time = 0; time <= 1000; time += stepMs) {
        output = filter.update(time, { x: 0.1 + 0.8 * (time / 1000), y: 0.5 }, { width: 1920, height: 1080 });
      }
      return output;
    };

    expect(Math.abs(run(1000 / 30).x - run(1000 / 60).x)).toBeLessThan(0.04);
  });
});
