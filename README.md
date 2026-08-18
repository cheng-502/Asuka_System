# Auaka System

> **Version 1.0.0** · Git tag: `v1.0.0` · Local-first multimodal personal knowledge space

Auaka System 将真实 Obsidian Markdown 知识库映射为具有语义意义的 3D 知识空间，并通过本地 MediaPipe Hand Landmarker 实现 Pointer、Pinch、Open Palm 和双手空间交互。

1.0.0 是第一个可运行的 MVP 版本：MVP-1 的空间知识界面和手势交互已经完成；MVP-2A 的 Chunk Retrieval 已作为独立的本地检索基础实现，但 Voice、RAG、LLM 和 Agent 仍未纳入本版本的完成范围。

## 1.0.0 已完成功能

### 知识空间 Pipeline

```text
Obsidian Markdown
        ↓
Knowledge Parsing
        ↓
Note-level Embedding · BAAI/bge-m3 · 1024 dimensions
        ↓
UMAP 3D · random_state=42 · n_neighbors=15 · min_dist=0.25
        ↓
versioned knowledge-space.json
        ↓
Three.js knowledge space
```

- 只读扫描 Obsidian Vault，解析标题、摘要、目录、显式 `[[Wikilink]]` 和域信息。
- 使用本地 multilingual embedding；RAG/检索始终使用原始高维向量，UMAP 只负责可视化。
- `knowledge-space.json` 保存版本、模型、维度、UMAP 参数、Pipeline 版本和 Vault hash，便于追踪节点位置变化原因。
- 显式 Wikilink 与模型推断的 Semantic Link 在数据层分开保存；视觉层对重合关系合并显示。
- Semantic Link 使用 Top-K 与 similarity threshold 双重限制；当前真实 Vault 校准值为 `max_neighbors=5`、`min_similarity=0.60`。

### Three.js 3D 知识空间

- 全屏 3D 场景，初始从知识空间外部的斜向视角观察整个节点云。
- OrbitControls 支持鼠标旋转、平移和缩放。
- 节点颜色按 Obsidian 顶层目录区分，大小参考显式链接数量。
- 实线表示 Wikilink，虚线表示 Semantic Link。
- 鼠标 hover、点击选择、节点详情面板和 Summary / Wikilinks / Semantic Neighbors 三个标签页。
- Semantic Neighbors 在详情面板中最多显示当前关注节点的 5 条关系。

### 本地手势交互

- `frontend/public/models/hand_landmarker.task` 作为版本化本地模型资产。
- `frontend/public/wasm/` 提供本地 WASM runtime，支持离线演示。
- 左上角小型镜像摄像头预览，透明 Canvas 显示 MediaPipe 21 个手部标记点和连接线。
- 当前 Hand Landmarker 配置：`numHands=2`，检测、存在和追踪阈值均为 `0.6`。
- Pointer：伸出食指控制屏幕空间指针并触发节点 hover。
- Pinch：拇指与食指稳定捏合后选择节点。
- Open Palm：取消选择并收起详情。
- No Hand：清除 hover；连续 15 秒未检测到手时自动退出摄像头模式。
- 双手张开/靠近控制缩放，双手食指连线角度控制旋转。
- **Close camera · mouse mode** 可主动关闭摄像头并回到鼠标模式。

### MVP-2A Chunk Retrieval

```text
Markdown sections
        ↓
Chunk ID · Note ID · heading path · offsets · content hash
        ↓
Chunk embedding cache
        ↓
Exact cosine search over high-dimensional vectors
        ↓
POST /search
```

- 按 heading 和段落切分 Markdown，保存 chunk 内容、起止位置、所属 Note、Heading path 和 content hash。
- 使用 `chunk-vectors.npy` 与 `chunk-index.json` 保存向量和索引元数据。
- 增量更新时复用未变化 chunk，只重新编码新增或内容 hash 发生变化的 chunk。
- 提供本地 `POST /search` API，支持 `top_k`、`min_score` 和 `note_id` 过滤。
- MVP-2A 不包含语音、LLM/RAG 答案生成、Agent 动作和 Obsidian 写入。

### 真实 Vault 验证结果

