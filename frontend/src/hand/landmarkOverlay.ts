import type { HandLandmarks } from "./GestureEngine";

const HAND_COLORS = ["#67e8f9", "#fbbf24"] as const;
const HIGHLIGHT_LANDMARKS = new Set([4, 8]);

const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [0, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [0, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [0, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [5, 9],
  [9, 13],
  [13, 17],
];

export function renderHandLandmarks(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  hands: readonly HandLandmarks[],
): void {
  context.clearRect(0, 0, width, height);

  hands.forEach((landmarks, handIndex) => {
    if (landmarks.length < 21) return;
    const color = HAND_COLORS[handIndex % HAND_COLORS.length];
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = 2;

    for (const [startIndex, endIndex] of HAND_CONNECTIONS) {
      const start = landmarks[startIndex];
      const end = landmarks[endIndex];
      context.beginPath();
      context.moveTo(start.x * width, start.y * height);
      context.lineTo(end.x * width, end.y * height);
      context.stroke();
    }

    landmarks.forEach((landmark, landmarkIndex) => {
      context.beginPath();
      context.arc(
        landmark.x * width,
        landmark.y * height,
        HIGHLIGHT_LANDMARKS.has(landmarkIndex) ? 5 : 3,
        0,
        Math.PI * 2,
      );
      context.fill();
    });
  });
}
