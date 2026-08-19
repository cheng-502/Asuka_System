import { afterEach, describe, expect, it, vi } from "vitest";
import defaultProfileJson from "../public/config/interaction-calibration.v1.json";
import {
  CalibrationValidationError,
  DEFAULT_INTERACTION_CALIBRATION,
  gestureConfigFromCalibration,
  loadInteractionCalibration,
  validateInteractionCalibration,
} from "../src/hand/InteractionCalibration";

function validProfile(): Record<string, unknown> {
  return structuredClone(defaultProfileJson) as Record<string, unknown>;
}

describe("interaction calibration profile", () => {
  afterEach(() => vi.useRealTimers());
  it("validates and deeply freezes the checked-in v1 profile", () => {
    const profile = validateInteractionCalibration(validProfile());

    expect(profile).toEqual(defaultProfileJson);
    expect(Object.isFrozen(profile)).toBe(true);
    expect(Object.isFrozen(profile.pointer)).toBe(true);
    expect(() => {
      (profile.pointer as { deadzone_px: number }).deadzone_px = 99;
    }).toThrow(TypeError);
  });

  it.each([
    ["unknown field", (profile: Record<string, unknown>) => { profile.extra = true; }],
    ["wrong type", (profile: Record<string, unknown>) => {
      (profile.pointer as Record<string, unknown>).beta = "fast";
    }],
    ["out of range", (profile: Record<string, unknown>) => {
      (profile.tracking as Record<string, unknown>).min_confidence = 1.1;
    }],
    ["non-finite number", (profile: Record<string, unknown>) => {
      (profile.pointer as Record<string, unknown>).min_cutoff = Number.NaN;
    }],
  ])("rejects %s", (_label, mutate) => {
    const profile = validProfile();
    mutate(profile);

    expect(() => validateInteractionCalibration(profile)).toThrow(CalibrationValidationError);
  });

  it("requires pinch enter threshold below release threshold", () => {
    const profile = validProfile();
    (profile.pinch as Record<string, unknown>).enter_ratio = 0.6;
    (profile.pinch as Record<string, unknown>).release_ratio = 0.5;

    expect(() => validateInteractionCalibration(profile)).toThrow("enter_ratio");
  });

  it("loads a valid remote profile", async () => {
    const request: typeof fetch = async () => new Response(JSON.stringify(validProfile()), { status: 200 });

    await expect(loadInteractionCalibration("/profile.json", request)).resolves.toMatchObject({
      source: "remote",
      warning: null,
      profile: defaultProfileJson,
    });
  });

  it("maps currently supported runtime parameters without inventing legacy equivalents", () => {
    expect(gestureConfigFromCalibration(DEFAULT_INTERACTION_CALIBRATION)).toEqual({
      autoExitTimeoutMs: 15_000,
    });
  });

  it.each([
    ["request failure", async () => new Response("missing", { status: 404 })],
    ["invalid JSON", async () => new Response("{", { status: 200 })],
    ["invalid profile", async () => new Response(JSON.stringify({ version: 99 }), { status: 200 })],
  ])("falls back safely after %s", async (_label, request) => {
    const result = await loadInteractionCalibration("/profile.json", request as typeof fetch);

    expect(result.source).toBe("default");
    expect(result.warning).toEqual(expect.any(String));
    expect(result.profile).toBe(DEFAULT_INTERACTION_CALIBRATION);
    expect(Object.isFrozen(result.profile)).toBe(true);
  });

  it("times out a stalled optional request and falls back without blocking boot", async () => {
    vi.useFakeTimers();
    const request: typeof fetch = async () => new Promise<Response>(() => undefined);
    const pending = loadInteractionCalibration("/profile.json", request, { timeoutMs: 25 });

    await vi.advanceTimersByTimeAsync(25);

    await expect(pending).resolves.toMatchObject({
      source: "default",
      profile: DEFAULT_INTERACTION_CALIBRATION,
      warning: expect.stringContaining("timed out"),
    });
  });

  it("keeps the timeout active while a response body is stalled", async () => {
    vi.useFakeTimers();
    const stalledBody = new ReadableStream<Uint8Array>({ start: () => undefined });
    const request: typeof fetch = async () => new Response(stalledBody, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    const pending = loadInteractionCalibration("/profile.json", request, { timeoutMs: 25 });

    await vi.advanceTimersByTimeAsync(25);

    await expect(pending).resolves.toMatchObject({
      source: "default",
      profile: DEFAULT_INTERACTION_CALIBRATION,
      warning: expect.stringContaining("timed out"),
    });
  });
});