- Vault：351 篇 Markdown notes。
- 未解析 Wikilink：575 条。
- Embedding：`BAAI/bge-m3`，1024 维，CPU，本地缓存 revision `5617a9f61b028005a4858fdac845db406aefb181`。
- `目标检测` 与 `object detection` 的模型 sanity check cosine similarity：`0.644856`。
- Artifact source hash：`74ecb5820ea2c09b69e0fe9ae435f3f86ad0dc433cddd8821f6791da031d036c`。

## 系统边界

```text
MVP-1：Obsidian + Note Embedding + UMAP + Three.js + Hand Tracking
MVP-2A：Chunk Embedding + Vector Cache + Exact Search API
MVP-2B：Voice + Search + RAG + LLM
MVP-3：Hermes / Agent + Obsidian 写入 + 自动重新生成空间
```

重要设计原则：

- RAG 永远使用原始高维 embedding。
- UMAP 只用于给人看的 3D 投影，浏览器不执行 UMAP。
- `knowledge-space.json` 是可追溯 artifact，不是临时前端数据。
- Vault 默认只读；私有 artifact、embedding cache 和模型 cache 不提交到 Git。

## 快速开始

### 安装

在仓库根目录执行：

```powershell
python -m pip install -e ".\pipeline[embedding]"
cd frontend
npm install
```

### 启动浏览器 Demo

```powershell
cd frontend
npx vite --host=127.0.0.1
```

打开：`http://127.0.0.1:5173/`

默认页面加载仓库内的小型 fixture。真实 Vault 的生成、Artifact 替换和完整手势验收请参考 [`docs/demo-runbook.md`](docs/demo-runbook.md)。

### 生成真实知识空间

```powershell
python -m auaka_pipeline.cli generate `
  --vault "C:\Users\lin20\Desktop\广药文件\Obsidian Vault" `
  --artifact "data\knowledge-space.real.json" `
  --embedding-cache "data\embeddings" `
  --max-neighbors 5 `
  --min-similarity 0.60
```

私有 Artifact 默认被 `.gitignore` 排除。要在本地浏览器中预览真实 Artifact，可按 runbook 的说明复制到 `frontend/public/data/`，不要将其提交到公共仓库。

### 构建 Chunk Retrieval 索引

```powershell
auaka-pipeline chunks `
  --vault "C:\Users\lin20\Desktop\广药文件\Obsidian Vault" `
  --cache "data\chunks"

auaka-pipeline serve --index "data\chunks" --host 127.0.0.1 --port 8765
```

查询：

```powershell
curl.exe -X POST http://127.0.0.1:8765/search `
  -H "Content-Type: application/json" `
  -d '{"query":"手眼标定","top_k":5,"min_score":0.60}'
```

## 验证命令

```powershell
# Frontend
cd frontend
npm test
npm run typecheck
npm run build

# Pipeline
cd ..
python -m pytest pipeline/tests
```

摄像头权限、光照、摄像头距离和真实手势仍需要在目标机器上进行人工验收；自动化测试不能替代这一步。

## 当前待办事项

### P0：手势交互校准

- [ ] 增加可见的屏幕空间 Pointer 光标、选取半径和节点命中反馈。
- [ ] 统一摄像头预览、标记点和知识空间 Pointer 的镜像坐标约定。
- [ ] 将 Pinch 从固定图像距离改成相对手掌尺度，并加入开合滞回和更稳定的时间确认。
- [ ] 为 Pointer 增加低延迟滤波、死区、目标吸附或 dwell selection，降低节点选取难度。
- [ ] 将双手缩放改成基于初始基准距离的归一化 log mapping，加入滤波、死区、限速和帧率无关计算。
- [ ] 对双手旋转加入角度解包、滤波、死区和旋转速度上限。

### P1：交互验证基础设施

- [ ] 增加 landmark trace 录制与回放，不依赖摄像头即可复现实验。
- [ ] 记录 pointer jitter、Pinch 成功率、误触发次数、选择耗时、缩放过冲和旋转过冲。
- [ ] 建立不同光照、摄像头距离、背景、手势速度和窗口尺寸的测试矩阵。
- [ ] 对模型阈值、滤波参数和手势映射建立版本化 calibration profile。
- [ ] 评估 Three.js bundle size，并在不牺牲离线启动的情况下拆分加载。

### P2：产品路线

