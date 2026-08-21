# 顶层白名单 MOC 设计

## 背景

当前文件夹 Hub 生成器会为每一个包含 Markdown 笔记的文件夹生成一个 MOC，真实 Vault 因此产生了 104 个候选 Hub。这个数量过多，不符合用户希望以少量主题入口观察知识空间的目标。

## 目标

将 MOC 数量固定为 10 个。每个 MOC 对应一个指定的 Vault 第一层文件夹，所有子文件夹只在对应的顶层 MOC 内分组展示，不再生成独立 MOC。

## 顶层 MOC 白名单

只为以下 10 个第一层文件夹生成 MOC：

1. `计算机`
2. `项目`
3. `AI学习图谱`
4. `编程`
5. `AI-Knowledge-Base`
6. `modern_genai_bilibili-main`
7. `摄影与器材`
8. `阅读`
9. `python`
10. `VUE3笔记`

以下第一层文件夹明确不生成 MOC：

- `个人笔记`
- `日记`
- `学习计划`
- `雅思`
- `02_Wiki`
- `03_Prompts`
- `05_Maps`
- `游戏`
- `记账`

## 生成规则

### 顶层 MOC

每个白名单文件夹生成一个文件：

```text
<顶层文件夹>/MOC - <顶层文件夹>.md
```

例如：

```text
AI学习图谱/MOC - AI学习图谱.md
```

MOC 使用以下 Frontmatter：

```yaml
---
knowledge_role: hub
hub_source_folder: "AI学习图谱"
hub_scope: "top-level"
hub_generated: true
hub_generator_version: "1.1"
---
```

顶层 MOC 不设置 `knowledge_parent`，因为它是当前 Hub 体系的根节点。

### 子文件夹分组

子文件夹不生成 MOC，不成为独立 Hub。系统将其作为顶层 MOC 内部的分组：

```markdown
# 导语

<!-- AUAKA:BEGIN GENERATED RELATIONS -->
## Docker

- [[AI学习图谱/Docker/相关笔记]]

## 06_概念

- [[AI学习图谱/06_概念/相关笔记]]
<!-- AUAKA:END GENERATED RELATIONS -->
```

规则如下：

- 直接位于顶层文件夹中的笔记，按“根目录笔记”分组；
- 子文件夹中的笔记按其相对路径分组；
- 不创建子文件夹 MOC；
- 不创建 `MOC - 根目录.md`；
- MOC 中只保存 Wikilink，不复制笔记正文；
- 所有关系继续位于 AUAKA 生成区域内。

## 非白名单文件夹

非白名单第一层文件夹保留在原始 Vault 和知识空间中，但不生成 MOC，也不被自动归入这 10 个顶层 Hub。

这些笔记在审核报告中列为：

```text
未纳入顶层 MOC 的第一层文件夹
```

这样不会因为缺少 MOC 而删除、移动或修改这些笔记。

## 审核与写入

生成流程保持 review-first：

```text
读取 Vault
  ↓
按白名单生成 10 个候选 MOC
  ↓
生成审核报告和 proposal.json
  ↓
用户审核
  ↓
批准后才写入 Vault
```

候选草案写入 Vault 外部目录。系统不得在审核前创建或修改 Vault 内的 MOC。

## 增量维护

- 新增笔记：按其所属第一层白名单文件夹加入对应 MOC；
- 新增子文件夹：在对应顶层 MOC 中新增分组；
- 移动笔记：生成从旧分组移除、加入新分组的变更建议；
- 移出白名单：生成移除建议，不自动删除笔记；
- 非白名单笔记：只记录为未纳入顶层 MOC，不自动归类；
- 用户在 `# 导语` 或生成区域外的手动内容保持不变；
- 只更新 `AUAKA:BEGIN/END GENERATED RELATIONS` 区域。

## Artifact v2 影响

Artifact v2 中最多产生 10 个由 MOC 明确声明的 Hub 节点。子文件夹不再产生 Hub 节点，只保留普通笔记和 Wikilink 关系。

embedding 继续用于语义近邻、检索和 RAG，不参与顶层 MOC 的选择或笔记归属。

## 验收标准

- [ ] 真实 Vault 只生成 10 个候选 MOC。
- [ ] 每个 MOC 对应一个白名单第一层文件夹。
- [ ] 子文件夹不会生成独立 MOC。
- [ ] 根目录笔记不会生成根 MOC。
- [ ] 非白名单文件夹不会被自动写入或移动。
- [ ] MOC 内按子文件夹展示笔记 Wikilink。
- [ ] 候选阶段不修改真实 Vault。
- [ ] 审核报告列出 10 个候选 MOC 和未纳入白名单的文件夹。
