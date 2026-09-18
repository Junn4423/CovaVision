"""Dependency-light embedding matching used by attendance workflows."""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Sequence


NumberVector = Sequence[float]


@dataclass(frozen=True)
class FaceCandidate:
    employee_id: str
    display_name: str
    embedding: NumberVector


@dataclass(frozen=True)
class FaceMatch:
    employee_id: str
    display_name: str
    similarity: float


def _norm(vector: NumberVector) -> float:
    values = [float(value) for value in vector]
    if not values or not all(math.isfinite(value) for value in values):
        return 0.0
    return math.sqrt(sum(value * value for value in values))


def _cosine_similarity(left: NumberVector, right: NumberVector) -> float:
    if len(left) != len(right):
        raise ValueError("embedding dimensions must match")

    left_norm = _norm(left)
    right_norm = _norm(right)
    if left_norm == 0.0 or right_norm == 0.0:
        raise ValueError("embeddings must be non-zero")

    return sum(float(a) * float(b) for a, b in zip(left, right)) / (left_norm * right_norm)


def find_best_match(
    embedding: NumberVector,
    candidates: Sequence[FaceCandidate],
    *,
    threshold: float,
) -> FaceMatch | None:
    """Return the best candidate only when cosine similarity reaches ``threshold``."""

    if not 0.0 <= threshold <= 1.0:
        raise ValueError("threshold must be between 0 and 1")
    if _norm(embedding) == 0.0:
        raise ValueError("embeddings must be non-zero")

    best: FaceMatch | None = None
    for candidate in candidates:
        try:
            similarity = _cosine_similarity(embedding, candidate.embedding)
        except ValueError:
            continue

        if best is None or similarity > best.similarity:
            best = FaceMatch(
                employee_id=candidate.employee_id,
                display_name=candidate.display_name,
                similarity=similarity,
            )

    if best is None or best.similarity < threshold:
        return None
    return best

