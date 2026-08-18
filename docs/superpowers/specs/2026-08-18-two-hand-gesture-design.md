# Two-Hand Zoom and Rotate Design

## Approved behavior

- One hand keeps the existing Pointer, Pinch, and Open Palm behavior.
- Two open palms activate spatial controls instead of single-hand Pointer/Open Palm events.
- Moving the two index fingertips apart emits positive `zoom` deltas; moving them together emits negative deltas.
- Rotating the line between the two index fingertips emits `rotate` deltas.
- GestureEngine emits incremental, thresholded deltas so camera motion is smooth and does not depend on absolute hand world coordinates.
- Three.js receives `zoom` through OrbitControls dolly methods and `rotate` through OrbitControls horizontal orbit methods.
- Mouse OrbitControls remain available at all times; closing the camera returns to mouse-only mode.

## Boundaries

- HandTracker requests at most two hands and forwards all normalized landmark sets.
- GestureEngine requires both hands to be open before emitting zoom/rotate events.
- The existing no-hand timeout and 15-second auto-exit behavior remain unchanged.

## Verification

- GestureEngine tests cover two-hand baseline, zoom direction, rotation delta, and single-hand regression.
- HandTracker tests cover two-hand result normalization and `numHands=2` configuration.
- InteractionController tests route zoom and rotate into the scene target.
- Frontend full tests and production build must pass.
