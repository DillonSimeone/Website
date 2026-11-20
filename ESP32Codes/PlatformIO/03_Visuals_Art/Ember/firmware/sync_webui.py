import filecmp
import gzip
import io
import os
import shutil

Import("env")

project_dir = env.subst("$PROJECT_DIR")
repo_dir = os.path.abspath(os.path.join(project_dir, ".."))
src_dir = os.path.join(repo_dir, "web_ui")
dst_dir = os.path.join(project_dir, "data")
demo_src = os.path.join(repo_dir, "DEMO_PATTERNS.json")
demo_webui = os.path.join(src_dir, "demo.json")
demo_data_gz = os.path.join(dst_dir, "demo.json.gz")


def _copy_if_changed(src_file, dst_file):
    if not os.path.exists(src_file):
        return
    os.makedirs(os.path.dirname(dst_file), exist_ok=True)
    if not os.path.exists(dst_file) or not filecmp.cmp(src_file, dst_file, shallow=False):
        shutil.copy2(src_file, dst_file)


def _write_gz_if_changed(src_file, gz_dst_file):
    if not os.path.exists(src_file):
        return
    with open(src_file, "rb") as f:
        raw = f.read()
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb", compresslevel=9, mtime=0) as gz:
        gz.write(raw)
    compressed = buf.getvalue()
    os.makedirs(os.path.dirname(gz_dst_file), exist_ok=True)
    if os.path.exists(gz_dst_file):
        with open(gz_dst_file, "rb") as f:
            if f.read() == compressed:
                return
    with open(gz_dst_file, "wb") as f:
        f.write(compressed)


def _remove_if_exists(path):
    if os.path.exists(path):
        os.remove(path)


def sync_webui(*args, **kwargs):
    _copy_if_changed(demo_src, demo_webui)
    _write_gz_if_changed(demo_src, demo_data_gz)
    _remove_if_exists(os.path.join(dst_dir, "demo.json"))

    if not os.path.isdir(src_dir):
        return
    os.makedirs(dst_dir, exist_ok=True)
    for root, _, files in os.walk(src_dir):
        rel = os.path.relpath(root, src_dir)
        target_root = dst_dir if rel == "." else os.path.join(dst_dir, rel)
        os.makedirs(target_root, exist_ok=True)
        for fname in files:
            src_path = os.path.join(root, fname)
            if fname.endswith((".html", ".json")):
                _write_gz_if_changed(src_path, os.path.join(target_root, fname + ".gz"))
                _remove_if_exists(os.path.join(target_root, fname))
            else:
                _copy_if_changed(src_path, os.path.join(target_root, fname))


# Sync at load time so SCons sees updated data/ files before building dependency graphs.
sync_webui()
env.AddPreAction("buildfs", sync_webui)
env.AddPreAction("uploadfs", sync_webui)
