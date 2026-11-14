/// Raw protobuf wire-format decoder (zero-copy over `&[u8]`).

#[derive(Debug, Clone, Copy)]
pub enum WireValue<'a> {
    Varint(u64),
    Fixed64(u64),
    Bytes(&'a [u8]),
    Fixed32(u32),
}

#[derive(Debug, Clone, Copy)]
pub struct ProtoField<'a> {
    pub field_number: u32,
    pub wire_type: u8,
    pub value: WireValue<'a>,
}

pub fn decode_varint(data: &[u8], mut pos: usize) -> Result<(u64, usize), ()> {
    let mut result: u64 = 0;
    let mut shift: u32 = 0;
    loop {
        if pos >= data.len() {
            return Err(());
        }
        let byte = data[pos];
        result |= ((byte & 0x7F) as u64) << shift;
        pos += 1;
        if (byte & 0x80) == 0 {
            return Ok((result, pos));
        }
        shift += 7;
        if shift >= 70 {
            return Err(());
        }
    }
}

pub fn decode_field<'a>(data: &'a [u8], pos: usize) -> Result<(ProtoField<'a>, usize), ()> {
    let (tag, mut pos) = decode_varint(data, pos)?;
    let field_number = (tag >> 3) as u32;
    let wire_type = (tag & 0x07) as u8;

    let value = match wire_type {
        0 => {
            let (v, next) = decode_varint(data, pos)?;
            pos = next;
            WireValue::Varint(v)
        }
        1 => {
            if pos + 8 > data.len() {
                return Err(());
            }
            let v = u64::from_le_bytes(data[pos..pos + 8].try_into().unwrap());
            pos += 8;
            WireValue::Fixed64(v)
        }
        2 => {
            let (len_u64, next) = decode_varint(data, pos)?;
            pos = next;
            let len = len_u64 as usize;
            if pos.checked_add(len).map_or(true, |end| end > data.len()) {
                return Err(());
            }
            let slice = &data[pos..pos + len];
            pos += len;
            WireValue::Bytes(slice)
        }
        5 => {
            if pos + 4 > data.len() {
                return Err(());
            }
            let v = u32::from_le_bytes(data[pos..pos + 4].try_into().unwrap());
            pos += 4;
            WireValue::Fixed32(v)
        }
        _ => return Err(()),
    };

    Ok((
        ProtoField {
            field_number,
            wire_type,
            value,
        },
        pos,
    ))
}

pub fn decode_message<'a>(data: &'a [u8]) -> Vec<ProtoField<'a>> {
    let mut fields = Vec::new();
    let mut pos = 0;
    while pos < data.len() {
        match decode_field(data, pos) {
            Ok((f, next)) => {
                fields.push(f);
                pos = next;
            }
            Err(()) => break,
        }
    }
    fields
}

pub fn get_varint(fields: &[ProtoField<'_>], field_number: u32) -> Option<u64> {
    for f in fields {
        if f.field_number == field_number && f.wire_type == 0 {
            if let WireValue::Varint(v) = f.value {
                return Some(v);
            }
        }
    }
    None
}

pub fn get_bytes<'a>(fields: &[ProtoField<'a>], field_number: u32) -> Option<&'a [u8]> {
    for f in fields {
        if f.field_number == field_number && f.wire_type == 2 {
            if let WireValue::Bytes(b) = f.value {
                return Some(b);
            }
        }
    }
    None
}

pub fn get_string<'a>(fields: &[ProtoField<'a>], field_number: u32) -> Option<&'a str> {
    let bytes = get_bytes(fields, field_number)?;
    std::str::from_utf8(bytes).ok()
}
