# -*- coding: utf-8 -*-
"""Utilities for storing and reading face encodings consistently."""


def serialize_face_encoding(encoding):
    if hasattr(encoding, 'tolist'):
        return encoding.tolist()
    if isinstance(encoding, tuple):
        return list(encoding)
    return encoding


def normalize_face_encodings(value):
    if value is None:
        return []

    value = serialize_face_encoding(value)

    if isinstance(value, list):
        if not value:
            return []

        first = value[0]
        if hasattr(first, 'tolist'):
            return [serialize_face_encoding(item) for item in value]
        if isinstance(first, (list, tuple)):
            return [serialize_face_encoding(item) for item in value]

        # Flat list of floats => one face embedding
        return [value]

    return [value]


def face_encoding_count(value):
    return len(normalize_face_encodings(value))
