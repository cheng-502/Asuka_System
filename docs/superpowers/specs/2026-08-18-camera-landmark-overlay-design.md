# Camera Landmark Overlay and Single-Hand Tracking Design

## Goal

Improve the local camera debugging surface so the user can see whether MediaPipe Hand Landmarker is detecting zero, one, or two hands, while preserving the current mirrored selfie-camera experience and gesture behavior.

## Confirmed behavior

- The preview remains horizontally mirrored with `scaleX(-1)`.
- Hand Landmarker continues to use `numHands=2`.
- Detection, presence, and tracking confidence remain `0.6` as requested.
- Both single-hand and two-hand results are passed to the overlay and Gesture Engine.
- Existing Pointer, Pinch, Open Palm, No Hand, auto-exit, zoom, and rotate semantics are unchanged.

## Overlay architecture

`CameraPreview` owns a transparent `<canvas>` layered over the `<video>`:

```text
HandTracker result
      ↓
normalized HandLandmarks[]
      ├── GestureEngine
      └── CameraPreview.setLandmarks()
             ↓
       mirrored Canvas overlay
```

The Canvas uses the same 4:3 aspect ratio and object-fit surface as the video. The Canvas itself is mirrored, so normalized MediaPipe coordinates can be drawn directly with `x * canvas.width` and `y * canvas.height` and still align with the mirrored video.

## Visual encoding

- Every detected hand draws all 21 landmarks.
- The standard MediaPipe five finger chains are drawn as thin lines.
- The first hand uses cyan; the second hand uses amber.
- Landmark 8 (index fingertip) and landmark 4 (thumb tip) receive a larger highlight ring because they drive Pointer and Pinch.
- The overlay is `pointer-events: none` and never blocks the camera close button.

## Status and lifecycle

- Active tracking reports `Hands detected: 0`, `Hands detected: 1`, or `Hands detected: 2` in the camera preview.
- A null or empty result clears the Canvas and reports zero hands.
- `stopCamera()` clears the Canvas before returning to mouse mode.
- A failed camera/model start clears the Canvas and keeps the existing error status.

## Single-hand diagnosis boundary

The adapter will preserve every valid hand returned by `HandLandmarkerResult`; it will not discard a one-hand result merely because the configured maximum is two. Tests will cover one-hand and two-hand normalization, empty-result clearing, and drawing coordinate mapping. The overlay status gives a direct runtime signal that distinguishes “MediaPipe detected no hand” from “the Gesture Engine did not react.”

## Testing

- Unit-test the pure overlay drawing helper with a fake 21-point hand and a mocked 2D context.
- Test `CameraPreview` creates the video/canvas/status elements, forwards a one-hand frame, reports the count, and clears it on null.
- Preserve existing HandTracker and GestureEngine tests.
- Run Vitest and TypeScript checks; perform a local browser smoke test with one hand, two hands, no hand, and camera close.
