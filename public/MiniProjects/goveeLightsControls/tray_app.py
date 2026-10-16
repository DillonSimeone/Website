import os
import sys
import threading
import tkinter as tk
from tkinter import ttk, colorchooser
from typing import Dict
from PIL import Image, ImageDraw
import pystray

from govee_api import GoveeManager, GoveeDevice

# Colors - Modern Dark Palette
BG_DARK = "#181825"
BG_CARD = "#242438"
BG_CARD_HOVER = "#2a2a44"
BORDER_COLOR = "#313244"
TEXT_PRIMARY = "#cdd6f4"
TEXT_SECONDARY = "#a6adc8"
TEXT_MUTED = "#6c7086"
ACCENT_BLUE = "#89b4fa"
ACCENT_PURPLE = "#cba6f7"
ACCENT_GREEN = "#a6e3a1"
ACCENT_RED = "#f38ba8"
ACCENT_YELLOW = "#f9e2af"
ACCENT_WARM = "#fab387"

PRESET_COLORS = [
    ("#ff5555", 255, 85, 85, "Crimson"),
    ("#ffb86c", 255, 184, 108, "Sunset"),
    ("#50fa7b", 80, 250, 123, "Emerald"),
    ("#8be9fd", 139, 233, 253, "Ice Blue"),
    ("#bd93f9", 189, 147, 249, "Purple"),
    ("#ff79c6", 255, 121, 198, "Pink"),
]
import winreg

REG_PATH = r"Software\Microsoft\Windows\CurrentVersion\Run"
REG_NAME = "GoveeTrayControl"

def is_autostart_enabled() -> bool:
    try:
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, REG_PATH, 0, winreg.KEY_READ)
        val, _ = winreg.QueryValueEx(key, REG_NAME)
        winreg.CloseKey(key)
        return bool(val)
    except Exception:
        return False

def set_autostart(enable: bool) -> bool:
    try:
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, REG_PATH, 0, winreg.KEY_SET_VALUE)
        if enable:
            if getattr(sys, 'frozen', False):
                target_exe = sys.executable
            else:
                target_exe = os.path.abspath(sys.argv[0])
            cmd = f'"{target_exe}" --minimized'
            winreg.SetValueEx(key, REG_NAME, 0, winreg.REG_SZ, cmd)
        else:
            try:
                winreg.DeleteValue(key, REG_NAME)
            except FileNotFoundError:
                pass
        winreg.CloseKey(key)
        return True
    except Exception as e:
        print(f"Error setting autostart: {e}")
        return False

def create_bulb_icon(on: bool = True) -> Image.Image:
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if on:
        d.ellipse((4, 4, 60, 60), fill=(255, 215, 0, 45))
        bulb_color = (255, 210, 40)
        base_color = (190, 190, 200)
    else:
        bulb_color = (110, 110, 125)
        base_color = (70, 70, 80)

    # Bulb body
    d.ellipse((14, 10, 50, 44), fill=bulb_color)
    d.polygon([(20, 36), (44, 36), (39, 49), (25, 49)], fill=bulb_color)
    # Bulb base
    d.rectangle((26, 49, 38, 54), fill=base_color)
    d.arc((26, 52, 38, 58), start=0, end=180, fill=base_color, width=2)
    return img


