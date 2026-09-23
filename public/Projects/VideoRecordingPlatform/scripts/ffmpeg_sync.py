#!/usr/bin/env python3
"""
Automated Multi-Angle Video Alignment & Composite Engine (FFmpeg)
Section 7 / Phase 3 Implementation

Reads session_meta.json, inspects device clock_offset_ms,
calculates millisecond audio/video delays, and generates synchronized composite.
Includes built-in FFmpeg installation safeties.
"""

import sys
import os
import json
import shutil
import subprocess
import platform

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

def verify_ffmpeg_installed():
    """Safety check: ensure FFmpeg is available before running video operations"""
    ffmpeg_bin = shutil.which("ffmpeg")
    if not ffmpeg_bin:
        print("\n========================================================")
        print("⚠️  CRITICAL SAFETY WARNING: FFmpeg is not installed!")
        print("========================================================")
        print("The Multi-Angle Sync Engine requires FFmpeg to align and render composites.")
        os_name = platform.system()
        if os_name == "Windows":
            print("To install on Windows:")
            print("  Run in PowerShell: winget install Gyan.FFmpeg")
            print("  Or with Chocolatey: choco install ffmpeg")
        elif os_name == "Darwin":
            print("To install on macOS:")
            print("  Run in Terminal: brew install ffmpeg")
        else:
            print("To install on Linux:")
            print("  Run: sudo apt update && sudo apt install -y ffmpeg")
        print("========================================================\n")
        return False
    return True

def align_session(session_dir, layout="side_by_side"):
    meta_path = os.path.join(session_dir, "session_meta.json")
    if not os.path.exists(meta_path):
        print(f"Error: session_meta.json not found in {session_dir}")
        return False

    with open(meta_path, "r") as f:
        meta = json.load(f)

    devices = meta.get("devices", [])
    if len(devices) < 2:
        print(f"Session {meta.get('session_uuid')} has fewer than 2 devices. Multi-angle composite not required.")
        return False

    raw_dir = os.path.join(session_dir, "raw")
    processed_dir = os.path.join(session_dir, "processed")
    os.makedirs(processed_dir, exist_ok=True)

    output_composite = os.path.join(processed_dir, "synced_composite.mp4")

    # Resolve file paths and offsets
    video_tracks = []
    for dev in devices:
        filename = dev.get("filename")
        if not filename:
            # Fallback search in raw_dir
            for f in os.listdir(raw_dir) if os.path.exists(raw_dir) else []:
                if dev.get("device_id") in f:
                    filename = f
                    break

        if filename:
            full_path = os.path.join(raw_dir, filename)
            if os.path.exists(full_path):
                video_tracks.append({
                    "device_id": dev.get("device_id"),
                    "offset_ms": dev.get("clock_offset_ms", 0),
                    "path": full_path
                })

    if len(video_tracks) < 2:
        print(f"Warning: Only {len(video_tracks)} video track files found on disk. Needs at least 2 for composite.")
        return False

    print(f"\n[FFmpeg Sync] Aligning {len(video_tracks)} camera angles for session {meta.get('session_uuid')}:")
    for t in video_tracks:
        print(f"  - Device: {t['device_id']} | Offset: {t['offset_ms']}ms | File: {os.path.basename(t['path'])}")

    # Calculate relative delays against the earliest recording start
    # Earlier start means lower clock offset or start time
    min_offset = min(t["offset_ms"] for t in video_tracks)
    for t in video_tracks:
        t["delay_ms"] = t["offset_ms"] - min_offset

    # Build FFmpeg command for side-by-side alignment
    # [0:v]setpts=PTS-STARTPTS+(delay0/1000)/TB,scale=960:540[v0];
    # [1:v]setpts=PTS-STARTPTS+(delay1/1000)/TB,scale=960:540[v1];
    # [v0][v1]hstack=inputs=2[outv]
    input_args = []
    filter_complex = []

    for i, t in enumerate(video_tracks[:2]):  # Side-by-side for first 2 angles
        input_args.extend(["-i", t["path"]])
        delay_sec = t["delay_ms"] / 1000.0
        filter_complex.append(f"[{i}:v]setpts=PTS-STARTPTS+{delay_sec:.3f}/TB,scale=960:540[v{i}]")

    filter_complex.append(f"[v0][v1]hstack=inputs=2[outv]")
    filter_complex.append(f"[0:a]volume=0.7[a0];[1:a]volume=0.7[a1];[a0][a1]amix=inputs=2[outa]")

    cmd = [
        "ffmpeg", "-y",
        *input_args,
        "-filter_complex", ";".join(filter_complex),
        "-map", "[outv]",
        "-map", "[outa]",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "22",
        "-c:a", "aac",
        "-b:a", "192k",
        output_composite
    ]

    print("\n[FFmpeg Sync] Executing alignment command:")
    print(" ".join(cmd))

    try:
        subprocess.run(cmd, check=True)
        print(f"\n✓ Successfully generated aligned composite: {output_composite}")
        meta["composite_file"] = "synced_composite.mp4"
        meta["composite_rendered_at"] = meta.get("end_epoch_nuc_ms", 0)
        with open(meta_path, "w") as f:
            json.dump(meta, f, indent=2)
        return True
    except subprocess.CalledProcessError as e:
        print(f"✗ FFmpeg rendering error: {e}")
        return False

if __name__ == "__main__":
    if not verify_ffmpeg_installed():
        sys.exit(1)

    if len(sys.argv) > 1:
        target_dir = sys.argv[1]
        align_session(target_dir)
    else:
        print("Usage: python ffmpeg_sync.py <path_to_session_dir>")
