from __future__ import annotations

import tempfile
import unittest
from pathlib import Path


import sys

PIPELINE_SRC = Path(__file__).parents[1] / "src"
sys.path.insert(0, str(PIPELINE_SRC))

from auaka_pipeline.vault import scan_vault


class VaultScanTest(unittest.TestCase):
    def test_scans_unicode_note_and_normalizes_relative_id(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_dir:
            root = Path(temporary_dir)
            note_path = root / "02_Wiki" / "目标检测.md"
            note_path.parent.mkdir(parents=True)
            note_path.write_text("# 目标检测\n\n这是一个摘要。", encoding="utf-8")

            report = scan_vault(root)

        self.assertEqual(report.included_count, 1)
        note = report.notes[0]
        self.assertEqual(note.note_id, "02_Wiki/目标检测.md")
        self.assertEqual(note.domain, "02_Wiki")
        self.assertEqual(note.title, "目标检测")

    def test_excludes_system_assets_templates_empty_and_planning_files(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_dir:
            root = Path(temporary_dir)
            (root / "keep.md").write_text("保留。", encoding="utf-8")
            (root / "task_plan.md").write_text("计划。", encoding="utf-8")
            (root / "empty.md").write_text("\n", encoding="utf-8")
            (root / ".obsidian" / "workspace.md").parent.mkdir(parents=True)
            (root / ".obsidian" / "workspace.md").write_text("系统。", encoding="utf-8")
            (root / "attachments" / "image.md").parent.mkdir(parents=True)
            (root / "attachments" / "image.md").write_text("附件。", encoding="utf-8")
            (root / "templates" / "template.md").parent.mkdir(parents=True)
            (root / "templates" / "template.md").write_text("模板。", encoding="utf-8")

            report = scan_vault(root)

        self.assertEqual([note.note_id for note in report.notes], ["keep.md"])
        reasons = {item.relative_path: item.reason for item in report.excluded}
        self.assertEqual(reasons["task_plan.md"], "excluded_file")
        self.assertEqual(reasons["empty.md"], "empty_file")
        self.assertEqual(reasons[".obsidian/workspace.md"], "excluded_directory")
        self.assertEqual(reasons["attachments/image.md"], "excluded_directory")
        self.assertEqual(reasons["templates/template.md"], "excluded_directory")

    def test_parses_frontmatter_summary_and_wikilink_aliases(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_dir:
            root = Path(temporary_dir)
            note_path = root / "Notes" / "source.md"
            note_path.parent.mkdir(parents=True)
            note_path.write_text(
                "---\n"
                "title: 自定义标题\n"
                "tags: [vision]\n"
                "---\n\n"
                "# 不应成为摘要\n\n"
                "这是第一段 **摘要**，关联 [[目标检测|检测方法]]。\n\n"
                "第二段不会进入摘要。\n\n"
                "[[Folder/Note#细节]] [[#本节]] [[#^block-id]]\n",
                encoding="utf-8",
            )

            report = scan_vault(root)

        note = report.notes[0]
        self.assertEqual(note.title, "自定义标题")
        self.assertEqual(note.summary, "这是第一段 摘要，关联 检测方法。")
        self.assertEqual(
            [(link.raw_target, link.alias, link.heading) for link in note.wikilinks],
            [
                ("目标检测", "检测方法", None),
                ("Folder/Note", None, "细节"),
                ("", None, "本节"),
                ("", None, "^block-id"),
            ],
        )

    def test_parses_explicit_hub_and_quoted_or_unquoted_parent_wikilinks(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_dir:
            root = Path(temporary_dir)
            (root / "quoted.md").write_text(
                '---\nknowledge_role: HUB\nknowledge_parent: "[[机器人视觉]]"\n---\n正文。',
                encoding="utf-8",
            )
            (root / "unquoted.md").write_text(
                "---\nknowledge_parent: [[Topics/视觉系统|视觉]]\n---\n正文。",
                encoding="utf-8",
            )

            report = scan_vault(root)

        notes = {note.note_id: note for note in report.notes}
        self.assertEqual(notes["quoted.md"].knowledge_role, "hub")
        self.assertEqual(notes["quoted.md"].knowledge_role_raw, "HUB")
        self.assertEqual(notes["quoted.md"].knowledge_parent.raw_target, "机器人视觉")
        self.assertEqual(notes["quoted.md"].knowledge_parent_raw, "[[机器人视觉]]")
        self.assertEqual(notes["unquoted.md"].knowledge_parent.raw_target, "Topics/视觉系统")
        self.assertEqual(notes["unquoted.md"].knowledge_parent.alias, "视觉")

    def test_invalid_hierarchy_metadata_is_inert_and_preserves_existing_parsing(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_dir:
            root = Path(temporary_dir)
            (root / "note.md").write_text(
                "---\n"
                "title: 安全标题\n"
                "knowledge_role: !!python/object/apply:os.system\n"
                "knowledge_parent: __import__('os').system('echo unsafe')\n"
                "---\n\n"
                "第一段关联 [[正常链接]]。\n",
                encoding="utf-8",
            )

            note = scan_vault(root).notes[0]

        self.assertIsNone(note.knowledge_role)
        self.assertEqual(note.knowledge_role_raw, "!!python/object/apply:os.system")
        self.assertIsNone(note.knowledge_parent)
        self.assertEqual(note.knowledge_parent_raw, "__import__('os').system('echo unsafe')")
        self.assertEqual(note.title, "安全标题")
        self.assertEqual(note.summary, "第一段关联 正常链接。")
        self.assertEqual([link.raw_target for link in note.wikilinks], ["正常链接"])

    def test_resolves_links_and_reports_unresolved_targets(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_dir:
            root = Path(temporary_dir)
            (root / "source.md").write_text(
                "[[Target]] [[Missing Note|别名]]", encoding="utf-8"
            )
            (root / "Target.md").write_text("目标内容。", encoding="utf-8")

            report = scan_vault(root)

        source_note = next(note for note in report.notes if note.note_id == "source.md")
        links = source_note.wikilinks
        self.assertEqual(links[0].resolved_target_id, "Target.md")
        self.assertEqual(len(report.unresolved_links), 1)
        self.assertEqual(report.unresolved_links[0].source_id, "source.md")
        self.assertEqual(report.unresolved_links[0].raw_target, "Missing Note")

    def test_scan_does_not_modify_vault_files(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_dir:
            root = Path(temporary_dir)
            note_path = root / "note.md"
            original = "# Note\n\nContent."
            note_path.write_text(original, encoding="utf-8")
            before = note_path.stat().st_mtime_ns

            scan_vault(root)

            self.assertEqual(note_path.read_text(encoding="utf-8"), original)
            self.assertEqual(note_path.stat().st_mtime_ns, before)


if __name__ == "__main__":
    unittest.main()