class DeviceCard(tk.Frame):
    def __init__(self, parent, dev: GoveeDevice, manager: GoveeManager, status_callback):
        super().__init__(parent, bg=BG_CARD, bd=1, relief="solid", highlightbackground=BORDER_COLOR, highlightthickness=1)
        self.dev = dev
        self.manager = manager
        self.status_callback = status_callback
        
        self.brightness_var = tk.IntVar(value=dev.brightness)
        self.is_on_var = tk.BooleanVar(value=dev.is_on)
        
        self._build_ui()

    def _build_ui(self):
        self.configure(padx=12, pady=7)

        # Header Row: Name + Connection Badge + Power Button
        header = tk.Frame(self, bg=BG_CARD)
        header.pack(fill="x", pady=(0, 4))

        info_frame = tk.Frame(header, bg=BG_CARD)
        info_frame.pack(side="left", fill="y")

        name_label = tk.Label(
            info_frame, 
            text=self.dev.name, 
            font=("Segoe UI", 11, "bold"), 
            fg=TEXT_PRIMARY, 
            bg=BG_CARD
        )
        name_label.pack(anchor="w")

        conn_text = f"LAN ⚡" if self.dev.lan_ip else f"Cloud ☁️"
        sub_label = tk.Label(
            info_frame, 
            text=f"{self.dev.sku} • {conn_text}", 
            font=("Segoe UI", 8), 
            fg=TEXT_MUTED, 
            bg=BG_CARD
        )
        sub_label.pack(anchor="w")

        # Power Toggle Button
        self.power_btn = tk.Button(
            header,
            text="ON" if self.dev.is_on else "OFF",
            font=("Segoe UI", 9, "bold"),
            bg=ACCENT_GREEN if self.dev.is_on else BORDER_COLOR,
            fg="#11111b" if self.dev.is_on else TEXT_SECONDARY,
            activebackground=ACCENT_GREEN,
            bd=0,
            padx=14,
            pady=3,
            cursor="hand2",
            command=self._toggle_power
        )
        self.power_btn.pack(side="right")

        # Brightness Slider Row
        bright_frame = tk.Frame(self, bg=BG_CARD)
        bright_frame.pack(fill="x", pady=(1, 3))

        bright_header = tk.Frame(bright_frame, bg=BG_CARD)
        bright_header.pack(fill="x")

        tk.Label(
            bright_header, 
            text="Brightness", 
            font=("Segoe UI", 9), 
            fg=TEXT_SECONDARY, 
            bg=BG_CARD
        ).pack(side="left")

        self.bright_val_label = tk.Label(
            bright_header, 
            text=f"{self.dev.brightness}%", 
            font=("Segoe UI", 9, "bold"), 
            fg=ACCENT_YELLOW, 
            bg=BG_CARD
        )
        self.bright_val_label.pack(side="right")

        self.slider = ttk.Scale(
            bright_frame,
            from_=1,
            to=100,
            orient="horizontal",
            variable=self.brightness_var,
            command=self._on_slider_move
        )
        self.slider.pack(fill="x", pady=(3, 0))
        # Release trigger
        self.slider.bind("<ButtonRelease-1>", self._on_slider_release)

        # True White / Temperature Row (Max Brightness)
        temp_frame = tk.Frame(self, bg=BG_CARD)
        temp_frame.pack(fill="x", pady=(3, 2))

        tk.Label(
            temp_frame, 
            text="True White (Max Lumens):", 
            font=("Segoe UI", 8, "bold"), 
            fg=TEXT_SECONDARY, 
            bg=BG_CARD
        ).pack(anchor="w", pady=(0, 2))

        temp_btn_row = tk.Frame(temp_frame, bg=BG_CARD)
        temp_btn_row.pack(fill="x")

        temp_presets = [
            ("Warm (2700K)", 2700, "#ffd199"),
            ("Neutral (4000K)", 4000, "#ffeedd"),
            ("Daylight (6500K)", 6500, "#d8eeff")
        ]
        for label, kelvin, tint in temp_presets:
            btn = tk.Button(
                temp_btn_row,
                text=label,
                font=("Segoe UI", 8),
                bg=BORDER_COLOR,
                fg=tint,
                activebackground=BG_CARD_HOVER,
                activeforeground=tint,
                bd=0,
                padx=6,
                pady=2,
                cursor="hand2",
                command=lambda k=kelvin, l=label: self._set_color_temp(k, l)
            )
            btn.pack(side="left", padx=(0, 5))

        # Color Presets Row
        color_frame = tk.Frame(self, bg=BG_CARD)
        color_frame.pack(fill="x", pady=(3, 2))

        tk.Label(
            color_frame, 
            text="RGB Colors:", 
            font=("Segoe UI", 8, "bold"), 
            fg=TEXT_SECONDARY, 
            bg=BG_CARD
        ).pack(anchor="w", pady=(0, 3))

        color_btn_row = tk.Frame(color_frame, bg=BG_CARD)
        color_btn_row.pack(fill="x")

        for hex_col, r, g, b, cname in PRESET_COLORS:
            btn = tk.Button(
                color_btn_row,
                bg=hex_col,
                activebackground=hex_col,
                bd=0,
                width=2,
                height=1,
                cursor="hand2",
                command=lambda red=r, gr=g, bl=b, n=cname: self._set_color_rgb(red, gr, bl, n)
            )
            btn.pack(side="left", padx=(0, 4))

        custom_btn = tk.Button(
            color_btn_row,
            text="🎨 Custom...",
            font=("Segoe UI", 8),
            bg=BORDER_COLOR,
            fg=TEXT_PRIMARY,
            activebackground=BG_CARD_HOVER,
            bd=0,
            padx=6,
            pady=1,
            cursor="hand2",
            command=self._pick_custom_color
        )
        custom_btn.pack(side="left", padx=(4, 0))

    def _toggle_power(self):
        new_state = not self.dev.is_on
        self.manager.set_power(self.dev.mac, new_state)
        self.update_state_ui()
        self.status_callback(f"Turned {self.dev.name} {'ON' if new_state else 'OFF'}")

    def _on_slider_move(self, val):
        v = int(float(val))
        self.bright_val_label.configure(text=f"{v}%")

    def _on_slider_release(self, event=None):
        v = int(self.brightness_var.get())
        self.manager.set_brightness(self.dev.mac, v, debounce=False)
        self.status_callback(f"Set {self.dev.name} brightness to {v}%")
        if not self.dev.is_on:
            self.dev.is_on = True
            self.update_state_ui()

    def _set_color_temp(self, kelvin: int, label: str):
        self.manager.set_color_temp(self.dev.mac, kelvin)
        self.status_callback(f"Set {self.dev.name} to {label}")
        if not self.dev.is_on:
            self.dev.is_on = True
            self.update_state_ui()

    def _set_color_rgb(self, r: int, g: int, b: int, name: str):
        self.manager.set_color_rgb(self.dev.mac, r, g, b)
        self.status_callback(f"Set {self.dev.name} to {name}")
        if not self.dev.is_on:
            self.dev.is_on = True
            self.update_state_ui()

    def _pick_custom_color(self):
        curr_rgb = (
            (self.dev.color_rgb >> 16) & 0xFF,
            (self.dev.color_rgb >> 8) & 0xFF,
            self.dev.color_rgb & 0xFF
        )
        color = colorchooser.askcolor(
            color=f"#{curr_rgb[0]:02x}{curr_rgb[1]:02x}{curr_rgb[2]:02x}",
            title=f"Choose Color for {self.dev.name}"
        )
        if color and color[0]:
            r, g, b = [int(c) for c in color[0]]
            self._set_color_rgb(r, g, b, f"#{r:02x}{g:02x}{b:02x}")

    def update_state_ui(self):
        self.brightness_var.set(self.dev.brightness)
        self.bright_val_label.configure(text=f"{self.dev.brightness}%")
        if self.dev.is_on:
            self.power_btn.configure(text="ON", bg=ACCENT_GREEN, fg="#11111b")
        else:
            self.power_btn.configure(text="OFF", bg=BORDER_COLOR, fg=TEXT_SECONDARY)


