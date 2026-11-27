"""
Interactive Dark-Mode Popup Dashboard for WifiTracker.

Provides real-time Wi-Fi diagnostics, live bandwidth gauges,
incident history, process socket inspection, and 1-click network reset.
"""

from __future__ import annotations

import os
import subprocess
import threading
import time
import tkinter as tk
from datetime import datetime, timezone
from tkinter import messagebox, ttk
from typing import Any, Callable, Dict, List, Optional

from models import AppConfig, Incident, ProbeSnapshot, SpeedTestResult
from speed_tester import run_speed_test
from storage import StorageManager
from wifi_probe import run_full_light_probe

# Color Palette (Dark Futuristic Theme)
COLORS = {
    "bg": "#12131e",
    "bg_secondary": "#1a1c2e",
    "bg_card": "#21243b",
    "bg_card_hover": "#2b304f",
    "accent_blue": "#00d2ff",
    "accent_purple": "#a78bfa",
    "accent_green": "#00e676",
    "accent_amber": "#ffd600",
    "accent_red": "#ff1744",
    "text_primary": "#f1f5f9",
    "text_secondary": "#94a3b8",
    "text_dim": "#64748b",
    "border": "#333857",
    "divider": "#2a2e4a",
    "progress_bg": "#1e2238",
}


