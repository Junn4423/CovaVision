from __future__ import annotations

from app.recognition.face_encoding_utils import (
    face_encoding_count,
    normalize_face_encodings,
    serialize_face_encoding,
)


class _ArrayLike:
    def tolist(self):
        return [1.0, 2.0]


def test_face_encoding_normalization_supports_flat_nested_tuple_and_array_values() -> None:
    assert serialize_face_encoding((1.0, 2.0)) == [1.0, 2.0]
    assert normalize_face_encodings([1.0, 2.0]) == [[1.0, 2.0]]
    assert normalize_face_encodings([(1.0, 2.0), (3.0, 4.0)]) == [[1.0, 2.0], [3.0, 4.0]]
    assert normalize_face_encodings(_ArrayLike()) == [[1.0, 2.0]]
    assert face_encoding_count(None) == 0
    assert face_encoding_count([]) == 0
    assert face_encoding_count([[1.0], [2.0]]) == 2