class GoveeTrayApp:
    def __init__(self):
        self.manager = GoveeManager()
        self.root = tk.Tk()
        self.root.title("Govee Light Controls")
        self.root.configure(bg=BORDER_COLOR)
        self.root.resizable(False, False)

        # Make window completely borderless
        self.root.overrideredirect(True)

        ico_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bulb.ico")
        if os.path.exists(ico_path):
            try:
                self.root.iconbitmap(ico_path)
            except Exception:
                pass

        # Style ttk
        style = ttk.Style()
        style.theme_use("clam")
        style.configure("TScale", background=BG_CARD, troughcolor=BORDER_COLOR, sliderrelief="flat")

        self.device_cards: Dict[str, DeviceCard] = {}
        self.tray_icon = None

        # Drag coordinates for custom title bar
        self._drag_start_x = 0
        self._drag_start_y = 0

        # Build GUI
        self._build_ui()

        # Position window docked above system tray
        self._position_window_near_tray()

        # Ensure autostart with Windows is registered by default
        if not is_autostart_enabled():
            set_autostart(True)

        # If launched on Windows boot (--minimized), start hidden
        if "--minimized" in sys.argv:
            self.root.withdraw()

        # Start background discovery & fetch
        self.status_label.configure(text="Connecting to Govee...")
        threading.Thread(target=self._init_data, daemon=True).start()

        # Initialize Tray
        self._setup_tray()

    def _position_window_near_tray(self):
        screen_w = self.root.winfo_screenwidth()
        screen_h = self.root.winfo_screenheight()
        w, h = 450, 740
        # Position in lower right, leaving room for taskbar
        x = max(0, screen_w - w - 16)
        y = max(0, screen_h - h - 56)
        self.root.geometry(f"{w}x{h}+{x}+{y}")

    def _start_drag(self, event):
        self._drag_start_x = event.x_root - self.root.winfo_x()
        self._drag_start_y = event.y_root - self.root.winfo_y()

    def _do_drag(self, event):
        new_x = event.x_root - self._drag_start_x
        new_y = event.y_root - self._drag_start_y
        self.root.geometry(f"+{new_x}+{new_y}")

    def _build_ui(self):
        # 1px Outer border container for crisp edge on any wallpaper
        self.main_border = tk.Frame(self.root, bg=BORDER_COLOR)
        self.main_border.pack(fill="both", expand=True)

        self.main_frame = tk.Frame(self.main_border, bg=BG_DARK)
        self.main_frame.pack(fill="both", expand=True, padx=1, pady=1)

        # --- Sleek Custom Dark Title Bar ---
        title_bar = tk.Frame(self.main_frame, bg="#1e1e2e", height=36)
        title_bar.pack(fill="x", side="top")
        title_bar.pack_propagate(False)

        # Title + Bulb Icon
        title_lbl = tk.Label(
            title_bar,
            text=" 💡  Govee Light Controls",
            font=("Segoe UI", 9, "bold"),
            fg=TEXT_PRIMARY,
            bg="#1e1e2e",
            cursor="fleur"
        )
        title_lbl.pack(side="left", padx=(10, 0))

        # Close Button (X) - Minimizes to System Tray
        self.close_btn = tk.Label(
            title_bar,
            text=" ✕ ",
            font=("Segoe UI", 11),
            fg=TEXT_SECONDARY,
            bg="#1e1e2e",
            cursor="hand2"
        )
        self.close_btn.pack(side="right", padx=(0, 2), fill="y")
        self.close_btn.bind("<Button-1>", lambda e: self.hide_window())
        self.close_btn.bind("<Enter>", lambda e: self.close_btn.configure(bg="#e06c75", fg="#ffffff"))
        self.close_btn.bind("<Leave>", lambda e: self.close_btn.configure(bg="#1e1e2e", fg=TEXT_SECONDARY))

        # Minimize Button (─)
        min_btn = tk.Label(
            title_bar,
            text=" ─ ",
            font=("Segoe UI", 10),
            fg=TEXT_SECONDARY,
            bg="#1e1e2e",
            cursor="hand2"
        )
        min_btn.pack(side="right", fill="y")
        min_btn.bind("<Button-1>", lambda e: self.hide_window())
        min_btn.bind("<Enter>", lambda e: min_btn.configure(bg="#313244", fg="#ffffff"))
        min_btn.bind("<Leave>", lambda e: min_btn.configure(bg="#1e1e2e", fg=TEXT_SECONDARY))

        # Allow dragging the window from the custom title bar
        title_bar.bind("<ButtonPress-1>", self._start_drag)
        title_bar.bind("<B1-Motion>", self._do_drag)
        title_lbl.bind("<ButtonPress-1>", self._start_drag)
        title_lbl.bind("<B1-Motion>", self._do_drag)

        # Sub-header: Device Count & Refresh
        header = tk.Frame(self.main_frame, bg=BG_DARK, padx=16, pady=10)
        header.pack(fill="x")

        title_frame = tk.Frame(header, bg=BG_DARK)
        title_frame.pack(side="left")

        tk.Label(
            title_frame, 
            text="Govee Controls", 
            font=("Segoe UI", 13, "bold"), 
            fg=TEXT_PRIMARY, 
            bg=BG_DARK
        ).pack(anchor="w")

        self.subtitle_label = tk.Label(
            title_frame, 
            text="Desktop Tray Controller", 
            font=("Segoe UI", 8), 
            fg=TEXT_MUTED, 
            bg=BG_DARK
        )
        self.subtitle_label.pack(anchor="w")

        # Refresh Button
        self.refresh_btn = tk.Button(
            header,
            text="🔄 Refresh",
            font=("Segoe UI", 9),
            bg=BG_CARD,
            fg=TEXT_PRIMARY,
            activebackground=BORDER_COLOR,
            bd=0,
            padx=10,
            pady=4,
            cursor="hand2",
            command=self._trigger_refresh
        )
        self.refresh_btn.pack(side="right")

        # Master Controls Section
        master_frame = tk.Frame(
            self.main_frame, 
            bg=BG_CARD, 
            bd=1, 
            relief="solid", 
            highlightbackground=BORDER_COLOR, 
            highlightthickness=1,
            padx=12,
            pady=10
        )
        master_frame.pack(fill="x", padx=16, pady=(0, 10))

        master_header = tk.Frame(master_frame, bg=BG_CARD)
        master_header.pack(fill="x", pady=(0, 6))

        tk.Label(
            master_header, 
            text="⚡ ALL LIGHTS", 
            font=("Segoe UI", 10, "bold"), 
            fg=ACCENT_PURPLE, 
            bg=BG_CARD
        ).pack(side="left")

        all_off_btn = tk.Button(
            master_header,
            text="ALL OFF",
            font=("Segoe UI", 8, "bold"),
            bg=BORDER_COLOR,
            fg=ACCENT_RED,
            activebackground=BG_CARD_HOVER,
            bd=0,
            padx=10,
            pady=3,
            cursor="hand2",
            command=self._all_off
        )
        all_off_btn.pack(side="right", padx=(4, 0))

        all_on_btn = tk.Button(
            master_header,
            text="ALL ON",
            font=("Segoe UI", 8, "bold"),
            bg=BORDER_COLOR,
            fg=ACCENT_GREEN,
            activebackground=BG_CARD_HOVER,
            bd=0,
            padx=10,
            pady=3,
            cursor="hand2",
            command=self._all_on
        )
        all_on_btn.pack(side="right")

        # Master Brightness Presets
        bright_presets_row = tk.Frame(master_frame, bg=BG_CARD)
        bright_presets_row.pack(fill="x", pady=(4, 6))

        tk.Label(
            bright_presets_row, 
            text="Master Brightness:", 
            font=("Segoe UI", 8), 
            fg=TEXT_SECONDARY, 
            bg=BG_CARD
        ).pack(side="left", padx=(0, 6))

        for pct in [100, 75, 50, 25, 10]:
            btn = tk.Button(
                bright_presets_row,
                text=f"{pct}%",
                font=("Segoe UI", 8),
                bg=BORDER_COLOR,
                fg=TEXT_PRIMARY,
                activebackground=BG_CARD_HOVER,
                bd=0,
                padx=6,
                pady=2,
                cursor="hand2",
                command=lambda p=pct: self._set_all_brightness(p)
            )
            btn.pack(side="left", padx=(0, 4))

        # Master True White
        white_presets_row = tk.Frame(master_frame, bg=BG_CARD)
        white_presets_row.pack(fill="x")

        tk.Label(
            white_presets_row, 
            text="True White (Max):", 
            font=("Segoe UI", 8), 
            fg=TEXT_SECONDARY, 
            bg=BG_CARD
        ).pack(side="left", padx=(0, 6))

        for label, kelvin in [("Daylight", 6500), ("Neutral", 4000), ("Warm", 2700)]:
            btn = tk.Button(
                white_presets_row,
                text=label,
                font=("Segoe UI", 8),
                bg=BORDER_COLOR,
                fg=ACCENT_YELLOW,
                activebackground=BG_CARD_HOVER,
                bd=0,
                padx=6,
                pady=2,
                cursor="hand2",
                command=lambda k=kelvin: self._set_all_color_temp(k)
            )
            btn.pack(side="left", padx=(0, 4))

        # Status Bar (Packed at bottom first, guaranteeing it is always visible!)
        status_bar = tk.Frame(self.main_frame, bg=BG_CARD, padx=12, pady=6)
        status_bar.pack(fill="x", side="bottom")

        self.status_label = tk.Label(
            status_bar, 
            text="Starting Govee Tray...", 
            font=("Segoe UI", 8), 
            fg=TEXT_SECONDARY, 
            bg=BG_CARD
        )
        self.status_label.pack(side="left")

        # Start with Windows Checkbox
        self.autostart_var = tk.BooleanVar(value=is_autostart_enabled())
        autostart_cb = tk.Checkbutton(
            status_bar,
            text="Start with Windows",
            variable=self.autostart_var,
            command=self._toggle_autostart,
            font=("Segoe UI", 8),
            bg=BG_CARD,
            fg=TEXT_SECONDARY,
            selectcolor=BG_DARK,
            activebackground=BG_CARD,
            activeforeground=TEXT_PRIMARY,
            bd=0,
            cursor="hand2"
        )
        autostart_cb.pack(side="right", padx=(4, 0))

        # Devices Container with Smooth Scrolling
        self.canvas = tk.Canvas(self.main_frame, bg=BG_DARK, bd=0, highlightthickness=0)
        self.canvas.pack(fill="both", expand=True, padx=14, pady=(0, 4))

        self.devices_frame = tk.Frame(self.canvas, bg=BG_DARK)
        self.canvas_window = self.canvas.create_window((0, 0), window=self.devices_frame, anchor="nw")

        self.devices_frame.bind(
            "<Configure>", 
            lambda e: self.canvas.configure(scrollregion=self.canvas.bbox("all"))
        )
        self.canvas.bind(
            "<Configure>", 
            lambda e: self.canvas.itemconfig(self.canvas_window, width=e.width)
        )
        self.canvas.bind_all("<MouseWheel>", self._on_mousewheel)

    def _on_mousewheel(self, event):
        bbox = self.canvas.bbox("all")
        if bbox and bbox[3] > self.canvas.winfo_height():
            self.canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")

    def _toggle_autostart(self):
        enabled = self.autostart_var.get()
        set_autostart(enabled)
        self.set_status("Start with Windows: " + ("Enabled" if enabled else "Disabled"))
        self._update_tray_menu()

    def _toggle_autostart_tray(self, icon=None, item=None):
        new_state = not is_autostart_enabled()
        set_autostart(new_state)
        self.autostart_var.set(new_state)
        self.set_status("Start with Windows: " + ("Enabled" if new_state else "Disabled"))
        self._update_tray_menu()

    def _init_data(self):
        # First scan LAN quickly
        self.manager.scan_lan(timeout=1.5)
        # Fetch devices and live states
        devices = self.manager.refresh_devices()
        self.root.after(0, lambda: self._populate_devices(devices))

    def _trigger_refresh(self):
        self.set_status("Refreshing devices & states...")
        def _task():
            self.manager.scan_lan(timeout=1.0)
            devices = self.manager.refresh_devices()
            self.root.after(0, lambda: self._populate_devices(devices))
            self.root.after(0, lambda: self.set_status(f"Loaded {len(devices)} devices"))
        threading.Thread(target=_task, daemon=True).start()

    def _populate_devices(self, devices):
        # Clear existing
        for child in self.devices_frame.winfo_children():
            child.destroy()
        self.device_cards.clear()

        if not devices:
            lbl = tk.Label(
                self.devices_frame, 
                text="No Govee devices found or check API key.", 
                font=("Segoe UI", 10), 
                fg=ACCENT_RED, 
                bg=BG_DARK
            )
            lbl.pack(pady=30)
            self.set_status("No devices found.")
            return

        lan_count = sum(1 for d in devices if d.lan_ip)
        self.subtitle_label.configure(
            text=f"{len(devices)} Device(s) • {lan_count} LAN ⚡ • {len(devices)-lan_count} Cloud ☁️"
        )

        for dev in devices:
            card = DeviceCard(self.devices_frame, dev, self.manager, self.set_status)
            card.pack(fill="x", pady=(0, 10))
            self.device_cards[dev.mac] = card

        self.set_status(f"Ready ({len(devices)} devices online)")
        self._update_tray_menu()

    def set_status(self, msg: str):
        self.root.after(0, lambda: self.status_label.configure(text=msg))

    def _all_on(self):
        self.manager.set_all_power(True)
        for card in self.device_cards.values():
            card.dev.is_on = True
            card.update_state_ui()
        self.set_status("All lights turned ON")
        self._update_tray_icon()

    def _all_off(self):
        self.manager.set_all_power(False)
        for card in self.device_cards.values():
            card.dev.is_on = False
            card.update_state_ui()
        self.set_status("All lights turned OFF")
        self._update_tray_icon()

    def _set_all_brightness(self, pct: int):
        self.manager.set_all_brightness(pct)
        for card in self.device_cards.values():
            card.dev.brightness = pct
            card.dev.is_on = True
            card.update_state_ui()
        self.set_status(f"All lights brightness set to {pct}%")
        self._update_tray_icon()

    def _set_all_color_temp(self, kelvin: int):
        self.manager.set_all_color_temp(kelvin)
        for card in self.device_cards.values():
            card.dev.color_temp_k = kelvin
            card.dev.is_on = True
            card.update_state_ui()
        self.set_status(f"All lights set to True White ({kelvin}K)")
        self._update_tray_icon()

    def _set_all_color_rgb(self, r: int, g: int, b: int, name: str):
        self.manager.set_all_color_rgb(r, g, b)
        for card in self.device_cards.values():
            card.dev.color_temp_k = 0
            card.dev.is_on = True
            card.update_state_ui()
        self.set_status(f"All lights set to {name}")
        self._update_tray_icon()

    def _do_show_window(self):
        self.root.deiconify()
        self.root.lift()
        self.root.attributes("-topmost", True)
        self.root.attributes("-topmost", False)
        self.root.focus_force()

    def hide_window(self):
        self.root.withdraw()

    def toggle_window(self, icon=None, item=None):
        if self.root.winfo_viewable():
            self.root.after(0, self.hide_window)
        else:
            self.root.after(0, self._do_show_window)

    # Tray Setup
    def _setup_tray(self):
        icon_img = create_bulb_icon(True)
        menu = self._build_tray_menu()
        self.tray_icon = pystray.Icon(
            "govee_tray",
            icon_img,
            "Govee Light Controls",
            menu=menu
        )
        self.tray_icon.run_detached()

    def _update_tray_icon(self):
        if not self.tray_icon:
            return
        any_on = any(d.is_on for d in self.manager.devices.values())
        self.tray_icon.icon = create_bulb_icon(any_on)

    def _update_tray_menu(self):
        if self.tray_icon:
            self.tray_icon.menu = self._build_tray_menu()
            self._update_tray_icon()

    def _build_tray_menu(self) -> pystray.Menu:
        items = []

        # Master Controls
        items.append(pystray.MenuItem("🎛️ Toggle Controls", self.toggle_window, default=True))
        items.append(pystray.Menu.SEPARATOR)

        # Helpers for menu callbacks with exactly (icon, item) signature
        def make_all_bright(pct):
            return lambda icon, item: self._set_all_brightness(pct)

        def make_all_temp(k):
            return lambda icon, item: self._set_all_color_temp(k)

        def make_all_color(r, g, b, name):
            return lambda icon, item: self._set_all_color_rgb(r, g, b, name)

        def make_dev_power(mac, state):
            return lambda icon, item: self._tray_set_power(mac, state)

        def make_dev_bright(mac, pct):
            return lambda icon, item: self._tray_set_brightness(mac, pct)

        def make_dev_temp(mac, k):
            return lambda icon, item: self._tray_set_temp(mac, k)

        def make_dev_color(mac, r, g, b):
            return lambda icon, item: self._tray_set_color(mac, r, g, b)

        # All Lights submenu
        all_brightness_items = [
            pystray.MenuItem(f"{p}%", make_all_bright(p))
            for p in [100, 75, 50, 25, 10]
        ]
        all_white_items = [
            pystray.MenuItem("☀️ Daylight (6500K)", make_all_temp(6500)),
            pystray.MenuItem("💡 Neutral White (4000K)", make_all_temp(4000)),
            pystray.MenuItem("🕯️ Warm White (2700K)", make_all_temp(2700)),
        ]
        all_color_items = [
            pystray.MenuItem(f"● {name}", make_all_color(r, g, b, name))
            for _, r, g, b, name in PRESET_COLORS
        ]

        all_menu = pystray.Menu(
            pystray.MenuItem("Turn All ON", lambda icon, item: self._all_on()),
            pystray.MenuItem("Turn All OFF", lambda icon, item: self._all_off()),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Brightness", pystray.Menu(*all_brightness_items)),
            pystray.MenuItem("True White (Max)", pystray.Menu(*all_white_items)),
            pystray.MenuItem("Colors", pystray.Menu(*all_color_items)),
        )
        items.append(pystray.MenuItem("⚡ All Lights", all_menu))
        items.append(pystray.Menu.SEPARATOR)

        # Individual Devices
        for mac, dev in self.manager.devices.items():
            dev_items = [
                pystray.MenuItem(
                    "Turn ON" if not dev.is_on else "Turn OFF",
                    make_dev_power(mac, not dev.is_on)
                ),
                pystray.Menu.SEPARATOR,
                pystray.MenuItem(
                    "Brightness", 
                    pystray.Menu(*[
                        pystray.MenuItem(f"{p}%", make_dev_bright(mac, p))
                        for p in [100, 75, 50, 25, 10]
                    ])
                ),
                pystray.MenuItem(
                    "True White",
                    pystray.Menu(
                        pystray.MenuItem("Daylight (6500K)", make_dev_temp(mac, 6500)),
                        pystray.MenuItem("Neutral (4000K)", make_dev_temp(mac, 4000)),
                        pystray.MenuItem("Warm (2700K)", make_dev_temp(mac, 2700)),
                    )
                ),
                pystray.MenuItem(
                    "Colors",
                    pystray.Menu(*[
                        pystray.MenuItem(f"● {name}", make_dev_color(mac, r, g, b))
                        for _, r, g, b, name in PRESET_COLORS
                    ])
                )
            ]
            items.append(pystray.MenuItem(f"💡 {dev.name}", pystray.Menu(*dev_items)))

        items.append(pystray.Menu.SEPARATOR)
        items.append(pystray.MenuItem("🔄 Refresh Devices", lambda icon, item: self._trigger_refresh()))
        items.append(pystray.MenuItem("Start with Windows", self._toggle_autostart_tray, checked=lambda item: is_autostart_enabled()))
        items.append(pystray.MenuItem("❌ Exit", self.quit_app))

        return pystray.Menu(*items)

    def _tray_set_power(self, mac: str, on: bool):
        self.manager.set_power(mac, on)
        if mac in self.device_cards:
            self.device_cards[mac].dev.is_on = on
            self.root.after(0, self.device_cards[mac].update_state_ui)
        self._update_tray_icon()

    def _tray_set_brightness(self, mac: str, pct: int):
        self.manager.set_brightness(mac, pct, debounce=False)
        if mac in self.device_cards:
            self.device_cards[mac].dev.brightness = pct
            self.device_cards[mac].dev.is_on = True
            self.root.after(0, self.device_cards[mac].update_state_ui)
        self._update_tray_icon()

    def _tray_set_temp(self, mac: str, kelvin: int):
        self.manager.set_color_temp(mac, kelvin)
        if mac in self.device_cards:
            self.device_cards[mac].dev.color_temp_k = kelvin
            self.device_cards[mac].dev.is_on = True
            self.root.after(0, self.device_cards[mac].update_state_ui)
        self._update_tray_icon()

    def _tray_set_color(self, mac: str, r: int, g: int, b: int):
        self.manager.set_color_rgb(mac, r, g, b)
        if mac in self.device_cards:
            self.device_cards[mac].dev.color_temp_k = 0
            self.device_cards[mac].dev.is_on = True
            self.root.after(0, self.device_cards[mac].update_state_ui)
        self._update_tray_icon()

    def quit_app(self, icon=None, item=None):
        if self.tray_icon:
            self.tray_icon.stop()
        self.root.after(0, self.root.destroy)

    def run(self):
        self.root.mainloop()


if __name__ == "__main__":
    app = GoveeTrayApp()
    app.run()