- [ ] MVP-2B：语音输入、Chunk Search、知识空间 focus、RAG 和 LLM 回答。
- [ ] MVP-3：Hermes / 自建 Agent，支持 `retrieve_knowledge()`、`create_note()` 和数字工具调用。
- [ ] Agent 写入 Obsidian 后自动触发增量 embedding、artifact 生成和新节点显示。
- [ ] 将 Agent 的执行轨迹、引用原文和空间变化可视化。

## 开发者需要学习和验证的思路

### 1. HCI：先学习“选取任务”，再调参数

Pointer 和 Pinch 不是简单的模型输出问题，而是目标获取问题。建议学习：

- Fitts's Law：目标大小、移动距离和选择时间的关系。
- Target acquisition、dwell selection、clutching 和 hysteresis。
- Speed–accuracy trade-off：灵敏度越高不代表效率越高。
- 3D 场景中的屏幕空间选取、目标吸附和选取半径。

验证时不要只问“能不能选中”，还要记录：

```text
time_to_select
selection_success_rate
false_pinch_count
pointer_jitter_px
overshoot_distance
```

### 2. 计算机视觉：统一三套坐标

必须明确区分：

```text
Raw camera coordinates
        ↓ mirror / unmirror
Preview coordinates
        ↓ viewport mapping
Knowledge-space screen coordinates
        ↓ NDC
Three.js Raycaster coordinates
```

重点学习 MediaPipe landmark 的 `x/y/z` 语义、镜像显示、viewport 映射、NDC 和 Raycaster。当前最重要的验证是：用户向屏幕右侧移动手时，预览中的手、标记点、Pointer 是否都向右移动。

### 3. 信号处理与控制：让手势稳定而不是迟钝

建议学习并比较：

- EMA 低通滤波：实现简单，适合第一轮。
- One Euro Filter：在低延迟和低抖动之间动态平衡。
- Kalman Filter：适合有明确运动模型的场景，但 MVP 阶段可能偏复杂。
- Dead zone、hysteresis、debounce、稳定帧和 frame-rate independent mapping。

每个手势都应设计成状态机：

```text
Idle → Candidate → Active → Release → Idle
```

不要把每帧 landmark 差值直接当成最终动作。

### 4. 双手缩放和旋转：使用相对量与基准量

缩放建议记录进入双手模式时的基准：

```text
palm_scale = average(left_palm_scale, right_palm_scale)
distance_normalized = fingertip_distance / palm_scale
zoom_signal = log(distance_normalized / baseline_distance)
```

旋转建议记录两根食指连线的初始角度：

```text
angle_signal = unwrap(current_angle - baseline_angle)
```

然后分别加入平滑、死区、限速和退出重置。这样参数的物理意义比单纯调整 `0.01` 或 `1.5` 更清楚。

### 5. 实验设计：用 trace replay 替代反复“凭感觉调参”

建议开发一个不依赖摄像头的回放工具：

```text
recorded landmarks
        ↓
GestureEngine replay
        ↓
events + metrics
        ↓
parameter comparison
```

每次实验固定一组 trace，只改变一个变量，例如 `pinch_open_threshold` 或 `pointer_smoothing`。这样才能知道改动是否真的改善了结果。

建议至少覆盖：

- 手离摄像头近、中、远三种距离。
- 正常光照、逆光和复杂背景。
- 慢速、正常速度和快速移动。
- 单手、双手、手暂时离开画面。
- 不同窗口尺寸和摄像头分辨率。

## 文档和运行手册

- [`docs/demo-runbook.md`](docs/demo-runbook.md)：真实 Vault 生成、启动和手势验收。
- [`tasks/plan.md`](tasks/plan.md)：任务拆解和工程进度。
- [`tasks/todo.md`](tasks/todo.md)：MVP-1 完成清单。
- [`findings.md`](findings.md)：模型、阈值、UMAP、手势和调试发现。
- [`progress.md`](progress.md)：按日期记录的实现和验证过程。
- [`docs/superpowers/specs/`](docs/superpowers/specs/)：已确认的设计文档。

## 发布信息

当前发布：`v1.0.0`。

该标签对应第一个完整可运行的本地 MVP。后续手势校准和 MVP-2B/MVP-3 应通过新的版本标签发布，例如 `v1.1.0` 或 `v2.0.0`，不要覆盖 `v1.0.0`。

## License

License 尚未最终确定；在明确许可证前，请将本仓库视为保留所有权利。