class WifiTrackerDashboard:
    """Dark-themed control panel and analytics dashboard."""

    def __init__(
        self,
        storage: StorageManager,
        config: AppConfig,
        on_run_speed_test: Optional[Callable[[], None]] = None,
        on_probe_updated: Optional[Callable[[ProbeSnapshot], None]] = None,
        on_config_changed: Optional[Callable[[AppConfig], None]] = None,
    ):
        self.storage = storage
        self.config = config
        self.on_run_speed_test = on_run_speed_test
        self.on_probe_updated = on_probe_updated
        self.on_config_changed = on_config_changed

        self.window: Optional[tk.Toplevel] = None
        self._is_testing = False
        self._latest_probe: Optional[ProbeSnapshot] = None
        self._latest_speed: Optional[SpeedTestResult] = self.storage.get_latest_speed_test()

    def show(self, root: Optional[tk.Tk] = None, latest_probe: Optional[ProbeSnapshot] = None):
        """Display the dashboard window (bring to front if already open)."""
        if latest_probe:
            self._latest_probe = latest_probe

        if self.window and tk.Toplevel.winfo_exists(self.window):
            self.window.deiconify()
            self.window.lift()
            self.window.focus_force()
            self.refresh_all_data()
            return

        self.window = tk.Toplevel(root) if root else tk.Tk()
        self.window.title("WifiTracker ? Network Health & Bandwidth Monitor")
        self.window.geometry("740x680")
        self.window.minsize(680, 580)
        self.window.configure(bg=COLORS["bg"])

        # Center on screen
        self.window.update_idletasks()
        w = self.window.winfo_width()
        h = self.window.winfo_height()
        sw = self.window.winfo_screenwidth()
        sh = self.window.winfo_screenheight()
        self.window.geometry(f"{w}x{h}+{(sw - w) // 2}+{(sh - h) // 2}")

        self._build_ui()
        self.refresh_all_data()

    def _build_ui(self):
        root = self.window
        root.grid_rowconfigure(2, weight=1)
        root.grid_columnconfigure(0, weight=1)

        # 1. Header Banner
        header = tk.Frame(root, bg=COLORS["bg_secondary"], padx=18, pady=12, highlightbackground=COLORS["border"], highlightthickness=1)
        header.grid(row=0, column=0, sticky="ew", padx=14, pady=(12, 6))
        header.grid_columnconfigure(1, weight=1)

        self.lbl_ssid = tk.Label(
            header,
            text="Wi-Fi: Connecting...",
            font=("Segoe UI", 14, "bold"),
            bg=COLORS["bg_secondary"],
            fg=COLORS["text_primary"]
        )
        self.lbl_ssid.grid(row=0, column=0, sticky="w")

        self.lbl_wifi_details = tk.Label(
            header,
            text="Signal: --% | Band: -- | Channel: -- | Link Rate: -- Mbps",
            font=("Segoe UI", 9),
            bg=COLORS["bg_secondary"],
            fg=COLORS["text_secondary"]
        )
        self.lbl_wifi_details.grid(row=1, column=0, sticky="w", pady=(2, 0))

        btn_box = tk.Frame(header, bg=COLORS["bg_secondary"])
        btn_box.grid(row=0, column=1, rowspan=2, sticky="e")

        self.btn_refresh = tk.Button(
            btn_box,
            text="? Quick Probe",
            font=("Segoe UI", 9, "bold"),
            bg=COLORS["bg_card"],
            fg=COLORS["accent_blue"],
            activebackground=COLORS["bg_card_hover"],
            activeforeground=COLORS["accent_blue"],
            relief="flat",
            padx=10,
            pady=4,
            command=self._on_quick_probe_clicked
        )
        self.btn_refresh.pack(side="right", padx=(6, 0))

        self.btn_repair = tk.Button(
            btn_box,
            text="?? Repair Stack",
            font=("Segoe UI", 9),
            bg=COLORS["bg_card"],
            fg=COLORS["accent_amber"],
            activebackground=COLORS["bg_card_hover"],
            activeforeground=COLORS["accent_amber"],
            relief="flat",
            padx=10,
            pady=4,
            command=self._on_repair_network_clicked
        )
        self.btn_repair.pack(side="right")

        # 2. Metrics Cards Row
        cards_frame = tk.Frame(root, bg=COLORS["bg"])
        cards_frame.grid(row=1, column=0, sticky="ew", padx=14, pady=6)
        for i in range(3):
            cards_frame.grid_columnconfigure(i, weight=1)

        # Card 1: Download
        self.card_down = tk.Frame(cards_frame, bg=COLORS["bg_card"], padx=14, pady=10, highlightbackground=COLORS["border"], highlightthickness=1)
        self.card_down.grid(row=0, column=0, sticky="nsew", padx=(0, 6))
        tk.Label(self.card_down, text="DOWNLOAD SPEED", font=("Segoe UI", 8, "bold"), bg=COLORS["bg_card"], fg=COLORS["text_secondary"]).pack(anchor="w")
        self.lbl_down_val = tk.Label(self.card_down, text="-- Mbps", font=("Segoe UI", 18, "bold"), bg=COLORS["bg_card"], fg=COLORS["accent_green"])
        self.lbl_down_val.pack(anchor="w", pady=(2, 0))
        self.lbl_down_sub = tk.Label(self.card_down, text="Last test: Never", font=("Segoe UI", 8), bg=COLORS["bg_card"], fg=COLORS["text_dim"])
        self.lbl_down_sub.pack(anchor="w")

        # Card 2: Upload
        self.card_up = tk.Frame(cards_frame, bg=COLORS["bg_card"], padx=14, pady=10, highlightbackground=COLORS["border"], highlightthickness=1)
        self.card_up.grid(row=0, column=1, sticky="nsew", padx=3)
        tk.Label(self.card_up, text="UPLOAD SPEED", font=("Segoe UI", 8, "bold"), bg=COLORS["bg_card"], fg=COLORS["text_secondary"]).pack(anchor="w")
        self.lbl_up_val = tk.Label(self.card_up, text="-- Mbps", font=("Segoe UI", 18, "bold"), bg=COLORS["bg_card"], fg=COLORS["accent_blue"])
        self.lbl_up_val.pack(anchor="w", pady=(2, 0))
        self.lbl_up_sub = tk.Label(self.card_up, text="Cloudflare Edge", font=("Segoe UI", 8), bg=COLORS["bg_card"], fg=COLORS["text_dim"])
        self.lbl_up_sub.pack(anchor="w")

        # Card 3: Latency & Jitter
        self.card_ping = tk.Frame(cards_frame, bg=COLORS["bg_card"], padx=14, pady=10, highlightbackground=COLORS["border"], highlightthickness=1)
        self.card_ping.grid(row=0, column=2, sticky="nsew", padx=(6, 0))
        tk.Label(self.card_ping, text="GATEWAY / DNS PING", font=("Segoe UI", 8, "bold"), bg=COLORS["bg_card"], fg=COLORS["text_secondary"]).pack(anchor="w")
        self.lbl_ping_val = tk.Label(self.card_ping, text="-- ms", font=("Segoe UI", 18, "bold"), bg=COLORS["bg_card"], fg=COLORS["accent_purple"])
        self.lbl_ping_val.pack(anchor="w", pady=(2, 0))
        self.lbl_ping_sub = tk.Label(self.card_ping, text="Router: -- ms | Jitter: -- ms", font=("Segoe UI", 8), bg=COLORS["bg_card"], fg=COLORS["text_dim"])
        self.lbl_ping_sub.pack(anchor="w")

        # 3. Action / Speed Test Trigger Bar
        act_bar = tk.Frame(root, bg=COLORS["bg_secondary"], padx=14, pady=8, highlightbackground=COLORS["border"], highlightthickness=1)
        act_bar.grid(row=2, column=0, sticky="ew", padx=14, pady=(0, 6))
        act_bar.grid_columnconfigure(1, weight=1)

        self.btn_run_test = tk.Button(
            act_bar,
            text="? Run Speed Test Now",
            font=("Segoe UI", 10, "bold"),
            bg=COLORS["accent_blue"],
            fg="#0b1021",
            activebackground="#38bdf8",
            activeforeground="#0b1021",
            relief="flat",
            padx=14,
            pady=6,
            command=self._start_speed_test_async
        )
        self.btn_run_test.grid(row=0, column=0, sticky="w")

        self.lbl_test_status = tk.Label(
            act_bar,
            text="Ready. Next scheduled test in automatic queue.",
            font=("Segoe UI", 9),
            bg=COLORS["bg_secondary"],
            fg=COLORS["text_secondary"]
        )
        self.lbl_test_status.grid(row=0, column=1, sticky="w", padx=12)

        # Progress bar (hidden unless testing)
        self.progress = ttk.Progressbar(act_bar, orient="horizontal", mode="determinate")
        self.progress.grid(row=1, column=0, columnspan=2, sticky="ew", pady=(6, 0))
        self.progress.grid_remove()

        # 4. Tabbed Notebook (Overview, 24h Summary, Incidents, Settings)
        style = ttk.Style()
        style.theme_use("default")
        style.configure("TNotebook", background=COLORS["bg"], borderwidth=0)
        style.configure("TNotebook.Tab", background=COLORS["bg_card"], foreground=COLORS["text_secondary"], padding=[12, 6], font=("Segoe UI", 9, "bold"))
        style.map("TNotebook.Tab", background=[("selected", COLORS["bg_secondary"])], foreground=[("selected", COLORS["accent_blue"])])

        notebook = ttk.Notebook(root)
        notebook.grid(row=3, column=0, sticky="nsew", padx=14, pady=(0, 14))
        root.grid_rowconfigure(3, weight=1)

        # Tab 1: Live Sockets & Probes
        tab_live = tk.Frame(notebook, bg=COLORS["bg_secondary"], padx=10, pady=10)
        notebook.add(tab_live, text="?? Live Network & Sockets")
        self._build_live_tab(tab_live)

        # Tab 2: Speed History
        tab_history = tk.Frame(notebook, bg=COLORS["bg_secondary"], padx=10, pady=10)
        notebook.add(tab_history, text="?? Speed History (24h)")
        self._build_history_tab(tab_history)

        # Tab 3: Incidents Log
        tab_incidents = tk.Frame(notebook, bg=COLORS["bg_secondary"], padx=10, pady=10)
        notebook.add(tab_incidents, text="?? Incident Log")
        self._build_incidents_tab(tab_incidents)

        # Tab 4: Settings
        tab_settings = tk.Frame(notebook, bg=COLORS["bg_secondary"], padx=14, pady=14)
        notebook.add(tab_settings, text="?? Settings")
        self._build_settings_tab(tab_settings)

    def _build_live_tab(self, parent: tk.Frame):
        parent.grid_rowconfigure(1, weight=1)
        parent.grid_columnconfigure(0, weight=1)

        lbl = tk.Label(
            parent,
            text="Active Network Socket Consumers (identifies background torrents, game launchers, sync apps):",
            font=("Segoe UI", 9, "bold"),
            bg=COLORS["bg_secondary"],
            fg=COLORS["text_secondary"]
        )
        lbl.grid(row=0, column=0, sticky="w", pady=(0, 6))

        cols = ("process", "pid", "sockets", "status")
        self.tree_procs = ttk.Treeview(parent, columns=cols, show="headings", height=8)
        self.tree_procs.heading("process", text="Process Name")
        self.tree_procs.heading("pid", text="PID")
        self.tree_procs.heading("sockets", text="Active Connections")
        self.tree_procs.heading("status", text="Impact")

        self.tree_procs.column("process", width=220)
        self.tree_procs.column("pid", width=80, anchor="center")
        self.tree_procs.column("sockets", width=140, anchor="center")
        self.tree_procs.column("status", width=140, anchor="center")

        self.tree_procs.grid(row=1, column=0, sticky="nsew")

        # Scrollbar
        sb = ttk.Scrollbar(parent, orient="vertical", command=self.tree_procs.yview)
        self.tree_procs.configure(yscrollcommand=sb.set)
        sb.grid(row=1, column=1, sticky="ns")

    def _build_history_tab(self, parent: tk.Frame):
        parent.grid_rowconfigure(2, weight=1)
        parent.grid_columnconfigure(0, weight=1)

        self.lbl_summary_24h = tk.Label(
            parent,
            text="24h Average: -- Mbps down, -- Mbps up | Min: -- Mbps | Max: -- Mbps",
            font=("Segoe UI", 9, "bold"),
            bg=COLORS["bg_secondary"],
            fg=COLORS["accent_blue"]
        )
        self.lbl_summary_24h.grid(row=0, column=0, sticky="w", pady=(0, 6))

        cols = ("time", "down", "up", "ping", "server")
        self.tree_history = ttk.Treeview(parent, columns=cols, show="headings", height=8)
        self.tree_history.heading("time", text="Timestamp")
        self.tree_history.heading("down", text="Download (Mbps)")
        self.tree_history.heading("up", text="Upload (Mbps)")
        self.tree_history.heading("ping", text="Ping (ms)")
        self.tree_history.heading("server", text="Server")

        self.tree_history.column("time", width=160)
        self.tree_history.column("down", width=130, anchor="center")
        self.tree_history.column("up", width=130, anchor="center")
        self.tree_history.column("ping", width=100, anchor="center")
        self.tree_history.column("server", width=140)

        self.tree_history.grid(row=2, column=0, sticky="nsew")

        sb = ttk.Scrollbar(parent, orient="vertical", command=self.tree_history.yview)
        self.tree_history.configure(yscrollcommand=sb.set)
        sb.grid(row=2, column=1, sticky="ns")

    def _build_incidents_tab(self, parent: tk.Frame):
        parent.grid_rowconfigure(1, weight=1)
        parent.grid_columnconfigure(0, weight=1)

        tk.Label(
            parent,
            text="Logged Slowdowns, Packet Loss Spikes & Culprit Processes:",
            font=("Segoe UI", 9, "bold"),
            bg=COLORS["bg_secondary"],
            fg=COLORS["text_secondary"]
        ).grid(row=0, column=0, sticky="w", pady=(0, 6))

        cols = ("time", "severity", "type", "desc", "culprit")
        self.tree_incidents = ttk.Treeview(parent, columns=cols, show="headings", height=8)
        self.tree_incidents.heading("time", text="Time")
        self.tree_incidents.heading("severity", text="Severity")
        self.tree_incidents.heading("type", text="Event")
        self.tree_incidents.heading("desc", text="Description")
        self.tree_incidents.heading("culprit", text="Detected Culprit")

        self.tree_incidents.column("time", width=140)
        self.tree_incidents.column("severity", width=80, anchor="center")
        self.tree_incidents.column("type", width=110)
        self.tree_incidents.column("desc", width=220)
        self.tree_incidents.column("culprit", width=160)

        self.tree_incidents.grid(row=1, column=0, sticky="nsew")

        sb = ttk.Scrollbar(parent, orient="vertical", command=self.tree_incidents.yview)
        self.tree_incidents.configure(yscrollcommand=sb.set)
        sb.grid(row=1, column=1, sticky="ns")

    def _build_settings_tab(self, parent: tk.Frame):
        tk.Label(parent, text="Configuration & Thresholds", font=("Segoe UI", 11, "bold"), bg=COLORS["bg_secondary"], fg=COLORS["text_primary"]).pack(anchor="w", pady=(0, 10))

        # Speed test interval
        row1 = tk.Frame(parent, bg=COLORS["bg_secondary"])
        row1.pack(fill="x", pady=4)
        tk.Label(row1, text="Auto Speed Test Interval (Minutes):", font=("Segoe UI", 9), bg=COLORS["bg_secondary"], fg=COLORS["text_secondary"], width=32, anchor="w").pack(side="left")
        self.ent_interval = tk.Entry(row1, bg=COLORS["bg_card"], fg=COLORS["text_primary"], insertbackground="white", width=10)
        self.ent_interval.insert(0, str(self.config.speedtest_interval_minutes))
        self.ent_interval.pack(side="left")

        # Speed drop threshold
        row2 = tk.Frame(parent, bg=COLORS["bg_secondary"])
        row2.pack(fill="x", pady=4)
        tk.Label(row2, text="Alert Speed Drop Threshold (Mbps):", font=("Segoe UI", 9), bg=COLORS["bg_secondary"], fg=COLORS["text_secondary"], width=32, anchor="w").pack(side="left")
        self.ent_threshold = tk.Entry(row2, bg=COLORS["bg_card"], fg=COLORS["text_primary"], insertbackground="white", width=10)
        self.ent_threshold.insert(0, str(self.config.speed_drop_threshold_mbps))
        self.ent_threshold.pack(side="left")

        # Router Ping threshold
        row3 = tk.Frame(parent, bg=COLORS["bg_secondary"])
        row3.pack(fill="x", pady=4)
        tk.Label(row3, text="Router Latency Threshold (ms):", font=("Segoe UI", 9), bg=COLORS["bg_secondary"], fg=COLORS["text_secondary"], width=32, anchor="w").pack(side="left")
        self.ent_ping_threshold = tk.Entry(row3, bg=COLORS["bg_card"], fg=COLORS["text_primary"], insertbackground="white", width=10)
        self.ent_ping_threshold.insert(0, str(self.config.gateway_latency_threshold_ms))
        self.ent_ping_threshold.pack(side="left")

        # Toast notifications checkbox
        self.var_notifications = tk.BooleanVar(value=self.config.enable_notifications)
        chk = tk.Checkbutton(
            parent,
            text="Enable Windows Desktop Toast Notifications on Speed Drops",
            variable=self.var_notifications,
            font=("Segoe UI", 9),
            bg=COLORS["bg_secondary"],
            fg=COLORS["text_primary"],
            selectcolor=COLORS["bg_card"],
            activebackground=COLORS["bg_secondary"],
            activeforeground=COLORS["text_primary"]
        )
        chk.pack(anchor="w", pady=10)

        # Save Button
        btn_save = tk.Button(
            parent,
            text="?? Save Preferences",
            font=("Segoe UI", 9, "bold"),
            bg=COLORS["accent_blue"],
            fg="#0b1021",
            relief="flat",
            padx=14,
            pady=6,
            command=self._save_settings
        )
        btn_save.pack(anchor="w", pady=(8, 0))

    def refresh_all_data(self):
        """Update all widgets with current state from DB and probe."""
        if not self.window or not tk.Toplevel.winfo_exists(self.window):
            return

        # 1. Update Probe / Wi-Fi info
        if self._latest_probe:
            w = self._latest_probe.wifi
            l = self._latest_probe.latency

            if w.is_connected:
                self.lbl_ssid.config(text=f"Wi-Fi: {w.ssid}", fg=COLORS["accent_green"])
                self.lbl_wifi_details.config(
                    text=f"Signal: {w.signal_pct}% | Band: {w.band} (Ch {w.channel}) | Protocol: {w.radio_type} | Link: {w.rx_rate_mbps:.0f} Mbps"
                )
            else:
                self.lbl_ssid.config(text="Wi-Fi: Disconnected", fg=COLORS["accent_red"])
                self.lbl_wifi_details.config(text="No active wireless connection")

            gw_str = f"{l.gateway_ping_ms:.1f} ms" if l.gateway_ping_ms is not None else "Timeout"
            dns_str = f"{l.public_dns_ping_ms:.1f} ms" if l.public_dns_ping_ms is not None else "--"
            jit_str = f"{l.jitter_ms:.1f} ms" if l.jitter_ms is not None else "--"

            self.lbl_ping_val.config(text=dns_str)
            self.lbl_ping_sub.config(text=f"Router ({l.gateway_ip}): {gw_str} | Jitter: {jit_str}")

            # Update live process sockets
            for item in self.tree_procs.get_children():
                self.tree_procs.delete(item)
            for proc in self._latest_probe.top_processes:
                impact = "High" if proc.connection_count > 15 else ("Moderate" if proc.connection_count > 6 else "Low")
                self.tree_procs.insert("", "end", values=(proc.process_name, proc.pid, proc.connection_count, impact))

        # 2. Update Speed Cards
        latest_speed = self.storage.get_latest_speed_test()
        if latest_speed and latest_speed.is_success:
            self.lbl_down_val.config(text=f"{latest_speed.download_mbps:.2f} Mbps")
            self.lbl_up_val.config(text=f"{latest_speed.upload_mbps:.2f} Mbps")
            # Format time
            try:
                dt = datetime.fromisoformat(latest_speed.timestamp).astimezone()
                time_str = dt.strftime("%I:%M %p")
            except Exception:
                time_str = latest_speed.timestamp[:19]
            self.lbl_down_sub.config(text=f"Last tested: {time_str}")

        # 3. Update History Tab
        for item in self.tree_history.get_children():
            self.tree_history.delete(item)
        tests = self.storage.get_recent_speed_tests(limit=30)
        for t in tests:
            try:
                dt = datetime.fromisoformat(t["timestamp"]).astimezone().strftime("%b %d, %I:%M %p")
            except Exception:
                dt = t["timestamp"][:16]
            self.tree_history.insert("", "end", values=(
                dt,
                f"{t['download_mbps']:.2f}",
                f"{t['upload_mbps']:.2f}",
                f"{t['ping_ms']:.1f}" if t.get('ping_ms') else "--",
                t.get('server_info', 'Cloudflare')
            ))

        stats = self.storage.get_stats_summary(hours=24)
        if stats["test_count"] > 0:
            self.lbl_summary_24h.config(
                text=f"24h Average: {stats['avg_download']} Mbps down / {stats['avg_upload']} Mbps up | Min: {stats['min_download']} | Max: {stats['max_download']} | Incidents: {stats['incident_count']}"
            )

        # 4. Update Incidents Tab
        for item in self.tree_incidents.get_children():
            self.tree_incidents.delete(item)
        incidents = self.storage.get_incidents(limit=30)
        for inc in incidents:
            try:
                dt = datetime.fromisoformat(inc["timestamp"]).astimezone().strftime("%b %d, %I:%M %p")
            except Exception:
                dt = inc["timestamp"][:16]
            self.tree_incidents.insert("", "end", values=(
                dt,
                inc["severity"],
                inc["issue_type"],
                inc["description"],
                inc.get("culprit_process") or "--"
            ))

    def _start_speed_test_async(self):
        if self._is_testing:
            return
        self._is_testing = True
        self.btn_run_test.config(state="disabled")
        self.progress.grid()
        self.progress["value"] = 0

        def run():
            def progress_cb(stage: str, pct: float, mbps: float):
                if self.window and tk.Toplevel.winfo_exists(self.window):
                    self.window.after(0, lambda: self._update_test_progress(stage, pct, mbps))

            res = run_speed_test(
                download_mb=self.config.speedtest_size_mb,
                upload_mb=4,
                progress_callback=progress_cb
            )
            if res.is_success:
                self.storage.record_speed_test(res)

            if self.window and tk.Toplevel.winfo_exists(self.window):
                self.window.after(0, lambda: self._finish_speed_test(res))

        threading.Thread(target=run, daemon=True).start()

    def _update_test_progress(self, stage: str, pct: float, mbps: float):
        if not self.window or not tk.Toplevel.winfo_exists(self.window):
            return
        self.progress["value"] = pct
        speed_txt = f" ({mbps:.2f} Mbps)" if mbps > 0 else ""
        self.lbl_test_status.config(text=f"{stage}{speed_txt}", fg=COLORS["accent_blue"])

    def _finish_speed_test(self, res: SpeedTestResult):
        self._is_testing = False
        if self.window and tk.Toplevel.winfo_exists(self.window):
            self.btn_run_test.config(state="normal")
            self.progress.grid_remove()
            if res.is_success:
                self.lbl_test_status.config(text=f"Test completed: {res.download_mbps:.2f} Mbps down / {res.upload_mbps:.2f} Mbps up", fg=COLORS["accent_green"])
            else:
                self.lbl_test_status.config(text=f"Test failed: {res.error_message}", fg=COLORS["accent_red"])
            self.refresh_all_data()

    def _on_quick_probe_clicked(self):
        def probe_bg():
            snap = run_full_light_probe()
            self.storage.record_probe(snap)
            self._latest_probe = snap
            if self.window and tk.Toplevel.winfo_exists(self.window):
                self.window.after(0, self.refresh_all_data)
            if self.on_probe_updated:
                self.on_probe_updated(snap)

        threading.Thread(target=probe_bg, daemon=True).start()

    def _on_repair_network_clicked(self):
        confirm = messagebox.askyesno(
            "1-Click Network Stack Reset",
            "This will flush your DNS cache and reset Winsock / IP catalog.\n\nContinue?",
            parent=self.window
        )
        if confirm:
            try:
                subprocess.run(["ipconfig", "/flushdns"], capture_output=True)
                subprocess.run(["netsh", "int", "ip", "reset"], capture_output=True)
                subprocess.run(["netsh", "winsock", "reset"], capture_output=True)
                messagebox.showinfo("Success", "DNS flushed and Winsock catalog reset successfully.", parent=self.window)
                self._on_quick_probe_clicked()
            except Exception as e:
                messagebox.showerror("Error", f"Failed to reset network stack: {e}", parent=self.window)

    def _save_settings(self):
        try:
            self.config.speedtest_interval_minutes = int(self.ent_interval.get().strip())
            self.config.speed_drop_threshold_mbps = float(self.ent_threshold.get().strip())
            self.config.gateway_latency_threshold_ms = float(self.ent_ping_threshold.get().strip())
            self.config.enable_notifications = self.var_notifications.get()
            self.storage.save_config(self.config)
            if self.on_config_changed:
                self.on_config_changed(self.config)
            messagebox.showinfo("Settings Saved", "Preferences updated successfully!", parent=self.window)
        except ValueError:
            messagebox.showerror("Invalid Input", "Please enter valid numeric values.", parent=self.window)
