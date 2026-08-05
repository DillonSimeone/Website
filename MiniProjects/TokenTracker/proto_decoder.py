"""Raw protobuf wire-format decoder.

Decodes protobuf binary data without requiring the google-protobuf library.
Supports wire types 0 (varint), 1 (64-bit fixed), 2 (length-delimited),
and 5 (32-bit fixed).

Only uses Python standard library (struct).
"""

from __future__ import annotations

import struct
from typing import Any


def decode_varint(data: bytes, pos: int) -> tuple[int, int]:
    """Decode a protobuf varint starting at position *pos*.

    Varints use 7 bits per byte with the MSB as a continuation flag.

    Args:
        data: The raw bytes buffer.
        pos: Byte offset where the varint begins.

    Returns:
        A ``(value, new_position)`` tuple.

    Raises:
        ValueError: If the varint is malformed or exceeds 10 bytes.
    """
    result = 0
    shift = 0
    while True:
        if pos >= len(data):
            raise ValueError("Truncated varint: unexpected end of data")
        byte = data[pos]
        result |= (byte & 0x7F) << shift
        pos += 1
        if not (byte & 0x80):
            break
        shift += 7
        if shift >= 70:  # 10 bytes max for a 64-bit varint
            raise ValueError("Varint too long (>10 bytes)")
    return result, pos


def decode_field(data: bytes, pos: int) -> tuple[int, int, Any, int]:
    """Decode one protobuf field starting at *pos*.

    Args:
        data: The raw bytes buffer.
        pos: Byte offset where the field tag begins.

    Returns:
        A ``(field_number, wire_type, value, new_position)`` tuple.

        *value* depends on *wire_type*:

        - **0** – varint → ``int``
        - **1** – 64-bit fixed → ``int`` (unsigned little-endian)
        - **2** – length-delimited → ``bytes``
        - **5** – 32-bit fixed → ``int`` (unsigned little-endian)

    Raises:
        ValueError: On unknown wire types or truncated data.
    """
    tag, pos = decode_varint(data, pos)
    field_number = tag >> 3
    wire_type = tag & 0x07

    if wire_type == 0:  # Varint
        value, pos = decode_varint(data, pos)
    elif wire_type == 1:  # 64-bit fixed
        if pos + 8 > len(data):
            raise ValueError("Truncated 64-bit field")
        value = struct.unpack("<Q", data[pos : pos + 8])[0]
        pos += 8
    elif wire_type == 2:  # Length-delimited
        length, pos = decode_varint(data, pos)
        if pos + length > len(data):
            raise ValueError("Truncated length-delimited field")
        value = data[pos : pos + length]
        pos += length
    elif wire_type == 5:  # 32-bit fixed
        if pos + 4 > len(data):
            raise ValueError("Truncated 32-bit field")
        value = struct.unpack("<I", data[pos : pos + 4])[0]
        pos += 4
    else:
        raise ValueError(f"Unsupported wire type {wire_type}")

    return field_number, wire_type, value, pos


def decode_message(data: bytes) -> list[tuple[int, int, Any]]:
    """Decode all fields from a protobuf message.

    Args:
        data: The raw bytes of the entire message.

    Returns:
        A list of ``(field_number, wire_type, value)`` tuples.
        Returns an empty list if *data* is empty or decoding fails.
    """
    fields: list[tuple[int, int, Any]] = []
    pos = 0
    try:
        while pos < len(data):
            field_number, wire_type, value, pos = decode_field(data, pos)
            fields.append((field_number, wire_type, value))
    except (ValueError, struct.error):
        # Graceful degradation: return whatever was decoded so far.
        pass
    return fields


def get_field(fields: list[tuple[int, int, Any]], field_number: int,
              wire_type: int | None = None) -> Any | None:
    """Return the *value* of the first field matching *field_number*.

    Args:
        fields: Decoded field list from :func:`decode_message`.
        field_number: The protobuf field number to search for.
        wire_type: Optional wire-type filter.

    Returns:
        The field value, or ``None`` if no match is found.
    """
    for fn, wt, val in fields:
        if fn == field_number and (wire_type is None or wt == wire_type):
            return val
    return None


def get_fields(fields: list[tuple[int, int, Any]], field_number: int,
               wire_type: int | None = None) -> list[Any]:
    """Return *all* values for repeated fields matching *field_number*.

    Args:
        fields: Decoded field list from :func:`decode_message`.
        field_number: The protobuf field number to search for.
        wire_type: Optional wire-type filter.

    Returns:
        A list of matching values (may be empty).
    """
    return [
        val for fn, wt, val in fields
        if fn == field_number and (wire_type is None or wt == wire_type)
    ]


def get_nested(fields: list[tuple[int, int, Any]], *path: int) -> Any | None:
    """Navigate nested protobuf messages by a chain of field numbers.

    Each intermediate field must be length-delimited (wire type 2) so it
    can be decoded as a sub-message.  The final step returns whatever
    value type the last field has.

    Example::

        # field 1 → sub-message → field 4 → sub-message → field 2
        value = get_nested(fields, 1, 4, 2)

    Args:
        fields: Decoded field list from :func:`decode_message`.
        *path: One or more field numbers forming the navigation path.

    Returns:
        The value at the end of the path, or ``None`` on any failure.
    """
    if not path:
        return None

    current_fields = fields
    for i, field_num in enumerate(path):
        value = get_field(current_fields, field_num)
        if value is None:
            return None

        # Intermediate steps must be bytes we can decode as sub-messages.
        if i < len(path) - 1:
            if not isinstance(value, bytes):
                return None
            current_fields = decode_message(value)
            if not current_fields:
                return None

    return value


def get_string(fields: list[tuple[int, int, Any]],
               field_number: int) -> str | None:
    """Return a length-delimited field decoded as a UTF-8 string.

    Args:
        fields: Decoded field list from :func:`decode_message`.
        field_number: The protobuf field number to retrieve.

    Returns:
        The decoded string, or ``None`` if the field is missing,
        is not length-delimited, or contains invalid UTF-8.
    """
    value = get_field(fields, field_number, wire_type=2)
    if value is None:
        return None
    try:
        return value.decode("utf-8")
    except (UnicodeDecodeError, AttributeError):
        return None


def get_varint(fields: list[tuple[int, int, Any]],
               field_number: int) -> int | None:
    """Return a varint field value.

    Args:
        fields: Decoded field list from :func:`decode_message`.
        field_number: The protobuf field number to retrieve.

    Returns:
        The integer value, or ``None`` if the field is missing
        or is not a varint.
    """
    return get_field(fields, field_number, wire_type=0)
