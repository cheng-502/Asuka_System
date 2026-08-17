# 手势控制的个人知识空间——MVP-1 设计文档

**状态：** 架构已获用户批准；等待中文文稿审阅后进入实现计划阶段。

**日期：** 2026-08-18

## 1. 目的

MVP-1 用来验证 Auaka System 最具辨识度的核心：将真实 Obsidian 知识库转换为具有语义意义的 3D 空间，并允许用户通过手部手势探索和选择其中的知识节点。

第一版 Demo 的完整闭环是：

```text
手进入摄像头画面
  → 食指移动屏幕指针
  → 捏合选中发光知识节点
  → 节点展开
  → 关联知识显现
```

这一版本质上是空间知识界面，而不是智能助手。它不会回答问题、检索 chunk、调用 LLM，也不会修改 Obsidian Vault。

## 2. 范围

### 包含内容

- 从指定 Vault 读取 Obsidian Markdown 笔记。
- 递归读取 Markdown，并应用明确的排除规则。
- 使用本地多语言 Note-level Embedding。
- 使用固定随机种子将笔记投影到 3D UMAP 空间。
- 生成版本化的 `knowledge-space.json`。
- 使用 Three.js 全屏渲染知识空间。
- 使用固定版本的本地 MediaPipe Hand Landmarker 模型。
- 支持 Pointer、Pinch、Open Palm、No Hand 手势事件。
- 使用屏幕空间指针和 Three.js Raycaster 选择节点。
- 展开节点，并通过 Summary、Wikilinks、Semantic Neighbors 三个 Tab 查看详情。
- 显示显式 Wikilink 关系和推断出的语义近邻关系。

### 不包含内容

- Chunk Embedding、Vector DB、RAG、LLM、语音、Hermes 或其他 Agent Runtime。
- 自动创建笔记或修改 Vault。
- 自定义硬件、PCB、深度摄像头或 VR 控制器。
- 第一版本地 API 服务。

## 3. 架构选择

采用“Python 离线 Knowledge Pipeline + Vite/TypeScript 浏览器应用”的架构。

```text
Python Knowledge Pipeline
  Obsidian Vault
    → Markdown Parser
    → 多语言 Note Embedding
    → UMAP 3D Projection
    → Semantic Neighbor Builder
    → 版本化 knowledge-space.json

浏览器应用
  knowledge-space.json → Three.js Scene
  Camera → MediaPipe Hand Landmarker
         → Gesture Engine
         → Pointer / Pinch / Open Palm Events
         → Three.js Interaction Controller
```

浏览器不执行 Embedding 和 UMAP，只加载生成好的 artifact，并负责实时可视化和交互。这样可以保持交互循环响应，同时让离线计算具备可复现性。

### MVP-1 放弃的替代方案

1. **全部在浏览器中计算：** 部署更简单，但模型加载、UMAP 计算、内存压力和浏览器差异会削弱 Demo 的稳定性。
2. **Python 本地 API + 浏览器：** 扩展性更强，但会提前引入服务启动、端口管理、请求失败和状态同步等复杂性。

## 4. 组件边界

### Python Knowledge Pipeline

职责：

- 扫描并过滤 Vault。
- 解析笔记元数据、确定性摘要、顶层知识领域和 Wikilink。
- 在本地生成多语言 Note-level Embedding。
- 计算 UMAP 坐标。
- 计算语义近邻候选及相似度。
- 计算源 Vault 指纹。
- 写入 `knowledge-space.json` 和本地 Embedding 缓存。
- 输出被跳过的笔记以及未解析链接的索引报告。

Pipeline 不得修改 Vault 原文件。

### 浏览器数据层

职责：

- 加载 `knowledge-space.json`。
- 在数据边界校验 artifact schema。
- 向场景层提供类型化的节点和关系。
- 对格式错误或缺失目标的关系进行安全降级，不能让异常穿透渲染循环导致 Three.js 崩溃。

### Three.js 场景层

职责：

- 渲染 3D 场景和相机控制。
- 将节点位置映射为 UMAP 坐标。
- 将 domain 映射为颜色，将 link_count 映射为节点大小，将 focus 映射为发光状态。
- 执行 Raycaster 命中检测。
- 渲染 Wikilink 和 Semantic Link 的不同样式。
- 协调选中节点状态与详情面板。

### Hand Tracking 与 Gesture Engine

职责：

- 加载固定版本的本地 Hand Landmarker 模型。
- 将 landmarks 转换为 Pointer、Pinch、Open Palm 和 No Hand 状态。
- 对 Pointer 坐标进行平滑。
- 应用稳定帧识别、冷却时间和“释放后才能再次触发”规则。
- 输出语义事件，但不导入或调用 Three.js 内部实现。

