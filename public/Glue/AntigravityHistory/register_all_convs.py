import sqlite3
import os
import base64
import re

convs_dir = r"C:\Users\DoctorNightmares\.gemini\antigravity-ide\conversations"
global_db = r"C:\Users\DoctorNightmares\AppData\Roaming\Antigravity IDE\User\globalStorage\state.vscdb"

def encode_varint(value):
    if value < 0:
        value = (1 << 64) + value
    out = bytearray()
    while True:
        part = value & 0x7f
        value >>= 7
        if value > 0:
            out.append(part | 0x80)
        else:
            out.append(part)
            break
    return bytes(out)

def encode_field(field_number, wire_type, payload):
    header = encode_varint((field_number << 3) | wire_type)
    if wire_type == 0:
        return header + encode_varint(payload)
    elif wire_type == 2:
        return header + encode_varint(len(payload)) + payload
    raise ValueError(f"Unsupported wire type {wire_type}")

def get_step_timestamp(meta_bytes):
    try:
        if meta_bytes and len(meta_bytes) > 3 and meta_bytes[0] == 0x0a:
            length = meta_bytes[1]
            if meta_bytes[2] == 0x08:
                pos = 3
                val = 0
                shift = 0
                while True:
                    b = meta_bytes[pos]
                    pos += 1
                    val |= (b & 0x7f) << shift
                    if not (b & 0x80):
                        break
                    shift += 7
                return val
    except Exception as e:
        pass
    return None

def extract_db_info(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    cursor.execute("SELECT COUNT(*), MIN(idx), MAX(idx) FROM steps;")
    steps_count, min_idx, max_idx = cursor.fetchone()
    if not steps_count:
        steps_count = 0
        min_idx, max_idx = 0, 0
        
    start_time = None
    end_time = None
    
    if steps_count > 0:
        try:
            cursor.execute("SELECT metadata FROM steps WHERE idx = ?;", (min_idx,))
            first_meta = cursor.fetchone()[0]
            start_time = get_step_timestamp(first_meta)
        except Exception:
            pass
            
        try:
            cursor.execute("SELECT metadata FROM steps WHERE idx = ?;", (max_idx,))
            last_meta = cursor.fetchone()[0]
            end_time = get_step_timestamp(last_meta)
        except Exception:
            pass

    if not start_time:
        start_time = int(os.path.getctime(db_path))
    if not end_time:
        end_time = int(os.path.getmtime(db_path))

    cursor.execute("SELECT step_payload FROM steps ORDER BY idx ASC;")
    rows = cursor.fetchall()
    title = "Untitled Conversation"
    for (p,) in rows:
        txts = re.findall(rb'[\x20-\x7E]{15,}', p)
        found = False
        for t in txts:
            try:
                dec = t.decode('utf-8').strip()
                if dec.startswith('{"') or dec.startswith('["'):
                    continue
                if dec.startswith('b$') or dec.startswith('cjo') or dec.startswith('pp9') or dec.startswith('bot-'):
                    continue
                if len(dec) < 25:
                    continue
                if len(dec.split()) < 3:
                    continue
                if dec.count('/') > 3 or dec.count('\\') > 3:
                    continue
                title = dec[:80] + ("..." if len(dec) > 80 else "")
                found = True
                break
            except:
                pass
        if found:
            break
            
    cursor.execute("SELECT data FROM trajectory_metadata_blob WHERE id = 'main';")
    meta_blob = cursor.fetchone()
    meta_data = meta_blob[0] if meta_blob else b""
    
    cursor.execute("SELECT cascade_id FROM trajectory_meta LIMIT 1;")
    cascade_row = cursor.fetchone()
    cascade_id = cascade_row[0] if cascade_row else os.path.basename(db_path).replace(".db", "")
    
    conn.close()
    
    return {
        "title": title,
        "steps_count": steps_count,
        "cascade_id": cascade_id,
        "meta_data": meta_data,
        "start_time": start_time,
        "end_time": end_time
    }

conversations = []
for filename in os.listdir(convs_dir):
    if filename.endswith(".db") and not filename.endswith(".backup"):
        db_path = os.path.join(convs_dir, filename)
        uuid_str = filename.replace(".db", "")
        try:
            info = extract_db_info(db_path)
            if info["steps_count"] > 0:
                conversations.append((uuid_str, info))
        except Exception as e:
            pass

conversations.sort(key=lambda x: x[1]["end_time"], reverse=True)

raw_summaries = []
for uuid_str, info in conversations:
    inner_proto = encode_field(1, 2, info["title"].encode('utf-8'))
    inner_proto += encode_field(2, 0, info["steps_count"])
    inner_proto += encode_field(3, 2, encode_field(1, 0, info["start_time"]) + encode_field(2, 0, 0))
    inner_proto += encode_field(4, 2, info["cascade_id"].encode('utf-8'))
    inner_proto += encode_field(5, 0, 1)
    inner_proto += encode_field(7, 2, encode_field(1, 0, info["start_time"]) + encode_field(2, 0, 0))
    inner_proto += encode_field(10, 2, encode_field(1, 0, info["end_time"]) + encode_field(2, 0, 0))
    inner_proto += encode_field(15, 2, b"")
    inner_proto += encode_field(16, 0, info["steps_count"])
    if info["meta_data"]:
        inner_proto += encode_field(17, 2, info["meta_data"])
    inner_proto += encode_field(22, 0, 4)
    
    inner_b64 = base64.b64encode(inner_proto)
    wrapper_bytes = encode_field(1, 2, inner_b64)
    raw_summaries.append((uuid_str, wrapper_bytes))

outer_bytes = bytearray()
for uid, wrapper in raw_summaries:
    item_payload = encode_field(1, 2, uid.encode('utf-8')) + encode_field(2, 2, wrapper)
    outer_bytes.extend(encode_field(1, 2, item_payload))
    
final_b64 = base64.b64encode(outer_bytes).decode('utf-8')

conn = sqlite3.connect(global_db)
cursor = conn.cursor()
cursor.execute("UPDATE ItemTable SET value = ? WHERE key = 'antigravityUnifiedStateSync.trajectorySummaries';", (final_b64,))
conn.commit()
conn.close()

print(f"Successfully rebuilt state.vscdb with {len(conversations)} properly labeled and chronologically sorted conversations!")
