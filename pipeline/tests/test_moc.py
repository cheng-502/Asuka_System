from __future__ import annotations

import json

import pytest

from auaka_pipeline.markdown import parse_markdown
from auaka_pipeline.moc import (
    DEFAULT_TOP_LEVEL_MOC_FOLDERS,
    ProposalChange,
    build_folder_hub_index,
    build_moc_proposal,
    apply_moc_proposal,
    proposal_to_dict,
    render_moc_draft,
    render_review_report,
)


def note(path: str) -> object:
    return parse_markdown(f"# {path}\n\n内容", path)


def test_folder_index_creates_one_hub_per_non_root_note_folder() -> None:
    result = build_folder_hub_index(
        [
            note("计算机视觉/目标检测/YOLO.md"),
            note("计算机视觉/目标检测/两阶段检测.md"),
            note("计算机视觉/图像分割/分割.md"),
            note("根目录笔记.md"),
        ]
    )

    by_folder = {hub.folder: hub for hub in result.hubs}
    assert set(by_folder) == set()
    assert result.excluded_top_level_folders == ("计算机视觉",)
    assert set(result.excluded_note_ids) == {
        "计算机视觉/目标检测/YOLO.md",
        "计算机视觉/目标检测/两阶段检测.md",
        "计算机视觉/图像分割/分割.md",
    }
    assert result.root_note_ids == ("根目录笔记.md",)


def test_folder_index_generates_only_whitelisted_top_level_hubs_and_groups_children() -> None:
    result = build_folder_hub_index(
        [
            note("AI学习图谱/Docker/入门.md"),
            note("AI学习图谱/06_概念/向量.md"),
            note("AI学习图谱/首页.md"),
            note("个人笔记/私人.md"),
        ]
    )

    assert len(result.hubs) == 1
    hub = result.hubs[0]
    assert hub.folder == "AI学习图谱"
    assert hub.moc_path == "AI学习图谱/MOC - AI学习图谱.md"
    assert hub.parent_moc_path is None
    assert hub.note_groups == (
        ("", ("AI学习图谱/首页.md",)),
        ("06_概念", ("AI学习图谱/06_概念/向量.md",)),
        ("Docker", ("AI学习图谱/Docker/入门.md",)),
    )
    assert result.excluded_top_level_folders == ("个人笔记",)


def test_nested_folder_uses_nearest_candidate_parent() -> None:
    result = build_folder_hub_index(
        [
            note("主题/子主题/深层/笔记.md"),
            note("主题/子主题/另一个.md"),
        ]
    )

    assert result.hubs == ()


def test_folder_index_is_independent_of_input_order() -> None:
    notes = [note("AI学习图谱/二.md"), note("项目/一.md"), note("编程/三.md")]
    first = build_folder_hub_index(notes)
    second = build_folder_hub_index(list(reversed(notes)))
    assert first == second


def test_default_whitelist_has_exactly_ten_folders() -> None:
    assert len(DEFAULT_TOP_LEVEL_MOC_FOLDERS) == 10


def test_proposal_contract_is_json_serializable_and_rejects_cycles() -> None:
    change = ProposalChange(
        action="create",
        path="主题/MOC - 主题.md",
        approval="pending",
        reason="new folder hub",
    )
    payload = proposal_to_dict(change)
    assert json.loads(json.dumps(payload, ensure_ascii=False)) == payload

    with pytest.raises(ValueError, match="parent cycle"):
        build_folder_hub_index(
            [note("A/B.md"), note("A/B/C.md")],
            parent_overrides={"A": "A/B", "A/B": "A"},
        )


def test_moc_draft_has_empty_intro_and_generated_relations() -> None:
    index = build_folder_hub_index(
        [note("AI学习图谱/子主题/笔记.md"), note("AI学习图谱/其他.md")]
    )
    draft = render_moc_draft(
        next(hub for hub in index.hubs if hub.folder == "AI学习图谱"), index
    )

    assert "knowledge_role: hub" in draft
    assert "hub_source_folder: \"AI学习图谱\"" in draft
    assert "# 导语\n\n<!-- AUAKA:BEGIN GENERATED RELATIONS -->" in draft
    assert "## 子主题" in draft
    assert "- [[AI学习图谱/子主题/笔记]]" in draft
    assert "## 说明" not in draft


def test_proposal_marks_missing_and_manual_marker_conflicts() -> None:
    index = build_folder_hub_index([note("AI学习图谱/笔记.md")])
    proposal = build_moc_proposal(
        index,
        existing_mocs={"AI学习图谱/MOC - AI学习图谱.md": "用户手写的 MOC，没有生成区域"},
        vault_hash="abc123",
    )

    assert proposal.vault_hash == "abc123"
    assert proposal.changes[0].action == "conflict"
    report = render_review_report(proposal)
    assert "根目录未归类笔记" in report
    assert "conflict" in report


def test_apply_requires_explicit_approval_and_preserves_manual_moc_content(tmp_path) -> None:
    vault = tmp_path / "vault"
    folder = vault / "AI学习图谱"
    folder.mkdir(parents=True)
    (folder / "笔记.md").write_text("# 笔记", encoding="utf-8")
    index = build_folder_hub_index([note("AI学习图谱/笔记.md")])
    proposal = build_moc_proposal(index, vault_hash="hash")
    drafts = {path: text for path, text in proposal.drafts.items()}

    with pytest.raises(PermissionError, match="explicit approval"):
        apply_moc_proposal(vault, proposal, drafts=drafts, approved=False)

    apply_moc_proposal(vault, proposal, drafts=drafts, approved=True, current_vault_hash="hash")
    target = folder / "MOC - AI学习图谱.md"
    assert target.exists()

    manual = target.read_text(encoding="utf-8").replace(
        "# 导语\n", "# 导语\n\n我的长期主题说明\n"
    )
    target.write_text(manual, encoding="utf-8")
    updated = build_moc_proposal(index, existing_mocs={target.relative_to(vault).as_posix(): manual}, vault_hash="hash")
    apply_moc_proposal(vault, updated, drafts=updated.drafts, approved=True, current_vault_hash="hash")
    assert "我的长期主题说明" in target.read_text(encoding="utf-8")


def test_apply_rejects_stale_vault_hash(tmp_path) -> None:
    vault = tmp_path / "vault"
    (vault / "AI学习图谱").mkdir(parents=True)
    (vault / "AI学习图谱" / "笔记.md").write_text("# 笔记", encoding="utf-8")
    index = build_folder_hub_index([note("AI学习图谱/笔记.md")])
    proposal = build_moc_proposal(index, vault_hash="old")
    with pytest.raises(ValueError, match="Vault hash mismatch"):
        apply_moc_proposal(vault, proposal, drafts=proposal.drafts, approved=True, current_vault_hash="new")
