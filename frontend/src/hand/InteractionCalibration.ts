import Ajv2020, { type ErrorObject } from "ajv/dist/2020";
import schema from "../../../contracts/interaction-calibration.schema.json";
import defaultProfileJson from "../../public/config/interaction-calibration.v1.json";
import type { GestureConfig } from "./GestureEngine";

export interface InteractionCalibrationProfile {
  readonly version: 1;
  readonly profile_id: string;
  readonly coordinates: {
    readonly preview_mirrored: true;
    readonly interaction_mirror_x: true;
  };
  readonly tracking: {
    readonly min_confidence: number;
    readonly dropout_grace_ms: number;
    readonly auto_exit_ms: number;
  };
  readonly pointer: {
    readonly min_cutoff: number; readonly beta: number; readonly derivative_cutoff: number;
    readonly deadzone_px: number; readonly cursor_diameter_px: number; readonly hit_radius_px: number;
  };
  readonly pinch: {
    readonly enter_ratio: number; readonly release_ratio: number; readonly activation_ms: number;
    readonly cooldown_ms: number; readonly palm_epsilon: number;
  };
  readonly open_palm: { readonly activation_ms: number; readonly cooldown_ms: number };
  readonly two_hand: {
    readonly activation_ms: number;
    readonly zoom_deadzone_ratio: number;
    readonly rotation_deadzone_degrees: number;
    readonly max_zoom_rate_per_second: number;
    readonly max_rotation_rate_degrees_per_second: number;
    readonly dropout_grace_ms: number;
  };
}

export interface InteractionCalibrationLoadResult {
  profile: InteractionCalibrationProfile;
  source: "remote" | "default";
  warning: string | null;
}

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateSchema = ajv.compile<InteractionCalibrationProfile>(schema);

export class CalibrationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalibrationValidationError";
  }
}

export function validateInteractionCalibration(
  input: unknown,
): InteractionCalibrationProfile {
  if (containsNonFiniteNumber(input)) {
    throw new CalibrationValidationError("profile contains a non-finite number");
  }
  if (!validateSchema(input)) {
    throw new CalibrationValidationError(formatSchemaErrors(validateSchema.errors));
  }
  if (input.pinch.enter_ratio >= input.pinch.release_ratio) {
    throw new CalibrationValidationError("pinch.enter_ratio must be lower than pinch.release_ratio");
  }
  return deepFreeze(structuredClone(input));
}

export const DEFAULT_INTERACTION_CALIBRATION = validateInteractionCalibration(
  defaultProfileJson,
);

export function gestureConfigFromCalibration(
  profile: InteractionCalibrationProfile,
): Pick<GestureConfig, "autoExitTimeoutMs"> {
  return { autoExitTimeoutMs: profile.tracking.auto_exit_ms };
}

export async function loadInteractionCalibration(
  url = "/config/interaction-calibration.v1.json",
  request: typeof fetch = fetch,
  options: { timeoutMs?: number } = {},
): Promise<InteractionCalibrationLoadResult> {
  try {
    const profile = await loadProfileWithTimeout(
      url,
      request,
      options.timeoutMs ?? 1_500,
    );
    return {
      profile,
      source: "remote",
      warning: null,
    };
  } catch (error) {
    return {
      profile: DEFAULT_INTERACTION_CALIBRATION,
      source: "default",
      warning: error instanceof Error ? error.message : "Interaction calibration could not be loaded",
    };
  }
}

async function loadProfileWithTimeout(
  url: string,
  request: typeof fetch,
  timeoutMs: number,
): Promise<InteractionCalibrationProfile> {
  const safeTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 1_500;
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const load = (async () => {
    const response = await request(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Interaction calibration request failed (${response.status})`);
    }
    return validateInteractionCalibration(await response.json());
  })();
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error(`Interaction calibration request timed out after ${safeTimeoutMs} ms`));
    }, safeTimeoutMs);
  });
  try {
    return await Promise.race([load, timeout]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

function formatSchemaErrors(errors: ErrorObject[] | null | undefined): string {
  return (errors ?? [])
    .map((error) => `${error.instancePath || "/"}: ${error.message ?? "invalid"}`)
    .join("; ");
}

function containsNonFiniteNumber(value: unknown): boolean {
  if (typeof value === "number") return !Number.isFinite(value);
  if (Array.isArray(value)) return value.some(containsNonFiniteNumber);
  if (value !== null && typeof value === "object") {
    return Object.values(value).some(containsNonFiniteNumber);
  }
  return false;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