### Interaction Controller

职责：

- 消费 Gesture Events。
- 将归一化 Pointer 坐标转换为 Three.js Raycaster 查询。
- 改变悬停、选中和详情面板状态。
- 将 Open Palm 解释为取消/收起。
- 摄像头不可用时，保证场景仍可使用鼠标操作。

## 5. Vault 数据读取

源 Vault：

```text
C:\Users\lin20\Desktop\广药文件\Obsidian Vault
```

当前只读统计发现该 Vault 包含 387 个 Markdown 文件。

解析器递归读取 Markdown，并排除：

- `.obsidian/`
- `attachments/`、`img/` 以及同类资源目录
- `templates/`
- 空文件
- `task_plan.md`、`findings.md`、`progress.md`
- 其他明确配置为系统文件或生成文件的内容

排除列表应当是配置，而不是完全硬编码，从而允许同一个 Pipeline 复用于其他 Vault。

### 笔记身份

MVP-1 中，`note_id` 使用 Vault 内的标准化相对路径，并统一使用 `/` 作为分隔符。这样 ID 具备可读性，可以直接从节点定位回原始文件。未来可以增加 frontmatter 标识符，而不改变其余 artifact 契约。

### 内容摘要

MVP-1 的摘要采用确定性规则生成：读取 frontmatter 之后的第一个非空段落，并截断到配置的展示长度。不使用 LLM。

## 6. Embedding 与空间投影

### Embedding

- 目标模型：`BAAI/bge-m3`，或在实现验证阶段确认的等价多语言模型。
- 运行环境：本地 Python `sentence-transformers`。
- 选定 BGE-M3 配置的预期向量维度为 1024。
- 相似度指标：对归一化向量使用 cosine similarity。
- `目标检测` 和 `object detection` 是必需的跨语言 sanity check。
- 浏览器不接收完整的高维 Embedding 矩阵。

### UMAP

- `n_components: 3`
- `random_state: 42`
- 使用与 Embedding 相似度策略一致的 metric。
- 坐标持久化后只作为展示坐标消费。
- MVP-1 不保证在数据、模型、UMAP 参数或 Pipeline 改变后，节点绝对坐标仍然稳定。

### 版本化 artifact

生成的 artifact 必须保存计算上下文：

```json
{
  "version": 1,
  "generated_at": "2026-08-18T12:00:00Z",
  "pipeline": {
    "version": "mvp1.0.0"
  },
  "embedding": {
    "model": "BAAI/bge-m3",
    "dimension": 1024,
    "metric": "cosine",
    "normalized": true
  },
  "umap": {
    "n_components": 3,
    "random_state": 42,
    "metric": "cosine"
  },
  "source": {
    "vault_hash": "...",
    "note_count": 387
  },
  "nodes": [],
  "links": []
}
```

Vault hash 根据所有已纳入文件的相对路径和内容 hash 排序计算。以后如果知识空间位置发生变化，就可以追踪变化来自 Vault、模型、UMAP 参数还是 Pipeline 版本。

### 独立的 Embedding 缓存

```text
data/embeddings.npy
data/embedding-index.json
```

缓存保留高维向量，用于重新计算以及未来 MVP-2 的检索工作。浏览器不加载这些文件；它们也不能替代版本化的空间展示 artifact。

## 7. 关系模型

数据层保留两种不同关系：

- `wikilink`：用户显式写下的 `[[...]]` 关系。
- `semantic`：模型推断出的关系，并带有 similarity 值。

如果同一对节点同时具备两种关系，一个数据记录保留两种类型：

```json
{
  "source": "02_Wiki/目标检测.md",
  "target": "AI-Knowledge-Base/object-detection.md",
  "types": ["wikilink", "semantic"],
  "similarity": 0.86,
  "is_unresolved": false
}
```

Wikilink 不会因为视觉降噪而被删除。Semantic Neighbor 使用可配置的 Top-K 候选策略，并且必须同时满足 similarity threshold。阈值要等真实 Vault 第一次运行后再校准，不能直接假定为 `0.7`。

渲染规则：

- 实线：Wikilink。
- 虚线：Semantic Link。
- 同一对节点同时存在两种关系：视觉上合并为一条边，但保留合并后的关系元数据。
- 未选中节点：关系线采用低透明度或局部显示。
- 选中节点：显示完整 Wikilink 邻域，以及最多 5 条通过阈值的语义近邻边。

## 8. 手势与交互契约

```typescript
type GestureEvent =
  | {
      type: "pointermove";
      x: number;
      y: number;
      confidence: number;
      timestamp: number;
    }
  | {
      type: "pinchstart";
      x: number;
      y: number;
      confidence: number;
      timestamp: number;
    }
  | {
      type: "openpalm";
      confidence: number;
      timestamp: number;
    }
  | {
      type: "nohand";
      timestamp: number;
    };
```

