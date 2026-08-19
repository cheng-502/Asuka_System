export interface NormalizedLandmark {
  x: number;
  y: number;
  z?: number;
}

export type Handedness = "Left" | "Right" | "Unknown";

export interface TrackedHand {
  landmarks: NormalizedLandmark[];
  handedness: Handedness;
  confidence: number;
}

export interface HandFrame {
  timestampMs: number;
  frameWidth: number;
  frameHeight: number;
  hands: TrackedHand[];
}
