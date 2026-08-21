from __future__ import annotations

import json

import pytest

from auaka_pipeline.markdown import parse_markdown
from auaka_pipeline.moc import (
    ProposalChange,
    build_folder_hub_index,
    build_moc_proposal,
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
    assert set(by_folder) == {
        "计算机视觉/目标检测",
        "计算机视觉/图像分割",
    }
    target_hub = by_folder["计算机视觉/目标检测"]
    assert target_hub.moc_path == "计算机视觉/目标检测/MOC - 目标检测.md"
    assert target_hub.parent_moc_path is None
    assert set(target_hub.note_ids) == {
        "计算机视觉/目标检测/两阶段检测.md",
        "计算机视觉/目标检测/YOLO.md",
    }
    assert result.root_note_ids == ("根目录笔记.md",)


def test_nested_folder_uses_nearest_candidate_parent() -> None:
    result = build_folder_hub_index(
        [
            note("主题/子主题/深层/笔记.md"),
            note("主题/子主题/另一个.md"),
        ]
    )

    by_folder = {hub.folder: hub for hub in result.hubs}
    assert by_folder["主题/子主题"].parent_moc_path is None
    assert by_folder["主题/子主题/深层"].parent_moc_path == (
        "主题/子主题/MOC - 子主题.md"
    )


def test_folder_index_is_independent_of_input_order() -> None:
    notes = [note("B/二.md"), note("A/一.md"), note("A/三.md")]
    first = build_folder_hub_index(notes)
    second = build_folder_hub_index(list(reversed(notes)))
    assert first == second


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
        [note("主题/子主题/笔记.md"), note("主题/其他.md")]
    )
    draft = render_moc_draft(
        next(hub for hub in index.hubs if hub.folder == "主题/子主题"), index
    )

    assert "knowledge_role: hub" in draft
    assert "hub_source_folder: \"主题/子主题\"" in draft
    assert "# 导语\n\n<!-- AUAKA:BEGIN GENERATED RELATIONS -->" in draft
    assert "## 笔记\n\n- [[主题/子主题/笔记]]" in draft
    assert "## 说明" not in draft


def test_proposal_marks_missing_and_manual_marker_conflicts() -> None:
    index = build_folder_hub_index([note("主题/笔记.md")])
    proposal = build_moc_proposal(
        index,
        existing_mocs={"主题/MOC - 主题.md": "用户手写的 MOC，没有生成区域"},
        vault_hash="abc123",
    )

    assert proposal.vault_hash == "abc123"
    assert proposal.changes[0].action == "conflict"
    report = render_review_report(proposal)
    assert "根目录未归类笔记" in report
    assert "conflict" in report
