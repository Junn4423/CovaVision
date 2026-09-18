import pytest

from app.recognition.face_matching import FaceCandidate, find_best_match


def test_find_best_match_returns_highest_similarity_above_threshold() -> None:
    result = find_best_match(
        [1.0, 0.0],
        [
            FaceCandidate(employee_id="emp-1", display_name="An", embedding=[0.7, 0.7]),
            FaceCandidate(employee_id="emp-2", display_name="Bình", embedding=[1.0, 0.0]),
        ],
        threshold=0.8,
    )

    assert result.employee_id == "emp-2"
    assert result.display_name == "Bình"
    assert result.similarity == pytest.approx(1.0)


def test_find_best_match_returns_none_below_threshold() -> None:
    result = find_best_match(
        [1.0, 0.0],
        [FaceCandidate(employee_id="emp-1", display_name="An", embedding=[0.0, 1.0])],
        threshold=0.6,
    )

    assert result is None


def test_find_best_match_rejects_invalid_embedding() -> None:
    with pytest.raises(ValueError, match="non-zero"):
        find_best_match(
            [0.0, 0.0],
            [FaceCandidate(employee_id="emp-1", display_name="An", embedding=[1.0, 0.0])],
            threshold=0.6,
        )

