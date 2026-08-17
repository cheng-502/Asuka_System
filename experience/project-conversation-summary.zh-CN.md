# Auaka System 对话总结

## 项目目标

Auaka System 计划构建一个以个人知识空间为核心的多模态个人知识助手，长期方向包括：

- Spatial Knowledge Interface：把个人知识映射为可探索的三维空间。
- Multimodal HCI：通过视觉、语音和空间手势与知识交互。
- Personal Agent：由 Agent 驱动电脑、Obsidian 和其他数字工具。

## MVP 路线

### MVP-1：Gesture-Controlled Personal Knowledge Space

第一版范围已冻结为：

```text
Obsidian Markdown
        ↓
Note-level Embedding
        ↓
UMAP 3D
        ↓
Three.js

Camera
        ↓
MediaPipe Hand Landmarker
        ↓
Gesture Engine
        ↓
Pointer / Pinch / Open Palm
        ↓
Three.js interaction
```

MVP-1 暂不包含 RAG、Chunk Embedding、Vector DB、LLM、Agent、语音、Hermes、PCB 或 Vault 写入。

目标 Demo 是：摄像头识别手部动作，食指移动屏幕指针，拇指与食指捏合选中知识节点，节点展开并显示相关知识；张开手掌用于取消选择或收起详情。

## 交互与界面决策

- 使用全屏 3D 知识空间。
- 摄像头预览固定在左上角。
- Pointer：伸出食指，经过平滑处理后控制屏幕指针。
- Pinch：食指与拇指捏合，选中知识节点。
- Open Palm：取消选择或收起详情。
- 使用屏幕空间坐标和 Three.js Raycaster，不直接把手部世界坐标映射到 3D 场景。
- 节点显示笔记标题。
- 详情面板包含 Summary、Wikilinks、Semantic Neighbors 三类信息，并支持切换。
- 实线表示显式 Obsidian Wikilink，虚线表示语义近邻关系。
- Wikilink 与 Semantic Link 重合时，视觉上合并为一条边，但数据层保留两种关系。

## 知识空间运算

- RAG（未来 MVP-2）永远使用原始高维 embedding。
- UMAP 只负责生成供人观察的三维坐标，不参与检索。
- UMAP 在 Python 离线 Pipeline 中执行，固定 `n_components=3` 和 `random_state=42`。
- 浏览器只消费持久化的三维坐标，不在运行时执行 UMAP。
- 语义近邻使用 Top-K 与最低相似度阈值共同筛选，不强行补足 5 条边。
- 当前视图对关注节点最多显示 5 条语义近邻；真实 Vault 跑通后再根据相似度分布确定阈值。

## Embedding 决策

- 优先使用 multilingual embedding，使“目标检测”和“object detection”等跨语言概念进入相近语义区域。
- 首选模型：`BAAI/bge-m3`，预期维度为 1024。
- 第一轮需要做跨语言相似度 sanity check。
- Hand Landmarker 模型固定为本地版本：`frontend/public/models/hand_landmarker.task`，保证可复现、稳定并支持离线演示。

## 数据与项目约束

- 知识图谱输入 Vault：`C:\Users\lin20\Desktop\广药文件\Obsidian Vault`
- 当前 Vault 约有 387 篇 Markdown 文件，目标按 100–1,000 篇规模设计。
- Vault 只读，不修改原始笔记。
- `knowledge-space.json` 从第一版开始版本化，记录 Pipeline、Embedding、UMAP 和 Vault hash 等生成上下文。
- 高维 embedding 与浏览器展示用的 `knowledge-space.json` 分离保存。
- 可追踪节点位置变化是由 Vault、Embedding 模型、UMAP 参数还是 Pipeline 版本变化造成的。

## 工程工作流与当前状态

已完成：

- MVP-1 需求确认与范围冻结。
- 中英文架构设计文档。
- Implementation tasks 计划文件。
- Git worktree 隔离：`codex/mvp1-implementation`。
- GitHub 远程仓库：`https://github.com/cheng-502/Asuka_System.git`。
- 当前 MVP-1 分支已推送到 GitHub。

当前进行中：

- Task 1：Bootstrap the dual-runtime project。
- 已先添加 Python CLI 的验收测试，下一步补齐 Python Pipeline 与 Vite/TypeScript 前端骨架。

后续顺序：

1. 建立数据契约与版本化 schema。
2. 实现 Obsidian Markdown 解析。
3. 接入 multilingual note embedding。
4. 实现 UMAP 3D 离线生成。
5. 实现 Three.js 知识空间。
6. 实现 MediaPipe Hand Landmarker 与 Pointer / Pinch / Open Palm 手势事件。
7. 进行浏览器测试、代码审查和完成前验证。
