# Camera Exit and Mouse Fallback Design

## Goal

让手势交互可以被自动或手动退出，同时保证鼠标交互始终可用。

## Approved behavior

- 摄像头启动后，Three.js 的鼠标 OrbitControls、hover 和点击选择继续可用。
- 连续 15 秒没有检测到手时，触发一次自动退出：停止 Hand Landmarker 循环、停止摄像头轨道、清空手势状态和当前 hover，并恢复鼠标模式。
- 摄像头预览增加“关闭摄像头 / 返回鼠标模式”按钮，用户可以随时主动触发相同的退出流程。
- 自动或手动退出不会关闭网页，不会销毁知识空间，不会清空鼠标选中的知识节点详情；只清除手势造成的 hover 和追踪状态。
- 用户再次点击“启用摄像头”可以重新启动手势交互。

## Boundaries

- `GestureEngine` 负责在配置的无手帧超时后发出一次 `auto_exit` 事件。
- `HandTracker` 负责停止 requestAnimationFrame、MediaStream tracks 和 MediaPipe landmarker。
- `CameraPreview` 负责显示启用/关闭按钮和状态。
- `main.ts` 负责把自动退出和手动退出连接到同一个 `stopCamera` 生命周期函数。

## Verification

- GestureEngine 测试自动退出只触发一次，重新检测到手后可重新计时。
- HandTracker 测试 `stop()` 会停止媒体轨道、清空视频源并释放 landmarker。
- CameraPreview 测试启用状态下显示关闭按钮并调用退出回调。
- 前端全量测试和生产构建通过。