手势含义：

- Pointer：伸出食指，控制 2D 屏幕指针。
- Pinch：食指和拇指捏合，选中指针下方的节点。
- Open Palm：取消选中并收起详情。
- No Hand：超过超时时间后清除 Pointer 和 Hover 状态。

选中流程使用归一化的食指尖端坐标和 Three.js Raycaster。手部坐标不会直接被当作 Three.js 世界坐标。

初始可调参数：

```typescript
const gestureConfig = {
  pointerSmoothing: 0.25,
  pinchStableFrames: 5,
  pinchCooldownMs: 400,
  openPalmStableFrames: 8,
  noHandTimeoutMs: 600,
  semanticMaxNeighbors: 5
};
```

这些值是第一轮校准参数，不是不可修改的永久协议。

## 9. 场景与详情界面

布局：

- 全屏 Three.js 知识空间。
- 左上角显示小型摄像头预览。
- 摄像头预览旁或下方显示当前手势状态。
- 选中笔记后的详情面板不能遮挡主要空间视图。

节点视觉编码：

- 位置：UMAP 3D 坐标。
- 颜色：Obsidian 顶层文件夹/知识领域。
- 大小：显式 Wikilink 数量。
- 发光：Pointer 悬停或选中状态。

选中节点详情：

- 标题始终显示。
- `Summary` Tab：确定性摘要。
- `Wikilinks` Tab：显式关联。
- `Semantic Neighbors` Tab：通过阈值的语义关联。

交互状态：

```text
Browsing → Hovering       （Pointer 命中节点）
Hovering → Browsing       （Pointer 离开节点）
Hovering → Selected       （PinchStart）
Selected → DetailTab      （选择详情 Tab）
Selected/DetailTab → Browsing （OpenPalm）
任意活动状态 → NoHand     （NoHand 超时）
NoHand → Browsing         （检测到手）
```

## 10. 错误处理

### Pipeline

- 单篇 Markdown 损坏时跳过并记录报告。
- Embedding 模型缺失、Embedding 失败或 UMAP 失败时，Pipeline 终止，并保留上一份有效 artifact。
- 未解析的 Wikilink 作为元数据保留，不阻塞生成。
- artifact 使用原子写入，失败的运行不能留下半成品 `knowledge-space.json`。

### 前端

- artifact schema 无效时显示可操作的错误状态。
- 关系目标缺失时不能让渲染循环崩溃。
- 摄像头权限缺失时关闭手势模式，但仍允许使用鼠标浏览 3D 空间。
- 手部短暂丢失时暂时保留状态；超时后清除 Pointer 和 Hover。

## 11. 验证方案

### Pipeline 检查

- 排除规则符合配置的 Vault 策略。
- Note ID 和 Vault hash 是确定性的。
- `目标检测` 与 `object detection` 通过跨语言 Embedding sanity check。
- 输入、模型、UMAP 参数和随机种子不变时，重复运行得到相同坐标。
- 输出 similarity 分布，用于校准 threshold。
- artifact 在发布前通过 schema 校验。
- Wikilink 和 Semantic Link 类型在去重合并后仍然保留。

### 前端检查

- artifact 加载和 schema 校验。
- 归一化 Pointer 坐标到 Raycaster 的映射。
- 使用合成事件测试 Gesture Event reducer 和交互状态机。
- 验证关系线样式和合并边元数据。
- 验证 Summary、Wikilinks、Semantic Neighbors 三个 Tab 的切换。
- 验证无摄像头、无手、数据损坏和未解析链接时的安全行为。

### 手动 Demo 验收

1. 从真实 Vault 加载生成后的 artifact。
2. 确认 3D 空间包含已纳入的笔记，并显示知识领域颜色。
3. 确认左上角显示摄像头预览和手势状态。
4. 移动食指，确认 Pointer 平滑跟随。
5. 捏合一个节点，确认只选中一次，不重复触发。
6. 检查三个详情 Tab。
7. 确认 Wikilink 和 Semantic Link 的渲染规则。
8. 张开手掌，确认节点取消选择、详情收起。
9. 暂时移开手，确认 No Hand 超时行为。
10. 不修改源文件重新运行 Pipeline，确认坐标保持稳定。

## 12. 后续兼容性

MVP-2 可以在不改变 Note-level 展示契约的前提下，增加独立的 Chunk Embedding → Vector DB → RAG 路径。

MVP-3 可以加入 Agent：创建或更新 Obsidian 笔记、重新运行 Pipeline，并让新节点出现在知识空间中。版本化 artifact 和 source hash 会让这些变化可追踪，而不是变成无法解释的“节点位置突然变了”。
