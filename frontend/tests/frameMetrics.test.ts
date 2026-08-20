import { describe, expect, it } from "vitest";
import { FrameMetrics } from "../src/scene/FrameMetrics";

describe("FrameMetrics", () => {
  it("measures a fixed sample after warmup without retaining frame objects", () => {
    const metrics = new FrameMetrics(2_000, 10_000);
    for (let timestamp = 0; timestamp <= 12_050; timestamp += 50 / 3) {
      metrics.record(timestamp);
    }

    const sample = metrics.snapshot;
    expect(sample).not.toBeNull();
    expect(sample!.durationMs).toBeGreaterThanOrEqual(10_000);
    expect(sample!.fps).toBeGreaterThan(59);
    expect(sample!.fps).toBeLessThan(61);
    expect(sample!.maxFrameMs).toBeCloseTo(50 / 3, 4);
    expect(Object.isFrozen(sample)).toBe(true);
  });

  it("ignores timestamp rollback and never emits invalid metrics", () => {
    const metrics = new FrameMetrics(0, 100);
    metrics.record(100);
    metrics.record(90);
    metrics.record(200);

    expect(metrics.snapshot?.fps).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(metrics.snapshot?.maxFrameMs)).toBe(true);
  });
});
