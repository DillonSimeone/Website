"""
Bandwidth and Speed Testing Engine.

Measures real-world download speed, upload speed, latency, and jitter
using Cloudflare's global edge network API (or fallback HTTP endpoints).
Designed to be lightweight, non-blocking, and provide live progress callbacks.
"""

from __future__ import annotations

import os
import time
from typing import Callable, Optional
import requests

from models import SpeedTestResult


CLOUDFLARE_DOWN_URL = "https://speed.cloudflare.com/__down"
CLOUDFLARE_UP_URL = "https://speed.cloudflare.com/__up"
CLOUDFLARE_PING_URL = "https://speed.cloudflare.com/__down?bytes=0"


def run_speed_test(
    download_mb: int = 10,
    upload_mb: int = 4,
    progress_callback: Optional[Callable[[str, float, float], None]] = None,
    stop_check: Optional[Callable[[], bool]] = None
) -> SpeedTestResult:
    """
    Run an end-to-end speed test.
    
    Args:
        download_mb: Payload size for download test (default: 10 MB for quick test)
        upload_mb: Payload size for upload test (default: 4 MB)
        progress_callback: Function called with (stage_name, percent_done, current_mbps)
        stop_check: Function returning True if user cancelled the test
    """
    result = SpeedTestResult()
    session = requests.Session()
    session.headers.update({"User-Agent": "WifiTracker/1.0"})

    # 1. Latency & Jitter Test
    if progress_callback:
        progress_callback("Testing Ping & Latency...", 5.0, 0.0)

    ping_samples = []
    for i in range(4):
        if stop_check and stop_check():
            result.is_success = False
            result.error_message = "Cancelled"
            return result
        try:
            t0 = time.perf_counter()
            resp = session.get(CLOUDFLARE_PING_URL, timeout=4)
            rtt = (time.perf_counter() - t0) * 1000.0
            if resp.status_code == 200:
                ping_samples.append(rtt)
        except Exception:
            pass

    if ping_samples:
        result.ping_ms = round(sum(ping_samples) / len(ping_samples), 1)
        if len(ping_samples) > 1:
            diffs = [abs(ping_samples[i] - ping_samples[i - 1]) for i in range(1, len(ping_samples))]
            result.jitter_ms = round(sum(diffs) / len(diffs), 1)

    # 2. Download Speed Test
    if progress_callback:
        progress_callback("Testing Download Speed...", 20.0, 0.0)

    total_bytes_down = 0
    start_time = None
    target_bytes = download_mb * 1024 * 1024

    try:
        url = f"{CLOUDFLARE_DOWN_URL}?bytes={target_bytes}"
        start_time = time.perf_counter()
        resp = session.get(url, stream=True, timeout=12)

        if resp.status_code == 200:
            chunk_size = 64 * 1024
            last_report = time.perf_counter()

            for chunk in resp.iter_content(chunk_size=chunk_size):
                if stop_check and stop_check():
                    result.is_success = False
                    result.error_message = "Cancelled"
                    return result
                if chunk:
                    total_bytes_down += len(chunk)
                    now = time.perf_counter()
                    if now - last_report > 0.15:
                        elapsed = max(0.001, now - start_time)
                        cur_mbps = (total_bytes_down * 8.0) / (elapsed * 1_000_000.0)
                        pct = 20.0 + min(45.0, (total_bytes_down / target_bytes) * 45.0)
                        if progress_callback:
                            progress_callback("Testing Download Speed...", pct, round(cur_mbps, 2))
                        last_report = now

            duration = max(0.001, time.perf_counter() - start_time)
            result.download_mbps = round((total_bytes_down * 8.0) / (duration * 1_000_000.0), 2)
            result.bytes_downloaded = total_bytes_down
        else:
            result.error_message = f"Download test failed HTTP {resp.status_code}"

    except Exception as e:
        result.error_message = f"Download error: {str(e)}"

    # 3. Upload Speed Test
    if progress_callback:
        progress_callback("Testing Upload Speed...", 70.0, 0.0)

    try:
        up_target_bytes = upload_mb * 1024 * 1024
        # Generate dummy data
        dummy_data = b"0" * min(up_target_bytes, 2 * 1024 * 1024)

        t_up_start = time.perf_counter()
        up_resp = session.post(
            CLOUDFLARE_UP_URL,
            data=dummy_data,
            timeout=10,
            headers={"Content-Type": "application/octet-stream"}
        )
        duration_up = max(0.001, time.perf_counter() - t_up_start)

        if up_resp.status_code in (200, 204):
            total_bytes_up = len(dummy_data)
            result.upload_mbps = round((total_bytes_up * 8.0) / (duration_up * 1_000_000.0), 2)
            result.bytes_uploaded = total_bytes_up
        else:
            result.upload_mbps = 0.0

    except Exception as e:
        if not result.error_message:
            result.error_message = f"Upload error: {str(e)}"

    if progress_callback:
        progress_callback("Test Complete", 100.0, result.download_mbps)

    result.is_success = result.download_mbps > 0.0
    return result
