"""
CLI Entry Point for WifiTracker.

Usage:
  python main.py                      # Launch system tray app & background monitor
  python main.py --test-probe         # Run instantaneous light Wi-Fi / latency probe
  python main.py --test-speed         # Run single speed test and print results
  python main.py --test-alert         # Send sample Windows toast notification
  python main.py --dashboard          # Launch GUI dashboard directly
  python main.py --interval 15        # Set speed test interval to 15 minutes
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description="WifiTracker: Wi-Fi Health & Bandwidth Monitor")
    parser.add_argument("--test-probe", action="store_true", help="Run light probe and print diagnostics")
    parser.add_argument("--test-speed", action="store_true", help="Run a single speed test and exit")
    parser.add_argument("--test-alert", action="store_true", help="Dispatch test Windows toast notification")
    parser.add_argument("--dashboard", action="store_true", help="Open GUI dashboard directly")
    parser.add_argument("--interval", type=int, default=None, help="Speed test interval in minutes (e.g. 15, 30)")
    parser.add_argument("--data-dir", type=str, default=None, help="Custom data directory for SQLite & config")
    parser.add_argument("--speed-size-mb", type=int, default=10, help="Download payload size in MB for tests")

    args = parser.parse_args()

    if args.test_probe:
        from wifi_probe import run_full_light_probe
        print("?? Running Wi-Fi & Latency Light Probe...")
        snap = run_full_light_probe()
        w = snap.wifi
        l = snap.latency
        print("=" * 60)
        print(f"Interface:    {w.interface_name} ({w.adapter_desc})")
        print(f"SSID:         {w.ssid} [{'CONNECTED' if w.is_connected else 'DISCONNECTED'}]")
        print(f"BSSID:        {w.bssid}")
        print(f"Signal:       {w.signal_pct}% | Channel: {w.channel} ({w.band}) | Protocol: {w.radio_type}")
        print(f"Link Rates:   RX {w.rx_rate_mbps} Mbps / TX {w.tx_rate_mbps} Mbps")
        print("-" * 60)
        print(f"Gateway IP:   {l.gateway_ip}")
        print(f"Gateway Ping: {l.gateway_ping_ms if l.gateway_ping_ms is not None else 'Timeout'} ms (Loss: {l.gateway_loss_pct}%)")
        print(f"DNS 1.1.1.1:  {l.public_dns_ping_ms if l.public_dns_ping_ms is not None else 'Timeout'} ms (Loss: {l.public_dns_loss_pct}%)")
        print(f"Jitter:       {l.jitter_ms if l.jitter_ms is not None else '--'} ms")
        print("-" * 60)
        print("Top Socket Consumers:")
        for p in snap.top_processes:
            print(f"  - {p.process_name:<30} (PID {p.pid:<6}): {p.connection_count} active sockets")
        print("=" * 60)
        return

    if args.test_speed:
        from speed_tester import run_speed_test
        print(f"? Running Bandwidth Speed Test ({args.speed_size_mb} MB download payload)...")
        def cb(stage, pct, mbps):
            speed_info = f" | {mbps:.2f} Mbps" if mbps > 0 else ""
            print(f"  [{pct:5.1f}%] {stage}{speed_info}")
        res = run_speed_test(download_mb=args.speed_size_mb, upload_mb=4, progress_callback=cb)
        print("=" * 60)
        print(f"Download:     {res.download_mbps:.2f} Mbps")
        print(f"Upload:       {res.upload_mbps:.2f} Mbps")
        print(f"Ping:         {res.ping_ms:.1f} ms | Jitter: {res.jitter_ms:.1f} ms")
        print(f"Server:       {res.server_info}")
        print(f"Success:      {res.is_success}")
        if res.error_message:
            print(f"Error:        {res.error_message}")
        print("=" * 60)
        return

    if args.test_alert:
        from alert_manager import send_windows_toast
        print("?? Sending test Windows toast notification...")
        send_windows_toast(
            "WifiTracker Alert (Test)",
            "Test anomaly notification: Download speed dropped to 0.04 Mbps. Top socket consumer: qbittorrent.exe."
        )
        print("Notification dispatched.")
        return

    if args.dashboard:
        import tkinter as tk
        from storage import StorageManager
        from popup_ui import WifiTrackerDashboard
        from wifi_probe import run_full_light_probe
        print("?? Launching Dashboard GUI...")
        storage = StorageManager(args.data_dir)
        cfg = storage.load_config()
        snap = run_full_light_probe()
        storage.record_probe(snap)
        dash = WifiTrackerDashboard(storage, cfg)
        dash.show(latest_probe=snap)
        dash.window.mainloop()
        return

    # Default: Run full system tray background monitor
    from tray_app import WifiTrackerApp
    app = WifiTrackerApp(data_dir=args.data_dir, speedtest_interval=args.interval)
    app.run()


if __name__ == "__main__":
    main()
